// Chat messages → render-ready tokens. No HTML is produced here: sites render the tokens with their own components,
// so message text can never be injected as markup.
import type { RawBadges, RawComment, RawFragment, RawUserBadge } from '../api/types'
import { emoteImage, type Emote, type EmoteImage, type EmoteSet } from './emotes'

export type Token = { kind: 'text'; text: string } | { kind: 'emote'; emote: Emote; image: EmoteImage }

export interface Badge {
  setId: string
  version: string
  title: string
  src: string
  srcset: string
  large: string
}

export interface ChatMessage {
  id: string
  /** VOD seconds. */
  at: number
  user: string
  /** The user's chosen colour, or null (sites pick a default, e.g. vexoulz-ui's twitchColor). */
  color: string | null
  badges: Badge[]
  tokens: Token[]
}

/** Splits fragments into text and emote tokens. Adjacent text is merged. */
export function tokenize(fragments: readonly RawFragment[] | null | undefined, emotes?: EmoteSet | null): Token[] {
  const out: Token[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = out.at(-1)
    if (last?.kind === 'text') last.text += text
    else out.push({ kind: 'text', text })
  }
  const pushEmote = (emote: Emote) => out.push({ kind: 'emote', emote, image: emoteImage(emote) })

  for (const f of fragments ?? []) {
    const nativeId = f.emote?.emoteID ?? f.emoticon?.emoticon_id
    if (nativeId) {
      pushEmote({ provider: 'twitch', id: String(nativeId), code: f.text.trim() })
      continue
    }
    // Keep the original whitespace: split into words and the gaps between them.
    for (const part of f.text.split(/(\s+)/)) {
      if (!part) continue
      const emote = /\s/.test(part) ? null : (emotes?.find(part) ?? null)
      if (emote) pushEmote(emote)
      else pushText(part)
    }
  }
  return out
}

// "set/version" → Badge for a badges payload, channel set first so it wins over global. Built once per payload.
const badgeIndexes = new WeakMap<RawBadges, Map<string, Badge>>()

function badgeIndex(badges: RawBadges): Map<string, Badge> {
  let index = badgeIndexes.get(badges)
  if (index) return index
  index = new Map()
  for (const sets of [badges.channel, badges.global]) {
    for (const set of sets ?? []) {
      for (const v of set.versions) {
        const key = `${set.set_id}/${v.id}`
        if (index.has(key)) continue
        index.set(key, {
          setId: set.set_id,
          version: v.id,
          title: v.title ?? set.set_id,
          src: v.image_url_1x,
          srcset: `${v.image_url_1x} 1x, ${v.image_url_2x} 2x, ${v.image_url_4x} 4x`,
          large: v.image_url_4x,
        })
      }
    }
  }
  badgeIndexes.set(badges, index)
  return index
}

/** Badge images for a comment's badges, channel set first, then global. Unknown badges are skipped. */
export function resolveBadges(userBadges: readonly RawUserBadge[] | null | undefined, badges?: RawBadges | null): Badge[] {
  if (!badges || !userBadges) return []
  const index = badgeIndex(badges)
  const out: Badge[] = []
  for (const b of userBadges) {
    const setId = b._id ?? b.setID
    const badge = setId ? index.get(`${setId}/${b.version}`) : undefined
    if (badge) out.push(badge)
  }
  return out
}

export function toChatMessage(c: RawComment, emotes?: EmoteSet | null, badges?: RawBadges | null): ChatMessage {
  return {
    id: c.id,
    at: c.content_offset_seconds,
    user: c.display_name,
    color: c.user_color || null,
    badges: resolveBadges(c.user_badges, badges),
    tokens: tokenize(c.message, emotes),
  }
}
