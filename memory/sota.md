# State of the art {#sec:sota}
  
This chapter presents a conceptual overview of the current state of the relevant kernel subsystems and APIs we'll be working with during this project. We'll be analyzing the **memory subsystem**, which is directly responsible of the writeback cache, but as we'll see later, the **block I/O subsystem** and **filesystem layer** are of special importance as well. Those are presented within sections \ref{subsec:io-stack} & \ref{subsec:writeback-cache}.

During analysis, we'll probably need to get insight on what is happening in the kernel. For complexity and practicity, this should be preferably done in a *non-invasive way* that avoids modifying the kernel or altering the results of the experiments themselves. Section \ref{subsec:tracing} presents an overview of the currently available mechanisms for tracing & debugging the Linux kernel.

When developing a possible solution —be it in form of kernel patches, loadable modules or userspace daemons— we'll likely rely on **accounting mechanisms** to track resource usage of (groups of) tasks and provide fairness. **Resource control** mechanisms will also be needed to enforce limits on (groups of) tasks, in the case of a userspace daemon. Section \ref{subsec:resource-control} details relevant accounting & control mechanisms readily available in Linux.


## Linux and the I/O stack {#subsec:io-stack}

This project is centered around the Linux kernel, and we'll be working on the **mainline version** at this time.

#### Flow of an I/O operation

Before beginning work, it was important to have an overview of the whole I/O stack in Linux, even if simplified.
When an I/O operation is issued from userspace upon a **mounted filesystem**, the following happens:

1. **VFS:** The VFS (short for 'Virtual File System') layer handles the operation and calls the appropriate handler on the corresponding filesystem.

2. **Writeback cache:** The pages holding data to be written are marked as *dirty*. The **memory subsystem** (also called VM or MM) keeps track of dirty pages. The VFS operation then usually completes immediately, and at a later time, kernel workers enqueue (some of) the dirty pages to be actually written to the underlying block device. The pages are now in *writeback* state.

3. **BIO:** At this point, the operation is called a BIO ---short for 'Block I/O'--- and it's handled by the **block layer**. It's placed on a per-device queue[^no-queue], and the **I/O scheduler** (or elevator) selects operations from that queue and issues them to the hardware (disk drive). There are many elevators on Linux, such as `bfq` (which provides fair scheduling) or `noop` which is simple FCFS.

   [^no-queue]: Some special block devices (like loop devices, or the device mapper) don't use a queue or I/O scheduler.

4. **Disk drive:** When the BIO is selected from the queue, the block driver issues it to the drive. After this, the operation is complete. However, the disk drive itself is often capable of caching the received operations. Since this caching layer is in hardware it's usually transparent to the kernel, except for the need to issue cache flushes when requested. Utilities like `hdparm` may be used to enable or disable the drive's cache.

If the I/O operation is directly upon an opened block device, it goes directly to step 3 and isn't of interest. Also of note is that the VFS layer does have some internal caches for inodes and dentrys, but this doesn't seem to be relevant either.

Step 2 (the writeback cache) is what we'll work with, and its behaviour and interface was further researched and is explained in section \ref{subsec:writeback-cache}.

