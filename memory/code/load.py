#!/usr/bin/env python3
import os
import sys
import time
import tempfile
import json
import pickle

def make_control(idle):
    def cycle():
        time.sleep(idle)
    return { 'cycle': cycle }

def make_write(f, idle):
    f = open(f, mode='wb', buffering=0)
    i = 0
    def cycle():
        nonlocal i
        f.write('{}'.format(i).encode())
        i += 1
        time.sleep(idle)
    return { 'cycle': cycle }

def make_load(f, wait, size, block):
    f = open(f, mode='wb', buffering=0)
    remaining = size // block
    block = bytes([0]*block)
    waited = False
    def cycle():
        nonlocal waited, remaining
        if not waited:
            time.sleep(wait)
            waited = True
            return
        if remaining <= 0:
            return True
        f.write(block)
        remaining -= 1
    return { 'cycle': cycle }

def make_multiwrite(f, idle):
    i = 0
    def cycle():
        nonlocal i
        with open(f + '.' + str(i), 'wb', buffering=0) as ff:
            ff.write(b'test')
        i += 1
        time.sleep(idle)
    return { 'cycle': cycle }

loads = {
    'control': (make_control, [ ('idle', float) ]),
    'load': (make_load, [ ('file', str), ('wait', float), ('size', int), ('block', int) ]),
    'write': (make_write, [ ('file', str), ('idle', float) ]),
    'multiwrite': (make_multiwrite, [ ('file', str), ('idle', float) ]),
}


args = sys.argv[1:]
if len(args) < 2:
    print('Usage: ./load.py <name> <kind> [<parameter>...]', file=sys.stderr)
    print('Available loads:', file=sys.stderr)
    for kind, (_, params_def) in loads.items():
        tokens = [kind] + ['<{}>'.format(n) for n, f in params_def]
        print(' {}'.format(' '.join(tokens)), file=sys.stderr)
    exit(1)
name, kind, *params = args
if kind not in loads:
    print('Error: Invalid load {}'.format(repr(kind)), file=sys.stderr)
    exit(1)
maker, params_def = loads[kind]
if len(params) != len(params_def):
    print('Error: Expected {} params, found {}'.format(len(params_def), len(params)), file=sys.stderr)
    exit(1)
params = [ (n,f(x)) for (n,f), x in zip(params_def, params) ]

gettime = lambda: time.clock_gettime(time.CLOCK_MONOTONIC)
load = maker(*(x[1] for x in params))
times = [ gettime() ]
try:
    while not load['cycle']():
        times.append(gettime())
except KeyboardInterrupt:
    pass
with open('load.{}.pkl'.format(name), 'wb') as out:
    pickle.dump({
        'pid': os.getpid(),
        'kind': kind,
        'params': dict(params),
        'times': times,
    }, out)
