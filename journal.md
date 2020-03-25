## Initial investigation

#### Relevant kernel code

 - `mm/page-writeback.c`
   - `struct dirty_throttle_control`: parameters to `balance_dirty_pages` and its subroutines
   - `struct wb_domain`
   - `balance_dirty_pages`: root function that does the throttling, or tells scheduler to pause/ratelimit the task
   - `domain_dirty_limits`: calculate the thresholds for a wb_domain
   - `wb_position_ratio`: algorithm that implements the actual ratelimiting curve, called from `balance_dirty_pages`
   - `global_dirtyable_memory`: function that looks up total dirtyable memory
 - `mm/backing-dev.c`
 - `fs/fs-writeback.c`
 - `mm/memcontrol.c`

#### Documentation

<https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/sysctl/vm.rst> ([old](https://github.com/torvalds/linux/blob/v4.18/Documentation/sysctl/vm.txt>)):  
gives a general overview of the exposed options governing the memory cache

<https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/mm/concepts.rst>:  
introduction to the memory subsystem

#### Relevant changes

(here, cgroup means *memory cgroup* aka *memcg*)

unknown:
nothing is done until dirty space surpasses `dirty_ratio` (20% by default); then I/O is throttled

[143dfe86](https://github.com/torvalds/linux/commit/143dfe8611a63030ce0c79419dc362f7838be557):
soft throttling begins when dirty space surpasses `avg(dirty_ratio, background_dirty_ratio)` (15% by default)  
this also removes some process-level fairness

[1df64719](https://github.com/torvalds/linux/commit/1df647197c5b8aacaeb58592cba9a1df322c9000):
"hard throttle 1000+ dd on a slow USB stick" (attempts to completely stop a task
when rate-limiting isn't enough)

[468e6a20](https://github.com/torvalds/linux/commit/468e6a20afaccb67e2a7d7f60d301f90e1c6f301):
`task->dirties` and `vm_dirties` are removed because 'no longer used'

[ece13ac3](https://github.com/torvalds/linux/commit/ece13ac31bbe492d940ba0bc4ade2ae1521f46a5):
tracepoint (re)added to `balance_dirty_pages`

unknown:
per cgroup page statistics are now collected.  
pages can be moved between cgroups!

[3ea67d06](https://github.com/torvalds/linux/commit/3ea67d06e4679a16f69f66f43a8d6ee4778985fc):
per cgroup 'writeback pages' are now counted

unknown:
per cgroup 'dirty pages' are now counted

[a1c3bfb2](https://github.com/torvalds/linux/commit/a1c3bfb2f67ef766de03f1f56bdfff9c8595ab14):
dirtyable maximum space no longer includes anon (i.e. swappable) pages; that means the effective limit is lowered


#### Other

https://unix.stackexchange.com/questions/480467/writeback-cache-dirty-seems-to-be-limited-to-even-less-than-dirty-background

https://unix.stackexchange.com/questions/482595/writeback-cache-dirty-seems-to-be-limited-below-the-expected-threshold-where

<https://lore.kernel.org/lkml/20131029203050.GE9568@quack.suse.cz/> in this thread, there are some discussions about system stability on writeback

there's also blkio cgroups, that allow imposing I/O limits, per device

systemd options for resource control:
https://www.freedesktop.org/software/systemd/man/systemd.resource-control.html


### Memory cgroups

memcg, old documentation: https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/cgroup-v1/memory.rst  
memcg, new documentation: https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/cgroup-v2.rst#memory

memcg implementation memo: https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/cgroup-v1/memcg_test.rst

Relevant memcg stat values:

 - `dirty`:
   v1: # of bytes that are waiting to get written back to the disk  
   v2: Amount of cached filesystem data that was modified but not yet written back to disk

 - `writeback`:
   v1: # of bytes of file/anon cache that are queued for syncing to disk  
   v2: Amount of cached filesystem data that was modified and is currently being written back to disk

#### Limitation: Memory ownership

Processes may be moved between cgroups, but memory isn't moved with them:

> Migrating a process across cgroups is a relatively expensive operation and stateful resources such as memory are not moved together with the process.

I don't think it would be possible anyway, as pages aren't associated to processes AFAIK...

See also [memory ownership](https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/cgroup-v2.rst#memory-ownership):

> A memory area is charged to the cgroup which instantiated it and stays charged to the cgroup until the area is released. Migrating a process to a different cgroup doesn't move the memory usages that it instantiated while in the previous cgroup to the new cgroup.
>
> A memory area may be used by processes belonging to different cgroups. To which cgroup the area will be charged is in-deterministic; however, over time, the memory area is likely to end up in a cgroup which has enough memory allowance to avoid high reclaim pressure.

#### Limitation: Filesystem support

The [documentation confirms](https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/cgroup-v2.rst#writeback) that only **ext2, ext4 and btrfs** attribute writes to the cgroup that made them:

> Page cache is dirtied through buffered writes and shared mmaps and written asynchronously to the backing filesystem by the writeback mechanism. Writeback sits between the memory and IO domains and regulates the proportion of dirty memory by balancing dirtying and write IOs.
> 
> The io controller, in conjunction with the memory controller, implements control of page cache writeback IOs. The memory controller defines the memory domain that dirty memory ratio is calculated and maintained for and the io controller defines the io domain which writes out dirty pages for the memory domain. Both system-wide and per-cgroup dirty memory states are examined and the more restrictive of the two is enforced.
> 
> cgroup writeback requires explicit support from the underlying filesystem. Currently, cgroup writeback is implemented on ext2, ext4 and btrfs. On other filesystems, all writeback IOs are attributed to the root cgroup.
> 
> There are inherent differences in memory and writeback management which affects how cgroup ownership is tracked. Memory is tracked per page while writeback per inode. For the purpose of writeback, an inode is assigned to a cgroup and all IO requests to write dirty pages from the inode are attributed to that cgroup.
> 
> As cgroup ownership for memory is tracked per page, there can be pages which are associated with different cgroups than the one the inode is associated with. These are called foreign pages. The writeback constantly keeps track of foreign pages and, if a particular foreign cgroup becomes the majority over a certain period of time, switches the ownership of the inode to that cgroup.
> 
> While this model is enough for most use cases where a given inode is mostly dirtied by a single cgroup even when the main writing cgroup changes over time, use cases where multiple cgroups write to a single inode simultaneously are not supported well. In such circumstances, a significant portion of IOs are likely to be attributed incorrectly. As memory controller assigns page ownership on the first use and doesn't update it until the page is released, even if writeback strictly follows page ownership, multiple cgroups dirtying overlapping areas wouldn't work as expected. It's recommended to avoid such usage patterns.

This was expected... FIXME: mention improving support for more filesystems is out of scope

Instructions for implementing filesystem support to annotate writes to the cgroup they belong: <https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/cgroup-v2.rst#filesystem-support-for-writeback>

#### Limitation: Per-group restrictions

**Apparently there's no per-cgroup knobs for dirty pages**, instead, the global dirty ratio is used but calculated according to cgroup memory limits. Not cool :(

according to [this mail](http://lkml.iu.edu/hypermail/linux/kernel/1102.3/00941.html) there *was* a dirty pages restriction
proposed somewhere, controllable via `memory.dirty_limit_in_bytes`. I can't seem to find this in actual kernel though

#### cgroup v1 vs v2

cgroup v1 allowed threads of a process to belong to different cgroups; in v2, all tasks in a process belong to the same cgroup

cgroup v1 allowed multiple hierarchies, this was removed in v2

blkio controller was renamed to io in v2 (?)

it seems lots of per-cgroup knobs have been removed in v2


### Profiling / accounting / tracing tools

https://www.kernel.org/doc/html/latest/trace/index.html

event sources:

 - tracepoints
 - kprobes (originally part of dprobes) (hope that's not needed)
   - ebpf installable as kprobes, from userspace. **bcc** helps with this!
 - ftrace (includes a function tracer, event tracer, and some other things that make use of kprobes)
 - dtrace (third-party)

event sources for userspace:

 - uprobes
 - ptrace

higher-level solutions:

 - bcc as mentioned above (maximum control, but complex)
 - trace-cmd (probably going to be the most useful)
 - perf (oriented into kernel profiling, not what we need)
 - systemtap (I think it's better to use the features directly)

https://www.kernel.org/doc/html/latest/accounting/index.html

through the taskstats (netlink) interface we can get

 - cgroup info
 - per-task stats
 - per-process stats

the closest usable thing would be written byte count, there's also I/O delay

## 2020-02-23

Learn more in depth about the tracing subsystem (ftrace), how to enable events,
parse the buffer, event filtering, triggers, etc. First, mount the tracefs filesystem
if it's not already mounted:

~~~
sudo mount -t tracefs tracefs /sys/kernel/tracing
~~~

**Note:** The location above is the right one. [Historically](https://www.kernel.org/doc/html/latest/trace/ftrace.html#the-file-system)
(before 4.1) there was no tracefs, this info was available at `/sys/kernel/debug/tracing`.
For backwards compatibility, it's still available there as well.

The [`writeback` subsystem](https://github.com/torvalds/linux/blob/master/include/trace/events/writeback.h) is what we should look at. Relevant events:

 - **writeback:balance_dirty_pages**  
   function that does the throttling, according to investigation
   - fields

 - **writeback:global_dirty_state**
   reports current state regarding dirty pages! just what we need ^^
   gives current dirty, writeback and unstable pages  
   gives background and normal thresholds, in pages (I think)  
   gives 'dirty limit' <- **FIXME** what's this?  
   gives accumulated dirtied and written pages

 - **writeback:bdi_dirty_ratelimit**  
   AFAIK, this only applies on per-'block device' dirty pages limiting

 - **writeback:writeback_wake_background**

 - **writeback:writeback_pages_written**  
   just reports number of written pages

Other events: `grep dirty /sys/kernel/debug/tracing/available_events`

Build quick Node.JS program to plot the following in realtime:

 - dirty pages
 - global dirtyable memory
 - throttling (??)

In the future, program should also record events to disk

**Important** It seems the Linux tracer provides enough info for what we need,
and we can log additional info *into the tracer* which is great. So I think we can just
record ftrace events and inspect them later. We shouldn't need any more flexibility
than that, at least in recording time.

Update: While I was writing the application I discovered KernelShark & trace-cmd & libtracefs & libtracecmd & libparsevent (all this is part of trace-cmd). KernelShark is a GUI frontend, which is
super cool, but it won't let me monitor a field in the event info..... so :(

There's trace-cmd which records the trace_pipe_raw buffers from all CPUs into a single
`trace.dat` file, and it does it using `splice` so there's no userspace involved. **It
also has a [Python API](https://github.com/rostedt/trace-cmd/blob/master/Documentation/README.PythonPlugin)
to read 'most information' of the records in `trace.dat`!**

> Question: Do `trace_pipe_raw` and `trace.dat` record trace markers?  
> A: It seems they do! As `print` events.
>
> Question: Does it support real-time viewing?  
> A: No.

So it seems pretty much what I need. In addition to this, I only need to write
a few control jobs and I can begin to run tests!

The Python bindings end up at `/usr/lib/trace-cmd/python`.
But WTF, it doesn't link to the library at all!

~~~
alba@alba-tpi ~> export PYTHONPATH=/usr/lib/trace-cmd/python
alba@alba-tpi ~> python
Python 3.8.1 (default, Jan 22 2020, 06:38:00) 
[GCC 9.2.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import ctracecmd
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
ImportError: /usr/lib/trace-cmd/python/ctracecmd.so: undefined symbol: tracecmd_append_cpu_data
>>> 
alba@alba-tpi ~> ldd /usr/lib/trace-cmd/python/ctracecmd.so 
ldd: avís: no teniu permís d’execució per a `/usr/lib/trace-cmd/python/ctracecmd.so'
	linux-vdso.so.1 (0x00007fffbbd57000)
	libc.so.6 => /usr/lib/libc.so.6 (0x00007f31765a2000)
	/usr/lib64/ld-linux-x86-64.so.2 (0x00007f317685a000)
~~~

This may be due to the AUR package passing wrong flags...

Did some initial tests with cgroups and the monitor application.
And it appears that **a memcg successfully isolates the
throttling!**

Next steps:
 - Fix the python binding so we can access event data
 - Understand the fields of `balance_dirty_pages` events
 - Do some proper tests, and use cgroupv2

Possible issues that complicate the project:
 - Processes that spawn childs which *themselves* do the I/O spam...
   we should detect these cases and add the parent too
 - As said above, we can't directly restrict the dirty
   limit for a cgroup
 - We need to create sub-cgroups in the hierarchy, and delete
   them when no longer needed
 - We need to stick to v1 or v2. systemd uses v1, so we need
   to use v1... but then the daemon will *not* work on systems
   that use v2


## 2020-02-29

`current` seems to be a global kernel variable containing
current task. **Surprisingly**, `current` was used before the
rate-limit patch to provide fairness when throttling! The patch
removes all uses of `current` and upon review, it seems that
`balance_dirty_pages` is no longer task dependent (except for one little detail, see third point)!
What the fuck! This raises questions:

 - Does that mean they actually *had* the task info at that time?
 - Was that info removed / lost, or is it available today?  
   The first makes no sense, because otherwise, why do you need
   explicit FS support to annotate BIOs? You could just look at
   the memcg of the current task.
 - `current` is still used (both after the patch, and now) when
   calculating the limits, but only in this way: if the task has
   `PF_LESS_THROTTLE` or is realtime, the calculated limits are
   increased by 25% and also added `global_wb_domain.dirty_limit / 32`.

Relevant option (cgroup dirty tracking): `CONFIG_CGROUP_WRITEBACK`

`wb_domain` seems to be just cgroup related.

The cgroup subparameters (also `dirty_throttle_control`) are called `gdtc` or `mdtc` or `sdtc`,
in contrast to 'dtc' which is the root parameters structure.
There's also the `wb_domain`.

Question: When is `balance_dirty_pages` called?  
Answer: It seems `balance_dirty_pages_ratelimited_nr` calls `balance_dirty_pages` but only when
necessary. Calls/results vary per CPU! By default, the ratelimiting is set to 32, i.e. `balance_dirty_pages`
is only called after the CPU has dirtied more than 32 pages since last call. Once cache is full, ratelimit
is decreased a lot to be precise.

**Important**: Is domain limit treated as a hard limit? BDI limit is not.

**Important**: Dirty position control line (line 830) (aka `wb_position_ratio`, previously `bdi_position_ratio`) has a very in-depth explanation
of the throttling, this is what calculates the actual ratelimit and smoothly
ramps it up depending on the limit. **Is this per task?** → doesn't seem so.

what is the `strictlimit` feature?  
what is `struct pglist_data`, called node?  
what is `get_writeback_state`?  
what changes have been done to `wb_position_ratio`?  
what happened to `dirties` field in `task_struct`, when was it removed?

Position control line seems to be made of two curves, one for the BDI and other for the wb_domain (i.e. memcg?).
