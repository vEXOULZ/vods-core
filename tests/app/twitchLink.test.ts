import { describe, expect, it, vi } from 'vitest'
import { AdminClient, type TwitchDevicePoll, type TwitchViewerStatus } from '../../src/app/admin/api'
import { linkTwitch, viewerTile } from '../../src/app/admin/twitchLink'

const FLOW = { flowId: 'f1', userCode: 'ABCDEFGH', verificationUri: 'https://www.twitch.tv/activate?device-code=ABCDEFGH', expiresIn: 1800, interval: 5 }
const LINKED: TwitchViewerStatus = { linked: true, valid: true, error: null, login: 'vexoul', method: 'device', connectedAt: null, checkedAt: null }
const noWait = vi.fn(async (_ms: number, _signal: AbortSignal) => {})

function client(polls: TwitchDevicePoll[]) {
  return {
    twitchViewerStart: vi.fn(async () => FLOW),
    twitchViewerPoll: vi.fn(async (_id: string) => polls.shift()!),
  }
}

describe('linkTwitch', () => {
  it('shows the code, then polls every interval until linked', async () => {
    const c = client([{ state: 'pending' }, { state: 'pending' }, { state: 'linked', status: LINKED }])
    const onFlow = vi.fn()
    const res = await linkTwitch(c, onFlow, new AbortController().signal, noWait)
    expect(res).toEqual({ state: 'linked', status: LINKED })
    expect(onFlow).toHaveBeenCalledWith(FLOW)
    expect(c.twitchViewerPoll.mock.calls).toEqual([['f1'], ['f1'], ['f1']])
    expect(noWait.mock.calls.every(([ms]) => ms === 5000)).toBe(true)
  })

  it('passes a failure on', async () => {
    const res = await linkTwitch(client([{ state: 'failed', error: 'expired' }]), () => {}, new AbortController().signal, noWait)
    expect(res).toEqual({ state: 'failed', error: 'expired' })
  })

  it('stops polling once cancelled', async () => {
    const ctl = new AbortController()
    const c = client([{ state: 'pending' }])
    const res = await linkTwitch(c, () => ctl.abort(), ctl.signal, noWait)
    expect(res).toEqual({ state: 'cancelled' })
    expect(c.twitchViewerPoll).not.toHaveBeenCalled()
  })
})

const ago = (iso: string) => `at ${iso}`

describe('viewerTile', () => {
  it('reads the status', () => {
    expect(viewerTile(undefined, ago)).toMatchObject({ status: 'off', linked: false })
    expect(viewerTile({ linked: false, valid: false, error: null }, ago)).toMatchObject({ status: 'off', text: 'Not linked', linked: false })
    expect(viewerTile(LINKED, ago)).toMatchObject({ status: 'ok', text: 'vexoul', linked: true })
    expect(viewerTile({ ...LINKED, valid: false, error: 'Twitch refused the token' }, ago)).toMatchObject({ status: 'warn', text: 'Token invalid', sub: 'Twitch refused the token' })
  })

  it("words times with the site's own formatter", () => {
    const st = { ...LINKED, method: 'paste' as const, connectedAt: 'T1', checkedAt: 'T2' }
    expect(viewerTile(st, ago).sub).toBe('pasted token at T1 · checked at T2')
  })
})

describe('AdminClient: the ad-free Twitch account', () => {
  it('calls the worker routes', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }))
    const c = new AdminClient({ base: '', fetch })
    await c.twitchViewer()
    await c.twitchViewerStart()
    await c.twitchViewerPoll('a/b')
    await c.twitchViewerPaste('stand-in')
    await c.twitchViewerUnlink()
    expect(fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])).toEqual([
      ['/admin/twitch/viewer', 'GET', null],
      ['/admin/twitch/viewer/device', 'POST', null],
      ['/admin/twitch/viewer/device/a%2Fb', 'GET', null],
      ['/admin/twitch/viewer', 'PUT', JSON.stringify({ token: 'stand-in' })],
      ['/admin/twitch/viewer', 'DELETE', null],
    ])
  })
})
