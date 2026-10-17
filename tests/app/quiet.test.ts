// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AUTH = 'https://auth.test'

/** A problem-details answer, as vex-auth and the worker send them. */
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: code, status, code, detail: code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

const ADMIN_SESSION = {
  admin: true,
  authenticated: true,
  csrf: 'worker-csrf',
  expiresAt: '2026-10-12T20:00:00Z',
  passwordLogin: false,
  twitchLogin: true,
  user: { id: '42', login: 'vexouluna', displayName: 'vexouLuna', avatar: null, color: null },
}

/** vex-auth and the worker, each route answering as given (a function for a thrown network error). */
function server(answers: { me?: () => Response; codes?: () => Response; session?: () => Response } = {}) {
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url)
    const method = init.method ?? 'GET'
    if (u === `${AUTH}/v1/me` && method === 'GET') return (answers.me ?? (() => Response.json({ id: '42', login: 'vexouluna', csrf: 'auth-csrf' })))()
    if (u === `${AUTH}/v1/codes` && method === 'POST') return (answers.codes ?? (() => Response.json({ code: 'c0de' })))()
    if (u.endsWith('/admin/session') && method === 'POST') return (answers.session ?? (() => Response.json(ADMIN_SESSION)))()
    if (u.endsWith('/admin/session')) return Response.json({ authenticated: false, csrf: null, expiresAt: null, passwordLogin: true, twitchLogin: true })
    return new Response('{}', { status: 404 })
  })
}

/** The account's credentialed requests, as @vex/ui/account makes them. */
const account = { request: (path: string, init: RequestInit = {}) => fetch(`${AUTH}${path}`, { ...init, credentials: 'include' }) }

async function load() {
  vi.resetModules()
  const quiet = await import('../../src/app/admin/quiet')
  const session = await import('../../src/app/admin/session')
  return { ...quiet, ...session }
}

const calls = (f: ReturnType<typeof server>, pathEnd: string) => f.mock.calls.filter(([u]) => String(u).endsWith(pathEnd))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('the quiet admin check', () => {
  it("mints a code at vex-auth, hands it to the worker, and takes the worker's session", async () => {
    const f = server()
    vi.stubGlobal('fetch', f)
    const { quietAdminCheck, session, admin } = await load()

    expect(await quietAdminCheck(account)).toBe('admin')
    expect(session.authenticated).toBe(true)
    expect(session.user?.id).toBe('42')

    const [, codes] = calls(f, '/v1/codes')[0]!
    expect(codes!.credentials).toBe('include')
    expect(new Headers(codes!.headers).get('X-Vex-CSRF')).toBe('auth-csrf')
    expect(JSON.parse(String(codes!.body))).toEqual({ client_id: 'vods-admin' })

    const [, handoff] = calls(f, '/admin/session')[0]!
    expect(handoff!.credentials).toBe('include')
    expect(JSON.parse(String(handoff!.body))).toEqual({ code: 'c0de' })

    // The worker's csrf goes with the dashboard's writes.
    f.mockClear()
    await admin.logout().catch(() => {})
    const [, write] = f.mock.calls[0]!
    expect((write!.headers as Record<string, string>)['x-csrf-token']).toBe('worker-csrf')
  })

  it('sends the client id it is given', async () => {
    const f = server()
    vi.stubGlobal('fetch', f)
    const { quietAdminCheck } = await load()
    await quietAdminCheck(account, 'other-archive')
    expect(JSON.parse(String(calls(f, '/v1/codes')[0]![1]!.body))).toEqual({ client_id: 'other-archive' })
  })

  it("is a viewer when the worker says {admin: false}, and makes no session", async () => {
    vi.stubGlobal('fetch', server({ session: () => Response.json({ admin: false }) }))
    const { quietAdminCheck, session } = await load()
    expect(await quietAdminCheck(account)).toBe('viewer')
    expect(session.authenticated).toBe(false)
  })

  it('is a viewer when signed out, asking nothing more', async () => {
    const f = server({ me: () => problem(401, 'signed_out') })
    vi.stubGlobal('fetch', f)
    const { quietAdminCheck } = await load()
    expect(await quietAdminCheck(account)).toBe('viewer')
    expect(calls(f, '/v1/codes')).toHaveLength(0)
  })

  it("is a viewer when vex-auth answers the code with 401 signed_out", async () => {
    const f = server({ codes: () => problem(401, 'signed_out') })
    vi.stubGlobal('fetch', f)
    const { quietAdminCheck } = await load()
    expect(await quietAdminCheck(account)).toBe('viewer')
    expect(calls(f, '/admin/session').filter(([, i]) => i?.method === 'POST')).toHaveLength(0)
  })

  it.each([
    [400, 'unknown_client'],
    [403, 'csrf'],
    [409, 'scope_missing'],
    [429, 'rate_limited'],
  ])("can't tell when the code is refused (%i %s), and asks once", async (status, code) => {
    const f = server({ codes: () => problem(status, code) })
    vi.stubGlobal('fetch', f)
    const { quietAdminCheck, session } = await load()
    expect(await quietAdminCheck(account)).toBe('unknown')
    expect(calls(f, '/v1/codes')).toHaveLength(1)
    expect(session.authenticated).toBe(false)
  })

  it.each([
    [400, 'invalid_code'],
    [403, 'origin_not_allowed'],
    [404, 'signin_off'],
    [502, 'misconfigured'],
    [503, 'unavailable'],
  ])("can't tell when the worker refuses the code (%i %s), and asks once", async (status, code) => {
    const f = server({ session: () => problem(status, code) })
    vi.stubGlobal('fetch', f)
    const { quietAdminCheck, session } = await load()
    expect(await quietAdminCheck(account)).toBe('unknown')
    expect(calls(f, '/v1/codes')).toHaveLength(1)
    expect(session.authenticated).toBe(false)
  })

  it("can't tell when a service doesn't answer", async () => {
    vi.stubGlobal(
      'fetch',
      server({
        codes: () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    )
    const { quietAdminCheck } = await load()
    expect(await quietAdminCheck(account)).toBe('unknown')
  })
})
