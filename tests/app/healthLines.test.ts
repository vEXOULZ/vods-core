import { afterEach, describe, expect, it, vi } from 'vitest'
import { diskLine, quotaLine, stuckLine, stuckVods } from '../../src/app/kit'
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
