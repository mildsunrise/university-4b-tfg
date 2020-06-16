#!/usr/bin/env python3
# Dependencies: python 3, trace-cmd
# Like experiment.py, but runs the tasks directly on the host
# and uses the specified command as the load.

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

def main():
    if os.getuid() != 0:
        print('Needs to be run as root.', file=sys.stderr)
        exit(1)

    # Create experiment directory
    expname = datetime.datetime.now().strftime('%m-%d_%H-%M')
    experiment_base = join(base, 'exp', '_' + expname)
    os.makedirs(experiment_base)
    print('Preparing experiment at:', experiment_base)
    os.chdir(experiment_base) # change to experiment dir

    # Preliminary things
    print('-- Preparing --')
    with open('experiment.json', 'w') as f:
        json.dump({
            'kind': 'live',
            'start': datetime.datetime.now().isoformat(),
            'kernel': os.uname().release,
        }, f, indent=4)
        f.write('\n')
    os.mkdir('loads')

    # Start experiment
    print('-- Starting experiment --')
    tasks = []
    add_task = lambda x: tasks.append(Popen(x, shell=True))
    def add_load(name, kind, *p):
        tasks.append(Popen([ join(base, 'analysis', 'load.py'), name, kind, *map(str, p) ]))

    add_task('trace-cmd record -e balance_dirty_pages -e global_dirty_state')
    time.sleep(3) # wait for it to start up

    add_load('c1', 'control', 0.05)
    add_load('w1', 'write', 'loads/write1', 0.05)
    add_load('mw1', 'multiwrite', 'loads/multiwrite1', 0.1)

    time.sleep(10)
    main_command = 'pacman -Syu'
    main_start = time.clock_gettime(time.CLOCK_MONOTONIC)
    main = Popen(main_command, shell=True)
    main.wait()

    check_lost_events()
    for task in tasks: task.send_signal(signal.SIGINT)
    for task in tasks: checked_wait(task, 4)

    # Finish things
    shutil.rmtree('loads')
    with open('main.json', 'w') as f:
        json.dump({
            'start': main_start,
            'command': main.args,
            'pid': main.pid,
            'exit_code': main.returncode,
        }, f, indent=4)
        f.write('\n')
    os.rename(experiment_base, join(base, 'exp', expname))
    print('\x1b[1m\x1b[32m-- Completed successfully --\nResults at: {}\x1b[m'.format(expname))

main()
