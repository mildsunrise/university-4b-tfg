# Introduction {#sec:introduction}

As usual in most modern systems, the Linux kernel caches disk I/O to optimize throughput and latency. This is called the *page cache*, and is an almost essential part of any \ac{GPOS} because of its performance benefits.

Disk writes are also 'absorbed' by the cache as well. They usually complete immediately from the process' point of view, and are committed to the disk at a later time. This part of the cache (which essentially acts like a buffer for writes) is substantially complex and is often called the *writeback cache*.

However, like any buffer, it can easily introduce unfairness and side-effects when there are heavy I/O tasks writing at a fast speed (such as downloads, backups, or uncompressions). These may eventually saturate the cache, forcing the kernel to throttle I/O, which often results in a lagging system. Introducing some level of fairness in the throttling would improve this.

This research project, which is carried out at the Department of Computer Architecture, aims to develop a Proof of Concept that will (partly) introduce this fairness:

 - First, the existent (unfair) I/O throttling will be measured. Its impact over system performance and general responsivity will then be analyzed. The main goal is to understand the dynamics leading to unresponsivity as deeply as possible.

 - Then, the Proof of Concept will be designed and developed to isolate the throttling, so that only the offending tasks are affected by it. 

 - As an optional goal, a proper patch to the Linux kernel can be developed in order to provide actual fairness.

 - Measures will be taken again, and the \ac{PoC} will be tested on production systems.

 - The resulting improvement in system performance / responsivity will be analyzed and general conclusions will be drawn.


\clearpage
## The problem {#subsec:problem}

The idea for this independent project comes from several attempts of diagnosing system unresponsiveness from the author, often in production environments. This problem occurs frequently, as the only requisite is to have an application that writes lots of data to the disk.

The cache is always enabled by default, since it greatly improves performance:

 - Tasks can continue their work without being having to wait for I/O writes, which means better latency and resource utilization, especially CPU efficiency.

 - Prevents 'bumpiness' (greatly varying latencies) in the physical device from damaging the performance of tasks. This is especially relevant in "read-write loops" (i.e. a download from the network into disk) which greatly reduce their throughput if there are unstabilities in one of the ends \cite{commit-soft-throttling}.

 - I/O is submitted to the disk in bulks, which allows the I/O scheduler (or elevator) to build efficient schedules for their transfer.

However, it is also unfair because it treats all writes equally. So, when the cache gets full, all applications that perform I/O are allegedly slowed down (I/O throttling), affecting the whole system.

To avoid this problem, an application that wants to write lots of data may explicitely enable `O_DIRECT`, a POSIX flag which causes these writes to bypass the writeback cache, preventing the cache from filling (and therefore, avoiding I/O throttling). However this is far from a solution, because:

 - The user must modify the application source code in order to enable it (users don’t normally know about this source code).

 - Applications don’t usually know whether they’re going to cause the cache to fill; it’s hard to predict if the bottleneck will be at the disk writing speed. It’s the kernel that knows.

 - Using an option that does an unwanted thing (it disables the cache, reducing performance) just to prevent a system-dependent side effect (I/O throttling) doesn’t feel right at all.

Linux also allows disabling the writeback cache on an entire filesystem, by remounting it in sync mode. However this is also not ideal; it degrades system performance as indicated above.

Linux also allows to adjust the threshold at which the cache is considered full (i.e. the queue size). Threshold, bandwidth and I/O scheduling can also be tweaked per block device. However, neither of this prevents the throttling from triggering; at most, it can isolate it to applications using that block device, but this doesn’t usually help.


\clearpage
## Previous efforts {#subsec:previous-efforts}

The writeback cache (and its throttling) has been a well known source of unresponsiveness. In 2010, modifications were made to the Linux kernel where (among other things) I/O is now rate-limited early to avoid reaching the actual limit where full throttling begins. From patch `143dfe86` \cite{commit-soft-throttling}:

> [...] long block time in balance_dirty_pages() hurts desktop responsiveness [...]
> 
> Users will notice that the applications will get throttled once crossing the global (background + dirty)/2=15% threshold, and then balanced around 17.5%. Before patch, the behavior is to just throttle it at 20% dirtyable memory in 1-dd case.
> 
> Users will notice a more responsive system during heavy writeback.  
> "killall dd" will take effect instantly.

Some other changes have also been made in respect to throttling since then; however throttling still has a substantially noticeable effect on responsiveness on the mainline kernel at the time of this writing.

