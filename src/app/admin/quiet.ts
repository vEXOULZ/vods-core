// The quiet admin check: whether someone signed in to the site's account (vex-auth) is one of the archive's
// admins, asked with two requests and no trip away from the page. vex-auth mints a one-time code for the archive
// (POST /v1/codes), and the worker trades it for a dashboard session when the account is an admin (POST
// /admin/session {code}). Nothing is kept in the browser: installVodsSession asks once per account per page load.
import { ProblemError } from '@vex/platform-web'
import { signInWithCode } from './session'

/** The archive's client id at vex-auth: the worker's ARCHIVE_ADMIN_AUTH_CLIENT_ID, `vods-admin` by default. */
export const ADMIN_CLIENT_ID = 'vods-admin'

/** `admin`: the dashboard session exists now. `viewer`: signed out, or not an admin. `unknown`: couldn't tell. */
export type AdminCheck = 'admin' | 'viewer' | 'unknown'

/** The account's credentialed requests to vex-auth (`VodsAccount.request`). */
export interface AuthRequests {
  request(path: string, init?: RequestInit): Promise<Response>
}

/**
 * Asks once whether the signed-in account is one of the archive's admins, making the dashboard session if it is. Any
 * answer but "admin" or "not an admin" (a refused client, a rate limit, a worker without Twitch sign-in) is
 * `unknown`, and nothing is retried.
 */
export async function quietAdminCheck(account: AuthRequests, clientId: string = ADMIN_CLIENT_ID): Promise<AdminCheck> {
  try {
    const me = await account.request('/v1/me', { headers: { Accept: 'application/json' } })
    if (me.status === 401) return 'viewer'
    if (!me.ok) return 'unknown'
    const { csrf } = (await me.json()) as { csrf?: string | null }
    if (!csrf) return 'unknown'
    const res = await account.request('/v1/codes', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Vex-CSRF': csrf },
      body: JSON.stringify({ client_id: clientId }),
    })
    if (!res.ok) throw await ProblemError.from(res)
    const { code } = (await res.json()) as { code?: string }
    if (!code) return 'unknown'
    return (await signInWithCode(code)) ? 'admin' : 'viewer'
  } catch (e) {
    // 401 signed_out: the account's session ended on the way. 400/403/404/409/429/502/503, or no answer: can't tell.
    return e instanceof ProblemError && (e.code === 'signed_out' || e.status === 401) ? 'viewer' : 'unknown'
  }
}
