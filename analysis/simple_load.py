import time
import tempfile

f = tempfile.NamedTemporaryFile(mode='wb', buffering=0)
i = 0
def cycle():
    global i
    f.seek(0)
    f.write('{}'.format(i).encode())
    i += 1
    time.sleep(0.1)

gettime = lambda: time.clock_gettime(time.CLOCK_MONOTONIC)
last = gettime()
while True:
    cycle()
    now = gettime()
    if now - last > .2:
        print('Time:', now - last)
    last = now
