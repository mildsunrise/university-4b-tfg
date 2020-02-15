## Initial investigation

#### Relevant kernel code

 - `mm/page-writeback.c`
   - `balance_dirty_pages`: function that does the throttling
   - `global_dirtyable_memory`: function that calculates total dirtyable memory
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

[ece13ac3](https://github.com/torvalds/linux/commit/ece13ac31bbe492d940ba0bc4ade2ae1521f46a5):
tracepoint added to `balance_dirty_pages`

[143dfe86](https://github.com/torvalds/linux/commit/143dfe8611a63030ce0c79419dc362f7838be557):
soft throttling begins when dirty space surpasses `avg(dirty_ratio, background_dirty_ratio)` (15% by default)

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
 - ftrace
 - dtrace (third-party)

event sources for userspace:

 - uprobes
 - ptrace

higher-level solutions:

 - event tracer
 - perf
 - systemtap

https://www.kernel.org/doc/html/latest/accounting/index.html

through the taskstats (netlink) interface we can get

 - cgroup info
 - per-task stats
 - per-process stats

the closest usable thing would be written byte count, there's also I/O delay

