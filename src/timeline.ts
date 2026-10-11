// VOD time ↔ YouTube part + offset.
//
// A VOD is uploaded as several YouTube videos ("parts"). Restricted chapters (DMCA) are cut out of the uploads, so
// the uploads laid end to end ("upload time") are the VOD with those spans removed. A live recording also misses the
// ads Twitch stitches into the stream: each upload's `gaps` say where (seconds into that upload) and how much VOD time
// it skips. Unlike cuts, they hold for that upload set only. Whatever else the uploads are short of the VOD is
// missing at the start: that is the `delay`.
//
//   delay   = duration - upload time - gaps - cuts
//   vodTime = upload time + delay, then every cut or gap that starts at or before it is added back
//
// All times are seconds. A VOD time inside a cut or a gap can't be watched and snaps to its end.

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
export function pickUploadType(vod: Pick<Vod, 'uploads'>, requested?: UploadType | null): UploadType {
  if (requested) return requested
  return vod.uploads.some((u) => u.type === 'live') ? 'live' : 'vod'
}

/**
 * What the player and the watch page need from a timeline: a VOD's own (`Timeline`) or a synthetic VOD's
 * (`SegmentTimeline`, which plays windows of other VODs). `uploads` are what plays, in order; a Position's offset is
 * seconds into that upload's video, which plays from `partStart` to `partEnd`.
 */
export interface PlayableTimeline {
  readonly type: UploadType
  readonly uploads: readonly Upload[]
  readonly chapters: readonly Chapter[]
  readonly cuts: readonly Span[]
  /** Time the uploads skip besides the cuts (a live recording's ad breaks), sorted. */
  readonly missing: readonly Span[]
  readonly duration: number
  readonly isEmpty: boolean
  cutAt(t: number): Span | null
  missingAt(t: number): Span | null
  chapterAt(t: number): Chapter | null
  watchable(t: number): number
  locate(t: number): Position
  toVod(pos: Position): number
  indexOfPart(part: number): number
  resolveStart(opts?: { t?: number | null; part?: number | null }): Position
  partSpans(): Span[]
  /** Seconds into upload `index`'s video where it starts playing. */
  partStart(index: number): number
  /** Seconds into its video where it stops, or null to play it to its end. */
  partEnd(index: number): number | null
}

/** The chapter playing at `t`: the one containing it, else the last one that started before it. */
export function chapterAt(chapters: readonly Chapter[], t: number): Chapter | null {
  let found: Chapter | null = null
  for (const c of chapters) {
    if (c.start > t) break
    found = c
    if (t < c.end) return c
  }
  return found
}

/** The cut containing `t` (start inclusive, end exclusive), if any. */
export function cutAt(cuts: readonly Span[], t: number): Span | null {
  return cuts.find((s) => t >= s.start && t < s.end) ?? null
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

export class Timeline implements PlayableTimeline {
  readonly type: UploadType
  readonly uploads: readonly Upload[]
  /** Length used for each upload (its duration, or the default while unknown). */
  readonly lengths: readonly number[]
  /** Upload-time start of each upload. */
  readonly starts: readonly number[]
  /** Total upload time. */
  readonly uploadLength: number
  readonly cuts: readonly Span[]
  /** VOD time the uploads' `gaps` skip (a live recording's ad breaks), sorted. */
  readonly missing: readonly Span[]
  /** VOD seconds missing before the first upload. */
  readonly delay: number
  readonly duration: number
  readonly chapters: readonly Chapter[]
  /** Each gap as upload-time start and length, sorted. */
  private readonly gaps: readonly { at: number; length: number }[]
  /** Cuts and missing spans together, sorted: everything upload time skips. */
  private readonly holes: readonly Span[]

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
    this.gaps = this.uploads
      .flatMap((u, i) => (u.gaps ?? []).map((g) => ({ at: starts[i]! + Math.min(Math.max(0, g.at), this.lengths[i]!), length: g.length })))
      .filter((g) => g.length > 0)
      .sort((a, b) => a.at - b.at)
    const cut = this.cuts.reduce((sum, s) => sum + (s.end - s.start), 0)
    const gap = this.gaps.reduce((sum, g) => sum + g.length, 0)
    this.delay = Math.max(0, vod.duration - t - gap - cut)
    this.duration = vod.duration
    this.chapters = vod.chapters
    // A gap starts on the VOD at its upload time plus the delay, the gaps before it and every cut that starts at or
    // before it (a cut right where a gap is comes first, as the archive places them).
    const missing: Span[] = []
    let shift = this.delay
    let c = 0
    for (const g of this.gaps) {
      let v = g.at + shift
      for (; c < this.cuts.length && this.cuts[c]!.start <= v + 1e-3; c++) {
        v += this.cuts[c]!.end - this.cuts[c]!.start
        shift += this.cuts[c]!.end - this.cuts[c]!.start
      }
      missing.push({ start: v, end: v + g.length })
      shift += g.length
    }
    this.missing = missing
    this.holes = [...this.cuts, ...missing].sort((a, b) => a.start - b.start)
  }

  get isEmpty(): boolean {
    return this.uploads.length === 0
  }

  /** The cut containing `t` (start inclusive, end exclusive), if any. */
  cutAt(t: number): Span | null {
    return cutAt(this.cuts, t)
  }

  /** The missing span (a gap in the uploads) containing `t`, if any. */
  missingAt(t: number): Span | null {
    return cutAt(this.missing, t)
  }

  /** The chapter playing at `t`: the one containing it, else the last one that started before it. */
  chapterAt(t: number): Chapter | null {
    return chapterAt(this.chapters, t)
  }

  /**
   * Upload time → VOD time. A point exactly where a cut or gap starts maps past it (where playback continues);
   * with `asEnd` it maps before it (where the footage before it stops), allowing for fractional durations that
   * overshoot it by a few ms.
   */
  uploadToVod(u: number, asEnd = false): number {
    let t = Math.max(0, u) + this.delay
    for (const s of this.holes) if (asEnd ? s.start < t - BOUNDARY_EPS : s.start <= t) t += s.end - s.start
    return t
  }

  /** VOD time → upload time. Times inside a cut or gap map to its end; times inside the delay map to 0. */
  vodToUpload(t: number): number {
    const inHole = cutAt(this.holes, t)
    const at = inHole ? inHole.end : Math.max(0, t)
    let removed = 0
    for (const s of this.holes) {
      if (s.start >= at) break
      removed += Math.min(at, s.end) - s.start
    }
    return Math.max(0, at - removed - this.delay)
  }

  /** The watchable VOD time closest to `t` (skips forward out of cuts and gaps, clamps to the ends). */
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

  /** Uploads play whole. */
  partStart(): number {
    return 0
  }

  partEnd(): number | null {
    return null
  }

  /**
   * VOD-time span covered by each upload (for the part picker and the timeline bar). A gap at the end of an upload
   * (a recording that stopped early) is that upload's: its span runs to the gap's end.
   */
  partSpans(): Span[] {
    return this.uploads.map((_, i) => {
      const start = this.starts[i]!
      const end = start + this.lengths[i]!
      let trailing = 0
      for (const g of this.gaps) if (g.at > start && Math.abs(g.at - end) <= BOUNDARY_EPS) trailing += g.length
      return { start: this.uploadToVod(start), end: this.uploadToVod(end, true) + trailing }
    })
  }
}
