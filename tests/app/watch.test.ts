import { describe, expect, it } from 'vitest'
import { SegmentTimeline } from '../../src/composite'
import { Timeline } from '../../src/timeline'
import type { Segment, Vod } from '../../src/types'
import { partOffset, streamEntered } from '../../src/app/lib/watch'
import { fixtureVod, makeVod } from '../helpers'

const seg = (vodId: string, start: number, end: number, at: number, stream = 0): Segment => ({ vodId, start, end, at, label: null, stream })
const synthetic = (segments: Segment[]): Vod => {
  const end = Math.max(...segments.map((s) => s.at + s.end - s.start))
  return { ...makeVod({ duration: end, parts: [] }), id: 'syn', synthetic: { supersedes: true, segments, madeAt: null, changedAt: null, firstLiveAt: null, lastLiveAt: null } }
}

describe('partOffset', () => {
  it('is the offset into the upload for a plain VOD, across a cut (vod-one-cut)', () => {
    const tl = new Timeline(fixtureVod('vod-one-cut'))
    expect(partOffset(tl, 54864)).toBe(864)
    // Inside the cut: the start of the part after it.
    expect(partOffset(tl, 60000)).toBe(0)
    expect(partOffset(tl, 80000)).toBe(80000 - 73091)
  })

  it("counts from where a split's first part starts in its YouTube video (vod-plain, split at 1000.5 s)", () => {
    const plain = fixtureVod('vod-plain')
    const tl = new SegmentTimeline(synthetic([seg(plain.id, 1000.5, 20000, 0)]), [plain])
    expect(tl.locate(100)).toEqual({ index: 0, offset: 1100.5 })
    expect(partOffset(tl, 100)).toBe(100)
    expect(partOffset(tl, 0)).toBe(0)
    // The next part is a whole video again.
    expect(partOffset(tl, 9800)).toBeCloseTo(0.5)
  })
})

describe('streamEntered', () => {
  const streams = [{ start: 0 }, { start: 1500 }, { start: 3000 }]

  it('finds the stream that playing on just crossed into', () => {
    expect(streamEntered(streams, 1499.6, 1500.1)).toBe(1)
    expect(streamEntered(streams, 2998, 3000)).toBe(2)
  })

  it("isn't fooled by seeks, going back, or staying inside a stream", () => {
    expect(streamEntered(streams, 1400, 1600)).toBe(-1) // a jump further than playing goes between two reports
    expect(streamEntered(streams, 1501, 1499)).toBe(-1)
    expect(streamEntered(streams, 1500, 1500)).toBe(-1)
    expect(streamEntered(streams, 100, 101)).toBe(-1)
    // The first stream is never "entered".
    expect(streamEntered(streams, -0.5, 0.5)).toBe(-1)
  })
})
