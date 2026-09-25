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
  // BTTV and 7TV through a CORS-friendly mirror; their own CDNs break on some mobile browsers.
  bttv: 'https://emotes.overpowered.tv/bttv',
  '7tv': 'https://emotes.overpowered.tv/7tv',
} as const

export const EMOTE_API = {
  ffz: 'https://api.frankerfacez.com/v1',
  bttv: 'https://api.betterttv.net/3',
  '7tv': 'https://7tv.io/v3',
} as const

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

async function getJson<T>(fetcher: Fetch, url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetcher(url, { signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return null
  }
}

/** Channel sets from the providers, for VODs the archive saved no emotes for. */
async function loadChannelSets(set: EmoteSet, twitchId: string, fetcher: Fetch, signal?: AbortSignal) {
  const id = encodeURIComponent(twitchId)
  await Promise.all([
    getJson<RawThirdPartyEmote[]>(fetcher, `${EMOTE_API.bttv}/cached/emotes/global`, signal).then(async (global) => {
      set.add('bttv', global)
      const channel = await getJson<{ sharedEmotes?: RawThirdPartyEmote[]; channelEmotes?: RawThirdPartyEmote[] }>(
        fetcher,
        `${EMOTE_API.bttv}/cached/users/twitch/${id}`,
        signal,
      )
      set.add('bttv', [...(channel?.sharedEmotes ?? []), ...(channel?.channelEmotes ?? [])])
    }),
    getJson<{ room?: { set: number }; sets?: Record<string, { emoticons?: RawThirdPartyEmote[] }> }>(
      fetcher,
      `${EMOTE_API.ffz}/room/id/${id}`,
      signal,
    ).then((d) => {
      if (d?.room && d.sets) set.add('ffz', d.sets[String(d.room.set)]?.emoticons)
    }),
    getJson<{ emote_set?: { emotes?: RawThirdPartyEmote[] } }>(fetcher, `${EMOTE_API['7tv']}/users/twitch/${id}`, signal).then(
      (d) => set.add('7tv', d?.emote_set?.emotes),
    ),
  ])
}

export interface LoadEmotesOptions {
  client: ArchiveClient
  vodId: string
  twitchId: string
  /** For the third-party APIs; defaults to the global fetch. */
  fetch?: Fetch
  signal?: AbortSignal
}

/**
 * The emotes for a VOD: the sets the archive saved for it, or the channel's current sets when there are none.
 * 7TV global emotes are always added. Failures leave a set empty rather than failing chat.
 */
export async function loadEmotes(opts: LoadEmotesOptions): Promise<EmoteSet> {
  const fetcher = opts.fetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init))
  const set = new EmoteSet()
  let saved: RawEmoteSets | null = null
  try {
    saved = await opts.client.vodEmotes(opts.vodId, opts.signal)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
  }
  if (saved) {
    set.add('7tv', saved['7tv_emotes']).add('ffz', saved.ffz_emotes).add('bttv', saved.bttv_emotes)
  } else {
    await loadChannelSets(set, opts.twitchId, fetcher, opts.signal)
  }
  const global = await getJson<{ emotes?: RawThirdPartyEmote[] }>(fetcher, `${EMOTE_API['7tv']}/emote-sets/global`, opts.signal)
  set.add('7tv', global?.emotes)
  return set
}
