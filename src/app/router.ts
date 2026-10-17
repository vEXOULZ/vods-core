// The wiring every vods site shares around its router: the route table (vodsRoutes) and what the account and the
// Manage pages need from it (installVodsSession). createVodsApp() uses both; a site with its own UI passes its own
// pages and account. No components here: the pages come from the site.
import { watch, type Ref } from 'vue'
import type { Router, RouteRecordRaw, RouteRecordSingleView } from 'vue-router'

import { AccountProgressStore } from '../index'
import { ADMIN_CLIENT_ID, quietAdminCheck, type AdminCheck } from './admin/quiet'
import { ensure, session, setExpiredHandler, twitchLoginUrl } from './admin/session'
import { site } from './site'

/** A page: a component, or a function that imports one. */
export type VodsPage = RouteRecordSingleView['component']

/** The site's pages, at the same URLs on every vods site. */
export interface VodsPages {
  home: VodsPage
  /** The lists: /vods and /playthroughs (it takes `tab`). */
  list: VodsPage
  /** The watch page (it takes `id`, and `type`: 'vod', 'live', or null for whichever set exists). */
  watch: VodsPage
  games: VodsPage
  notFound: VodsPage
  /** Manage: the archive's admin pages. Every one but `login` needs a dashboard session (installVodsSession). */
  manage: Record<'login' | 'overview' | 'jobs' | 'job' | 'vods' | 'vod' | 'synthetic' | 'storage' | 'youtube' | 'settings' | 'tags' | 'audit', VodsPage>
}

/** The routes of a vods site, with its own pages. */
export function vodsRoutes(pages: VodsPages): RouteRecordRaw[] {
  const m = pages.manage
  return [
    { path: '/', component: pages.home },
    // The lists. /vods?tab=playthroughs is the old link to the playthroughs.
    {
      path: '/vods',
      component: pages.list,
      props: { tab: 'vods' },
      beforeEnter: (to) => {
        if (to.query.tab === undefined) return true
        const { tab, ...query } = to.query
        return { path: tab === 'playthroughs' ? '/playthroughs' : '/vods', query, hash: to.hash }
      },
    },
    { path: '/playthroughs', component: pages.list, props: { tab: 'playthroughs' } },
    // Same URLs as the old site: /vods/:id plays the VOD uploads, /live/:id the live-recorded ones,
    // /youtube/:id whichever set exists (live first).
    { path: '/vods/:id', component: pages.watch, props: (r) => ({ id: r.params.id, type: 'vod' }) },
    { path: '/live/:id', component: pages.watch, props: (r) => ({ id: r.params.id, type: 'live' }) },
    { path: '/youtube/:id', component: pages.watch, props: (r) => ({ id: r.params.id, type: null }) },
    { path: '/games/:id', component: pages.games, props: true },
    // Manage: the archive's admin pages. Every page but the login needs a dashboard session; see installVodsSession.
    { path: '/manage/login', component: m.login, meta: { public: true } },
    { path: '/manage', component: m.overview },
    { path: '/manage/jobs', component: m.jobs },
    { path: '/manage/jobs/:id(\\d+)', component: m.job, props: true },
    { path: '/manage/vods', component: m.vods },
    { path: '/manage/vods/:id', component: m.vod, props: true },
    { path: '/manage/synthetic/new', component: m.synthetic },
    { path: '/manage/synthetic/:id', component: m.synthetic, props: true },
    { path: '/manage/storage', component: m.storage },
    { path: '/manage/youtube', component: m.youtube },
    { path: '/manage/settings', component: m.settings },
    { path: '/manage/tags', component: m.tags },
    { path: '/manage/audit', component: m.audit },
    // The old admin URLs, for bookmarks and the worker's sign-in errors (it sends those to /admin/login).
    { path: '/admin/:rest(.*)*', redirect: (to) => ({ path: `/manage${to.path.slice('/admin'.length)}`, query: to.query, hash: to.hash }) },
    { path: '/:pathMatch(.*)*', component: pages.notFound },
  ]
}

/** Whether a path is one of the Manage pages: /manage and below, not /managefoo. */
export function isManagePath(path: string): boolean {
  return path === '/manage' || path.startsWith('/manage/')
}

/** The site's account (vex-auth), as `@vex/ui/account`'s Account provides it. */
export interface VodsAccount {
  readonly user: Readonly<Ref<{ readonly id: string } | null>>
  /** True once the account knows who is signed in (or that no one is). */
  readonly ready: Readonly<Ref<boolean>>
  /** A credentialed request to vex-auth. */
  request(path: string, init?: RequestInit): Promise<Response>
}

