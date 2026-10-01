// A synthetic VOD's timeline. A merge, a split or a playthrough is a list of segments: windows of real VODs laid on
// one timeline. Each source keeps its own Timeline (its uploads, delay and cuts), and what plays is a list of clips,
// a clip being one source upload cut to one segment's window. A clip's offset is seconds into its YouTube video, as
// for a plain VOD, but it plays from `partStart` to `partEnd` rather than the whole video.
//
//   synthetic time = segment.at + (source time - segment.start)
//
// Space between segments is a gap chapter in the synthetic VOD's chapters (the archive derives them), so it is a cut
// here and the player skips it.

import {
  chapterAt,
  pickUploadType,
  restrictedSpans,
  Timeline,
  type PlayableTimeline,
  type Position,
  type Span,
  type TimelineOptions,
} from './timeline'
import type { Chapter, Segment, Upload, UploadType, Vod } from './types'

/** Seconds of slack when deciding which clip a time falls in (as for a plain VOD's uploads). */
const BOUNDARY_EPS = 0.5
/** Shorter than this, a clip isn't worth loading a video for. */
const MIN_CLIP = 0.05

export interface Clip {
  /** Index into `segments`. */
  segment: number
  /** Index into that source timeline's uploads. */
  upload: number
  /** Seconds into the video. */
  from: number
  to: number
  /** Synthetic seconds it covers. */
  start: number
  end: number
}

export interface SegmentPosition {
  /** Index into `segments`. */
  index: number
  segment: Segment
  /** Seconds into the source VOD (kept inside the segment's window). */
  sourceTime: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** The source VOD ids of a synthetic VOD, in order, once each. */
export function sourceIds(vod: Pick<Vod, 'synthetic'>): string[] {
  return [...new Set(vod.synthetic?.segments.map((s) => s.vodId) ?? [])]
}

/** The upload set a synthetic VOD plays: the one asked for, else "live" when any source has live uploads. */
export function pickSyntheticUploadType(sources: Iterable<Vod>, requested?: UploadType | null): UploadType {
  if (requested) return requested
  for (const s of sources) if (s.uploads.some((u) => u.type === 'live')) return 'live'
  return 'vod'
}

/** A source's uploads of `type`, else its own pick: a playthrough shouldn't stop at a VOD with only the other kind. */
function sourceType(vod: Vod, type: UploadType): UploadType {
  return vod.uploads.some((u) => u.type === type) ? type : pickUploadType(vod)
}

export class SegmentTimeline implements PlayableTimeline {
  readonly type: UploadType
  readonly segments: readonly Segment[]
  /** One per source VOD that loaded (a hidden or missing source has none; its segments don't play). */
  readonly sources: ReadonlyMap<string, Timeline>
  readonly clips: readonly Clip[]
  /** One per clip: the source upload, numbered as the clip. */
  readonly uploads: readonly Upload[]
  readonly chapters: readonly Chapter[]
  readonly cuts: readonly Span[]
  readonly duration: number

  constructor(vod: Vod, sources: Iterable<Vod>, type?: UploadType | null, opts: TimelineOptions = {}) {
    const list = [...sources]
    this.type = pickSyntheticUploadType(list, type)
    this.segments = vod.synthetic?.segments ?? []
    this.sources = new Map(list.map((s) => [s.id, new Timeline(s, sourceType(s, this.type), opts)]))
    this.chapters = vod.chapters
    this.cuts = restrictedSpans(vod.chapters)
    this.duration = vod.duration

    const clips: Clip[] = []
    const uploads: Upload[] = []
    this.segments.forEach((seg, si) => {
      const tl = this.sources.get(seg.vodId)
      if (!tl) return
      const span = { start: seg.at, end: seg.at + seg.end - seg.start }
      tl.partSpans().forEach((p, i) => {
        const a = Math.max(p.start, seg.start)
        const b = Math.min(p.end, seg.end)
        if (b - a < MIN_CLIP) return
        const base = tl.starts[i]!
        const from = clamp(tl.vodToUpload(a) - base, 0, tl.lengths[i]!)
        const to = clamp(tl.vodToUpload(b) - base, 0, tl.lengths[i]!)
        if (to - from < MIN_CLIP) return
        clips.push({
          segment: si,
          upload: i,
          from,
          to,
          start: clamp(seg.at + tl.uploadToVod(base + from) - seg.start, span.start, span.end),
          end: clamp(seg.at + tl.uploadToVod(base + to, true) - seg.start, span.start, span.end),
        })
        uploads.push({ ...tl.uploads[i]!, part: uploads.length + 1 })
      })
    })
    this.clips = clips
    this.uploads = uploads
  }

