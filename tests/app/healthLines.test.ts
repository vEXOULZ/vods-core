import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type YoutubeCheck,
  diskLine,
  issueLink,
  issueWhere,
  percent,
  quotaLine,
  sortedProblems,
  stuckLine,
  stuckVods,
  youtubeCheckLine,
  youtubeCheckMessage,
} from '../../src/app/kit'
import { admin } from '../../src/app/admin/session'

afterEach(() => vi.restoreAllMocks())

const NOW = Date.parse('2026-10-13T12:00:00Z')
const quota = (used: number) => ({ used, limit: 10_000, resetsAt: '2026-10-14T07:00:00Z', calls: {} })

describe('overview health lines', () => {
  it('counts the quota in units and uploads left, and warns past 80%', () => {
    expect(quotaLine(quota(4809), NOW)).toEqual({ text: '4,809 of 10,000 units', sub: 'room for 3 more uploads · resets in 19 h', warn: false })
    expect(quotaLine(quota(8400), NOW)).toMatchObject({ sub: 'room for 1 more upload · resets in 19 h', warn: true })
    expect(quotaLine(quota(12_000), NOW).sub).toBe('no room for another upload · resets in 19 h')
  })

  it('says how much disk is free and warns past 80% used', () => {
    expect(diskLine({ total: 1000, used: 500, free: 500 }).warn).toBe(false)
    expect(diskLine({ total: 1000, used: 850, free: 150 }).warn).toBe(true)
  })

  it('counts the stuck VODs, with a + past the page', async () => {
    const list = vi.spyOn(admin, 'vodList').mockResolvedValue({ items: [{ id: 'a' }, { id: 'b' }] as never, next_cursor: 'x' })
    const s = await stuckVods()
    expect(list).toHaveBeenCalledWith({ uploaded: false, busy: false, synthetic: false, limit: 50 }, undefined)
    expect(s).toEqual({ count: 2, more: true, ids: ['a', 'b'] })
    expect(stuckLine(s)).toMatchObject({ text: '2+ VODs', warn: true })
    expect(stuckLine({ count: 1, more: false }).text).toBe('1 VOD')
    expect(stuckLine({ count: 0, more: false })).toMatchObject({ text: 'None', warn: false })
  })
})

const check = (over: Partial<YoutubeCheck> = {}): YoutubeCheck => ({
  checkedAt: '2026-10-13T11:00:00Z', videos: 120, vods: 40, whole: 40, bad: 0, warn: 0, seconds: 1000, onYoutube: 1000, problems: [], ...over,
})
const report = (id: string, share: number, severity: 'bad' | 'warn') => ({
  id, title: null, seconds: 100, planned: 100, share, copies: [],
  issues: [{ kind: 'blocked' as const, severity, detail: 'x', type: 'vod', part: 1, video: 'abc' }],
})

describe('YouTube check lines', () => {
  it('rounds the share down, so a gap never shows as 100%', () => {
    expect([percent(1), percent(0), percent(0.9995), percent(0.973), percent(1.2)]).toEqual(['100%', '0%', '99.9%', '97.3%', '100%'])
  })

  it('says how much is on YouTube and warns when a VOD is missing there', () => {
    expect(youtubeCheckLine({ running: false, last: null })).toEqual({ text: 'Not checked yet', sub: 'Check now to see', warn: false })
    expect(youtubeCheckLine({ running: false, last: check() })).toEqual({ text: '100% on YouTube', sub: 'All 120 uploads there and whole', warn: false })
    expect(youtubeCheckLine({ running: false, last: check({ onYoutube: 950, bad: 2, warn: 1 }) })).toEqual({
      text: '95.0% on YouTube', sub: '2 VODs missing there, 1 with warnings', warn: true,
    })
    expect(youtubeCheckLine({ running: false, last: check({ warn: 1 }) })).toMatchObject({ sub: '1 VOD with warnings', warn: false })
    expect(youtubeCheckMessage(check({ bad: 1, warn: 2 }))).toBe('Checked 120 uploads on YouTube: 3 VODs with problems')
  })

  it('lists bad VODs first, then the least on YouTube, and links what is still there', () => {
    const c = check({ problems: [report('1', 0.5, 'warn'), report('2', 0.9, 'bad'), report('3', 0.2, 'bad')] })
    expect(sortedProblems(c).map((r) => r.id)).toEqual(['3', '2', '1'])
    expect(sortedProblems(null)).toEqual([])
    const i = report('1', 1, 'bad').issues[0]!
    expect(issueWhere(i)).toBe('VOD part 1')
    expect(issueWhere({ ...i, type: 'live', part: undefined })).toBe('Live copy')
    expect(issueLink(i)).toBe('https://www.youtube.com/watch?v=abc')
    expect(issueLink({ ...i, kind: 'removed' })).toBeUndefined()
  })
})
