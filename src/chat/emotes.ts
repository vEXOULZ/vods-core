// The emote sets for a VOD, from what the archive saved. The emote types, lookup and image URLs live in
// @vexoulz/platform-web, shared with doomtp-web; they are re-exported here so existing imports keep working.
import { EmoteSet, SEVENTV_GLOBAL, type RawThirdPartyEmote } from '@vexoulz/platform-web/chat'
import type { ArchiveClient, Fetch } from '../api/client'

export {
  BTTV_MODIFIERS,
  BTTV_OVERLAYS,
  EMOTE_CDN,
  EmoteSet,
  FFZ_MODIFIERS,
  SEVENTV_GLOBAL,
  emoteImage,
  emotePage,
  modifierOf,
  type Emote,
  type EmoteImage,
  type EmoteProvider,
  type ModifierEffect,
} from '@vexoulz/platform-web/chat'

export interface LoadEmotesOptions {
  client: ArchiveClient
  vodId: string
  /** For 7TV's global set on older VODs; defaults to the global fetch. */
  fetch?: Fetch
  signal?: AbortSignal
}

/** Runs `load`, treating any failure except an abort as "nothing". */
async function quietly<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return null
  }
}

/**
 * The emotes for a VOD. When the archive saved the VOD's sets, only those are used, so old chat shows what was an
 * emote back then: the channel's sets first, then the global sets saved with them. Rows saved before the archive kept
 * global sets (or whose 7TV global capture failed) get 7TV's current global set instead. VODs with no saved sets get
 * the channel's current and global 7TV / BTTV / FFZ sets, which the archive caches. Failures leave a set empty
 * rather than failing chat.
 */
export async function loadEmotes(opts: LoadEmotesOptions): Promise<EmoteSet> {
  const set = new EmoteSet()
  const saved = await quietly(() => opts.client.vodEmotes(opts.vodId, opts.signal))
  if (saved) {
    set.add('7tv', saved['7tv_emotes']).add('ffz', saved.ffz_emotes).add('bttv', saved.bttv_emotes)
    const globals = saved.global_emotes
    set.add('7tv', globals?.['7tv']).add('ffz', globals?.ffz).add('bttv', globals?.bttv)
    if (!globals?.['7tv']?.length) {
      const live = await quietly(async () => {
        const fetcher = opts.fetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init))
        const res = await fetcher(SEVENTV_GLOBAL, { signal: opts.signal })
        return res.ok ? ((await res.json()) as { emotes?: RawThirdPartyEmote[] }) : null
      })
      set.add('7tv', live?.emotes)
    }
  } else {
    const current = await quietly(() => opts.client.thirdPartyEmotes(opts.signal))
    if (current) set.add('7tv', current['7tv']).add('ffz', current.ffz).add('bttv', current.bttv)
  }
  return set
}
