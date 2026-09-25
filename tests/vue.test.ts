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
