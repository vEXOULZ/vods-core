import { describe, expect, it } from 'vitest'
import { normalizeUploads } from '../src/api/normalize'
import { SegmentTimeline } from '../src/composite'
import { Timeline } from '../src/timeline'
import type { Segment, UploadGap, Vod } from '../src/types'
import { makeVod } from './helpers'

const withGaps = (vod: Vod, gaps: UploadGap[][]): Vod => ({ ...vod, uploads: vod.uploads.map((u, i) => ({ ...u, gaps: gaps[i] ?? [] })) })

// Like the archive's VOD 2895611509: 15030 s long, recorded from 47 s in, a 150 s ad break after each of 8 equal
// stretches but the last, and the recording ending 308 s early. Uploaded as a 10800 s part and the rest.
const STRETCH = 13624.861 / 8
const LIVE = withGaps(makeVod({ duration: 15030, parts: [10800, 2824.861], type: 'live' }), [
  [1, 2, 3, 4, 5, 6].map((k) => ({ at: k * STRETCH, length: 150 })),
  [
    { at: 7 * STRETCH - 10800, length: 150 },
    { at: 2824.861, length: 15030 - 47 - 13624.861 - 7 * 150 },
  ],
])

describe('Timeline: a live recording with ad breaks', () => {
  const tl = new Timeline(LIVE, 'live')

  it('leaves only the late start as delay', () => {
    expect(tl.delay).toBeCloseTo(47, 3)
  })

  it('puts every stretch where it was recorded', () => {
    for (let i = 0; i < 8; i++) expect(tl.uploadToVod(i * STRETCH)).toBeCloseTo(47 + i * (STRETCH + 150), 3)
    for (let i = 0; i < 8; i++) expect(tl.vodToUpload(47 + i * (STRETCH + 150) + 10)).toBeCloseTo(i * STRETCH + 10, 3)
  })

  it('marks the ad breaks as missing and skips them', () => {
    const brk = 47 + STRETCH
    expect(tl.missing).toHaveLength(8)
    expect(tl.missing[0]!.start).toBeCloseTo(brk, 3)
    expect(tl.missingAt(brk + 10)).not.toBeNull()
    expect(tl.cutAt(brk + 10)).toBeNull()
    expect(tl.watchable(brk + 10)).toBeCloseTo(brk + 150, 3)
    expect(tl.locate(brk + 10)).toEqual({ index: 0, offset: expect.closeTo(STRETCH, 3) as number })
  })

  it('runs the last part to the end of the VOD', () => {
    const [p1, p2] = tl.partSpans()
    expect(p1!.start).toBeCloseTo(47, 3)
    expect(p1!.end).toBeCloseTo(47 + 10800 + 6 * 150, 3)
    expect(p2!.start).toBeCloseTo(p1!.end, 3)
    expect(p2!.end).toBeCloseTo(15030, 3)
  })

  it("leaves the other upload set alone: gaps are the recording's own", () => {
    const vod = { ...LIVE, uploads: [...LIVE.uploads, { id: 'v1', type: 'vod' as const, part: 1, duration: 15030, thumbnail: null, preview: null }] }
    const tl = new Timeline(vod, 'vod')
    expect(tl.delay).toBe(0)
    expect(tl.missing).toEqual([])
    expect(tl.uploadToVod(5000)).toBe(5000)
  })
})

describe('Timeline: gaps and cuts', () => {
  // 200 s cut at 500, then 100 s missing 1000 s into the upload, which is VOD 1200 (after the cut).
  const tl = new Timeline(
    withGaps(makeVod({ duration: 2200, parts: [1900], chapters: [{ start: 500, end: 700, restricted: true }] }), [[{ at: 1000, length: 100 }]]),
  )

  it('counts both, once each', () => {
    expect(tl.delay).toBe(0)
    expect(tl.missing).toEqual([{ start: 1200, end: 1300 }])
    expect(tl.uploadToVod(400)).toBe(400)
    expect(tl.uploadToVod(600)).toBe(800)
    expect(tl.uploadToVod(1000)).toBe(1300)
    expect(tl.uploadToVod(1000, true)).toBe(1200)
    expect(tl.vodToUpload(1250)).toBe(1000)
    expect(tl.partSpans()).toEqual([{ start: 0, end: 2200 }])
  })
})

describe('SegmentTimeline: a window of a VOD with a gap', () => {
  const src = { ...withGaps(makeVod({ duration: 3700, parts: [3600] }), [[{ at: 1000, length: 100 }]]), id: 'g' }
  const seg: Segment = { vodId: 'g', start: 500, end: 3700, at: 0, label: null, stream: 0 }
  const syn: Vod = { ...makeVod({ duration: 3200, parts: [] }), id: 'syn', synthetic: { supersedes: true, segments: [seg], madeAt: null, changedAt: null, firstLiveAt: null, lastLiveAt: null } }
  const tl = new SegmentTimeline(syn, [src])

  it('carries the missing span into synthetic time and skips it', () => {
    expect(tl.missing).toEqual([{ start: 500, end: 600 }])
    expect(tl.missingAt(550)).not.toBeNull()
    expect(tl.locate(550)).toEqual({ index: 0, offset: 1000 })
    expect(tl.watchable(550)).toBe(600)
  })
})

describe('normalizeUploads: gaps', () => {
  it('keeps well-formed gaps, sorted, and leaves the field out when there are none', () => {
    const [a, b] = normalizeUploads([
      { id: 'a', type: 'live', part: 1, gaps: [[10, 5], ['x', 1], [3, 0], [1, 2], [4]] },
      { id: 'b', type: 'live', part: 2, gaps: 'nope' },
    ])
    expect(a!.gaps).toEqual([{ at: 1, length: 2 }, { at: 10, length: 5 }])
    expect(b).not.toHaveProperty('gaps')
  })
})
