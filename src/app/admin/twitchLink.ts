import { timeAgo } from '@vexoulz/ui'
import type { AdminClient, TwitchDeviceFlow, TwitchViewerStatus } from './api'

/** The Overview tile's reading of the linked ad-free Twitch account. */
export function viewerTile(st: TwitchViewerStatus | null | undefined): {
  status: 'ok' | 'warn' | 'off'
  text: string
  sub: string
  linked: boolean
} {
  if (!st) return { status: 'off', text: 'Unknown', sub: '', linked: false }
  if (!st.linked) return { status: 'off', text: 'Not linked', sub: 'Live recordings get stitched ads', linked: false }
  const how = st.method === 'paste' ? 'pasted token' : 'linked'
  const sub = st.error ?? [st.connectedAt ? `${how} ${timeAgo(st.connectedAt)}` : '', st.checkedAt ? `checked ${timeAgo(st.checkedAt)}` : ''].filter(Boolean).join(' · ')
  return { status: st.valid ? 'ok' : 'warn', text: st.valid ? (st.login ?? 'Linked') : 'Token invalid', sub, linked: true }
}

export type LinkOutcome = { state: 'linked'; status: TwitchViewerStatus | null } | { state: 'failed'; error: string } | { state: 'cancelled' }

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/**
 * Twitch's device flow from the dashboard: start it, hand the code to `onFlow` (the broadcaster enters it at Twitch,
 * signed in as the account to link), then poll every `interval` seconds until the worker says linked or failed, the
 * code runs out, or `signal` aborts. The device code itself stays in the worker.
 */
export async function linkTwitch(
  client: Pick<AdminClient, 'twitchViewerStart' | 'twitchViewerPoll'>,
  onFlow: (flow: TwitchDeviceFlow) => void,
  signal: AbortSignal,
  sleep: (ms: number, signal: AbortSignal) => Promise<void> = wait,
): Promise<LinkOutcome> {
  const flow = await client.twitchViewerStart()
  onFlow(flow)
  const until = Date.now() + flow.expiresIn * 1000
  for (;;) {
    await sleep(Math.max(1, flow.interval) * 1000, signal)
    if (signal.aborted) return { state: 'cancelled' }
    const res = await client.twitchViewerPoll(flow.flowId)
    if (res.state !== 'pending') return res
    if (Date.now() > until) return { state: 'failed', error: 'The code expired; start again' }
  }
}
