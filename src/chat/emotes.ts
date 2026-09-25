// Emote sets and image URLs. Lookup order matches the old site: native Twitch fragments first, then 7TV, FFZ, BTTV.
import type { ArchiveClient, Fetch } from '../api/client'
import type { RawEmoteSets, RawThirdPartyEmote } from '../api/types'

export type EmoteProvider = 'twitch' | '7tv' | 'ffz' | 'bttv'

export interface Emote {
  provider: EmoteProvider
  id: string
  code: string
}

export interface EmoteImage {
  /** 1x URL, for `src`. */
  src: string
  /** For `srcset`. */
  srcset: string
  /** Largest size, for a tooltip preview. */
  large: string
}

export const EMOTE_CDN = {
  twitch: 'https://static-cdn.jtvnw.net/emoticons/v2',
  ffz: 'https://cdn.frankerfacez.com/emote',
  // Every provider's own CDN (no third-party mirrors). 7TV redirects emotes that moved to new ids; its CDN follows.
  bttv: 'https://cdn.betterttv.net/emote',
  '7tv': 'https://cdn.7tv.app/emote',
} as const

/** 7TV's global set, fetched live only for VODs saved before the archive kept global sets. */
export const SEVENTV_GLOBAL = 'https://7tv.io/v3/emote-sets/global'

export function emoteImage(e: Pick<Emote, 'provider' | 'id'>): EmoteImage {
  const id = encodeURIComponent(e.id)
  switch (e.provider) {
    case 'twitch': {
      const u = (s: string) => `${EMOTE_CDN.twitch}/${id}/default/dark/${s}`
      return { src: u('1.0'), srcset: `${u('1.0')} 1x, ${u('2.0')} 2x, ${u('3.0')} 4x`, large: u('3.0') }
    }
    case '7tv': {
      const u = (s: string) => `${EMOTE_CDN['7tv']}/${id}/${s}.webp`
      return { src: u('1x'), srcset: `${u('1x')} 1x, ${u('2x')} 2x, ${u('3x')} 3x, ${u('4x')} 4x`, large: u('4x') }
    }
    case 'ffz': {
      const u = (s: string) => `${EMOTE_CDN.ffz}/${id}/${s}`
      return { src: u('1'), srcset: `${u('1')} 1x, ${u('2')} 2x, ${u('4')} 4x`, large: u('4') }
    }
    case 'bttv': {
      const u = (s: string) => `${EMOTE_CDN.bttv}/${id}/${s}`
      return { src: u('1x'), srcset: `${u('1x')} 1x, ${u('2x')} 2x, ${u('3x')} 3x`, large: u('3x') }
    }
  }
}

/** Code → emote, per third-party provider. */
export class EmoteSet {
  private readonly maps: Record<'7tv' | 'ffz' | 'bttv', Map<string, Emote>> = {
    '7tv': new Map(),
    ffz: new Map(),
    bttv: new Map(),
  }

  add(provider: '7tv' | 'ffz' | 'bttv', emotes: readonly RawThirdPartyEmote[] | null | undefined): this {
    for (const raw of emotes ?? []) {
      const code = raw.name ?? raw.code
      if (!code || raw.id == null) continue
      // First one wins, like the old site's Array.find.
      if (!this.maps[provider].has(code)) this.maps[provider].set(code, { provider, id: String(raw.id), code })
    }
    return this
  }

  /** The emote a word stands for, 7TV first, then FFZ, then BTTV. */
  find(word: string): Emote | null {
    return this.maps['7tv'].get(word) ?? this.maps.ffz.get(word) ?? this.maps.bttv.get(word) ?? null
  }

  get size(): number {
    return this.maps['7tv'].size + this.maps.ffz.size + this.maps.bttv.size
  }
}

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
