import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type DoomtpStatus,
  type YoutubeCheck,
  RECENT_PROBLEM_DAYS,
  diskLine,
  doomtpLine,
  issueLink,
  issueWhere,
  percent,
  quotaLine,
  sortedProblems,
  splitProblems,
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

describe('recent upload problems', () => {
  const now = Date.parse('2026-10-15T12:00:00Z')
  const dated = (id: string, createdAt: string | null | undefined, share = 0.5) => ({ ...report(id, share, 'bad'), createdAt })

  it('keeps the last two weeks on the overview and sends the rest to their own page', () => {
    const c = check({
      problems: [
        dated('old', '2026-09-01T00:00:00Z', 0.1),
        dated('new', '2026-10-10T00:00:00Z'),
        dated('edge', '2026-10-01T12:00:00Z'),
        dated('undated', undefined),
      ],
    })
    const { recent, older } = splitProblems(c, now)
    expect(recent.map((r) => r.id)).toEqual(['undated', 'new', 'edge'])
    expect(older.map((r) => r.id)).toEqual(['old'])
    expect(RECENT_PROBLEM_DAYS).toBe(14)
    expect(splitProblems(null, now)).toEqual({ recent: [], older: [] })
  })
})

describe('doomtp-bot tile', () => {
  const base: DoomtpStatus = {
    configured: true, keyed: true, login: 'vexoulz', ok: true, listening: true, since: '2026-10-15T10:00:00Z', error: null, checkedAt: '2026-10-15T12:00:00Z',
  }
  const ago = (iso: string) => `@${iso.slice(11, 16)}`

  it('says whether the bot answers and is in chat', () => {
    expect(doomtpLine(base, ago)).toEqual({ text: 'In chat', sub: 'since @10:00 · with a key', warn: false, status: 'ok' })
    expect(doomtpLine({ ...base, listening: false, keyed: false }, ago)).toEqual({ text: 'Not in chat', sub: 'left @10:00 · public log only', warn: true, status: 'warn' })
    expect(doomtpLine({ ...base, ok: false, listening: null, error: 'ConnectError' }, ago)).toMatchObject({ text: 'Unreachable', sub: 'ConnectError', status: 'warn' })
    expect(doomtpLine({ ...base, configured: false, ok: null }, ago)).toMatchObject({ text: 'Not set up', status: 'off', warn: false })
  })
})
