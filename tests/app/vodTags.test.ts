import type { Synthetic, Vod } from '../../src/index'
import { describe, expect, it } from 'vitest'
import type { TagStyle } from '../../src/app/site'
import { splitTags, tagStyle, vodTags } from '../../src/app/lib/vodTags'

const now = new Date(2026, 9, 2, 12, 0).getTime()
const daysAgo = (n: number) => new Date(now - n * 24 * 3600 * 1000)
const vod = (o: Partial<Vod> = {}): Vod =>
  ({ id: '1', title: '', createdAt: daysAgo(30), duration: 0, chapters: [], uploads: [], drive: [], games: [], thumbnail: null, streamId: null, tags: [], ...o }) as Vod
const syn = (first: Date | null, last: Date | null): Synthetic => ({
  supersedes: false,
  segments: [],
  madeAt: null,
  changedAt: null,
  firstLiveAt: first,
  lastLiveAt: last,
})

describe('vodTags', () => {
  it('marks a VOD streamed in the last week as new', () => {
    expect(vodTags(vod({ createdAt: daysAgo(2) }), now)).toEqual(['new'])
    expect(vodTags(vod({ createdAt: daysAgo(10) }), now)).toEqual([])
    expect(vodTags(vod({ createdAt: daysAgo(7) }), now)).toEqual([])
  })
  it('marks a synthetic VOD by its first and last footage', () => {
    expect(vodTags(vod({ synthetic: syn(daysAgo(10), daysAgo(2)) }), now)).toEqual(['updated'])
    expect(vodTags(vod({ synthetic: syn(daysAgo(2), daysAgo(1)) }), now)).toEqual(['new'])
    expect(vodTags(vod({ synthetic: syn(daysAgo(10), daysAgo(10)) }), now)).toEqual([])
  })
  it('falls back to createdAt without live dates', () => {
    expect(vodTags(vod({ createdAt: daysAgo(1), synthetic: syn(null, null) }), now)).toEqual(['new'])
    expect(vodTags(vod({ createdAt: daysAgo(20), synthetic: syn(null, null) }), now)).toEqual([])
  })
  it('keeps the VOD’s own tags after the date ones, once', () => {
    expect(vodTags(vod({ tags: ['compilation', 'complete'], synthetic: syn(daysAgo(20), daysAgo(3)) }), now)).toEqual(['updated', 'compilation', 'complete'])
    expect(vodTags(vod({ tags: ['compilation'] }), now)).toEqual(['compilation'])
  })
})

describe('splitTags', () => {
  const tags: Record<string, TagStyle> = {
    new: { label: 'new', drawn: true },
    complete: { label: 'complete', drawn: true },
    compilation: { label: 'playthrough', drawn: false },
  }
  it('draws the configured tags and leaves the rest as chips', () => {
    const v = vod({ createdAt: daysAgo(1), tags: ['compilation', 'complete', 'other'] })
    expect(splitTags(v, now, tags)).toEqual({ drawn: ['new', 'complete'], chips: ['compilation', 'other'] })
  })
  it('reads an unknown tag as a chip with its own name', () => {
    expect(tagStyle('other', tags)).toEqual({ label: 'other', drawn: false })
    expect(tagStyle('compilation', tags).label).toBe('playthrough')
  })
})
