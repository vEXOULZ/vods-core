import { describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, ref } from 'vue'
import { defineVodsConfig } from '../src/config'
import { LocalProgressStore, type KeyValueStorage } from '../src/progress'
import { createVods, useChat, useProgress, useVods, useWatch } from '../src/vue'
import { rawFixture } from './helpers'

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function setup(fetch: (url: string) => Promise<Response>) {
  const config = defineVodsConfig({ channel: 'c', twitchId: '1', apiBase: 'https://api.example', startDate: '2024-01-01' })
  const data = new Map<string, string>()
  const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
  const vods = createVods(config, { fetch: vi.fn(fetch), progress: new LocalProgressStore({ storage }) })
  const app = createApp({ render: () => null })
  app.use(vods)
  const scope = effectScope()
  const run = <T>(fn: () => T): T => app.runWithContext(() => scope.run(fn)!)
  return { run, scope, ctx: vods.context }
}

describe('vue composables', () => {
  it('useVods refetches when the filters change', async () => {
    const urls: string[] = []
    const { run } = setup(async (url) => {
      urls.push(url)
      return json({ total: 1, limit: 20, skip: 0, data: [rawFixture('vod-plain')] })
    })
    const filters = ref({ page: 1 })
    const { vods, total, loading } = run(() => useVods(filters))
    await flush()
    expect(loading.value).toBe(false)
    expect(total.value).toBe(1)
    expect(vods.value[0]!.chapters[1]!.end).toBe(5504)
    filters.value = { page: 2 }
    await flush()
    expect(urls.at(-1)).toContain('$skip=20')
  })

  it('useVods appends the next page of the same filters, and starts over otherwise', async () => {
    const { run } = setup(async (url) => json({ total: 3, limit: 20, skip: 0, data: [{ ...rawFixture('vod-plain'), id: url }] }))
    const filters = ref<{ page: number; title?: string }>({ page: 1 })
    const { vods, page } = run(() => useVods(filters, { append: true }))
    await flush()
    filters.value = { page: 2 }
    await flush()
    expect(vods.value).toHaveLength(2)
    expect(page.value).toBe(2)
    filters.value = { page: 1, title: 'x' }
    await flush()
    expect(vods.value).toHaveLength(1)
  })

  it('useWatch builds the timeline, and flags a missing VOD', async () => {
    const { run } = setup(async (url) => (url.includes('/vods/404') ? json({ message: 'Not found' }, 404) : json(rawFixture('vod-one-cut'))))
    const id = ref('2510563806')
    const w = run(() => useWatch(id))
    await flush()
    expect(w.timeline.value?.cuts).toEqual([{ start: 54865, end: 73091 }])
    expect(w.uploadType.value).toBe('vod')
    id.value = '404'
    await flush()
    expect(w.notFound.value).toBe(true)
    expect(w.timeline.value).toBeNull()
  })

  it("useWatch loads a synthetic VOD's sources and plays their windows", async () => {
    const urls: string[] = []
    const vod = (id: string, extra = {}) => ({ ...rawFixture('vod-plain'), id, ...extra })
    const { run } = setup(async (url) => {
      urls.push(url)
      if (url.endsWith('/vods/a%2B1')) {
        return json(vod('a+1', { youtube: [], synthetic: { supersedes: true, segments: [{ vodId: 'a', start: 100, end: 200, at: 0 }, { vodId: 'gone', start: 0, end: 50, at: 100 }] } }))
      }
      if (url.endsWith('/vods/a')) return json(vod('a'))
      return json({ message: 'Not found' }, 404)
    })
    const w = run(() => useWatch('a+1'))
    await flush()
    expect(urls.filter((u) => u.includes('/vods/a')).length).toBe(2)
    expect(w.sources.value.map((s) => s.id)).toEqual(['a'])
    expect(w.segments.value?.partSpans()).toEqual([{ start: 0, end: 100 }])
    expect(w.timeline.value?.locate(10)).toEqual({ index: 0, offset: 110 })
  })

  it('useChat follows a synthetic VOD from one source to the next, inside each window', async () => {
    const urls: string[] = []
    const row = (vod: string, at: number) => ({ id: `${vod}@${at}`, vod_id: vod, display_name: 'u', content_offset_seconds: at, message: [{ text: 'hi' }], user_badges: null, user_color: null })
    const { run } = setup(async (url) => {
      if (url.includes('/comments')) {
        urls.push(url)
        const vod = url.includes('/vods/a/') ? 'a' : 'b'
        return json({ comments: [row(vod, 5), row(vod, 15), row(vod, 25), row(vod, 35)] })
      }
      if (url.includes('/emotes?')) return json({ total: 0, limit: 1, skip: 0, data: [] })
      return json({}, 404)
    })
    const segments = [{ vodId: 'a', start: 10, end: 30, at: 0, label: null, stream: 0 }, { vodId: 'b', start: 0, end: 20, at: 20, label: null, stream: 1 }]
    const segmentAt = (t: number) => {
      const index = t >= 20 ? 1 : 0
      const segment = segments[index]!
      return { index, segment, sourceTime: Math.min(segment.end, Math.max(segment.start, segment.start + t - segment.at)) }
    }
    const time = ref(0)
    const chat = run(() => useChat({ vodId: 'a+b', time, playing: ref(true), backlog: 10, segments: { segmentAt } }))
    time.value = 16 // a at 26: its 5 s is before the window
    await flush()
    expect(chat.messages.value.map((m) => m.id)).toEqual(['a@15', 'a@25'])
    time.value = 36 // b at 16
    await flush()
    expect(urls.at(-1)).toContain('/vods/b/')
    expect(chat.messages.value.map((m) => m.id)).toEqual(['b@5', 'b@15'])
  })

  it('useChat shows comments as the clock moves, applying the viewer offset', async () => {
    const page = { comments: [0, 5, 10, 15].map((at, i) => ({ id: `c${i}`, vod_id: 'v', display_name: 'u', content_offset_seconds: at, message: [{ text: 'hi' }], user_badges: null, user_color: null })) }
    const { run } = setup(async (url) => {
      if (url.includes('/comments')) return json(page)
      if (url.includes('/emotes?')) return json({ total: 0, limit: 1, skip: 0, data: [] })
      return json({}, 404)
    })
    const time = ref(0)
    const playing = ref(true)
    const offset = ref(2)
    const chat = run(() => useChat({ vodId: 'v', time, playing, offset, backlog: 10 }))
    // Chat clock 6.5 − 2 = 4.5: c1 (at 5) isn't due yet, though it would be without the offset.
    time.value = 6.5
    await flush()
    expect(chat.messages.value.map((m) => m.id)).toEqual(['c0'])
    time.value = 12.5
    await flush()
    expect(chat.messages.value.map((m) => m.id)).toEqual(['c0', 'c1', 'c2'])
  })

  it('useChat replays the chosen chat, reloading it when the choice changes, even while paused', async () => {
    const urls: string[] = []
    const row = (source: string) => ({ id: source, vod_id: 'v', display_name: 'u', content_offset_seconds: 0, message: [{ text: 'hi' }], user_badges: null, user_color: null, source })
    const { run } = setup(async (url) => {
      if (url.includes('/comments')) {
        urls.push(url)
        const source = url.includes('source=replay') ? 'replay' : 'bot'
        return json({ comments: [row(source)], sources: { replay: 3, bot: 3 } })
      }
      if (url.includes('/emotes?')) return json({ total: 0, limit: 1, skip: 0, data: [] })
      return json({}, 404)
    })
    const time = ref(0)
    const playing = ref(true)
    const chatSource = ref<'auto' | 'replay' | 'bot'>('auto')
    const chat = run(() => useChat({ vodId: 'v', time, playing, chatSource }))
    time.value = 1
    await flush()
    expect(urls.at(-1)).not.toContain('source=')
    expect([chat.served.value, chat.sources.value]).toEqual(['bot', { replay: 3, bot: 3 }])
    playing.value = false
    chatSource.value = 'replay'
    await flush()
    expect(urls.at(-1)).toContain('source=replay')
    expect(chat.messages.value.map((m) => m.id)).toEqual(['replay'])
    expect(chat.served.value).toBe('replay')
  })

  it('useChat renders messages again once emotes arrive after them', async () => {
    const page = { comments: [{ id: 'c0', vod_id: 'v', display_name: 'u', content_offset_seconds: 0, message: [{ text: 'SHEESH' }], user_badges: null, user_color: null }] }
    let releaseEmotes!: () => void
    const emotesReady = new Promise<void>((r) => (releaseEmotes = r))
    const { run } = setup(async (url) => {
      if (url.includes('/comments')) return json(page)
      if (url.includes('/emotes?')) {
        await emotesReady
        return json({ total: 1, limit: 1, skip: 0, data: [{ '7tv_emotes': [{ id: 's', code: 'SHEESH' }] }] })
      }
      return json({}, 404)
    })
    const time = ref(0)
    const chat = run(() => useChat({ vodId: 'v', time, playing: ref(true), backlog: 10 }))
    time.value = 1
    await flush()
    expect(chat.messages.value[0]!.tokens.some((t) => t.kind === 'emote')).toBe(false)
    releaseEmotes()
    await flush()
    expect(chat.messages.value[0]!.tokens.some((t) => t.kind === 'emote')).toBe(true)
  })

  it('useProgress saves on pause and offers it back', async () => {
    const { run, ctx } = setup(async () => json({}, 404))
    const time = ref(0)
    const playing = ref(true)
    run(() => useProgress({ vodId: 'v', duration: 1000, time, playing }))
    time.value = 400
    playing.value = false
    await flush()
    expect((await ctx.progress.get('v'))?.t).toBe(400)
    const again = run(() => useProgress({ vodId: 'v', duration: 1000, time: ref(0), playing: ref(false) }))
    await flush()
    expect(again.resume.value?.t).toBe(400)
  })
})
