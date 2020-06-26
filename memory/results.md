# Experiments and results {#sec:results}

With proper reasearch & tooling in place, we now walk through the performed experiments, results and the conclusions or theories drawn from them: this is the analysis phase (section \ref{subsec:analysis}). We'll then investigate ways to mitigate the side effects and develop a PoC (section \ref{subsec:poc}).

It is advisable to read section \ref{sec:development} first, to be familiar with the experiment model and environment.

## Analysis phase {#subsec:analysis}

#### UML tests

We started performing experiments inside our UML kernel and analyzing them. We did several iterations which can be summarized in an experiment shown in figure \ref{fig:tl-uml-simple}. This experiment uses the configuration shown in table \ref{table:uml-config}, and we can see:

 - At $t = \SI{0}{\second}$: only the control \& innocent loads are running. We can observe almost no I/O, and the cache growing very slowly.

 - At $t = \SI{5}{\second}$: the first offender load starts kicking in, trying to write as much as possible. The dirty pages grow and reach the `dirty_limit` in a couple of seconds.
 We start observing **long pauses** (several seconds) interleaved by periods of zero throttling, on both the offender load and the multiwrite load, but not on the write load.

 - At $t \approx \SI{25}{\second}$: The kernel starts lowering the `dirty_limit`, which alters the global throttling curve[^only-global] (see figure \ref{fig:curve-global}) to apply more throttling to the processes. Long pauses stop and we start observing rate-limiting on the offender load (this can be seen through constant, but small, pauses on the `l1` pane; we can also observe how dirty pages grow much slower than before).

   [^only-global]: Note that our kernel was compiled with `CONFIG_BLK_WBT` disabled, and as such there should be no device-specific curve, only the global one.

 - At $t = \SI{43}{\second}$: The second offender load kicks in, but has zero impact on the rest of the system. It quickly gets rate-limited. The rate-limiting seems to be shared on both tasks, and is increased a bit to account for the new pressure.

\begin{table} \hypertarget{table:uml-config}{%
  \centering
  \input{img/results/uml_config.tex}
  \caption{Base configuration for UML experiments}\label{table:uml-config}
} \end{table}

