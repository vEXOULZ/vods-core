// The quiet admin check: someone signed in to the site's account (vexoulz-auth) makes one trip through the worker's
// `/admin/signin?quiet=1`, which comes straight back with `admin=1` (a dashboard session was made) or `admin=0`
// (anything else) and never shows a page. The answer is remembered per browser and Twitch account in localStorage as
// `vods-admin:<twitch id>`, so a plain viewer is checked once; "yes" means the check runs again, quietly, whenever an
// admin's dashboard session ends while the account stays signed in. Signing out forgets it.
//
// No storage (private mode, blocked site data): no quiet check at all, since nothing would stop it repeating.

const KEY = (id: string) => `vods-admin:${id}`
/** When the last trip started (sessionStorage), so a session that won't stick can't bounce the page in a loop. */
const LAST = 'vods-admin:quiet-at'
const GAP_MS = 60_000

export type Answer = 'yes' | 'no'

function local(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function recall(id: string, store: Storage | null = local()): Answer | null {
  try {
    const v = store?.getItem(KEY(id))
    return v === 'yes' || v === 'no' ? v : null
  } catch {
    return null
  }
}

export function remember(id: string, answer: Answer, store: Storage | null = local()): void {
  try {
    store?.setItem(KEY(id), answer)
  } catch {
    // not remembered: the next page load asks again, at most once a minute
  }
}

export function forget(id: string, store: Storage | null = local()): void {
  try {
    store?.removeItem(KEY(id))
  } catch {
    // nothing to forget
  }
}

/** The worker's `admin=0|1` answer from a page's query, or null when it has none. */
export function answerOf(query: Record<string, unknown>): Answer | null {
  return query.admin === '1' ? 'yes' : query.admin === '0' ? 'no' : null
}

/** Whether to make the trip now: never for a known viewer, and at most once a minute per tab. */
export function shouldCheck(id: string, now = Date.now(), store: Storage | null = local(), tab: Storage | null = session()): boolean {
  if (!store || !tab || recall(id, store) === 'no') return false
  try {
    const last = Number(tab.getItem(LAST) ?? 0)
    if (now - last < GAP_MS) return false
    tab.setItem(LAST, String(now))
    return true
  } catch {
    return false
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