Some possible reasons this hasn't been properly addressed are:

 - The writeback cache is an extremely complex component. It doesn't cleanly belong in a single subsystem, instead being managed jointly by the *memory subsystem* and the *filesystem layer* at the same time, and also interfaces with the *block I/O layer* to commit changes to the disk.
 
 - Its behaviour isn't easy to test, inspect or reason about due to their macroscopic nature and the variety of situations one can find.

 - It's a critical part of the system in terms of performance.

 - There may be hidden dynamics we're unaware of at the time of starting this project.

It’s important to note that throttling appears to have been partially task-fair at earlier versions of the Linux kernel; however that doesn’t seem to be the case today.

On the other side, subtle control features have been made available (memory cgroups, BIO annotation support), but aren’t ---to the author’s knowledge--- being actively used to address I/O throttling fairness. This project attempts to build on these features. However throttling is a complex process, so we first need to understand & measure it in detail.


\clearpage
## Project structure & requirements {#subsec:project-structure}

Since we're dealing with a complex component of the kernel, substantial research will be needed at the early stages of this project. Understanding what leads to the throttling is critical for success.

Due to the nature of Linux there is plenty of documentation, discussion and commit history publicly available on the matter; however the scope is limited and will likely not allow for a 100% correct, in-depth, source-code level analysis of the problem. Likely, we are not aiming for a definitive fix, or even a proof-of-concept for one, but at least a solution that can successfully mitigate the problem partially.

#### Requirements

- Tooling to measure and analyze when and how I/O throttling occurs, and what tasks are affected.
- The measuring process should be as less invasive as possible, so it can be used on a production system and measurement itself doesn’t alter the results.
- The developed Proof of Concept must be able to isolate the I/O throttling to a small part of the system, ideally at process- or task- level.
- The Proof of Concept should be developed preferably in the form of a *userspace daemon*.
- Optionally, a proper kernel patch may be developed.

#### General specifications (both PoC and measurement tooling)

- The kernel must be compiled with accounting and tracing support.
- In order to implement fairness, we first need to track the origin of block writes. If these writes come from a filesystem (which will usually be the case), then explicit support is required from the FS in order to track the origin. According to the kernel’s documentation, only ext2, ext4 and btrfs have this support implemented. **Implementing tracking support on filesystems is out of scope**. Thus, this isn’t guaranteed to work on other filesystems.

#### PoC operation specifications

- Maximum time from (a) start of offending writes to (b) throttling isolation: \SI{5}{\second}
- The kernel must be compiled with cgroup support.
- If multiple processes are writing to the same inode, and at least one of them is performing offending writes, throttling isolation is not guaranteed.
- Custom kernel patches might be required.

\begin{table} \hypertarget{fig:work-packages}{%
  \centering
  \includegraphics[width=1\columnwidth]{img/work-packages.pdf}
  \caption{Work packages for this project}\label{fig:work-packages}
} \end{table}

\begin{landscape}
  \begin{figure} \hypertarget{fig:gantt}{%
    \centering
    \includegraphics[width=1\columnwidth]{img/gantt.pdf}
    \caption{Gantt diagram showing initial work distribution}\label{fig:gantt}
  } \end{figure}
\end{landscape}

![Work breakdown structure of this project](img/block-diagram.png){#fig:block-diagram width=100%}

#### Initial work plan

Figure \ref{fig:block-diagram} shows the general structure of the work breakdown, and figures \ref{fig:work-packages} and \ref{fig:gantt} show the work packages and Gantt diagram, respectively. Critical review was initially planned to happen shortly after starting WP2.

#### Deviations

The main source of deviation was the unexpected cause for pauses: we didn't expect them to be caused by cache flushes. This required researching new approaches and studying the block layer in more detail. In the end, we were still able to get both a functional mitigation, and a working Proof-of-Concept. Some of the tasks from WP2 and were conducted in parallel with WP3, and most of WP3 couldn't be carried out. In addition, WP1 ended up getting more weight than WP2. We believe incidentals of this magnitude are natural in any research project, though.

This project was also substantially impacted by COVID-19, originating changes in both the work distribution (about a week of delay at the time of the critical review) and the deadline schedule from ETSETB.


<!-- An Introduction that clearly states the rationale of the thesis that includes:

- Statement of purpose (objectives).
- Requirements and specifications.
- Methods and procedures, citing if this work is a continuation of another project or it uses applications, algorithms, software or hardware previously developed by other authors.
- Work plan with tasks, milestones and a Gantt diagram.
- Description of the deviations from the initial plan and incidences that may have occurred.
-->
