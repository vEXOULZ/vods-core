import { describe, expect, it } from 'vitest'
import { pickUploadType, restrictedSpans, Timeline } from '../src/timeline'
import { fixtureVod, makeVod } from './helpers'

describe('normalized fixtures', () => {
  it('turns the length-as-end into absolute chapter ends', () => {
    const vod = fixtureVod('vod-plain')
    expect(vod.duration).toBe(25000)
    expect(vod.chapters.map((c) => [c.start, c.end])).toEqual([
      [0, 2110],
      [2110, 5504],
      [5504, 10222],
      [10222, 11058],
      [11058, 12963],
      [12963, 24607],
      [24607, 25000],
    ])
  })
})

describe('Timeline: no cuts (vod-plain, 3 parts)', () => {
  const tl = new Timeline(fixtureVod('vod-plain'))

  it('has no delay when the uploads cover the VOD', () => {
    expect(tl.delay).toBe(0)
    expect(tl.uploadLength).toBe(25000)
  })

  it('maps VOD time to part and offset', () => {
    expect(tl.locate(0)).toEqual({ index: 0, offset: 0 })
    expect(tl.locate(10799)).toEqual({ index: 0, offset: 10799 })
    expect(tl.locate(10800)).toEqual({ index: 1, offset: 0 })
    expect(tl.locate(24000)).toEqual({ index: 2, offset: 2400 })
  })

  it('clamps past the end to the end of the last part', () => {
    expect(tl.locate(99999)).toEqual({ index: 2, offset: 3400 })
  })

  it('round-trips', () => {
    for (const t of [0, 1, 5504, 10800, 17000.5, 24999]) expect(tl.toVod(tl.locate(t))).toBeCloseTo(t, 6)
  })

  it('finds the chapter playing', () => {
    expect(tl.chapterAt(5504)?.name).toBe('Make Good Choices')
    expect(tl.chapterAt(5503.9)?.name).toBe('MOONROT')
    expect(tl.chapterAt(25000)?.name).toBe('Just Chatting')
  })

  it('lists part spans in VOD time', () => {
    expect(tl.partSpans()).toEqual([
      { start: 0, end: 10800 },
      { start: 10800, end: 21600 },
      { start: 21600, end: 25000 },
    ])
  })
})

describe('Timeline: one cut (vod-one-cut, 5 h restricted chapter)', () => {
  const tl = new Timeline(fixtureVod('vod-one-cut'))

  it('removes the cut from the upload timeline', () => {
    expect(tl.cuts).toEqual([{ start: 54865, end: 73091 }])
    expect(tl.delay).toBe(0)
  })

  it('plays right up to the cut, then continues after it', () => {
    expect(tl.locate(54864)).toEqual({ index: 5, offset: 864 })
    expect(tl.partSpans()[5]).toEqual({ start: 54000, end: 54865 })
    expect(tl.partSpans()[6]).toEqual({ start: 73091, end: 83891 })
    expect(tl.toVod({ index: 6, offset: 0 })).toBe(73091)
  })

  it('snaps a time inside the cut to its end', () => {
    expect(tl.cutAt(60000)).toEqual({ start: 54865, end: 73091 })
    expect(tl.locate(54865)).toEqual({ index: 6, offset: 0 })
    expect(tl.locate(60000)).toEqual({ index: 6, offset: 0 })
    expect(tl.watchable(60000)).toBe(73091)
  })

  it('maps times after the cut back into the right part', () => {
    expect(tl.locate(80000)).toEqual({ index: 6, offset: 80000 - 73091 })
    expect(tl.locate(86520)).toEqual({ index: 7, offset: 2629 })
  })
})

