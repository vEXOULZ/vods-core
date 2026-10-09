// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const Page = defineComponent(() => () => h('div'))
const pages = {
  home: Page,
  list: Page,
  watch: Page,
  games: Page,
  notFound: Page,
  manage: Object.fromEntries(
    ['login', 'overview', 'jobs', 'job', 'vods', 'vod', 'synthetic', 'storage', 'settings', 'tags', 'audit'].map((k) => [k, Page]),
  ) as Record<'login' | 'overview' | 'jobs' | 'job' | 'vods' | 'vod' | 'synthetic' | 'storage' | 'settings' | 'tags' | 'audit', typeof Page>,
}

/** The worker's answer to GET /admin/session. */
function adminSession(s: { authenticated?: boolean; twitchLogin?: boolean; user?: { id: string } }) {
  return vi.fn(async (url: string) =>
    String(url).endsWith('/admin/session')
      ? Response.json({ authenticated: false, csrf: null, expiresAt: null, passwordLogin: true, twitchLogin: false, ...s })
      : new Response('{}', { status: 404 }),
  )
}

/** A fresh session module (its `ensure()` answers once per load) and the wiring on a memory router. */
async function setup(opts: { user?: string | null; path?: string } = {}) {
  vi.resetModules()
  const { installVodsSession, vodsRoutes } = await import('../../src/app/router')
  const session = await import('../../src/app/admin/session')
  const router = createRouter({ history: createMemoryHistory(), routes: vodsRoutes(pages) })
  const user = ref(opts.user ? { id: opts.user } : null)
  const ready = ref(true)
  const navigate = vi.fn()
  const account = { user, ready, request: vi.fn(async () => new Response('{}')) }
  installVodsSession(router, account, { navigate })
  await router.push(opts.path ?? '/')
  return { router, navigate, session, user }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('vodsRoutes', () => {
  it('has the same URLs on every site', async () => {
    const { vodsRoutes } = await import('../../src/app/router')
    const router = createRouter({ history: createMemoryHistory(), routes: vodsRoutes(pages) })
    expect(router.resolve('/manage/jobs/12').matched[0]?.path).toBe('/manage/jobs/:id(\\d+)')
    expect(router.resolve('/youtube/abc').matched[0]?.path).toBe('/youtube/:id')
    expect(router.resolve('/admin/vods/3').fullPath).toBe('/admin/vods/3')
    await router.push('/admin/vods/3?x=1')
    expect(router.currentRoute.value.fullPath).toBe('/manage/vods/3?x=1')
    await router.push('/vods?tab=playthroughs&q=a')
    expect(router.currentRoute.value.fullPath).toBe('/playthroughs?q=a')
  })
})

describe('isManagePath', () => {
  it('takes /manage and below, not a longer name', async () => {
    const { isManagePath } = await import('../../src/app/router')
    expect(['/manage', '/manage/', '/manage/vods/1'].map(isManagePath)).toEqual([true, true, true])
    expect(['/managefoo', '/', '/vods/manage'].map(isManagePath)).toEqual([false, false, false])
  })
})

describe('the Manage guard', () => {
  it('sends a visitor without a session to the sign-in page, and leaves /managefoo alone', async () => {
    vi.stubGlobal('fetch', adminSession({}))
    const { router } = await setup()
    await router.push('/manage/vods?x=1')
    expect(router.currentRoute.value.path).toBe('/manage/login')
    expect(router.currentRoute.value.query.next).toBe('/manage/vods?x=1')
    await router.push('/managefoo')
    expect(router.currentRoute.value.path).toBe('/managefoo')
  })

  it("goes through the worker's Twitch sign-in when it has one", async () => {
    vi.stubGlobal('fetch', adminSession({ twitchLogin: true }))
    const { router, navigate } = await setup()
    await router.push('/manage')
    expect(navigate).toHaveBeenCalledWith('/backend-admin/admin/signin?next=%2Fmanage')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('lets an admin in', async () => {
    vi.stubGlobal('fetch', adminSession({ authenticated: true }))
    const { router } = await setup()
    await router.push('/manage/tags')
    expect(router.currentRoute.value.path).toBe('/manage/tags')
  })
})

describe('the quiet admin check', () => {
  it('asks once for someone signed in to the account', async () => {
    vi.stubGlobal('fetch', adminSession({ twitchLogin: true }))
    const { navigate } = await setup({ user: '42', path: '/vods/1' })
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/backend-admin/admin/signin?quiet=1&next=%2Fvods%2F1'))
  })

  it('never asks from a public page, nor for a known viewer', async () => {
    vi.stubGlobal('fetch', adminSession({ twitchLogin: true }))
    const first = await setup({ user: '42', path: '/manage/login' })
    await nextTick()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r))
    expect(first.navigate).not.toHaveBeenCalled()

    localStorage.setItem('vods-admin:7', 'no')
    const second = await setup({ user: '7', path: '/vods/1' })
    await new Promise((r) => setTimeout(r))
    expect(second.navigate).not.toHaveBeenCalled()
  })

  it("takes the worker's answer off the URL and remembers it", async () => {
    vi.stubGlobal('fetch', adminSession({ twitchLogin: true }))
    const { router, navigate } = await setup({ user: '42', path: '/vods/1?admin=0&t=5' })
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/vods/1?t=5'))
    expect(localStorage.getItem('vods-admin:42')).toBe('no')
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('a dashboard session that ends', () => {
  it('sends a Manage page to the sign-in page', async () => {
    vi.stubGlobal('fetch', adminSession({ authenticated: true }))
    const { router, session } = await setup({ path: '/manage/vods' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await session.admin.health().catch(() => {})
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/manage/login'))
    expect(router.currentRoute.value.query.next).toBe('/manage/vods')
  })
})
