// The vods site itself: its pages, the Manage dashboard, the router and the wiring between them. A site is this plus
// its own config and branding: its main.ts calls createVodsApp() and mounts what it returns.
import { VxBuild, useToast } from '@vexoulz/ui'
import { createAccount } from '@vexoulz/ui/account'
import { createPlatformUi } from '@vexoulz/platform-web/vue'
import { createApp, watch, type App as VueApp } from 'vue'
import { createRouter, createWebHistory, RouterLink, type Router } from 'vue-router'

import type { VodsConfig } from '../config'
import { AccountProgressStore } from '../index'
import { createVods } from '../vue'

import './styles/platform.css'

import App from './App.vue'
import { configureArt, type VodsArt } from './art'
import { answerOf, recall, remember, shouldCheck } from './admin/quiet'
import { ensure, quietLoginUrl, session, setExpiredHandler, twitchLoginUrl } from './admin/session'
import { setupVodsSite } from './kit'
import { site, type VodsSite } from './site'

export { DEFAULT_TAGS, site, type TagStyle, type VodsSite } from './site'
export { art, type VodsArt } from './art'

export interface VodsAppOptions {
  /** The channel and its archive API (`defineVodsConfig`). */
  config: VodsConfig
  /** What tells this site from the other vods sites: its network id, name, Twitch link, and tags. */
  site: Partial<VodsSite> & Pick<VodsSite, 'id' | 'name' | 'twitchUrl'>
  /** The worker's admin API, for the Manage pages. Default `/backend-admin` on the same origin. */
  adminBase?: string
  /**
   * vexoulz-auth's URL, the shared *.vexoul.net sign-in. Empty turns sign-in off (the menu's "Sign in" is greyed
   * out); a site that isn't registered with vexoulz-auth leaves it empty.
   */
  authBase?: string
  /** The commit the site was built from, shown in the footer. */
  commit?: string
  /**
   * The site's own art for the app's stand-ins (a VOD with no thumbnail, the Twitch mark). Unset, plain placeholders:
   * e.g. `{ noThumbnail: VxNoThumbnail, twitchGlyph: VxTwitchGlyph }` from vexoulz-ui.
   */
  art?: VodsArt
}

export interface VodsApp {
  app: VueApp
  router: Router
}

