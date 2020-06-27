import { BaseObject, StreamData } from 'netlink'
import * as structs from 'netlink/dist/structs'

/** Scheduling policies */
export enum Scheduler {
    NORMAL,
    
    FIFO = 1,
    
    RR = 2,
    
    BATCH = 3,
    
    IDLE = 5,
    
    DEADLINE = 6,
}

export interface Taskstats {
    version?: number
    
    ____pad0?: Buffer
    
    /** Exit status */
    acExitcode?: number
    
    /** Record flags */
    acFlag?: number
    
    /** task_nice */
    acNice?: number
    
    ____pad1?: Buffer
    
    cpuCount?: bigint
    
    cpuDelayTotal?: bigint
    
    blkioCount?: bigint
    
    blkioDelayTotal?: bigint
    
    swapinCount?: bigint
    
    swapinDelayTotal?: bigint
    
    cpuRunRealTotal?: bigint
    
    cpuRunVirtualTotal?: bigint
    
    /** Command name */
    acComm?: string
    
    acSched?: Scheduler | keyof typeof Scheduler
    
    __acPad?: Buffer
    
    ____pad2?: Buffer
    
    acUID?: number
    
    /** Group ID */
    acGID?: number
    
    /** Process ID */
    acPID?: number
    
    /** Parent process ID */
    acPPID?: number
    
    /** Begin time [sec since 1970] */
    acBtime?: number
    
    ____pad3?: Buffer
    
    acEtime?: bigint
    
    /** User CPU time [usec] */
    acUtime?: bigint
    
    /** SYstem CPU time [usec] */
    acStime?: bigint
    
    /** Minor Page Fault Count */
    acMinFlt?: bigint
    
    /** Major Page Fault Count */
    acMajFlt?: bigint
    
    /** accumulated RSS usage in MB-usec */
    coreMem?: bigint
    
    /** accumulated VM  usage in MB-usec */
    virtMem?: bigint
    
    /** High-watermark of RSS usage, in KB */
    hiwaterRSS?: bigint
    
    /** High-water VM usage, in KB */
    hiwaterVM?: bigint
    
    /** bytes read */
    readChar?: bigint
    
    /** bytes written */
    writeChar?: bigint
    
    /** read syscalls */
    readSyscalls?: bigint
    
    /** write syscalls */
    writeSyscalls?: bigint
    
    /** bytes of read I/O */
    readBytes?: bigint
    
    /** bytes of write I/O */
    writeBytes?: bigint
    
    /** bytes of cancelled write I/O */
    cancelledWriteBytes?: bigint
    
    /** voluntary_ctxt_switches */
    nvcsw?: bigint
    
    /** nonvoluntary_ctxt_switches */
    nivcsw?: bigint
    
    /** utime scaled on frequency etc */
    acUtimeScaled?: bigint
    
    /** stime scaled on frequency etc */
    acStimeScaled?: bigint
    
    /** scaled cpu_run_real_total */
    cpuScaledRunRealTotal?: bigint
    
    freepagesCount?: bigint
    
    freepagesDelayTotal?: bigint
    
    thrashingCount?: bigint
    
    thrashingDelayTotal?: bigint
    
    /** 64-bit begin time */
    acBtime64?: bigint
}

/** Parses the attributes of a [[Taskstats]] object */
export function parseTaskstats(r: Buffer): Taskstats {
    if (r.length !== __LENGTH_Taskstats) throw Error('Unexpected length for Taskstats')
    const x: Taskstats = {}
    x.version = structs.readU16.call(r, 0)
    x.____pad0 = r.slice(2, 2 + 2)
    x.acExitcode = structs.readU32.call(r, 4)
    x.acFlag = structs.readU8.call(r, 8)
    x.acNice = structs.readU8.call(r, 9)
    x.____pad1 = r.slice(10, 10 + 6)
    x.cpuCount = structs.readU64.call(r, 16)
    x.cpuDelayTotal = structs.readU64.call(r, 24)
    x.blkioCount = structs.readU64.call(r, 32)
    x.blkioDelayTotal = structs.readU64.call(r, 40)
    x.swapinCount = structs.readU64.call(r, 48)
    x.swapinDelayTotal = structs.readU64.call(r, 56)
    x.cpuRunRealTotal = structs.readU64.call(r, 64)
    x.cpuRunVirtualTotal = structs.readU64.call(r, 72)
    const acComm = r.slice(80, 80 + 32)
    const idx = acComm.indexOf(0)
    x.acComm = acComm.slice(0, idx === -1 ? acComm.length : idx).toString()
    x.acSched = structs.getEnum(Scheduler, structs.readU8.call(r, 112))
    x.__acPad = r.slice(113, 113 + 3)
    x.____pad2 = r.slice(116, 116 + 4)
    x.acUID = structs.readU32.call(r, 120)
    x.acGID = structs.readU32.call(r, 124)
    x.acPID = structs.readU32.call(r, 128)
    x.acPPID = structs.readU32.call(r, 132)
    x.acBtime = structs.readU32.call(r, 136)
    x.____pad3 = r.slice(140, 140 + 4)
    x.acEtime = structs.readU64.call(r, 144)
    x.acUtime = structs.readU64.call(r, 152)
    x.acStime = structs.readU64.call(r, 160)
    x.acMinFlt = structs.readU64.call(r, 168)
    x.acMajFlt = structs.readU64.call(r, 176)
    x.coreMem = structs.readU64.call(r, 184)
    x.virtMem = structs.readU64.call(r, 192)
    x.hiwaterRSS = structs.readU64.call(r, 200)
    x.hiwaterVM = structs.readU64.call(r, 208)
    x.readChar = structs.readU64.call(r, 216)
    x.writeChar = structs.readU64.call(r, 224)
    x.readSyscalls = structs.readU64.call(r, 232)
    x.writeSyscalls = structs.readU64.call(r, 240)
    x.readBytes = structs.readU64.call(r, 248)
    x.writeBytes = structs.readU64.call(r, 256)
    x.cancelledWriteBytes = structs.readU64.call(r, 264)
    x.nvcsw = structs.readU64.call(r, 272)
    x.nivcsw = structs.readU64.call(r, 280)
    x.acUtimeScaled = structs.readU64.call(r, 288)
    x.acStimeScaled = structs.readU64.call(r, 296)
    x.cpuScaledRunRealTotal = structs.readU64.call(r, 304)
    x.freepagesCount = structs.readU64.call(r, 312)
    x.freepagesDelayTotal = structs.readU64.call(r, 320)
    x.thrashingCount = structs.readU64.call(r, 328)
    x.thrashingDelayTotal = structs.readU64.call(r, 336)
    x.acBtime64 = structs.readU64.call(r, 344)
    return x
}

