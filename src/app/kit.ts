// The app's logic without its look: everything the vods pages and Manage do that isn't a component or a style, for a
// site that draws its own pages (keekivods.vexoul.net) instead of using createVodsApp(). Nothing here imports
// @vexoulz/ui. Pair it with the `vue` entry (createVods, useVods, useWatch, useChat, useProgress).
import type { VodsConfig } from '../config'
import { configureAdmin } from './admin/session'
import { configurePlatform } from './admin/platform'
import { loadTagConfig, tagConfig } from './lib/vodTags'
import { configureSite, site, type VodsSite } from './site'

export interface VodsSiteOptions {
  /** The channel and its archive API (`defineVodsConfig`). */
  config: VodsConfig
  /** The site's id, name, Twitch link, and optionally its cards per page and tags. */
  site: Partial<VodsSite> & Pick<VodsSite, 'id' | 'name' | 'twitchUrl'>
  /** The worker's admin API, for the Manage pages. Default `/backend-admin` on the same origin. */
  adminBase?: string
}

/**
 * Sets up the site before its app mounts: the site and channel, the admin API, and how tags show (the site's own
 * until /manage/tags answers). createVodsApp() does this itself; a site with its own UI calls it once from main.ts.
 */
export function setupVodsSite(options: VodsSiteOptions): void {
  configureSite(options.config, options.site)
  tagConfig.value = site.tags
  configureAdmin(options.adminBase ?? '/backend-admin')
  configurePlatform()
  void loadTagConfig()
}

// The route table and the account and Manage wiring around the router (createVodsApp() uses the same).
export * from './router'

export { DEFAULT_TAGS, site, vodsConfig, configureSite, type TagStyle, type VodsSite } from './site'

// Pages' logic.
export * from './lib/art'
export * from './lib/cuts'
export * from './lib/dates'
export * from './lib/emoteMenu'
export * from './lib/games'
export * from './lib/gamesPlayed'
export * from './lib/listQuery'
export * from './lib/mostPlayed'
export * from './lib/notify'
export * from './lib/place'
export * from './lib/tagShape'
export * from './lib/vodTags'
export * from './lib/watch'
export * from './composables/useChatSettings'
export * from './composables/useFullscreen'
export * from './composables/useNextVod'
export * from './composables/useShortcuts'
export * from './composables/useThumbnail'
export * from './composables/useWatchView'
export * from './composables/useTimeline'
export * from './composables/watchDebounced'

// Manage: the worker's admin API, its session, and the editors' drafts and checks.
export * from './admin/api'
export { admin, adminBase, session, ensure, login, logout, twitchLoginUrl, quietLoginUrl, setExpiredHandler, SIGNIN_ERRORS } from './admin/session'
// The quiet admin check for someone signed in to the account (admin/quiet.ts).
export { answerOf, forget, recall, remember, shouldCheck, type Answer } from './admin/quiet'
export { platform, vodSubject } from './admin/platform'
export * from './admin/edits'
export * from './admin/settings'
export * from './admin/tags'
export * from './admin/useDraftEditor'
export * from './composables/useSplice'
export * from './composables/useChaptersDraft'