export interface VodsSessionOptions {
  /** The Manage sign-in page. Default `/manage/login`. */
  manageLogin?: string
  /** How the page leaves for the worker's sign-in. Default `window.location.assign` (tests replace it). */
  navigate?: (url: string) => void
  /**
   * The archive's client id at vex-auth, for the quiet admin check: the worker's ARCHIVE_ADMIN_AUTH_CLIENT_ID.
   * Default `vods-admin`.
   */
  adminClientId?: string
}

/** How long after a quiet renewal another one may follow, so a session that won't stick can't loop. */
const RENEW_MS = 60_000

export interface VodsSession {
  /** Watch progress, kept with the account while someone is signed in: `createVods(config, { progress })`. */
  progress: AccountProgressStore
}

/**
 * Wires the account and the Manage dashboard session into the router: the Manage pages' guard, what happens when a
 * dashboard session ends mid-use, the tab's title on each new page, the quiet admin check for someone signed in to
 * the account, and watch progress that follows the account. Call it once, before the app mounts.
 */
export function installVodsSession(router: Router, account: VodsAccount, options: VodsSessionOptions = {}): VodsSession {
  const loginPath = options.manageLogin ?? '/manage/login'
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url))
  const toLogin = (next: string) => ({ path: loginPath, query: { next } })
  const clientId = options.adminClientId ?? ADMIN_CLIENT_ID

  // The quiet admin check (admin/quiet.ts), once per account per page load: a later caller gets the same answer.
  type Asked = { id: string; answer: Promise<AdminCheck>; result: AdminCheck | null }
  let asked: Asked | null = null
  const check = (id: string): Promise<AdminCheck> => {
    if (asked?.id === id) return asked.answer
    const entry: Asked = {
      id,
      result: null,
      answer: (async (): Promise<AdminCheck> => {
        await ensure()
        if (session.authenticated) return 'admin'
        if (!session.twitchLogin) return 'unknown'
        return quietAdminCheck(account, clientId)
      })().then((a) => (entry.result = a)),
    }
    asked = entry
    return entry.answer
  }
  let renewedAt = -Infinity

  // A dashboard session that ends mid-use: an admin still signed in to the account gets a new one quietly (at most
  // once a minute); anyone else, or a renewal that fails, goes to the sign-in page, which says why.
  setExpiredHandler(() => {
    const here = router.currentRoute.value
    const user = account.user.value
    const toSignIn = () => {
      if (isManagePath(here.path) && !here.meta.public) void router.push(toLogin(here.fullPath))
    }
    if (user && asked?.id === user.id && asked.result === 'admin' && Date.now() - renewedAt >= RENEW_MS) {
      renewedAt = Date.now()
      asked = null
      void check(user.id).then((a) => a === 'admin' || toSignIn())
      return
    }
    toSignIn()
  })

  // Manage pages need a dashboard session. Without one, the visitor goes through the worker's Twitch sign-in (which
  // signs in to the account on the way) and comes back to the page; with that off, or after a session ended, to the
  // sign-in page.
  router.beforeEach(async (to) => {
    if (!isManagePath(to.path) || to.meta.public) return true
    await ensure()
    if (session.authenticated) return true
    // Someone signed in to the account may be an admin: the quiet check makes the session without leaving the page.
    const user = account.ready.value ? account.user.value : null
    if (user) {
      await check(user.id)
      if (session.authenticated) return true
    }
    if (session.twitchLogin && !session.notice) {
      navigate(twitchLoginUrl(to.fullPath))
      return false
    }
    return toLogin(to.fullPath)
  })

  // The tab's title goes back to the site's name on every new page; a page with a title of its own (a VOD, a Manage
  // page) sets it as it renders, after this. A page that stays (a VOD's ?t= moving) keeps the title it set.
  router.afterEach((to, from, failure) => {
    if (!failure && to.matched.at(-1) !== from.matched.at(-1)) document.title = site.name
  })

  // Signed in to the account: ask once whether it's one of the archive's admins. An admin's dashboard session (and
  // Manage in the account menu) shows up without the page reloading; anyone else sees nothing.
  watch(
    () => [account.user.value?.id ?? null, account.ready.value] as const,
    ([id, ready]) => {
      if (!ready) return
      if (!id) asked = null
      else void check(id)
    },
    { immediate: true },
  )

  // Watch progress follows the signed-in account (vex-auth); signed out it stays in this browser, and signing in
  // moves what this browser has into the account.
  const progress = new AccountProgressStore({ signedIn: () => !!account.user.value, request: (p, i) => account.request(p, i) })
  watch(account.user, (user, before) => {
    if (user && !before) void progress.merge()
  })

  return { progress }
}
