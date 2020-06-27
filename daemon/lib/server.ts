import { createTaskstats, Taskstats } from './taskstats'
import * as ioprio from './ioprio'
import * as os from 'os';

// System parameters
const diskBandwidth = 70 // in MBps

// Daemon parameters
const sampleInterval = 1e3
const decayTime = 5e3
const decayCoeff = 1 - Math.exp(- sampleInterval / decayTime)
const offenderThreshold = .70
const innocentThreshold = .20
const tsBufferSize = 1024 * 1024

// err.code === 'ESRCH'

ioprio.set(process.pid, ioprio.Class.IDLE, 0)

;(async function main() {
    const socket = await createTaskstats()

    // Get our own stats
    await socket.getTask(process.pid)

    // Listen for task exits
    socket.on('taskExit', (t: Taskstats, p?: Taskstats) => {
        console.log('task exited:', {
            tid: t.acPID, comm: t.acComm, uid: t.acUID,
            readBytes: t.readBytes, writeBytes: t.writeBytes })
        if (p) console.log('belonging to process', {
            readBytes: p.readBytes, writeBytes: p.writeBytes })
    })

    const cpus: number = os.cpus().length
    console.log(`Tracking ${cpus} cpus`)
    await socket.registerCpuMask(`0-${cpus-1}`)

    socket.socket.socket.ref()

    // Increase the buffer size to avoid losing stats
    socket.socket.socket.setRecvBufferSize(tsBufferSize)
})()