describe('Timeline: two cuts, fractional durations (vod-two-cuts)', () => {
  const tl = new Timeline(fixtureVod('vod-two-cuts'))

  it('clamps a slightly negative delay to 0', () => {
    expect(tl.delay).toBe(0)
    expect(tl.cuts).toEqual([
      { start: 16326, end: 35783 },
      { start: 44555, end: 44558 },
    ])
  })

  it('starts each part after its cut', () => {
    const spans = tl.partSpans()
    expect(spans[1]!.end).toBeCloseTo(16326, 1)
    expect(spans[2]!.start).toBeCloseTo(35783, 1)
    expect(spans[2]!.end).toBeCloseTo(44555, 1)
    expect(spans[3]!.start).toBeCloseTo(44558, 1)
  })

  it('lands inside the 3-second cut on the next part, not a few ms before the end of the previous one', () => {
    const pos = tl.locate(44556)
    expect(pos.index).toBe(3)
    expect(pos.offset).toBeLessThan(0.5)
  })

  it('round-trips outside the cuts', () => {
    for (const t of [100, 16000, 36000, 44000, 50000, 86000]) expect(tl.toVod(tl.locate(t))).toBeCloseTo(t, 3)
  })
})

describe('Timeline: late cuts (vod-late-cut)', () => {
  const tl = new Timeline(fixtureVod('vod-late-cut'))
  it('handles a cut near the end', () => {
    expect(tl.cuts).toHaveLength(2)
    expect(tl.locate(75000).index).toBe(7)
    expect(tl.toVod(tl.locate(75000))).toBeCloseTo(80208, 0)
  })
})

describe('Timeline: synthetic edge cases', () => {
  it('puts missing footage (delay) at the start', () => {
    const tl = new Timeline(makeVod({ duration: 1000, parts: [400, 400] }))
    expect(tl.delay).toBe(200)
    expect(tl.locate(0)).toEqual({ index: 0, offset: 0 })
    expect(tl.locate(300)).toEqual({ index: 0, offset: 100 })
    expect(tl.toVod({ index: 1, offset: 0 })).toBe(600)
  })

  it('uses the default length for a part still processing, as a number', () => {
    const tl = new Timeline(makeVod({ duration: 30000, parts: [10800, null, 5000] }), 'vod', { defaultPartDuration: 10800 })
    expect(tl.lengths).toEqual([10800, 10800, 5000])
    expect(tl.starts).toEqual([0, 10800, 21600])
    expect(typeof tl.delay).toBe('number')
  })

  it('merges overlapping cuts', () => {
    expect(
      restrictedSpans([
        { name: 'a', gameId: null, image: null, start: 100, end: 200, restricted: true },
        { name: 'b', gameId: null, image: null, start: 150, end: 300, restricted: true },
        { name: 'c', gameId: null, image: null, start: 400, end: 500, restricted: false },
      ]),
    ).toEqual([{ start: 100, end: 300 }])
  })

  it('handles a cut at the very start', () => {
    const tl = new Timeline(makeVod({ duration: 1000, parts: [800], chapters: [{ start: 0, end: 200, restricted: true }] }))
    expect(tl.locate(0)).toEqual({ index: 0, offset: 0 })
    expect(tl.toVod({ index: 0, offset: 0 })).toBe(200)
    expect(tl.locate(500)).toEqual({ index: 0, offset: 300 })
  })

  it('resolves ?t= and ?part=', () => {
    const tl = new Timeline(fixtureVod('vod-plain'))
    expect(tl.resolveStart({ t: 12000 })).toEqual({ index: 1, offset: 1200 })
    expect(tl.resolveStart({ part: 3 })).toEqual({ index: 2, offset: 0 })
    expect(tl.resolveStart({ part: 9 })).toEqual({ index: 0, offset: 0 })
    expect(tl.resolveStart({ t: 12000, part: 3 })).toEqual({ index: 1, offset: 1200 })
  })

  it('is empty without uploads of the requested type', () => {
    const tl = new Timeline(makeVod({ duration: 100, parts: [100] }), 'live')
    expect(tl.isEmpty).toBe(true)
    expect(tl.locate(50)).toEqual({ index: -1, offset: 0 })
  })

  it('prefers live uploads when there are any, like the old site', () => {
    const vod = makeVod({ duration: 100, parts: [100] })
    expect(pickUploadType(vod)).toBe('vod')
    vod.uploads.push({ id: 'l1', type: 'live', part: 1, duration: 100, thumbnail: null })
    expect(pickUploadType(vod)).toBe('live')
    expect(pickUploadType(vod, 'vod')).toBe('vod')
  })
})
