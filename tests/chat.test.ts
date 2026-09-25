import { describe, expect, it, vi } from 'vitest'
import type { RawComment, RawCommentPage } from '../src/api/types'
import { EmoteSet, emoteImage, loadEmotes, SEVENTV_GLOBAL } from '../src/chat/emotes'
import { resolveBadges, tokenize, toChatMessage } from '../src/chat/message'
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

describe('messages', () => {
  const emotes = new EmoteSet()
    .add('7tv', [{ id: 'sev', name: 'catJAM' }])
    .add('ffz', [{ id: 42, name: 'monkaS' }])
    .add('bttv', [{ id: 'bt', code: 'catJAM' }, { id: 'bt2', code: 'Clap' }])

  it('looks emotes up 7TV → FFZ → BTTV and keeps whitespace', () => {
    const tokens = tokenize([{ text: 'hi catJAM  monkaS Clap!' }], emotes)
    expect(tokens.map((t) => (t.kind === 'text' ? t.text : `[${t.emote.provider}:${t.emote.code}]`))).toEqual([
      'hi ',
      '[7tv:catJAM]',
      '  ',
      '[ffz:monkaS]',
      ' Clap!',
    ])
  })

  it('uses native Twitch emote fragments in both historical shapes', () => {
    const tokens = tokenize([{ text: 'Kappa', emote: { emoteID: '25' } }, { text: ' ' }, { text: 'PogChamp', emoticon: { emoticon_id: '88' } }])
    expect(tokens.filter((t) => t.kind === 'emote').map((t) => t.kind === 'emote' && t.emote.id)).toEqual(['25', '88'])
    expect(tokens[0]!.kind === 'emote' && tokens[0]!.image.src).toBe('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0')
  })

  it('never produces markup', () => {
    const tokens = tokenize([{ text: '<img src=x onerror=alert(1)>' }], emotes)
    expect(tokens).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
  })

  it('builds emote image URLs per provider', () => {
    expect(emoteImage({ provider: 'ffz', id: '42' }).large).toBe('https://cdn.frankerfacez.com/emote/42/4')
    expect(emoteImage({ provider: '7tv', id: 'sev' }).src).toBe('https://cdn.7tv.app/emote/sev/1x.webp')
    expect(emoteImage({ provider: 'bttv', id: 'bt' }).src).toBe('https://cdn.betterttv.net/emote/bt/1x')
  })

  it('only uses the providers own CDNs', () => {
    for (const provider of ['twitch', 'ffz', 'bttv', '7tv'] as const) {
      const { src } = emoteImage({ provider, id: 'x' })
      expect(new URL(src).hostname).toMatch(/(^|\.)(jtvnw\.net|frankerfacez\.com|betterttv\.net|7tv\.app)$/)
    }
  })

  it('resolves badges from the channel set before the global one, skipping empty ones', () => {
    const badges = {
      channel: [{ set_id: 'subscriber', versions: [{ id: '12', image_url_1x: 'c1', image_url_2x: 'c2', image_url_4x: 'c4' }] }],
      global: [
        { set_id: 'subscriber', versions: [{ id: '12', image_url_1x: 'g1', image_url_2x: 'g2', image_url_4x: 'g4' }] },
        { set_id: 'moderator', versions: [{ id: '1', image_url_1x: 'm1', image_url_2x: 'm2', image_url_4x: 'm4', title: 'Moderator' }] },
      ],
    }
    const out = resolveBadges([{ setID: 'subscriber', version: '12' }, { setID: '', version: '' }, { _id: 'moderator', version: '1' }], badges)
    expect(out.map((b) => [b.setId, b.src, b.title])).toEqual([
      ['subscriber', 'c1', 'subscriber'],
      ['moderator', 'm1', 'Moderator'],
    ])
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