![Simplified view of the Linux I/O stack, adapted from \cite{linux-io-diagrams}.](img/sota/IO_stack_of_the_Linux_kernel_simplified.pdf){#fig:io-stack-flow height=100%}

Figure \ref{fig:io-stack-flow} shows a representation of the flow. Please note how the page cache (i.e. the VM layer) isn't *after* the VFS layer, but *next to it*. As will be seen later, these layers interact in both directions.

#### Skipping the cache

Some operations may skip the writeback cache. In this case step 2 is not performed (thus, the memory subsystem is not involved); the BIO is immediately scheduled and completes when issued to the disk. There are many ways for this to happen:

- From userspace, if the file was opened with `O_DIRECT`. This is a POSIX flag that does precisely that; it instructs operations on the file to skip caching.

  A related option is `O_SYNC`, which instructs data to be written synchronously to disk. They have different meanings, but `O_SYNC` involves among other things skipping the cache.

- By mounting the filesystem in `sync` mode (versus `async` mode, the default). This causes all operations on that filesystem to skip caching. A command like the following may be uesd to disable the writeback cache, on the fly, in the root filesystem:

  ~~~ bash
  mount -o remount,sync /
  ~~~

This list isn't exhaustive.


\clearpage
## The writeback cache {#subsec:writeback-cache}

#### Introduction

The writeback cache is a subset of the functionality provided by the VM's **page cache**. The page cache is an essential component in any general purpose OS, whose main intent is to reduce I/O operations on the underlying block device and improve perfomance.

Essentially, the page cache puts free memory pages to good use by mapping them to storage. "Free" in this context approximately means "pages not reserved by the kernel, network buffers or user processes". (This hasn't always been that way, though; some time ago, swappable process memory was considered free as well. \cite{commit-free-pages})

In that regard, **writeback caching** allows writes to be cached as well, and performed at a later time. This is useful for two important reasons:

 - Tasks can continue their work without being having to wait for I/O writes, which means better latency and resource utilization, especially CPU efficiency.

 - Prevents 'bumpiness' (greatly varying latencies) in the physical device from damaging the performance of tasks. This is especially relevant in "read-write loops" (i.e. a download from the network into disk) which greatly reduce their throughput if there are unstabilities in one of the ends\cite{commit-soft-throttling}.

Conceptually, it acts like a large buffer for writes.

#### General operation

Writeback caching works by tracking pages that become **dirty**, i.e. modified with respect to what's stored in the block device. Pages can be modified by regular operations on open files, or through other means such as mapped file memory.

Kernel worker tasks wake up periodically and transition some of the pages into **writeback** state, which means they're being written to the block device. This is done according to some criteria, such as how long the page has been dirty, or whether the current amount of dirty pages surpasses a configured **background dirty threshold**.

Once the page has been written, it's considered clean and may be removed from the cache.

#### Integration with VFS

It's a complicated component, because even though part of the memory management layer (VM), it has to coordinate with the VFS layer to maintain file-to-storage mappings and flush changes to disk when either of the parts request it (i.e. `sync` has been called, or the system is running low on memory).

And this integration between both components is often tricky, because the VFS layer always works in terms of *inodes*, whereas the VM layer always works in terms of pages \cite{docs-inodes-pages-problem}. Many pages can belong to the same inode.

#### Throttling

Like every buffer with finite capacity, the writeback cache needs a mechanism to throttle tasks that dirty pages to prevent it from filling indefinitely.

The main user-facing parameter to control this throttling is the **dirty threshold**, which defines the maximum percentage[^percentage] of the *free memory* (see above) in the system that can ever hold dirty pages[^dirty-pages]. Together with the **background dirty threshold** mentioned before, these define most of the throttling characteristics.

[^percentage]: Modern kernels allow defining an absolute amount of memory instead of a percentage of a dynamic value\cite{mail-throttle-amount}. This is useful in systems with lots of RAM, as only *integer* percentages are accepted.

[^dirty-pages]: In most contexts, especially throttling, *dirty pages* includes pages in writeback state as well.

Previously, throttling seemed to be simple: when the dirty threshold is surpassed, new writes are no longer cached and effectively become synchronous (i.e. complete after processed by the block device). This was hurting interactivity and performance, and was later replaced by a **soft-throttling** scheme based on scheduler rate-limiting\cite{commit-soft-throttling}.

\begin{figure} \hypertarget{fig:curve-global}{%
  \centering
  \input{img/sota/throttling_curve_global}
  \caption{Representation of the global throttling curve}\label{fig:curve-global}
} \end{figure}

\begin{figure} \hypertarget{fig:curve-bdi}{%
  \centering
  \input{img/sota/throttling_curve_bdi}
  \caption{Representation of the per-block device throttling curve}\label{fig:curve-bdi}
} \end{figure}

Instead, processes now begin to be throttled *before* the dirty threshold is reached (at around the midpoint between it and the background dirty threshold), and the pauses are supposed to increase as the dirty limit is approached. The details are a bit more complicated, as two curves seem to be implemented: a global one, and another for the block device. These are represented in figures \ref{fig:curve-global} and \ref{fig:curve-bdi}. The source code appears to indicate that the minimum of both curves is in effect\cite{source-writeback-curve}.

#### Unfairness

However, the throttling seems to be applied the same way no matter the task. There is a manual exception for tasks that have the `PF_LOCAL_THROTTLE`, which get throttled in less cases. This is expected, given that the memory subsystem has reduced capability of tracking the ownership of each page.

Taking that into account, it's reasonable to expect the same throttling applied to innocent, non-cache-starving processes than is being applied to the starving ones. Also, workers don't seem to apply any fairness when selecting pages for writeback.

#### Existing parameters

Writeback cache parameters can be adjusted on the fly through the sysctl interface. These are the relevant ones:

\begin{description}
\item[\mintinline{text}{vm.dirty_background_ratio}]
    The threshold, as a percentage of free memory, at which dirty pages start to be transitioned to *writeback* state (default: \SI{10}{\percent}).
\item[\mintinline{text}{vm.dirty_background_bytes}]
    Like \mintinline{text}{vm.dirty_background_ratio}, but specified as an absolute quantity in bytes (default: none).
\item[\mintinline{text}{vm.dirty_ratio}]
    Target maximum dirty + writeback pages, as a percentage of free memory (default: \SI{20}{\percent}).
\item[\mintinline{text}{vm.dirty_bytes}]
    Like \mintinline{text}{vm.dirty_ratio}, but specified as an absolute quantity in bytes (default: none).
%
\item[\mintinline{text}{vm.dirty_writeback_centisecs}]
    Interval, in centisecs, at which kernel workers wake up to write dirty pages (default: \SI{5}{\second}).
\item[\mintinline{text}{vm.dirty_expire_centisecs}]
    Time, in centisecs, after which dirty pages are always written to disk regardless of threshold (default: \SI{30}{\second}).
%
%\item[\mintinline{text}{vm.dirtytime_expire_seconds}]
%\item[\mintinline{text}{vm.laptop_mode}]
%\item[\mintinline{text}{vm.vfs_cache_pressure}]
\end{description}

Some parameters may be adjusted per block device as well, but aren't detailed here for brevity and because of its limited use for this project.


## Kernel tracing tools {#subsec:tracing}

When performing the experiments, we


## Resource control & accounting {#subsec:resource-control}


