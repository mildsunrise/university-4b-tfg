import { EventEmitter } from 'events'
import { createGenericNetlink, GenericNetlinkSocket,
         GenericNetlinkSendOptions, GenericNetlinkMessage,
         GenericNetlinkSocketOptions, RawNetlinkSocketOptions,
         MessageInfo, AttrStream, NetlinkSocketOptions,
         FlagsGet, genl, RequestOptions, readU16, NetlinkMessage } from 'netlink'
import { Taskstats, Commands, Message, CommandMessage,
         parseTaskstats as _parseTaskstats, __LENGTH_Taskstats,
         parseMessage, formatCommandMessage } from './taskstats_struct'

// Based on <linux/taskstats.h> at 16fbf79

export const TASKSTATS_GENL_NAME = 'TASKSTATS'
export const TASKSTATS_GENL_VERSION = 0x1

export const VERSION = 10

function parseTaskstats(r: Buffer, verifyVersion: boolean = true): Taskstats {
    if (r.length < 2)
        throw Error('No version')
    const version = readU16.call(r, 0)
    if (verifyVersion && version < VERSION)
        throw Error(`Need version ${VERSION} but struct is ${version}`)
    return _parseTaskstats(r.slice(0, __LENGTH_Taskstats))
}

export interface TaskstatsSocketOptions {
}

export interface TaskstatsSendOptions extends GenericNetlinkSendOptions {
}

export class TaskstatsSocket extends EventEmitter {
    readonly socket: GenericNetlinkSocket
    private readonly familyId: number
    private readonly version: number

    constructor(socket: GenericNetlinkSocket, familyData: genl.Message, options?: TaskstatsSocketOptions) {
        super()
        if (typeof familyData.familyId === 'undefined' || typeof familyData.version === 'undefined')
            throw Error('Invalid family data')
        this.familyId = familyData.familyId
        this.version = familyData.version
        this.socket = socket
        this.socket.on('message', this._receive.bind(this))
    }

    private _receive(omsg: GenericNetlinkMessage[], rinfo: MessageInfo) {
        if (omsg.length !== 1)
            throw new Error('Invalid number of message parts')
        // FIXME: skip ACKs (we need to handle this correctly)
        if ((omsg[0] as any as NetlinkMessage).type === 2) return
        if (omsg[0].cmd !== Commands.NEW)
            throw new Error('Invalid kind of event')
        const msg = parseMessage(omsg[0].data)
        if (!msg.aggrPid)
            throw new Error('Missing taskstats')
        const t = parseTaskstats(msg.aggrPid.stats!)
        if (msg.aggrPid.pid !== t.acPID)
            throw new Error(`struct (${t.acPID}) not matching TID (${msg.aggrPid.pid})`)

        if (msg.aggrTgid) {
            // Some messages have tgid in addition to pid, if the process had
            // multiple threads and the last one exited. If present, this
            // second struct has most fields set to zero, including version!
            const p = parseTaskstats(msg.aggrTgid.stats!, false)
            if (!(p.acPID === 0 || p.acPID === msg.aggrTgid.tgid) || !msg.aggrTgid.tgid)
                throw new Error(`struct (${p.acPID}) not matching TGID (${msg.aggrTgid.tgid})`)
            p.acPID = msg.aggrTgid.tgid
            this.emit('taskExit', t, p)
        } else {
            this.emit('taskExit', t)
        }
    }

    send(
        cmd: Commands,
        msg: CommandMessage,
        options?: TaskstatsSendOptions
    ) {
        const attrs = new AttrStream()
        attrs.emit(formatCommandMessage(msg))
        return this.socket.send(this.familyId, cmd, this.version, attrs.bufs, options)
    }

    async request(
        cmd: Commands,
        msg?: CommandMessage,
        options?: TaskstatsSendOptions & RequestOptions
    ): Promise<Message[]> {
        const attrs = new AttrStream()
        attrs.emit(formatCommandMessage(msg || {}))
        // rinfo isn't very useful here; this is a kernel interface
        const [omsg, _] = await this.socket.request(
            this.familyId, cmd, this.version, attrs.bufs, options)
        return omsg.map(x => parseMessage(x.data))
    }

    async registerCpuMask(cpus: string) {
        await this.request(Commands.GET, { registerCpumask: cpus })
    }
    async deregisterCpuMask(cpus: string) {
        await this.request(Commands.GET, { deregisterCpumask: cpus })
    }

    async getTask(pid: number): Promise<Taskstats> {
        const omsg = await this.request(Commands.GET, { pid: pid })
        if (omsg.length !== 1)
            throw new Error('Invalid number of message parts')
        const msg = omsg[0]
        //if (omsg[0].cmd !== Commands.NEW)
        //    throw new Error('Invalid kind of response')
        if (!msg.aggrPid || !msg.aggrPid.stats)
            throw new Error('Response without aggr_pid attributes')
        const stats = parseTaskstats(msg.aggrPid.stats)
        if (msg.aggrPid.pid !== pid || stats.acPID !== pid)
            throw new Error('PIDs not matching')
        return stats
    }
    async getProcess(pid: number): Promise<Taskstats> {
        const omsg = await this.request(Commands.GET, { tgid: pid })
        if (omsg.length !== 1)
            throw new Error('Invalid number of message parts')
        const msg = omsg[0]
        //if (omsg[0].cmd !== Commands.NEW)
        //    throw new Error('Invalid kind of response')
        if (!msg.aggrTgid || !msg.aggrTgid.stats)
            throw new Error('Response without aggr_tgid attributes')
        const stats = parseTaskstats(msg.aggrTgid.stats)
        if (msg.aggrTgid.tgid !== pid || stats.acPID !== pid)
            throw new Error('PIDs not matching')
        return stats
    }
}

export async function createTaskstats(
    options?: TaskstatsSocketOptions & GenericNetlinkSocketOptions & NetlinkSocketOptions & RawNetlinkSocketOptions
): Promise<TaskstatsSocket> {
    const socket = createGenericNetlink(options)
    // FIXME: do this correctly, check version, etc.
    const families = await socket.ctrlRequest(genl.Commands.GET_FAMILY, {}, { flags: FlagsGet.DUMP })
    const family = families.filter(x => x.familyName === TASKSTATS_GENL_NAME)[0]
    if (typeof family === 'undefined')
        throw Error('taskstats genl family not available')
    if (family.version! < TASKSTATS_GENL_VERSION)
        throw Error('taskstats genl family has lower version')
    return new TaskstatsSocket(socket, family, options)
}

export { Taskstats } from './taskstats_struct'
