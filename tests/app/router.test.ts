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
async function setup(opts: { user?: string | null; path?: string; clientId?: string } = {}) {
  vi.resetModules()
  const { installVodsSession, vodsRoutes } = await import('../../src/app/router')
  const session = await import('../../src/app/admin/session')
  const router = createRouter({ history: createMemoryHistory(), routes: vodsRoutes(pages) })
  const user = ref(opts.user ? { id: opts.user } : null)
  const ready = ref(true)
  const navigate = vi.fn()
  const account = { user, ready, request: (p: string, i: RequestInit = {}) => fetch(`https://auth.test${p}`, { ...i, credentials: 'include' }) }
  installVodsSession(router, account, { navigate, adminClientId: opts.clientId })
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

/** vexoulz-auth and a worker with Twitch sign-in: the account is an admin (`admin`), a viewer, or the worker can't tell. */
function quiet(answer: 'admin' | 'viewer' | 503) {
  let signedIn = false
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url)
    const method = init.method ?? 'GET'
    if (u.endsWith('/v1/me')) return Response.json({ id: '42', login: 'vexoulz', csrf: 'auth-csrf' })
    if (u.endsWith('/v1/codes')) return Response.json({ code: 'c0de' })
    if (u.endsWith('/admin/session') && method === 'POST') {
      if (answer === 503) return Response.json({ status: 503, code: 'unavailable' }, { status: 503 })
      if (answer === 'viewer') return Response.json({ admin: false })
      signedIn = true
      return Response.json({ admin: true, authenticated: true, csrf: 'w', expiresAt: null, passwordLogin: false, twitchLogin: true, user: { id: '42' } })
    }
    if (u.endsWith('/admin/session')) return Response.json({ authenticated: signedIn, csrf: null, expiresAt: null, passwordLogin: true, twitchLogin: true })
    return new Response('{}', { status: 404 })
  })
}

const settle = () => new Promise((r) => setTimeout(r, 10))
const codesAsked = () => vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith('/v1/codes')).length

describe('the quiet admin check', () => {
  it('gives a signed-in admin the dashboard session on the page they are on', async () => {
    vi.stubGlobal('fetch', quiet('admin'))
    const { router, navigate, session } = await setup({ user: '42', path: '/vods/1' })
    await vi.waitFor(() => expect(session.session.authenticated).toBe(true))
    expect(navigate).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/vods/1')
  })

  it('never leaves the page, and keeps nothing in localStorage or sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    for (const answer of ['admin', 'viewer', 503] as const) {
      vi.stubGlobal('fetch', quiet(answer))
      const { navigate } = await setup({ user: '42', path: '/vods/1' })
      await vi.waitFor(() => expect(codesAsked()).toBe(1))
      await settle()
      expect(navigate).not.toHaveBeenCalled()
    }
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    setItem.mockRestore()
  })

  it("shows a viewer nothing, and asks once however much they move around", async () => {
    vi.stubGlobal('fetch', quiet('viewer'))
    const { router, session } = await setup({ user: '7', path: '/vods/1' })
    await vi.waitFor(() => expect(codesAsked()).toBe(1))
    await router.push('/vods/2')
    await router.push('/games/3')
    await settle()
    expect(codesAsked()).toBe(1)
    expect(session.session.authenticated).toBe(false)
  })

  it("asks once when the worker can't tell, never in a loop", async () => {
    vi.stubGlobal('fetch', quiet(503))
    const { router, session } = await setup({ user: '42', path: '/vods/1' })
    await vi.waitFor(() => expect(codesAsked()).toBe(1))
    await router.push('/vods/2')
    await settle()
    expect(codesAsked()).toBe(1)
    expect(session.session.authenticated).toBe(false)
  })

  it('asks nothing when signed out', async () => {
    vi.stubGlobal('fetch', quiet('admin'))
    const { navigate } = await setup({ path: '/vods/1' })
    await settle()
    expect(codesAsked()).toBe(0)
    expect(navigate).not.toHaveBeenCalled()
  })

  it("asks again for another account, and sends the site's client id", async () => {
    vi.stubGlobal('fetch', quiet('viewer'))
    const { user } = await setup({ user: '7', path: '/vods/1', clientId: 'keeki-admin' })
    await vi.waitFor(() => expect(codesAsked()).toBe(1))
    user.value = { id: '8' }
    await vi.waitFor(() => expect(codesAsked()).toBe(2))
    const body = vi.mocked(fetch).mock.calls.find(([u]) => String(u).endsWith('/v1/codes'))![1]!.body
    expect(JSON.parse(String(body))).toEqual({ client_id: 'keeki-admin' })
  })

  it('lets a signed-in admin into Manage without the Twitch sign-in', async () => {
    vi.stubGlobal('fetch', quiet('admin'))
    const { router, navigate } = await setup({ user: '42' })
    await router.push('/manage/vods')
    expect(router.currentRoute.value.path).toBe('/manage/vods')
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

  it("renews an admin's session quietly once, then sends them to the sign-in page", async () => {
    vi.stubGlobal('fetch', quiet('admin'))
    const { router, session, navigate } = await setup({ user: '42' })
    await router.push('/manage/vods')
    await vi.waitFor(() => expect(codesAsked()).toBe(1))
    const expire = async () => {
      const f = vi.mocked(fetch)
      f.mockImplementationOnce(async () => new Response('{}', { status: 401 }))
      await session.admin.health().catch(() => {})
    }
    await expire()
    await vi.waitFor(() => expect(codesAsked()).toBe(2))
    await vi.waitFor(() => expect(session.session.authenticated).toBe(true))
    expect(router.currentRoute.value.path).toBe('/manage/vods')

    // Ending again at once: no second renewal, so a session that won't stick can't loop.
    await expire()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/manage/login'))
    expect(codesAsked()).toBe(2)
    expect(navigate).not.toHaveBeenCalled()
  })
})
