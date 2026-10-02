import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeVod } from '../src/api/normalize'
import type { RawVod } from '../src/api/types'
import { redirectTarget, SegmentTimeline, sourceIds, supersededTarget } from '../src/composite'
import { WatchPlayer, YT_STATE, type PlayerLike } from '../src/player'
import type { Chapter, Segment, Vod } from '../src/types'
import { makeVod } from './helpers'

const seg = (vodId: string, start: number, end: number, at: number, stream = 0): Segment => ({ vodId, start, end, at, label: null, stream })
const source = (id: string, duration: number, parts: number[], chapters: Partial<Chapter>[] = []): Vod => {
  const v = makeVod({ duration, parts, chapters })
  return { ...v, id, uploads: v.uploads.map((u) => ({ ...u, id: `${id}-yt${u.part}` })) }
}
const synthetic = (segments: Segment[], chapters: Partial<Chapter>[] = []): Vod => {
  const end = Math.max(...segments.map((s) => s.at + s.end - s.start))
  return { ...makeVod({ duration: end, parts: [], chapters }), id: 'syn', synthetic: { supersedes: true, segments, madeAt: null, changedAt: null, firstLiveAt: null, lastLiveAt: null } }
}

// A (2 h, two 1 h parts) and B (1 h) are one broadcast with 300 s missing between them.
const A = source('a', 7200, [3600, 3600])
const B = source('b', 3600, [3600])

describe('SegmentTimeline: a merge with a gap', () => {
  const tl = new SegmentTimeline(
    synthetic([seg('a', 0, 7200, 0), seg('b', 0, 3600, 7500)], [{ start: 7200, end: 7500, restricted: true, kind: 'gap' }]),
    [A, B],
  )

  it('plays every source upload as a clip', () => {
    expect(tl.uploads.map((u) => [u.id, u.part])).toEqual([['a-yt1', 1], ['a-yt2', 2], ['b-yt1', 3]])
    expect(tl.partSpans()).toEqual([{ start: 0, end: 3600 }, { start: 3600, end: 7200 }, { start: 7500, end: 11100 }])
    expect([0, 1, 2].map((i) => [tl.partStart(i), tl.partEnd(i)])).toEqual([[0, null], [0, null], [0, null]])
  })

  it('maps synthetic time into the right source video, skipping the gap', () => {
    expect(tl.locate(100)).toEqual({ index: 0, offset: 100 })
    expect(tl.locate(3700)).toEqual({ index: 1, offset: 100 })
    expect(tl.locate(7300)).toEqual({ index: 2, offset: 0 })
    expect(tl.locate(7600)).toEqual({ index: 2, offset: 100 })
    expect(tl.watchable(7300)).toBe(7500)
    expect(tl.toVod({ index: 2, offset: 100 })).toBe(7600)
    expect(tl.locate(99999)).toEqual({ index: 2, offset: 3600 })
    expect(tl.cutAt(7300)).toEqual({ start: 7200, end: 7500 })
  })

  it('says whose chat plays when, holding a segment at its end through a gap', () => {
    expect(tl.segmentAt(100)).toMatchObject({ index: 0, sourceTime: 100 })
    expect(tl.segmentAt(7300)).toMatchObject({ index: 0, sourceTime: 7200 })
    expect(tl.segmentAt(7600)).toMatchObject({ index: 1, sourceTime: 100, segment: { vodId: 'b' } })
  })
})

