import { describe, expect, it, vi } from 'vitest'
import { AdminClient } from '../../src/app/admin/api'
import { censorDrafts, censorEdits, censorErrors, censoredSeconds, newCensor } from '../../src/app/admin/edits'

describe('censor drafts', () => {
  it('round-trip ranges, sorted, with notes trimmed and empty ones dropped', () => {
    const drafts = censorDrafts([
      { start: 300, end: 360, video: null, mute: true },
      { start: 10, end: 20, video: 'blur', mute: false, note: 'menu' },
    ])
    expect(drafts.map((d) => d.video)).toEqual(['none', 'blur'])
    drafts[0]!.note = '  song  '
    drafts[1]!.note = '   '
    expect(censorEdits(drafts)).toEqual([
      { start: 10, end: 20, video: 'blur', mute: false },
      { start: 300, end: 360, video: null, mute: true, note: 'song' },
    ])
  })

  it('check what the worker checks', () => {
    const [ok, empty, back, late, nothing] = censorDrafts([
      { start: 0, end: 10, video: 'black', mute: false },
      { start: 0, end: 10, video: 'blur', mute: false },
      { start: 50, end: 40, video: 'blur', mute: false },
      { start: 50, end: 900, video: 'blur', mute: false },
      { start: 5, end: 10, video: null, mute: false },
    ])
    empty!.end = null
    const errors = censorErrors([ok!, empty!, back!, late!, nothing!], 600)
    expect(errors.has(ok!.key)).toBe(false)
    expect(errors.get(empty!.key)).toMatch(/required/)
    expect(errors.get(back!.key)).toMatch(/after the start/)
    expect(errors.get(late!.key)).toMatch(/after the VOD/)
    expect(errors.get(nothing!.key)).toMatch(/mute/)
  })

  it('start a new range after the last, inside the VOD', () => {
    const rows = censorDrafts([{ start: 0, end: 100, video: 'blur', mute: false }])
    expect(newCensor(rows, 600)).toMatchObject({ start: 100, end: 160, video: 'blur', mute: false })
    expect(newCensor(censorDrafts([{ start: 0, end: 590, video: 'blur', mute: false }]), 600)).toMatchObject({ start: 540, end: 600 })
  })

  it('count overlapping ranges once', () => {
    expect(censoredSeconds([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 100, end: 110 }])).toBe(25)
    expect(censoredSeconds([])).toBe(0)
  })
})

describe('AdminClient censor and re-archive', () => {
  it('saves ranges, deletes uploads and re-archives', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: false, msg: 'ok' }), { status: 200 }))
    const c = new AdminClient({ base: '/b/', fetch })
    await c.saveCensor('7', [{ start: 0, end: 5, video: 'black', mute: true }])
    await c.deleteUploads('7', ['abc'])
    await c.rearchive('7', { type: 'live', part: 2 })
    const calls = fetch.mock.calls.map(([url, init]) => [url, init!.method, JSON.parse(String(init!.body))])
    expect(calls).toEqual([
      ['/b/admin/vods/7/censor', 'PUT', { censor: [{ start: 0, end: 5, video: 'black', mute: true }] }],
      ['/b/admin/vods/7/youtube/delete', 'POST', { videos: ['abc'] }],
      ['/b/admin/vods/7/rearchive', 'POST', { type: 'live', part: 2 }],
    ])
  })
})