/** Encodes a [[Taskstats]] object into a stream of attributes */
export function formatTaskstats(x: Taskstats, r: Buffer = Buffer.alloc(__LENGTH_Taskstats)): Buffer {
    if (r.length !== __LENGTH_Taskstats) throw Error('Unexpected length for Taskstats')
    x.version && structs.writeU16.call(r, x.version, 0)
    if (x.____pad0 && x.____pad0.length !== 2)
        throw Error('____pad0: Unexpected buffer length')
        x.____pad0 && x.____pad0.copy(r, 2)
    x.acExitcode && structs.writeU32.call(r, x.acExitcode, 4)
    x.acFlag && structs.writeU8.call(r, x.acFlag, 8)
    x.acNice && structs.writeU8.call(r, x.acNice, 9)
    if (x.____pad1 && x.____pad1.length !== 6)
        throw Error('____pad1: Unexpected buffer length')
        x.____pad1 && x.____pad1.copy(r, 10)
    x.cpuCount && structs.writeU64.call(r, x.cpuCount, 16)
    x.cpuDelayTotal && structs.writeU64.call(r, x.cpuDelayTotal, 24)
    x.blkioCount && structs.writeU64.call(r, x.blkioCount, 32)
    x.blkioDelayTotal && structs.writeU64.call(r, x.blkioDelayTotal, 40)
    x.swapinCount && structs.writeU64.call(r, x.swapinCount, 48)
    x.swapinDelayTotal && structs.writeU64.call(r, x.swapinDelayTotal, 56)
    x.cpuRunRealTotal && structs.writeU64.call(r, x.cpuRunRealTotal, 64)
    x.cpuRunVirtualTotal && structs.writeU64.call(r, x.cpuRunVirtualTotal, 72)
    if (x.acComm) {
        const acComm = Buffer.from(x.acComm)
        if (acComm.length > 32)
            throw Error('acComm: Unexpected buffer length')
        acComm.copy(r, 80)
    }
    x.acSched && structs.writeU8.call(r, structs.putEnum(Scheduler, x.acSched), 112)
    if (x.__acPad && x.__acPad.length !== 3)
        throw Error('__acPad: Unexpected buffer length')
        x.__acPad && x.__acPad.copy(r, 113)
    if (x.____pad2 && x.____pad2.length !== 4)
        throw Error('____pad2: Unexpected buffer length')
        x.____pad2 && x.____pad2.copy(r, 116)
    x.acUID && structs.writeU32.call(r, x.acUID, 120)
    x.acGID && structs.writeU32.call(r, x.acGID, 124)
    x.acPID && structs.writeU32.call(r, x.acPID, 128)
    x.acPPID && structs.writeU32.call(r, x.acPPID, 132)
    x.acBtime && structs.writeU32.call(r, x.acBtime, 136)
    if (x.____pad3 && x.____pad3.length !== 4)
        throw Error('____pad3: Unexpected buffer length')
        x.____pad3 && x.____pad3.copy(r, 140)
    x.acEtime && structs.writeU64.call(r, x.acEtime, 144)
    x.acUtime && structs.writeU64.call(r, x.acUtime, 152)
    x.acStime && structs.writeU64.call(r, x.acStime, 160)
    x.acMinFlt && structs.writeU64.call(r, x.acMinFlt, 168)
    x.acMajFlt && structs.writeU64.call(r, x.acMajFlt, 176)
    x.coreMem && structs.writeU64.call(r, x.coreMem, 184)
    x.virtMem && structs.writeU64.call(r, x.virtMem, 192)
    x.hiwaterRSS && structs.writeU64.call(r, x.hiwaterRSS, 200)
    x.hiwaterVM && structs.writeU64.call(r, x.hiwaterVM, 208)
    x.readChar && structs.writeU64.call(r, x.readChar, 216)
    x.writeChar && structs.writeU64.call(r, x.writeChar, 224)
    x.readSyscalls && structs.writeU64.call(r, x.readSyscalls, 232)
    x.writeSyscalls && structs.writeU64.call(r, x.writeSyscalls, 240)
    x.readBytes && structs.writeU64.call(r, x.readBytes, 248)
    x.writeBytes && structs.writeU64.call(r, x.writeBytes, 256)
    x.cancelledWriteBytes && structs.writeU64.call(r, x.cancelledWriteBytes, 264)
    x.nvcsw && structs.writeU64.call(r, x.nvcsw, 272)
    x.nivcsw && structs.writeU64.call(r, x.nivcsw, 280)
    x.acUtimeScaled && structs.writeU64.call(r, x.acUtimeScaled, 288)
    x.acStimeScaled && structs.writeU64.call(r, x.acStimeScaled, 296)
    x.cpuScaledRunRealTotal && structs.writeU64.call(r, x.cpuScaledRunRealTotal, 304)
    x.freepagesCount && structs.writeU64.call(r, x.freepagesCount, 312)
    x.freepagesDelayTotal && structs.writeU64.call(r, x.freepagesDelayTotal, 320)
    x.thrashingCount && structs.writeU64.call(r, x.thrashingCount, 328)
    x.thrashingDelayTotal && structs.writeU64.call(r, x.thrashingDelayTotal, 336)
    x.acBtime64 && structs.writeU64.call(r, x.acBtime64, 344)
    return r
}

