Userspace daemon that monitor tasks, and lowers the I/O class of heavy writers.

Requires Node v14.
The kernel requires `CONFIG_TASKSTATS` and `TASK_IO_ACCOUNTING`.

## Usage

Make sure that compiler and associated tools are installed:

~~~
sudo apt install build-essential
~~~

Install dependencies and compile everything:

~~~
npm install
~~~

To work, you need to set an I/O priority aware scheduler, such as CFQ or BFQ:

~~~
sudo sh -c 'echo bfq > /sys/block/sda/queue/scheduler'
~~~

Start as root (or with `CAP_NET_ADMIN` and `CAP_SYS_NICE`):

~~~
sudo node dist/server
~~~
