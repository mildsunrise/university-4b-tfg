#!/usr/bin/env python3
# Dependencies: python 3, trace-cmd
# This should be in a path WITHOUT SPACES or weird control characters
# Do NOT run as root!!

import time
import datetime
import ctypes
import tempfile
import sys
import os
import signal
import shutil
from os.path import dirname, join, abspath
from subprocess import run, Popen, DEVNULL
import json
import re
libc = ctypes.CDLL(None)

def checked_wait(task, timeout=None):
    rc = task.wait(timeout)
    if rc:
        raise Exception('Task {} terminated with exit code {}'.format(task.args, rc))

def check_lost_events():
    base = '/sys/kernel/tracing/per_cpu'
    for cpu in os.listdir(base):
        with open(join(base, cpu, 'stats')) as f:
            stats = dict( re.fullmatch(r'(.+?): (.*)', x.rstrip()).groups() for x in f )
        lost = int(stats['overrun']) + int(stats['dropped events'])
        if lost:
            raise Exception('{} lost events on {}'.format(lost, cpu))

base = dirname(dirname(abspath(__file__)))

## EXPERIMENT PARAMETERS ##
kernel_path = join(base, 'linux', 'linux')
memory = '150M'
write_bps = 1 * 1024 * 1024
dev_size = 130 * 1024 * 1024

def main():
    # Create experiment directory
    expname = datetime.datetime.now().strftime('%m-%d_%H-%M')
    experiment_base = join(base, 'exp', '_' + expname)
    os.makedirs(experiment_base)
    print('Preparing experiment at:', experiment_base)

    # Create device file, filled with 0xFF
    print('-- Creating block device --')
    dev_file = tempfile.NamedTemporaryFile(dir='/run/user/{}'.format(os.getuid()))
    block = bytes([ 0xFF ] * 4096)
    missing = dev_size
    while missing: missing -= dev_file.write(block[:missing])
    dev_file.flush()
    
    # Make filesystem
    print('-- Formatting --')
    run(check=True, args=[ 'mkfs.ext2', '-F', dev_file.name ])
    
    # Launch kernel!
    print('\x1b[1m-- Launching kernel --\x1b[m')
    run(check=True, args=[ kernel_path, 'mem=' + memory,
            'root=/dev/root', 'rootfstype=hostfs', 'rw',
            'ubdb=' + dev_file.name,
            'init=' + abspath(__file__), '--', experiment_base ])

    os.rename(experiment_base, join(base, 'exp', expname))
    print('\x1b[1m\x1b[32m-- Completed successfully --\nResults at: {}\x1b[m'.format(expname))

def inside_container():
    print('\x1b[1m-- Inside kernel --\x1b[m')
    os.chdir(sys.argv[1]) # change to experiment dir
    
    dev_file = '/dev/ubdb'
    dev_number = os.stat(dev_file).st_rdev
    dev_number = '{}:{}'.format(os.major(dev_number), os.minor(dev_number))
    
    # Mount common filesystems
    print('-- Mounting things --')
    blkio_base = '/sys/fs/cgroup/blkio'
    run(check=True, args=[ 'mount', '-t', 'proc', 'none', '/proc' ])
    run(check=True, args=[ 'mount', '-t', 'sysfs', 'none', '/sys' ])
    run(check=True, args=[ 'mount', '-t', 'tmpfs', 'none', '/sys/fs/cgroup' ])
    os.mkdir(blkio_base)
    run(check=True, args=[ 'mount', '-t', 'cgroup', '-o', 'blkio', 'none', blkio_base ])
    run(check=True, args=[ 'mount', '-t', 'tracefs', 'none', '/sys/kernel/tracing' ])
    
    # Throttle write bandwidth
    print('-- Throttling bandwidth --')
    blkio_write_bps = join(blkio_base, 'blkio.throttle.write_bps_device')
    with open(blkio_write_bps, 'w') as f: f.write('{} {}'.format(dev_number, write_bps))

    # Mount our block device
    print('-- Mounting FS --')
    run(check=True, args=[ 'mount', dev_file, '/mnt' ])
    
    # Preliminary things
    print('-- Preparing --')
    with open('experiment.json', 'w') as f:
        json.dump({
            'kind': 'uml',
            'start': datetime.datetime.now().isoformat(),
            'kernel': os.uname().release,
            'write_bps': write_bps,
            'dev_size': dev_size,
            'memory': memory,
        }, f, indent=4)
        f.write('\n')

    # Start experiment
    print('-- Starting experiment --')
    tasks = []
    add_task = lambda x: tasks.append(Popen(x, shell=True))
    def add_load(name, kind, *p):
        tasks.append(Popen([ join(base, 'analysis', 'load.py'), name, kind, *map(str, p) ]))

    #run(check=True, args=[ '/sbin/bash' ])
    add_task('trace-cmd record -e balance_dirty_pages -e global_dirty_state')
    time.sleep(3) # wait for it to start up

    add_load('c1', 'control', 0.05)
    add_load('w1', 'write', '/mnt/write1', 0.05)
    add_load('mw1', 'multiwrite', '/mnt/multiwrite1', 0.1)
    add_load('l2', 'load', '/mnt/load2', 43, int(dev_size*.2), 512)
    add_load('l1', 'load', '/mnt/load1',  5, int(dev_size*.5), 1024)

    checked_wait(tasks.pop())
    check_lost_events()
    for task in tasks: task.send_signal(signal.SIGINT)
    for task in tasks: checked_wait(task, 4)

    # at the end, we need to invoke the 'reboot' syscall to power off
    print('-- Powering off --')
    libc.syncfs(os.open('/', 0)) # force hostfs to sync data... poweroff unmounts forcefully
    libc.reboot(0x4321fedc)


if os.getpid() == 1:
    # we're init inside the VM! omfg!
    inside_container()
else:
    main()
