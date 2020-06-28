const native = require('../build/Release/native_binding')

/**
 * Gives us 8 prio classes with 13-bits of data for each class
 */
export const CLASS_SHIFT = 13
export const PRIO_MASK = (1 << CLASS_SHIFT) - 1

export const PRIO_CLASS = (mask: number) => mask >> CLASS_SHIFT
export const PRIO_DATA = (mask: number) => mask & PRIO_MASK
export const PRIO_VALUE = (class_: number, data: number) =>
    (class_ << CLASS_SHIFT) | data

export const isValid = (mask: number) => PRIO_CLASS(mask) != Class.NONE

/**
 * These are the io priority groups as implemented by CFQ. RT is the realtime
 * class, it always gets premium service. BE is the best-effort scheduling
 * class, the default for any process. IDLE is the idle scheduling class, it
 * is only served when no one else is using the disk.
 */
export enum Class {
	NONE,
	RT,
	BE,
	IDLE,
}

/**
 * 8 best effort priority levels are supported
 */
export const BE_NR = 8

export enum Who {
	PROCESS = 1,
	PGRP,
	USER,
}

/**
 * Fallback BE priority
 */
export const NORM = 4

/** Set ioprio on a process */
export function set(pid: number, class_: Class, data: number) {
    native.setIoprio(Who.PROCESS, pid, PRIO_VALUE(class_, data))
}