  get isEmpty(): boolean {
    return this.clips.length === 0
  }

  cutAt(t: number): Span | null {
    return this.cuts.find((s) => t >= s.start && t < s.end) ?? null
  }

  chapterAt(t: number): Chapter | null {
    return chapterAt(this.chapters, t)
  }

  /** The segment playing at `t`, else the last one that started before it (its time held at its end), else the first. */
  segmentAt(t: number): SegmentPosition | null {
    if (!this.segments.length) return null
    let index = 0
    this.segments.forEach((s, i) => {
      if (s.at <= t) index = i
    })
    const segment = this.segments[index]!
    return { index, segment, sourceTime: clamp(segment.start + t - segment.at, segment.start, segment.end) }
  }

  private timelineOf(c: Clip): Timeline {
    return this.sources.get(this.segments[c.segment]!.vodId)!
  }

  /** Synthetic time → clip and seconds into its video. Gaps and cuts snap forward; past the end, the last clip's end. */
  locate(t: number): Position {
    const n = this.clips.length
    if (!n) return { index: -1, offset: 0 }
    for (let k = 0; k < n; k++) {
      const c = this.clips[k]!
      if (t < c.start) return { index: k, offset: c.from }
      // Right at the end of a clip the next one takes over (as between a plain VOD's uploads).
      const next = this.clips[k + 1]
      const end = next && next.start - c.end < BOUNDARY_EPS ? c.end - BOUNDARY_EPS : c.end
      if (t < end) {
        const seg = this.segments[c.segment]!
        const tl = this.timelineOf(c)
        const offset = tl.vodToUpload(seg.start + t - seg.at) - tl.starts[c.upload]!
        return { index: k, offset: clamp(offset, c.from, c.to) }
      }
    }
    const last = this.clips[n - 1]!
    return { index: n - 1, offset: last.to }
  }

  toVod(pos: Position): number {
    const c = this.clips[pos.index]
    if (!c) return 0
    const seg = this.segments[c.segment]!
    const tl = this.timelineOf(c)
    const t = seg.at + tl.uploadToVod(tl.starts[c.upload]! + clamp(pos.offset, c.from, c.to)) - seg.start
    return clamp(t, c.start, c.end)
  }

  watchable(t: number): number {
    if (this.isEmpty) return 0
    return this.toVod(this.locate(t))
  }

  indexOfPart(part: number): number {
    return part >= 1 && part <= this.clips.length ? part - 1 : -1
  }

  resolveStart(opts: { t?: number | null; part?: number | null } = {}): Position {
    if (this.isEmpty) return { index: -1, offset: 0 }
    if (opts.t && opts.t > 0) return this.locate(opts.t)
    const index = opts.part ? this.indexOfPart(opts.part) : -1
    return index !== -1 ? { index, offset: this.partStart(index) } : { index: 0, offset: this.partStart(0) }
  }

  partSpans(): Span[] {
    return this.clips.map((c) => ({ start: c.start, end: c.end }))
  }

  partStart(index: number): number {
    return this.clips[index]?.from ?? 0
  }

  partEnd(index: number): number | null {
    const c = this.clips[index]
    if (!c) return null
    return c.to >= this.timelineOf(c).lengths[c.upload]! - MIN_CLIP ? null : c.to
  }

  /** Synthetic-time span of each segment (for marking where one stream ends and the next starts). */
  segmentSpans(): Span[] {
    return this.segments.map((s) => ({ start: s.at, end: s.at + s.end - s.start }))
  }
}

/**
 * Where a superseded VOD's time `t` plays now: the entry whose window holds it, else the closest one before it (a
 * merge drops the overlap of two VODs), else the first. Null when the VOD isn't superseded.
 */
export function supersededTarget(vod: Pick<Vod, 'supersededBy'>, t: number): { id: string; t: number } | null {
  const list = [...(vod.supersededBy ?? [])].sort((a, b) => a.start - b.start)
  if (!list.length) return null
  const hit =
    list.find((s) => t >= s.start && (s.end === null || t < s.end)) ?? [...list].reverse().find((s) => s.start <= t) ?? list[0]!
  const within = clamp(t, hit.start, hit.end ?? Infinity)
  return { id: hit.id, t: hit.at + within - hit.start }
}