/** The site's app, ready to mount: `createVodsApp({...}).app.mount('#app')`. Call it once. */
export function createVodsApp(options: VodsAppOptions): VodsApp {
  setupVodsSite(options)
  configureArt(options.art)
  const account = createAccount({ authBase: options.authBase ?? '' })

  const WatchPage = () => import('./pages/WatchPage.vue')
  const VodsPage = () => import('./pages/VodsPage.vue')

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: () => import('./pages/HomePage.vue') },
      // The lists. /vods?tab=playthroughs is the old link to the playthroughs.
      {
        path: '/vods',
        component: VodsPage,
        props: { tab: 'vods' },
        beforeEnter: (to) => {
          if (to.query.tab === undefined) return true
          const { tab, ...query } = to.query
          return { path: tab === 'playthroughs' ? '/playthroughs' : '/vods', query, hash: to.hash }
        },
      },
      { path: '/playthroughs', component: VodsPage, props: { tab: 'playthroughs' } },
      // Same URLs as the old site: /vods/:id plays the VOD uploads, /live/:id the live-recorded ones,
      // /youtube/:id whichever set exists (live first).
      { path: '/vods/:id', component: WatchPage, props: (r) => ({ id: r.params.id, type: 'vod' }) },
      { path: '/live/:id', component: WatchPage, props: (r) => ({ id: r.params.id, type: 'live' }) },
      { path: '/youtube/:id', component: WatchPage, props: (r) => ({ id: r.params.id, type: null }) },
      { path: '/games/:id', component: () => import('./pages/GamesPage.vue'), props: true },
      // Manage: the archive's admin pages. Every page but the login needs a dashboard session; see admin/session.ts.
      { path: '/manage/login', component: () => import('./pages/admin/AdminLoginPage.vue'), meta: { public: true } },
      { path: '/manage', component: () => import('./pages/admin/AdminOverviewPage.vue') },
      { path: '/manage/jobs', component: () => import('./pages/admin/AdminJobsPage.vue') },
      { path: '/manage/jobs/:id(\\d+)', component: () => import('./pages/admin/AdminJobPage.vue'), props: true },
      { path: '/manage/vods', component: () => import('./pages/admin/AdminVodsPage.vue') },
      { path: '/manage/vods/:id', component: () => import('./pages/admin/AdminVodPage.vue'), props: true },
      { path: '/manage/synthetic/new', component: () => import('./pages/admin/AdminSyntheticPage.vue') },
      { path: '/manage/synthetic/:id', component: () => import('./pages/admin/AdminSyntheticPage.vue'), props: true },
      { path: '/manage/storage', component: () => import('./pages/admin/AdminStoragePage.vue') },
      { path: '/manage/settings', component: () => import('./pages/admin/AdminSettingsPage.vue') },
      { path: '/manage/tags', component: () => import('./pages/admin/AdminTagsPage.vue') },
      { path: '/manage/audit', component: () => import('./pages/admin/AdminAuditPage.vue') },
      // The old admin URLs, for bookmarks and the worker's sign-in errors (it sends those to /admin/login).
      { path: '/admin/:rest(.*)*', redirect: (to) => ({ path: `/manage${to.path.slice('/admin'.length)}`, query: to.query, hash: to.hash }) },
      { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
    ],
    scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
  })

  // A dashboard session that ends mid-use: an admin still signed in to the account gets a new one quietly (one trip,
  // admin/quiet.ts); anyone else goes to the sign-in page, which says why.
  setExpiredHandler(() => {
    const here = router.currentRoute.value
    const user = account.user.value
    if (user && recall(user.id) === 'yes' && shouldCheck(user.id)) return window.location.assign(quietLoginUrl(here.fullPath))
    if (here.path.startsWith('/manage') && !here.meta.public) void router.push({ path: '/manage/login', query: { next: here.fullPath } })
  })

  // Manage pages need a dashboard session. Without one, the visitor goes through the worker's Twitch sign-in (which
  // signs in to the account on the way) and comes back to the page; with that off, or after a session ended, to the
  // sign-in page.
  router.beforeEach(async (to) => {
    if (!to.path.startsWith('/manage') || to.meta.public) return true
    await ensure()
    if (session.authenticated) return true
    if (session.twitchLogin && !session.notice) {
      window.location.assign(twitchLoginUrl(to.fullPath))
      return false
    }
    return { path: '/manage/login', query: { next: to.fullPath } }
  })

  // The tab's title goes back to the site's name on every new page; a page with a title of its own (a VOD, a Manage
  // page) sets it as it renders, after this. A page that stays (a VOD's ?t= moving) keeps the title it set.
  router.afterEach((to, from, failure) => {
    if (!failure && to.matched.at(-1) !== from.matched.at(-1)) document.title = site.name
  })

  // Signed in to the account: read the quiet check's answer off the URL, and ask once if this browser doesn't know
  // whether the account is one of the archive's admins. A known viewer never loads the dashboard session.
  void router.isReady().then(() =>
    watch(
      () => [account.user.value, account.ready.value, router.currentRoute.value.query.admin] as const,
      async ([user, ready]) => {
        if (!ready) return
        const here = router.currentRoute.value
        const answer = answerOf(here.query)
        if (here.query.admin !== undefined) {
          const { admin: _a, ...query } = here.query
          void router.replace({ path: here.path, query, hash: here.hash })
        }
        if (!user) return
        if (answer) remember(user.id, answer)
        if (recall(user.id) === 'no') return
        await ensure()
        if (session.authenticated) {
          if (session.user?.id === user.id) remember(user.id, 'yes')
          return
        }
        if (!answer && session.twitchLogin && !here.meta.public && shouldCheck(user.id)) {
          window.location.assign(quietLoginUrl(here.fullPath))
        }
      },
      { immediate: true },
    ),
  )

  // Watch progress follows the signed-in account (vexoulz-auth); signed out it stays in this browser, and signing in
  // moves what this browser has into the account.
  const progress = new AccountProgressStore({ signedIn: () => !!account.user.value, request: account.request })
  watch(account.user, (user, before) => {
    if (user && !before) void progress.merge()
  })

  const app = createApp(App)
    .use(router)
    .use(VxBuild, { commit: options.commit ?? '' })
    .use(account)
    .use(createVods(options.config, { progress }))
    // The shared jobs, audit and chat-line components: where a job or a subject (vod:<id>, job:<id>) lives, and toasts.
    .use(
      createPlatformUi({
        link: RouterLink,
        jobHref: (id) => `/manage/jobs/${id}`,
        subjectHref: (s) => {
          const m = /^(vod|job):(.+)$/.exec(s)
          if (!m) return null
          return m[1] === 'vod' ? `/manage/vods/${encodeURIComponent(m[2]!)}` : `/manage/jobs/${encodeURIComponent(m[2]!)}`
        },
        notify: (msg, kind) => useToast().show(msg, { kind, duration: kind === 'error' ? 5000 : 3000 }),
        appName: 'worker',
      }),
    )
  return { app, router }
}
