import { describe, expect, it, vi } from 'vitest'
import type { RawComment, RawCommentPage } from '../src/api/types'
import { EmoteSet, loadEmotes, SEVENTV_GLOBAL } from '../src/chat/emotes'
import { loginOf, toChatMessage } from '../src/chat/message'
import { ChatReplay, type CommentSource } from '../src/chat/replay'
import { ArchiveClient } from '../src/api/client'
import { fixtureComments } from './helpers'

const comment = (i: number, at: number): RawComment => ({
  id: `c${i}`,
  vod_id: 'v1',
  display_name: `u${i}`,
  content_offset_seconds: at,
  message: [{ text: `msg ${i}` }],
  user_badges: null,
  user_color: null,
})

/** Pages of `size` comments, one every `gap` seconds; cursors are page numbers. */
function fakeSource(count: number, size = 10, gap = 1) {
  const all = Array.from({ length: count }, (_, i) => comment(i, i * gap))
  const page = (p: number): RawCommentPage => ({
    comments: all.slice(p * size, (p + 1) * size),
    cursor: (p + 1) * size < all.length ? String(p + 1) : undefined,
  })
  const source: CommentSource = {
    commentsAt: vi.fn(async (_v: string, t: number) => page(Math.floor(Math.floor(t / gap) / size))),
    commentsAfter: vi.fn(async (_v: string, cursor: string) => page(Number(cursor))),
  }
  return source
}

describe('ChatReplay', () => {
  it('starts with a backlog up to the clock, then streams what comes due', async () => {
    const src = fakeSource(100)
    const r = new ChatReplay(src, 'v1', { backlog: 3, prefetchAt: 2 })
    const first = await r.update(5)
    expect(first.reset).toBe(true)
    expect(first.comments.map((c) => c.id)).toEqual(['c3', 'c4', 'c5'])
    const next = await r.update(7.5)
    expect(next.reset).toBe(false)
    expect(next.comments.map((c) => c.id)).toEqual(['c6', 'c7'])
  })

  it('pages through with the cursor without losing or repeating comments', async () => {
    const src = fakeSource(100)
    const r = new ChatReplay(src, 'v1', { backlog: 0, prefetchAt: 3, jumpTolerance: 100 })
    await r.update(0)
    const seen: string[] = ['c0']
    for (let t = 1; t <= 45; t++) seen.push(...(await r.update(t)).comments.map((c) => c.id))
    expect(seen).toEqual(Array.from({ length: 46 }, (_, i) => `c${i}`))
    expect(src.commentsAt).toHaveBeenCalledTimes(1)
    expect(src.commentsAfter).toHaveBeenCalledTimes(4)
  })

  it('treats a backwards move or a big jump as a seek', async () => {
    const src = fakeSource(100)
    const r = new ChatReplay(src, 'v1', { backlog: 1 })
    await r.update(50)
    const back = await r.update(20)
    expect(back.reset).toBe(true)
    expect(back.comments.map((c) => c.id)).toEqual(['c20'])
    const jump = await r.update(80)
    expect(jump.reset).toBe(true)
    expect(src.commentsAt).toHaveBeenCalledTimes(3)
    // Small jitter backwards is not a seek.
    expect((await r.update(79.5)).reset).toBe(false)
  })

  it('asks for the chosen source and keeps the counts from the page', async () => {
    const src: CommentSource = {
      commentsAt: vi.fn(async () => ({ comments: [comment(0, 0)], sources: { replay: 1, bot: 0 } })),
      commentsAfter: vi.fn(),
    }
    const r = new ChatReplay(src, 'v1', { source: 'replay' })
    expect(r.sources).toBeNull()
    await r.update(0)
    expect(src.commentsAt).toHaveBeenCalledWith('v1', 0, expect.anything(), 'replay')
    expect(r.sources).toEqual({ replay: 1, bot: 0 })
  })

  it('queues overlapping updates instead of fetching twice', async () => {
    const src = fakeSource(100)
    const r = new ChatReplay(src, 'v1')
    const [a, b] = await Promise.all([r.update(5), r.update(6)])
    expect(a.reset).toBe(true)
    expect(b.reset).toBe(false)
    expect(src.commentsAt).toHaveBeenCalledTimes(1)
  })

  it('works on a real comment page', async () => {
    const page = fixtureComments()
    const src: CommentSource = { commentsAt: async () => page, commentsAfter: async () => ({ comments: [] }) }
    const r = new ChatReplay(src, '2703890458', { backlog: 1000 })
    const { comments } = await r.update(100)
    expect(comments.length).toBeGreaterThan(0)
    expect(comments.every((c) => c.content_offset_seconds <= 100)).toBe(true)
  })
})