![Timeline from UML base experiment](img/development/example-timeline.pdf){#fig:tl-uml-simple width=100%}

We can also observe a \SI{1}{\second} pause at $t = \SI{26}{\second}$, but since this pause also affected the control load and event count panes, it can be discarded as it was probably caused by the UML kernel being stopped for a while at host level.

#### Interpretation

There's some remarkable results to note in this experiment:

 - We were able to reproduce long, unfair pauses in an innocent load caused by the presence of an offender process. Horray!

 - These unfair pauses don't almost affect the `write` load, but do affect the `multiwrite` one. Further investigation reveals the `mw1` load is almost always being blocked on `openat` syscalls (i.e. when opening each file). However, we *did* observe pauses on `w1` as well in some experiments, it's just much less probable.

 - It takes a long time (\SI{20}{\second}) for soft-throttling to kick in correctly, but after that **there are no unwanted pauses**. Innocent loads aren't blocked at all, not even soft-throttled. Maybe the throttling does have some amount of fairness?

 - The `dirty_limit` throttling parameter doesn't (only) depend on configured ratios or free memory, but is adjusted through some unknown process, probably depending upon past I/O in a certain amount of time. We can see how the dirty threshold and background dirty threshold do not change.

 - The `dirty_limit` starts actually higher than the dirty threshold, at about \SI{135}{\percent} of the dirty threshold in this case... so the dirty threshold is *not* the actual limit.

We then performed several variations of the experiment to control for other factors. One of them was repeating the experiment but mounting the filesystem in `sync` mode. This disables the writeback cache, and allows us to make sure the long pauses are at least related to it. This didn't give the clearest results (figure \ref{fig:tl-uml-sync}) because there were much frequent machine-global pauses. Still, we get no unwanted pauses but increased latency due to synchronous operation.

![Timeline from UML experiment, but disabling the cache](img/results/tl-uml-sync.pdf){#fig:tl-uml-sync width=100%}

\clearpage
#### Live experiments {#par:live-experiments}

This looked like a promising reproduction of the problem, but the environment ---while highly controlled--- is still different from a real one in terms of sizes: the cache is very small, the bandwidth is also small, ... Also, the offender load could be doing something different to what a normal load would do. Thus, we wanted to perform a more realistic experiment to see if it matched what we saw inside UML.

So, a stripped down version of `experiment.py` was made, which runs the loads directly on the host. Also, instead of running offender loads it starts an actual command (which in our tests was `pacman -Syu` to upgrade the system). This script is called `live_experiment.py` and its source code may be found in appendix \ref{sec:code-experiment} as well as in the `analysis` folder of the submitted annex.

![Timeline from a live experiment (system upgrade)](img/results/tl-live-simple.pdf){#fig:tl-live-simple width=100%}

\begin{table} \hypertarget{table:live-config}{%
  \centering
  \input{img/results/live_config.tex}
  \caption{Base configuration for live experiments}\label{table:live-config}
} \end{table}

Again we needed many iterations of the experiment to apply fixes and get usable data, one of which is shown in figure \ref{fig:tl-live-simple} and table \ref{table:live-config} for the configuration. We won't go into a temporal description of the events like before, but there's an important thing to note: **no throttling is being applied, yet there are similar unwanted pauses**.

To verify that no throttling is ocurring, we can look at how no `balance_dirty_pages` events occur in the second pane, unlike in figure \ref{fig:tl-uml-simple}. And it's expected, since the dirty pages barely get to grow past the dirty background limit. Other things to note are: a much larger cache (\SI{1}{\giga\byte}), and that a lot more of these unwanted pauses affect the `w1` load as well.

So, on one hand we have confirmed how (in a more real environment) we observe these unwanted pauses, during which (as the lack of kernel tracer event shows) there is *almost no I/O* in the system. In fact, these pauses themselves reduce the offender's throughput enough that there's no need for actual throttling! But on the other, this experiment differs from our UML ones and seems to indicate the pauses have a different cause.

\clearpage
#### Looking closer

We then attempted to get more data on what was happening in the live experiment. We decided to capture more data from the tracer, namely:

 - All events in the whole `writeback` subsystem
 - `syscalls` events to precisely track when possibly blocking syscalls (`write`, `openat`, `close`) start \& end.

However these are a *lot* of events, especially on a real-life system. Since we are probably happy with just capturing a handful of pauses, we proceeded by manually turning the tracer on & off through the `tracing_on` file while `trace-cmd` was recording. We waited for a pause to happen, then turned the tracer on, and after around \SI{20}{\second} we got another pause. We then turned the tracer off.

This gave us a `trace.dat` dump of about \SI{720}{\mega\byte}. With help of our visualization tool, we noted the timestamps of our pauses and cropped the `trace.dat` file to those timestamps, leaving some padding:

~~~ bash
trace-cmd split -o trace-pause.dat 811900 811910
~~~

This gave us a more manageable \SI{110}{\mega\byte} dump.

We first produced a zoomed-in version of the timeline to have some overview of the period, which is shown in figure \ref{fig:tl-closeup}. The cycle times of `mw1` are now represented by dashed vertical lines on every pane. The following seems to happen on most pauses:

 1. The number of dirty pages reach the dirty background threshold.
 2. The cache moves a lot (around \SI{100}{\mega\byte}) of pages into writeback state (difference between black and blue line).
 3. The innocent load gets out of sleep, attempts to do I/O and gets blocked (pause).
 4. There is a period of almost no I/O, judging by the events count pane and the little growth in dirty pages. That also means we have less samples, but we can at least see how...
 5. These writeback pages get fully written (the lines touch again)
 6. I/O resumes, and *after some time*, our innocent load gets unblocked.

\begin{landscape}
  \begin{figure} \hypertarget{fig:tl-closeup}{%
    \centering
    \includegraphics[width=1\columnwidth]{img/results/close-up.pdf}
    \caption{Timeline close-up when no measures are taken}\label{fig:tl-closeup}
  } \end{figure}
\end{landscape}

This seems to imply that the cause for these pauses is the writeback *itself*, not the throttling. Remember that the VM layer works in terms of pages, but the VFS layers works with inodes, and the writeback cache must reconcile both. We inspected the `trace-pause.dat` file in Kernelshark, and among other things noticed that **the innocent load is always woken up just after inodes are cleared** according to the event log, see figure \ref{fig:event-log-before-end}. The selected event is when the `openat` syscall in `mw1` exits.

\begin{figure} \hypertarget{fig:event-log-before-end}{%
  \centering
  \includegraphics[width=1\textwidth]{img/results/inspection-events-before-exit-0.png}
  \vskip .8em
  \includegraphics[width=1\textwidth]{img/results/inspection-events-before-exit-1.png}
  \caption{Tracer events prior to finish of a long pause}\label{fig:event-log-before-end}
} \end{figure}

It is also important to look at how there is a period (point 6) where high-rate I/O starts again, yet our innocent load remains blocked. Maybe the offender load has been unblocked first and starts writing again, but it is not obvious why this would happen.

#### The cause

Indeed, a look at the kernel's source code seems to confirm that inodes are locked while in writeback state \cite{source-include-fs}:

> Inode state bits.  Protected by `inode->i_lock`
> [...]  
> Two bits are used for locking and completion notification, `I_NEW` and `I_SYNC`.
>
> [...]
>
> **I_SYNC**: Writeback of inode is running. The bit is set during data writeback, and cleared with a wakeup on the bit address once it is done. The bit is also used to pin the inode in memory for flusher thread.

And also \cite{source-fs-writeback}:

~~~ c
static void inode_sync_complete(struct inode *inode)
{
  inode->i_state &= ~I_SYNC;
  /* If inode is clean an unused, put it into LRU now... */
  inode_add_lru(inode);
  /* Waiters must see I_SYNC cleared before being woken up */
  smp_mb();
  wake_up_bit(&inode->i_state, __I_SYNC);
}
~~~

Knowing all this, we draw the conclusion that these unwanted pauses are a direct consequence of (a) having a large cache, and (b) inodes being locked while waiting for writeback. Large caches make it possible (and frequent!) for large amounts of data to be queued for writeback when the cache is flushed. This means some of those inodes can be locked for a long time before they're finally written, and this is probably what's blocking our innocent load too.

To be clear: the writeback cache is a complex component and the reality is probably a bit more complicated, but that conclusion means that any offender will cause long pauses not only on itself, but any system process that writes to the filesystem at that time.

The relevant variable here is the amount of time it takes to flush the cache, which gives a high bound for the pause time:

\begin{equation*}
  T_{{flush}} =
    \frac{\text{dirty background threshold}}{\text{disk throughput}}
    \simeq \frac{\SI{375}{\mega\byte}}{\SI{70}{\mega\byte\per\second}} \simeq \SI{5.4}{\second}
\end{equation*}

Over the last couple of decades, RAM size has increased almost logarithmically \cite{ram-growth}. Disk sizes \& densisties have also increased, but disk *throughput* has remained almost the same. So around 2005, flush times were probably on the order of *tenths* of a second and didn't hurt responsiveness that much.

While doing initial research, we found people complaining about large caches on the Linux kernel mailing list around late 2013 \cite{lkml-thresholds}:

> My feeling is that vm.dirty_ratio/vm.dirty_background_ratio should _not_ be
> percentage based, 'cause for PCs/servers with a lot of memory (say 64GB or
> more) this value becomes unrealistic (13GB) and I've already had some
> unpleasant effects due to it.

And this was Linus Torvald's response, which includes a rationale about the percentage ratios:

> Right. The percentage notion really goes back to the days when we
> typically had 8-64 *megabytes* of memory So if you had a 8MB machine
> you wouldn't want to have more than one megabyte of dirty data, but if
> you were "Mr Moneybags" and could afford 64MB, you might want to have
> up to 8MB dirty!!
> 
> Things have changed.
> 
> So I would suggest we change the defaults. Or pwehaps make the rule be
> that "the ratio numbers are 'ratio of memory up to 1GB'", to make the
> semantics similar across 32-bit HIGHMEM machines and 64-bit machines.
> 
> The modern way of expressing the dirty limits are to give the actual
> absolute byte amounts, but we default to the legacy ratio mode..
> 
> Linus

Theodore Ts'o suggested to make it possible to specify the thresholds in terms of *seconds* ($T_{{flush}}$ in the formula above) rather than absolute sizes:

> What I think would make sense is to dynamically measure the speed of
> writeback, so that we can set these limits as a function of the device
> speed.  It's already the case that the writeback limits don't make
> sense on a slow USB 2.0 storage stick; I suspect that for really huge
> RAID arrays or very fast flash devices, it doesn't make much sense
> either.

This wasn't implemented, which is not surprising given there's no straightforward way to do it ---there's only one cache, which may serve different disks, and determining or even defining the throughput of a disk isn't easy.

It *was* made possible to specify the thresholds in bytes, rather than integer percentages (see page \pageref{par:cache-parameters}), but it is not enabled by default and we are not aware of any distributions that take care of setting them up.


## PoC phase {#subsec:poc}

Once we have a clear enough understanding of the problem, we'll try to investigate ways to alleviate the problem. Note that the pauses reproduced inside the UML kernel (figure \ref{fig:tl-uml-simple}) seem to have a different nature than the pauses reproduced in the live experiments (figure \ref{fig:tl-closeup}), where no throttling is even triggered.

The first objective involves altering our tests from the analysis phase, trying different approaches until we measure a consistent reduction in pauses experienced by innocent loads.

Once (and if) we find a mechanism to reduce these pauses, we'll then automate it into a *userspace daemon* to apply it automatically on a live system, whenever it detects an offender task.

#### Initial efforts

It's important to note that this thesis isn't entirely in chronological order. Due to time / workplan constraints, this PoC development phase was performed partially in parallel with the analysis phase. Before the cause of the long pauses was pinned down we tried many approaches, including:

 - CPU-limiting the offender loads.

 - Limiting their memory consumption using `memcg` cgroups (which should theoretically limit their allowed amount of dirty pages, indirectly).

 - Throttling their block I/O bandwidth using `blkio` cgroups.

As well as combinations of multiple restrictions. All this didn't seem to have statistically significant effects on pauses.

Later, when it was discovered that the origin of those pauses (in live experiments) was due to cache flushes, we moved our efforts into live experiments. After a bit of more research into the block I/O layer, we tried using the BFQ I/O scheduler.

#### BFQ experiments

As explained in section \ref{subsec:resource-control}, BFQ is a fair I/O scheduler. It works by reserving the disk to one task for some time, then switching to the next. By adjusting the proportion of time assigned to each task using *weights*, both bandwidth and latency can be theoretically controlled. BFQ also supports *hierarchical distributions* and different *queues* which are served in strict priority order.

Thus, we switched from our default `mq-deadline` to using BFQ:

~~~ bash
echo bfq > /sys/block/sda/queue/scheduler
~~~

**Note:** Not all block device drivers use I/O schedulers; some of them handle BIOs directly. In our case, the root filesystem was mounted on an LVM volume, which uses the *device mapper* and is an example of such a device. Since BIOs are eventually forwarded to the disk (`sda`) device, the effect should be the same as if the FS was directly mounted there. Our understanding of the block I/O layer is still limited though, so we could be wrong.

Given the origin of our pauses, it seems intuitive that lowering the priority of the offender tasks should allow flushed writes from other tasks to be processed first, thus reducing pauses. This is what we tried next.

According to BFQ's documentation, the scheduler automatically detects interactive tasks and assigns higher weights to them by default \cite{docs-bfq}. This seems to be in line with what we're looking for; however, we're not just looking for higher weights for our innocent tasks, but for their requests to be served *first*. Some preliminary experiments confirmed that simply switching to the scheduler didn't seem to reduce pauses substantially.

\begin{landscape}
  \begin{figure} \hypertarget{fig:tl-closeup-bfq}{%
    \centering
    \includegraphics[width=1\columnwidth]{img/results/close-up-bfq.pdf}
    \caption{Timeline close-up when using BFQ and the \mintinline{text}{idle} class}\label{fig:tl-closeup-bfq}
  } \end{figure}
\end{landscape}

BFQ distributions can be set through `blkio` cgroups, like we did before, but it can also be controlled through per-process I/O priorities. These priorities can be managed through the `ionice` command or programmatically using `ioprio_get` and `ioprio_set`. It's important to note, though, that these "I/O priorities" usually control the *weight* of the task, not its actual priority queue. To place the task on a different queue, we have to supply a different I/O class when setting the priority to the process.

Thus, in addition to using the BFQ scheduler, we also tried starting the offender load in the `idle` class. This should cause their requests to be the last ones to be processed, hopefully reducing innocent pauses. We modified `live_experiment.py` to launch the main command prefixed with `ionice -c idle`, and then performed some experiments.

The results seemed to show that **pauses were greatly reduced**. Figure \ref{fig:tl-closeup-bfq} shows a close up of one of the live experiments. Compared to figure \ref{fig:tl-closeup}, we can appreciate how there's still periods of no I/O in the system (at \SIrange{76}{77}{\second}, at \SIrange{77.7}{79.5}{\second}, and at \SI{82.7}{\second}) but our innocent load still runs unaffected, with its operations completing immediately!

There *is* a \SI{170}{\milli\second} pause near the end of the timeline though, but these were rare as figure. Figure \ref{fig:tl-live-bfqidle} shows the overview of another experiment, and again, the biggest pause we can see is \SI{585}{\milli\second} long, followed by \SI{195}{\milli\second} and \SI{127}{\milli\second}. Disks have internal caches, background processes, may reorder requests, etc. and this is probably the reason pauses do not entirely go away.

![Timeline from a live experiment using BFQ and the `idle` class](img/results/tl-live-bfqidle.pdf){#fig:tl-live-bfqidle width=100%}

#### Final results

To better measure & compare the effects of different approaches to reducing pauses, we ran these tests in a different machine. This machine has a *much slower disk* which, together with the default cache size, results in pauses that can easily reach \SI{40}{\second}. It is an extremely large cache and should give us a clearer comparison of both approaches. When performing comparisons, it's important to account for cache size and written data.

\begin{figure} \hypertarget{fig:bfq-comparison}{%
  \centering
  \includegraphics[width=.8\textwidth]{img/results/bfq-comparison-1.pdf}
  \includegraphics[width=.8\textwidth]{img/results/bfq-comparison-2.pdf}
  \caption{Pause comparison before / after enabling BFQ, on a large cache}\label{fig:bfq-comparison}
} \end{figure}

After running the experiments, we created an histogram plotting the longest pauses experienced in every experiment, together with some parameters. One of them is the **wait time** which measures, given a random instant, how much we have to wait for the current pause to end. The results can be seen in figure \ref{fig:bfq-comparison}.

We can see how simply enabling BFQ *does* appear to reduce the longest pauses a bit, but setting the `idle` class on the offender is needed for substantial effects: it brings the longest pause to half the time, achieves \textbf{\SI[detect-weight=true]{210}{\percent} reduction on wait time} and also a \SI{30}{\percent} reduction on the total time the innocent load stays paused for.

We also attempted to use the machine while the experiments were running, and can confirm that it was barely possible except when putting the offender in the `idle` class. Thus, while far from a perfect solution, we can verify that lowering I/O priorities substantially improves system responsiveness.

<!-- TODO -->

