// The vods site itself: its pages, the Manage dashboard, the router and the wiring between them. A site is this plus
// its own config and branding: its main.ts calls createVodsApp() and mounts what it returns.
import { VxBuild, useToast } from '@vexoulz/ui'
import { createAccount } from '@vexoulz/ui/account'
import { createPlatformUi } from '@vexoulz/platform-web/vue'
import { createApp, type App as VueApp } from 'vue'
import { createRouter, createWebHistory, RouterLink, type Router } from 'vue-router'

import type { VodsConfig } from '../config'
import { createVods } from '../vue'

import './styles/platform.css'
import './styles/tags.css'

import App from './App.vue'
import { configureArt, type VodsArt } from './art'
import { setupVodsSite } from './kit'
import { installVodsSession, vodsRoutes } from './router'
import type { VodsSite } from './site'

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

  const router = createRouter({
    history: createWebHistory(),
    routes: vodsRoutes({
      home: () => import('./pages/HomePage.vue'),
      list: () => import('./pages/VodsPage.vue'),
      watch: () => import('./pages/WatchPage.vue'),
      games: () => import('./pages/GamesPage.vue'),
      notFound: () => import('./pages/NotFoundPage.vue'),
      manage: {
        login: () => import('./pages/admin/AdminLoginPage.vue'),
        overview: () => import('./pages/admin/AdminOverviewPage.vue'),
        jobs: () => import('./pages/admin/AdminJobsPage.vue'),
        job: () => import('./pages/admin/AdminJobPage.vue'),
        vods: () => import('./pages/admin/AdminVodsPage.vue'),
        vod: () => import('./pages/admin/AdminVodPage.vue'),
        synthetic: () => import('./pages/admin/AdminSyntheticPage.vue'),
        storage: () => import('./pages/admin/AdminStoragePage.vue'),
        settings: () => import('./pages/admin/AdminSettingsPage.vue'),
        tags: () => import('./pages/admin/AdminTagsPage.vue'),
        audit: () => import('./pages/admin/AdminAuditPage.vue'),
      },
    }),
    scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
  })
  // The Manage guard, the tab's title, the quiet admin check and progress that follows the account (router.ts).
  const { progress } = installVodsSession(router, account)

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