export const __LENGTH_Taskstats = 352

export enum Commands {
    /** user->kernel request/get-response */
    GET = 1,
    
    /** kernel->user event */
    NEW = 2,
}

export interface Message extends BaseObject {
    /** Process id */
    pid?: number
    
    /** Thread group id */
    tgid?: number
    
    /** taskstats structure */
    stats?: Buffer
    
    /** contains pid + stats */
    aggrPid?: Message
    
    /** contains tgid + stats */
    aggrTgid?: Message
    
    /** contains nothing */
    null_?: true
}

/** Parses the attributes of a [[Message]] object */
export function parseMessage(r: Buffer): Message {
    return structs.getObject(r, {
        1: (data, obj) => obj.pid = structs.getU32(data),
        2: (data, obj) => obj.tgid = structs.getU32(data),
        3: (data, obj) => obj.stats = data,
        4: (data, obj) => obj.aggrPid = parseMessage(data),
        5: (data, obj) => obj.aggrTgid = parseMessage(data),
        6: (data, obj) => obj.null_ = structs.getFlag(data),
    })
}

/** Encodes a [[Message]] object into a stream of attributes */
export function formatMessage(x: Message): StreamData {
    return structs.putObject(x, {
        pid: (data, obj) => data.push(1, structs.putU32(obj.pid!)),
        tgid: (data, obj) => data.push(2, structs.putU32(obj.tgid!)),
        stats: (data, obj) => data.push(3, obj.stats!),
        aggrPid: (data, obj) => data.push(4, formatMessage(obj.aggrPid!)),
        aggrTgid: (data, obj) => data.push(5, formatMessage(obj.aggrTgid!)),
        null_: (data, obj) => data.push(6, structs.putFlag(obj.null_!)),
    })
}

export interface CommandMessage extends BaseObject {
    pid?: number
    
    tgid?: number
    
    registerCpumask?: string
    
    deregisterCpumask?: string
}

/** Parses the attributes of a [[CommandMessage]] object */
export function parseCommandMessage(r: Buffer): CommandMessage {
    return structs.getObject(r, {
        1: (data, obj) => obj.pid = structs.getU32(data),
        2: (data, obj) => obj.tgid = structs.getU32(data),
        3: (data, obj) => obj.registerCpumask = structs.getString(data),
        4: (data, obj) => obj.deregisterCpumask = structs.getString(data),
    })
}

/** Encodes a [[CommandMessage]] object into a stream of attributes */
export function formatCommandMessage(x: CommandMessage): StreamData {
    return structs.putObject(x, {
        pid: (data, obj) => data.push(1, structs.putU32(obj.pid!)),
        tgid: (data, obj) => data.push(2, structs.putU32(obj.tgid!)),
        registerCpumask: (data, obj) => data.push(3, structs.putString(obj.registerCpumask!)),
        deregisterCpumask: (data, obj) => data.push(4, structs.putString(obj.deregisterCpumask!)),
    })
}
