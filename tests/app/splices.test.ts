import type { Chapter } from '../../src/index'
import { describe, expect, it, vi } from 'vitest'
import { AdminApiError, AdminClient, isSpliced, type Splice } from '../../src/app/admin/api'
import { gamesWithArt } from '../../src/app/lib/art'
import { cutNote } from '../../src/app/lib/cuts'

const reply = (status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))

describe('merge and split client', () => {
  it('posts the right bodies', async () => {
    const fetch = reply(200, { error: false, msg: 'ok' })
    const c = new AdminClient({ base: '', fetch })
    await c.merge('A', 'B')
    await c.merge('A', 'B', 0)
    await c.unmerge('A', 'B', true)
    await c.split('A', 3605)
    await c.unsplit('A')
    const bodies = fetch.mock.calls.map(([url, init]) => [url, init?.body && JSON.parse(init.body as string)])
    expect(bodies).toEqual([
      ['/admin/vods/A/merge', { source: 'B' }],
      ['/admin/vods/A/merge', { source: 'B', gap: 0 }],
      ['/admin/vods/A/unmerge', { source: 'B', force: true }],
      ['/admin/vods/A/split', { at: 3605 }],
      ['/admin/vods/A/unsplit', {}],
    ])
  })

  it("keeps a 409's extra fields: validPoints and edited", async () => {
    const points = [{ at: 10800, from: 10800, to: 10860 }]
    const split = await new AdminClient({ base: '', fetch: reply(409, { error: true, msg: 'inside an upload', validPoints: points }) })
      .split('A', 5000)
      .catch((e: unknown) => e)
    expect(split).toBeInstanceOf(AdminApiError)
    expect((split as AdminApiError).validPoints).toEqual(points)
    expect((split as AdminApiError).edited).toEqual([])
    const undo = await new AdminClient({ base: '', fetch: reply(409, { error: true, msg: 'Edited since', edited: ['A.title'] }) })
      .unmerge('A', 'B')
      .catch((e: unknown) => e)
    expect((undo as AdminApiError).edited).toEqual(['A.title'])
  })
})

describe('isSpliced', () => {
  const sp = (undoneAt: string | null): Splice => ({
    id: 1, kind: 'merge', vodId: 'A', otherId: 'B', offset: 100, gap: 10, detail: {}, createdAt: '', undoneAt, undoable: true,
  })
  it('is true while a merge or split stands, or when merged away', () => {
    expect(isSpliced({ splices: [] })).toBe(false)
    expect(isSpliced({ splices: [sp('2026-01-01')] })).toBe(false)
    expect(isSpliced({ splices: [sp('2026-01-01'), sp(null)] })).toBe(true)
    expect(isSpliced({ merged_into: { id: 'A', offset: 100 } })).toBe(true)
  })
})

describe('gap chapters', () => {
  const ch = (name: string, over: Partial<Chapter> = {}): Chapter => ({ name, image: null, gameId: null, start: 0, end: 1, restricted: false, ...over })
  it('are labelled apart from DMCA cuts', () => {
    expect(cutNote(ch('Game'))).toBeNull()
    expect(cutNote(ch('Game', { restricted: true }))?.label).toBe('cut')
    expect(cutNote(ch('Technical difficulties', { restricted: true, kind: 'gap' }))?.label).toBe('stream down')
  })
  it("aren't games", () => {
    expect(gamesWithArt([ch('A'), ch('Technical difficulties', { restricted: true, kind: 'gap' }), ch('A')]).map((g) => g.name)).toEqual(['A'])
  })
})
