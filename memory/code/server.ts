import { promisify } from 'util'
import PromisePool from 'es6-promise-pool'
import { createTaskstats, Taskstats } from './taskstats'
import * as ioprio from './ioprio'
import * as os from 'os'
import { readdirSync, readFileSync } from 'fs'
const delay = promisify(setTimeout)

// System parameters
const diskBandwidth = 70 // in MBps

// Daemon parameters
const sampleInterval = 2e3
const decayTime = 8e3
const decayCoeff = 1 - Math.exp(- sampleInterval / decayTime)
const offenderThreshold = .70
const innocentThreshold = .20
const parentFactor = .7
const warnThreshold = 1.5
const tsBufferSize = 1024 * 1024
const fetchConcurrency = 100

; (async function main() {

    const getWrittenBytes = (p: Taskstats) => p.writeBytes - p.cancelledWriteBytes

    // Pseudo-filesystem, shouldn't block the loop...
    const listPids = (): number[] =>
        readdirSync('/proc').filter(x => /^\d+$/.test(x)).map(x => Number(x))
    const listTids = (pid: number): number[] => {
        try {
            return readdirSync(`/proc/${pid}/task`).map(x => Number(x))
        } catch (e) {
            if ((e as any).code === 'ENOENT')
                return []
            throw e
        }
    }
    const readPPID = (pid: number) => {
        try {
            return Number(/^\d+ \([\s\S]+\) . (\d+)/.exec(
                readFileSync(`/proc/${pid}/stat`, 'utf8'))![1])
        } catch (e) {
            if ((e as any).code === 'ENOENT')
                return
            throw e
        }
    }

    const ignoreEsrch = (e: Error) =>
        ((e as any).code === 'ESRCH' || e.message === 'Request rejected: ESRCH')
            ? null : Promise.reject(e)

    // FETCH CODE

    interface ProcessData {
        pid: number
        command?: string
        parent: number
        writtenBytes: bigint
    }

    function aggregateData(pid: number, tasks: Map<number, Taskstats>): ProcessData {
        let writtenBytes: bigint = 0n
        let parent: number | null = null
        tasks.forEach(t => {
            writtenBytes += getWrittenBytes(t)
            if (parent !== null && parent !== t.acPPID)
                throw Error('parent mismatch')
            parent = t.acPPID
        })
        return {
            pid, command: tasks.get(pid)?.acComm, parent: parent!, writtenBytes
        }
    }

    const fetchProcesses = (cb: (p: ProcessData) => any) =>
        new PromisePool(function *() {
            for (const pid of listPids()) {
                const tasks: Map<number, Taskstats> = new Map()
                const tids = listTids(pid)
                let done = 0
                for (const tid of tids) {
                    yield fetchSocket.getTask(tid)
                        .then(t => tasks.set(tid, t), ignoreEsrch)
                        .then(() => {
                            if (++done === tids.length && tasks.size)
                                cb(aggregateData(pid, tasks))
                        })
                }
            }
        }() as any, fetchConcurrency).start()

    // TREE CODE
    
    interface TreeNode {
        parent: number
        children: number[]
        writtenBytes: bigint
        writeBw: number
        command: string
    }

    function initializeNode(p: ProcessData) {
        const node: TreeNode = {
            parent: p.parent,
            children: [],
            writtenBytes: p.writtenBytes,
            writeBw: 0,
            command: p.command || '',
        }
        tree.set(p.pid, node)
        return node
    }

    async function recursivelyAct(
        callback: (task: number) => Promise<void>,
        ...pids: number[]
    ): Promise<void> {
        while (pids.length) {
            // To mitigate the effects of races, first act on roots
            await Promise.all(pids.map( x => callback(x).catch(ignoreEsrch) ))
            // Then list their children and recurse, breadth first
            const parentOf = (pid: number) => {
                const node = tree.get(pid)
                return node ? node.parent : readPPID(pid)
            }
            pids = listPids().filter(pid => pids.includes(parentOf(pid) || -1))
        }
    }

    type NodeScore = { pid: number, bw: number }
    function findOffender(pid: number) {
        const node = tree.get(pid)!
        let max: NodeScore | null = null
        const maxOf = (x: NodeScore) => (max && max.bw >= x.bw) ? max : x

        let childrenBw = 0
        for (const child of node.children) {
            const result = findOffender(child)
            max = maxOf(result)
            childrenBw += result.bw
        }
        const bw = node.writeBw + childrenBw * parentFactor
        return maxOf({ pid, bw })
    }


    // Use separate sockets, for receiving stats & fetching them
    const fetchSocket = await createTaskstats()
    const eventSocket = await createTaskstats()

    // Increase the buffer size to avoid losing stats
    eventSocket.socket.socket.setRecvBufferSize(tsBufferSize)

    // Initialize the tree
    log('Populating the tree')
    const tree: Map<number, TreeNode> = new Map()
    let currentOffender: number | null = null
    let time = process.hrtime.bigint()
    await fetchProcesses(initializeNode)

    // Listen for task exits
    eventSocket.on('taskExit', (t: Taskstats, p?: Taskstats) => {
        // FIXME: aggregate stats from exited tasks
    })
    const cpus: number = os.cpus().length
    log(`Tracking ${cpus} cpus`)
    //await eventSocket.registerCpuMask(`0-${cpus-1}`)

    // Begin operating
    log('Daemon ready')
    while (true) {
        await delay(sampleInterval)

        // Monitor cycle time
        const endTime = process.hrtime.bigint()
        const cycle = Number(endTime - time) / 1e6
        if (cycle > sampleInterval * warnThreshold)
            log(`Loop cycle took ${cycle - sampleInterval}ms more`)
        time = endTime

        // Update counters & also bandwidths
        const gone = new Set(tree.keys())
        await fetchProcesses(p => {
            gone.delete(p.pid)
            const node = tree.get(p.pid)!
            if (!node)
                return initializeNode(p)
            node.parent = p.parent

            const delta = p.writtenBytes - node.writtenBytes
            node.writtenBytes = p.writtenBytes
            
            const bandwidth = (Number(delta) / 1e6) / (cycle / 1e3)
            node.writeBw += decayCoeff * (bandwidth - node.writeBw)
        })

        // Remove processes that no longer exist
        gone.forEach(pid => tree.delete(pid))
        if (currentOffender !== null && !tree.has(currentOffender)) {
            // offender died
            currentOffender = null
        }

        // Update children so we can traverse the tree
        tree.forEach(node => node.children = [])
        tree.forEach((node, pid) => {
            const parent = tree.get(node.parent)
            parent && parent.children.push(pid)
        })

        // Detransition offender if it matches requirements
        if (currentOffender !== null) {
            if (findOffender(currentOffender).bw < innocentThreshold * diskBandwidth) {
                log('Unrestricting back')
                await recursivelyAct(async x => ioprio.set(x, ioprio.Class.BE, 0), currentOffender)
                currentOffender = null
            }
        } else {
            // Traverse from PID 1, picking an offender
            let offender = findOffender(1)
            if (offender.bw > offenderThreshold * diskBandwidth && offender.pid !== 1) {
                const node = tree.get(offender.pid)!
                log(`Restricting process ${offender.pid} ${JSON.stringify(node.command)}`)
                await recursivelyAct(async x => ioprio.set(x, ioprio.Class.IDLE, 0), offender.pid)
                currentOffender = offender.pid
            }
        }
    }

})()

function log(msg: string) {
    const ts = new Date().toISOString().replace('T', ' ')
    console.log(`${ts}: ${msg}`)
}