describe('SegmentTimeline: splits and playthroughs cut inside videos', () => {
  it('starts the second half of a split inside its first video', () => {
    const tl = new SegmentTimeline(synthetic([seg('a', 1000.5, 7200, 0)]), [A])
    expect(tl.clips.map((c) => [c.from, c.to, c.start, c.end])).toEqual([
      [1000.5, 3600, 0, 2599.5],
      [0, 3600, 2599.5, 6199.5],
    ])
    expect(tl.resolveStart()).toEqual({ index: 0, offset: 1000.5 })
    expect(tl.resolveStart({ part: 2 })).toEqual({ index: 1, offset: 0 })
    expect(tl.locate(10)).toEqual({ index: 0, offset: 1010.5 })
  })

  it('stops the first half of a split inside its video', () => {
    const tl = new SegmentTimeline(synthetic([seg('a', 0, 1000.5, 0)]), [A])
    expect(tl.uploads.map((u) => u.id)).toEqual(['a-yt1'])
    expect(tl.partEnd(0)).toBe(1000.5)
    expect(tl.locate(5000)).toEqual({ index: 0, offset: 1000.5 })
  })

  it('plays two windows of one video back to back', () => {
    const tl = new SegmentTimeline(synthetic([seg('a', 600, 1200, 0), seg('a', 2000, 2400, 600)]), [A])
    expect(tl.clips.map((c) => [c.from, c.to, c.start, c.end])).toEqual([
      [600, 1200, 0, 600],
      [2000, 2400, 600, 1000],
    ])
    expect(tl.locate(700)).toEqual({ index: 1, offset: 2100 })
  })

  it("keeps each source's own cuts and delay", () => {
    // 500 s cut out of C's upload at 1000–1500, and its first 100 s never uploaded.
    const C = source('c', 7200, [6600], [{ start: 1000, end: 1500, restricted: true }])
    const tl = new SegmentTimeline(synthetic([seg('c', 0, 7200, 0)], [{ start: 1000, end: 1500, restricted: true }]), [C])
    expect(tl.clips[0]).toMatchObject({ from: 0, to: 6600, start: 100, end: 7200 })
    expect(tl.locate(50)).toEqual({ index: 0, offset: 0 })
    expect(tl.locate(1200)).toEqual({ index: 0, offset: 900 })
    expect(tl.toVod({ index: 0, offset: 900 })).toBe(1500)
  })

  it('skips the segments of a source that did not load', () => {
    const tl = new SegmentTimeline(synthetic([seg('gone', 0, 100, 0), seg('b', 0, 3600, 100)]), [B])
    expect(tl.partSpans()).toEqual([{ start: 100, end: 3700 }])
    expect(tl.locate(0)).toEqual({ index: 0, offset: 0 })
    expect(tl.isEmpty).toBe(false)
    expect(new SegmentTimeline(synthetic([seg('gone', 0, 100, 0)]), []).isEmpty).toBe(true)
  })

  it('plays the live uploads when any source has them', () => {
    const L = { ...source('l', 3600, [3600]), uploads: [{ id: 'l-live', type: 'live' as const, part: 1, duration: 3600, thumbnail: null, preview: null }] }
    const tl = new SegmentTimeline(synthetic([seg('l', 0, 3600, 0), seg('b', 0, 3600, 3600)]), [L, B])
    expect(tl.type).toBe('live')
    // B has no live uploads: its VOD ones play.
    expect(tl.uploads.map((u) => u.id)).toEqual(['l-live', 'b-yt1'])
  })
})

describe('SegmentTimeline: streams', () => {
  // A playthrough: two windows of A (a chapter cut out between them), then B.
  const tl = new SegmentTimeline(synthetic([seg('a', 3000, 4000, 0, 0), seg('a', 5000, 5500, 1000, 0), seg('b', 0, 600, 1500, 1)]), [A, B])

  it('groups segments into streams', () => {
    expect(tl.streams()).toEqual([
      { stream: 0, segment: 0, vodId: 'a', start: 0, end: 1500 },
      { stream: 1, segment: 2, vodId: 'b', start: 1500, end: 2100 },
    ])
  })

  it('numbers parts by video within their stream', () => {
    // A's first window crosses its part boundary at 3600: two clips. The second window is later in that same video,
    // so it stays in the same part.
    expect(tl.clips.map((_, i) => tl.clipInStream(i))).toEqual([
      { stream: 0, part: 0 },
      { stream: 0, part: 1 },
      { stream: 0, part: 1 },
      { stream: 1, part: 0 },
    ])
    expect(tl.clipInStream(9)).toBeNull()
  })

  it('finds where a stream jumps within its VOD', () => {
    expect(tl.jumps()).toEqual([{ at: 1000, vodId: 'a', from: 4000, to: 5000 }])
  })
})

