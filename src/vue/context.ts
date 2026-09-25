import { inject, type App, type InjectionKey } from 'vue'
import { ArchiveClient, type Fetch } from '../api/client'
import type { VodsConfig } from '../config'
import { LocalProgressStore, type ProgressStore } from '../progress'

export interface VodsContext {
  config: VodsConfig
  client: ArchiveClient
  progress: ProgressStore
  /** For third-party emote APIs. */
  fetch?: Fetch
}

export const VODS_KEY: InjectionKey<VodsContext> = Symbol('vods')

/** Vue plugin: `app.use(createVods(config))`. Pass `progress` to swap the store (accounts, tests). */
export function createVods(config: VodsConfig, opts: { fetch?: Fetch; progress?: ProgressStore } = {}) {
  const ctx: VodsContext = {
    config,
    client: new ArchiveClient({ apiBase: config.apiBase, fetch: opts.fetch }),
    progress: opts.progress ?? new LocalProgressStore(),
    fetch: opts.fetch,
  }
  return {
    context: ctx,
    install(app: App) {
      app.provide(VODS_KEY, ctx)
    },
  }
}

export function useVodsContext(): VodsContext {
  const ctx = inject(VODS_KEY, null)
  if (!ctx) throw new Error('vods-core: install createVods(config) on the app first')
  return ctx
}
