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
    version: number
    
    /** Exit status */
    acExitcode: number
    
    /** Record flags */
    acFlag: number
    
    /** task_nice */
    acNice: number
    
    cpuCount: bigint
    
    cpuDelayTotal: bigint
    
    blkioCount: bigint
    
    blkioDelayTotal: bigint
    
    swapinCount: bigint
    
    swapinDelayTotal: bigint
    
    cpuRunRealTotal: bigint
    
    cpuRunVirtualTotal: bigint
    
    /** Command name */
    acComm: string
    
    acSched: Scheduler | keyof typeof Scheduler
    
    acUID: number
    
    /** Group ID */
    acGID: number
    
    /** Process ID */
    acPID: number
    
    /** Parent process ID */
    acPPID: number
    
    /** Begin time [sec since 1970] */
    acBtime: number
    
    acEtime: bigint
    
    /** User CPU time [usec] */
    acUtime: bigint
    
    /** SYstem CPU time [usec] */
    acStime: bigint
    
    /** Minor Page Fault Count */
    acMinFlt: bigint
    
    /** Major Page Fault Count */
    acMajFlt: bigint
    
    /** accumulated RSS usage in MB-usec */
    coreMem: bigint
    
    /** accumulated VM  usage in MB-usec */
    virtMem: bigint
    
    /** High-watermark of RSS usage, in KB */
    hiwaterRSS: bigint
    
    /** High-water VM usage, in KB */
    hiwaterVM: bigint
    
    /** bytes read */
    readChar: bigint
    
    /** bytes written */
    writeChar: bigint
    
    /** read syscalls */
    readSyscalls: bigint
    
    /** write syscalls */
    writeSyscalls: bigint
    
    /** bytes of read I/O */
    readBytes: bigint
    
    /** bytes of write I/O */
    writeBytes: bigint
    
    /** bytes of cancelled write I/O */
    cancelledWriteBytes: bigint
    
    /** voluntary_ctxt_switches */
    nvcsw: bigint
    
    /** nonvoluntary_ctxt_switches */
    nivcsw: bigint
    
    /** utime scaled on frequency etc */
    acUtimeScaled: bigint
    
    /** stime scaled on frequency etc */
    acStimeScaled: bigint
    
    /** scaled cpu_run_real_total */
    cpuScaledRunRealTotal: bigint
    
    freepagesCount: bigint
    
    freepagesDelayTotal: bigint
    
    thrashingCount: bigint
    
    thrashingDelayTotal: bigint
    
    /** 64-bit begin time */
    acBtime64: bigint
}

/** Parses the attributes of a [[Taskstats]] object */
export function parseTaskstats(r: Buffer): Taskstats {
    if (r.length !== __LENGTH_Taskstats) throw Error('Unexpected length for Taskstats')
    return {
        get version() { return structs.readU16.call(r, 0) },
        get acExitcode() { return structs.readU32.call(r, 4) },
        get acFlag() { return structs.readU8.call(r, 8) },
        get acNice() { return structs.readU8.call(r, 9) },
        get cpuCount() { return structs.readU64.call(r, 16) },
        get cpuDelayTotal() { return structs.readU64.call(r, 24) },
        get blkioCount() { return structs.readU64.call(r, 32) },
        get blkioDelayTotal() { return structs.readU64.call(r, 40) },
        get swapinCount() { return structs.readU64.call(r, 48) },
        get swapinDelayTotal() { return structs.readU64.call(r, 56) },
        get cpuRunRealTotal() { return structs.readU64.call(r, 64) },
        get cpuRunVirtualTotal() { return structs.readU64.call(r, 72) },
        get acComm() { 
            const acComm = r.slice(80, 80 + 32)
            const idx = acComm.indexOf(0)
            return acComm.slice(0, idx === -1 ? acComm.length : idx).toString()
        },
        get acSched() { return structs.getEnum(Scheduler, structs.readU8.call(r, 112)) },
        get acUID() { return structs.readU32.call(r, 120) },
        get acGID() { return structs.readU32.call(r, 124) },
        acPID: structs.readU32.call(r, 128),
        get acPPID() { return structs.readU32.call(r, 132) },
        get acBtime() { return structs.readU32.call(r, 136) },
        get acEtime() { return structs.readU64.call(r, 144) },
        get acUtime() { return structs.readU64.call(r, 152) },
        get acStime() { return structs.readU64.call(r, 160) },
        get acMinFlt() { return structs.readU64.call(r, 168) },
        get acMajFlt() { return structs.readU64.call(r, 176) },
        get coreMem() { return structs.readU64.call(r, 184) },
        get virtMem() { return structs.readU64.call(r, 192) },
        get hiwaterRSS() { return structs.readU64.call(r, 200) },
        get hiwaterVM() { return structs.readU64.call(r, 208) },
        get readChar() { return structs.readU64.call(r, 216) },
        get writeChar() { return structs.readU64.call(r, 224) },
        get readSyscalls() { return structs.readU64.call(r, 232) },
        get writeSyscalls() { return structs.readU64.call(r, 240) },
        get readBytes() { return structs.readU64.call(r, 248) },
        get writeBytes() { return structs.readU64.call(r, 256) },
        get cancelledWriteBytes() { return structs.readU64.call(r, 264) },
        get nvcsw() { return structs.readU64.call(r, 272) },
        get nivcsw() { return structs.readU64.call(r, 280) },
        get acUtimeScaled() { return structs.readU64.call(r, 288) },
        get acStimeScaled() { return structs.readU64.call(r, 296) },
        get cpuScaledRunRealTotal() { return structs.readU64.call(r, 304) },
        get freepagesCount() { return structs.readU64.call(r, 312) },
        get freepagesDelayTotal() { return structs.readU64.call(r, 320) },
        get thrashingCount() { return structs.readU64.call(r, 328) },
        get thrashingDelayTotal() { return structs.readU64.call(r, 336) },
        get acBtime64() { return structs.readU64.call(r, 344) },
    }
}

/** Encodes a [[Taskstats]] object into a stream of attributes */
export function formatTaskstats(x: Taskstats, r: Buffer = Buffer.alloc(__LENGTH_Taskstats)): Buffer {
    if (r.length !== __LENGTH_Taskstats) throw Error('Unexpected length for Taskstats')
    x.version && structs.writeU16.call(r, x.version, 0)
    x.acExitcode && structs.writeU32.call(r, x.acExitcode, 4)
    x.acFlag && structs.writeU8.call(r, x.acFlag, 8)
    x.acNice && structs.writeU8.call(r, x.acNice, 9)
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
    x.acUID && structs.writeU32.call(r, x.acUID, 120)
    x.acGID && structs.writeU32.call(r, x.acGID, 124)
    x.acPID && structs.writeU32.call(r, x.acPID, 128)
    x.acPPID && structs.writeU32.call(r, x.acPPID, 132)
    x.acBtime && structs.writeU32.call(r, x.acBtime, 136)
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
