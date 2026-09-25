// VOD time ↔ YouTube part + offset.
//
// A VOD is uploaded as several YouTube videos ("parts"). Restricted chapters (DMCA) are cut out of the uploads, so
// the uploads laid end to end ("upload time") are the VOD with those spans removed. When the uploads are shorter
// than the VOD minus the cuts, the missing footage is at the start: that is the `delay`.
//
//   vodTime = upload time + delay, then every cut that starts at or before it is added back
//
// All times are seconds. A VOD time inside a cut can't be watched and snaps to the end of that cut.

import type { Chapter, Upload, UploadType, Vod } from './types'
import { DEFAULT_PART_DURATION } from './config'

/** Seconds of slack when deciding which upload a time falls in. */
const BOUNDARY_EPS = 0.5

export interface Span {
  start: number
  end: number
}

export interface Position {
  /** Index into `timeline.uploads`. */
  index: number
  /** Seconds into that upload. */
  offset: number
}

export interface TimelineOptions {
  /** Seconds assumed for an upload whose duration isn't known yet. */
  defaultPartDuration?: number
}

/** Which upload set to watch: the one asked for, else "live" when the VOD has live uploads, else "vod" (the old site's rule). */
export function pickUploadType(vod: Vod, requested?: UploadType | null): UploadType {
  if (requested) return requested
  return vod.uploads.some((u) => u.type === 'live') ? 'live' : 'vod'
}

/** Restricted chapters as sorted, merged spans. */
export function restrictedSpans(chapters: readonly Chapter[]): Span[] {
  const spans = chapters
    .filter((c) => c.restricted && c.end > c.start)
    .map((c) => ({ start: c.start, end: c.end }))
    .sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  return merged
}

export class Timeline {
  readonly type: UploadType
  readonly uploads: readonly Upload[]
  /** Length used for each upload (its duration, or the default while unknown). */
  readonly lengths: readonly number[]
  /** Upload-time start of each upload. */
  readonly starts: readonly number[]
  /** Total upload time. */
  readonly uploadLength: number
  readonly cuts: readonly Span[]
  /** VOD seconds missing before the first upload. */
  readonly delay: number
  readonly duration: number
  readonly chapters: readonly Chapter[]

  constructor(vod: Vod, type: UploadType = pickUploadType(vod), opts: TimelineOptions = {}) {
    const fallback = opts.defaultPartDuration ?? DEFAULT_PART_DURATION
    this.type = type
    this.uploads = vod.uploads.filter((u) => u.type === type)
    this.lengths = this.uploads.map((u) => u.duration ?? fallback)
    const starts: number[] = []
    let t = 0
    for (const len of this.lengths) {
      starts.push(t)
      t += len
    }
    this.starts = starts
    this.uploadLength = t
    this.cuts = restrictedSpans(vod.chapters)
    const cut = this.cuts.reduce((sum, s) => sum + (s.end - s.start), 0)
    this.delay = Math.max(0, vod.duration - t - cut)
    this.duration = vod.duration
    this.chapters = vod.chapters
  }

  get isEmpty(): boolean {
    return this.uploads.length === 0
  }

  /** The cut containing `t` (start inclusive, end exclusive), if any. */
  cutAt(t: number): Span | null {
    return this.cuts.find((s) => t >= s.start && t < s.end) ?? null
  }

  /** The chapter playing at `t`: the one containing it, else the last one that started before it. */
  chapterAt(t: number): Chapter | null {
    let found: Chapter | null = null
    for (const c of this.chapters) {
      if (c.start > t) break
      found = c
      if (t < c.end) return c
    }
    return found
  }

  /**
   * Upload time → VOD time. A point exactly where a cut starts maps past the cut (where playback continues);
   * with `asEnd` it maps before it (where the footage before the cut stops), allowing for fractional durations
   * that overshoot the cut by a few ms.
   */
  uploadToVod(u: number, asEnd = false): number {
    let t = Math.max(0, u) + this.delay
    for (const s of this.cuts) if (asEnd ? s.start < t - BOUNDARY_EPS : s.start <= t) t += s.end - s.start
    return t
  }

  /** VOD time → upload time. Times inside a cut map to the cut's end; times inside the delay map to 0. */
  vodToUpload(t: number): number {
    const inCut = this.cutAt(t)
    const at = inCut ? inCut.end : Math.max(0, t)
    let removed = 0
    for (const s of this.cuts) {
      if (s.start >= at) break
      removed += Math.min(at, s.end) - s.start
    }
    return Math.max(0, at - removed - this.delay)
  }

  /** The watchable VOD time closest to `t` (skips forward out of cuts, clamps to the ends). */
  watchable(t: number): number {
    if (this.isEmpty) return 0
    return this.toVod(this.locate(t))
  }

  /** VOD time → which upload and how far into it. Past the end clamps to the end of the last upload. */
  locate(t: number): Position {
    if (this.isEmpty) return { index: -1, offset: 0 }
    const u = Math.min(this.vodToUpload(t), this.uploadLength)
    let index = 0
    // Upload durations are fractional (8771.99 s), so a boundary can be off by a few ms: within BOUNDARY_EPS of the
    // next upload's start counts as that upload.
    for (let i = 0; i < this.starts.length; i++) {
      if (this.starts[i]! <= u + BOUNDARY_EPS && this.lengths[i]! > 0) index = i
      else if (this.starts[i]! > u + BOUNDARY_EPS) break
    }
    const offset = Math.max(0, u - this.starts[index]!)
    return { index, offset: Math.min(offset, this.lengths[index]!) }
  }

  /** Upload + offset → VOD time. */
  toVod(pos: Position): number {
    if (pos.index < 0 || pos.index >= this.uploads.length) return 0
    return this.uploadToVod(this.starts[pos.index]! + Math.max(0, pos.offset))
  }

  /** Index of the upload with part number `part`, falling back to position `part - 1`, else -1. */
  indexOfPart(part: number): number {
    const byNumber = this.uploads.findIndex((u) => u.part === part)
    if (byNumber !== -1) return byNumber
    return part >= 1 && part <= this.uploads.length ? part - 1 : -1
  }

  /**
   * Where playback starts for a watch URL: `?t=` (VOD time) wins, else `?part=` from its beginning, else the start.
   */
  resolveStart(opts: { t?: number | null; part?: number | null } = {}): Position {
    if (this.isEmpty) return { index: -1, offset: 0 }
    if (opts.t && opts.t > 0) return this.locate(opts.t)
    if (opts.part) {
      const index = this.indexOfPart(opts.part)
      if (index !== -1) return { index, offset: 0 }
    }
    return { index: 0, offset: 0 }
  }

  /** VOD-time span covered by each upload (for the part picker and the timeline bar). */
  partSpans(): Span[] {
    return this.uploads.map((_, i) => ({
      start: this.uploadToVod(this.starts[i]!),
      end: this.uploadToVod(this.starts[i]! + this.lengths[i]!, true),
    }))
  }
}