// Tokens, badges and emote URLs are tested in @vexoulz/platform-web, where that code lives.
describe('toChatMessage', () => {
  const emotes = new EmoteSet()
    .add('7tv', [{ id: 'sev', name: 'catJAM' }])
    .add('ffz', [{ id: 42, name: 'monkaS' }])
    .add('bttv', [{ id: 'bt', code: 'catJAM' }, { id: 'bt2', code: 'Clap' }])

  it('reads the bot chat: usernames, notices, redeems, cheers, /me and removals', () => {
    const base = { ...comment(0, 0), source: 'bot' as const, user_login: 'someone', display_name: 'Someone' }
    const msg = toChatMessage({ ...base, message_type: 'action', bot: { bits: 100, reward: { id: 'r', title: 'Hydrate', cost: 500, input: '' } } })
    expect(msg).toMatchObject({ login: 'someone', source: 'bot', kind: 'message', action: true, bits: 100,
      reward: { title: 'Hydrate', cost: 500, input: null }, removed: null })
    const notice = toChatMessage({ ...base, kind: 'notice', bot: { type: 'raid' } })
    expect([notice.kind, notice.noticeType]).toEqual(['notice', 'raid'])
    const timedOut = toChatMessage({ ...base, cleared_at: '2026-01-01T00:00:00Z', bot: { removal: { type: 'timeout', duration_s: 600, reason: '' } } })
    expect(timedOut.removed).toEqual({ type: 'timeout', reason: null, seconds: 600 })
    expect(toChatMessage({ ...base, deleted_at: '2026-01-01T00:00:00Z' }).removed?.type).toBe('delete')
  })

  it('knows a replay username only when the display name is plain ASCII', () => {
    expect(loginOf({ display_name: 'SomeOne_42' })).toBe('someone_42')
    expect(loginOf({ display_name: '日本語' })).toBeNull()
    expect(loginOf({ display_name: '日本語', user_login: 'nihongo' })).toBe('nihongo')
    const msg = toChatMessage(comment(0, 0))
    expect([msg.source, msg.kind, msg.login, msg.removed]).toEqual(['replay', 'message', 'u0', null])
  })

  it('converts a real comment', () => {
    const raw = fixtureComments().comments[0]!
    const msg = toChatMessage(raw, emotes, null)
    expect(msg.at).toBe(raw.content_offset_seconds)
    expect(msg.user).toMatch(/^viewer\d+$/)
    expect(msg.tokens.length).toBeGreaterThan(0)
  })
})

describe('loadEmotes', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const load = (fetch: (url: string) => Promise<Response>) =>
    loadEmotes({ client: new ArchiveClient({ apiBase: 'https://api.example', fetch }), vodId: '1', fetch })

  it("keeps a VOD with saved sets to those (plus 7TV globals), never today's channel emotes", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/emotes?')) return json({ total: 1, limit: 1, skip: 0, data: [{ ffz_emotes: [{ id: 1, name: 'a' }], bttv_emotes: [], '7tv_emotes': [] }] })
      if (url === SEVENTV_GLOBAL) return json({ emotes: [{ id: 'g', name: 'EZ' }] })
      if (url.endsWith('/v1/emotes/third-party')) return json({ bttv: [{ id: 'n', code: 'NewEmote', provider: 'bttv' }] })
      return json({}, 404)
    })
    const set = await load(fetch)
    expect(set.find('a')).toEqual({ provider: 'ffz', id: '1', code: 'a' })
    expect(set.find('EZ')?.provider).toBe('7tv')
    expect(set.find('NewEmote')).toBeNull()
    expect(fetch.mock.calls.some(([u]) => u.includes('third-party'))).toBe(false)
  })

  it('uses the global sets saved with the VOD, after its channel sets, and skips the live 7TV fetch', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/emotes?'))
        return json({
          total: 1, limit: 1, skip: 0,
          data: [{
            ffz_emotes: [{ id: 1, name: 'Same' }], bttv_emotes: [], '7tv_emotes': [],
            global_emotes: { '7tv': [{ id: 'old', name: 'EZ' }, { id: 'g2', name: 'Same' }], bttv: [], ffz: [{ id: 9, code: 'ZrehplaR' }] },
            global_emotes_source: 'captured',
          }],
        })
      if (url === SEVENTV_GLOBAL) return json({ emotes: [{ id: 'today', name: 'EZ' }] })
      return json({}, 404)
    })
    const set = await load(fetch)
    expect(set.find('EZ')).toEqual({ provider: '7tv', id: 'old', code: 'EZ' })
    expect(set.find('ZrehplaR')?.provider).toBe('ffz')
    // A channel emote wins over a global with the same code only within its provider's lookup order: 7TV first.
    expect(set.find('Same')?.provider).toBe('7tv')
    expect(fetch.mock.calls.some(([u]) => u === SEVENTV_GLOBAL)).toBe(false)
  })

  it("uses the archive-cached current sets when nothing was saved, and survives failures", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/emotes?')) return json({ total: 0, limit: 1, skip: 0, data: [] })
      if (url.endsWith('/v1/emotes/third-party')) return json({ bttv: [{ id: 'b', code: 'Clap', provider: 'bttv' }], failed: ['7tv', 'ffz'] })
      return json({}, 404)
    })
    const set = await load(fetch)
    expect(set.find('Clap')?.provider).toBe('bttv')
    // Only the archive is called: no provider APIs from the browser.
    expect(fetch.mock.calls.every(([u]) => u.startsWith('https://api.example/'))).toBe(true)
    expect((await load(async () => json({}, 500))).size).toBe(0)
  })
})