describe('normalize and redirects', () => {
  it('reads the synthetic fields', () => {
    const raw = {
      id: 'a+b', title: 't', duration: '03:05:00', chapters: [], youtube: [], drive: [], createdAt: '2026-01-01T00:00:00Z',
      tags: ['compilation'],
      synthetic: {
        supersedes: false,
        segments: [{ vodId: 'b', start: 0, end: 10, at: 50 }, { vodId: 'a', start: 5, end: 55, at: 0, label: 'x' }],
        madeAt: '2026-02-01T10:00:00.000Z',
        changedAt: '2026-03-01T10:00:00.000Z',
        firstLiveAt: '2026-01-01T00:00:05.000Z',
        lastLiveAt: 'not a date',
      },
    } as RawVod
    const vod = normalizeVod(raw)
    expect(vod.tags).toEqual(['compilation'])
    expect(vod.synthetic?.segments.map((s) => s.vodId)).toEqual(['a', 'b'])
    expect(sourceIds(vod)).toEqual(['a', 'b'])
    expect(vod.synthetic?.segments.map((s) => s.stream)).toEqual([0, 1])
    expect(vod.synthetic?.changedAt?.toISOString()).toBe('2026-03-01T10:00:00.000Z')
    expect(vod.synthetic?.firstLiveAt?.getTime()).toBe(Date.UTC(2026, 0, 1, 0, 0, 5))
    expect(vod.synthetic?.lastLiveAt).toBeNull()
    const plain = normalizeVod({ ...raw, tags: undefined, synthetic: null, appears_in: [{ id: 'p', title: null }] })
    expect([plain.tags, plain.synthetic, plain.supersededBy, plain.appearsIn]).toEqual([[], null, null, [{ id: 'p', title: '', tags: [] }]])
  })

  it('starts a new stream where the source changes, unless the archive numbers them', () => {
    const segs = (list: object[]) => normalizeVod({ id: 'p', title: 't', duration: '00:00:30', chapters: [], youtube: [], drive: [], createdAt: '2026-01-01T00:00:00Z', synthetic: { supersedes: false, segments: list } } as unknown as RawVod).synthetic!.segments.map((s) => s.stream)
    expect(segs([{ vodId: 'a', start: 0, end: 5, at: 0 }, { vodId: 'a', start: 9, end: 12, at: 5 }, { vodId: 'b', start: 0, end: 5, at: 8 }, { vodId: 'a', start: 20, end: 25, at: 13 }])).toEqual([0, 0, 1, 2])
    // A merged broadcast inside a playthrough: two VODs, one stream.
    expect(segs([{ vodId: 'a', start: 0, end: 5, at: 0, stream: 0 }, { vodId: 'a2', start: 0, end: 5, at: 6, stream: 0 }, { vodId: 'b', start: 0, end: 5, at: 11, stream: 1 }])).toEqual([0, 0, 1])
  })

  it('sends a superseded VOD to the same moment', () => {
    const split = { supersededBy: [{ id: 'a-2', start: 1000, end: null, at: 0 }, { id: 'a-1', start: 0, end: 1000, at: 0 }] }
    expect(supersededTarget(split, 500)).toEqual({ id: 'a-1', t: 500 })
    expect(supersededTarget(split, 1500)).toEqual({ id: 'a-2', t: 500 })
    const mergedLater = { supersededBy: [{ id: 'a+b', start: 0, end: null, at: 7500 }] }
    expect(supersededTarget(mergedLater, 60)).toEqual({ id: 'a+b', t: 7560 })
    // A merge cut the overlap off the first VOD: its end goes to where that window ends.
    const cut = { supersededBy: [{ id: 'a+b', start: 0, end: 7000, at: 0 }] }
    expect(supersededTarget(cut, 7100)).toEqual({ id: 'a+b', t: 7000 })
    expect(supersededTarget({ supersededBy: null }, 5)).toBeNull()
    expect(redirectTarget({ mergedInto: { id: 'm', offset: 100 }, supersededBy: null }, 5)).toEqual({ id: 'm', t: 105 })
    expect(redirectTarget({ ...split, mergedInto: null }, 1500)).toEqual({ id: 'a-2', t: 500 })
    expect(redirectTarget({ mergedInto: null, supersededBy: null }, 5)).toBeNull()
  })
})

describe('WatchPlayer on a SegmentTimeline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fakePlayer() {
    const state = { id: '', t: 0, s: YT_STATE.UNSTARTED as number }
    const player: PlayerLike & { state: typeof state } = {
      state,
      loadVideoById: vi.fn((id: string, start = 0) => Object.assign(state, { id, t: start, s: YT_STATE.PLAYING })),
      cueVideoById: vi.fn((id: string, start = 0) => Object.assign(state, { id, t: start, s: YT_STATE.CUED })),
      seekTo: vi.fn((t: number) => (state.t = t)),
      playVideo: vi.fn(() => (state.s = YT_STATE.PLAYING)),
      pauseVideo: vi.fn(() => (state.s = YT_STATE.PAUSED)),
      getCurrentTime: () => state.t,
      getPlayerState: () => state.s,
      mute: vi.fn(),
      unMute: vi.fn(),
      isMuted: () => false,
      destroy: vi.fn(),
    }
    return player
  }

  it('moves on when a clip ends inside its video, seeking when the next clip is the same video', () => {
    const tl = new SegmentTimeline(synthetic([seg('a', 600, 1200, 0), seg('a', 2000, 2400, 600), seg('b', 0, 100, 1000)]), [A, B])
    const w = new WatchPlayer(tl, { tickMs: 250 })
    const p = fakePlayer()
    const ended = vi.fn()
    w.on('ended', ended)
    w.attach(p, tl.resolveStart())
    expect(p.loadVideoById).toHaveBeenLastCalledWith('a-yt1', 600)
    w.handleState(YT_STATE.PLAYING)
    p.state.t = 1200
    vi.advanceTimersByTime(250)
    expect(p.seekTo).toHaveBeenLastCalledWith(2000, true)
    expect(p.loadVideoById).toHaveBeenCalledTimes(1)
    expect([w.partIndex, w.currentTime()]).toEqual([1, 600])
    p.state.t = 2400
    vi.advanceTimersByTime(250)
    expect(p.loadVideoById).toHaveBeenLastCalledWith('b-yt1', 0)
    p.state.t = 100
    vi.advanceTimersByTime(250)
    expect(ended).toHaveBeenCalledOnce()
    expect(p.pauseVideo).toHaveBeenCalled()
  })

  it('starts a picked part where its clip starts', () => {
    const tl = new SegmentTimeline(synthetic([seg('a', 1000, 7200, 0)]), [A])
    const w = new WatchPlayer(tl)
    const p = fakePlayer()
    w.attach(p, { index: 1, offset: 0 })
    w.playPart(0)
    expect(p.loadVideoById).toHaveBeenLastCalledWith('a-yt1', 1000)
  })
})
