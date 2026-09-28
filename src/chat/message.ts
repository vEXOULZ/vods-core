// Chat messages → render-ready tokens. No HTML is produced here: sites render the tokens with their own components,
// so message text can never be injected as markup.
import type { RawBadges, RawComment, RawFragment, RawUserBadge } from '../api/types'
import { emoteImage, modifierOf, type Emote, type EmoteImage, type EmoteSet, type ModifierEffect } from './emotes'

/**
 * A BTTV / FFZ modifier applied to an emote; `code` is what was typed, for showing it as text instead. `id` is the
 * modifier's own emote id, for its image or page.
 */
export interface Modifier {
  effect: ModifierEffect
  code: string
  provider: 'bttv' | 'ffz'
  id: string
}

/** One emote image and the modifiers applied to it. */
export interface EmoteLayer {
  emote: Emote
  image: EmoteImage
  modifiers: Modifier[]
}

/**
 * An emote token is the emote typed, plus the zero-width emotes typed after it (`overlays`, bottom to top), drawn
 * over it. Modifier words are folded into the layer they apply to rather than kept as tokens.
 */
export type EmoteToken = { kind: 'emote'; overlays: EmoteLayer[] } & EmoteLayer

export type Token = { kind: 'text'; text: string } | EmoteToken

type Part = { kind: 'space'; text: string } | { kind: 'word'; text: string } | { kind: 'emote'; emote: Emote }

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

/** Fragments as words, the gaps between them (original whitespace kept) and emotes. */
function* parts(fragments: readonly RawFragment[], emotes?: EmoteSet | null): Generator<Part> {
  for (const f of fragments) {
    const nativeId = f.emote?.emoteID ?? f.emoticon?.emoticon_id
    if (nativeId) {
      yield { kind: 'emote', emote: { provider: 'twitch', id: String(nativeId), code: f.text.trim() } }
      continue
    }
    for (const text of f.text.split(/(\s+)/)) {
      if (!text) continue
      if (/\s/.test(text)) {
        yield { kind: 'space', text }
        continue
      }
      const emote = emotes?.find(text)
      yield emote ? { kind: 'emote', emote } : { kind: 'word', text }
    }
  }
}

/**
 * Splits fragments into text and emote tokens. Adjacent text is merged.
 *
 * Zero-width emotes (and emotes after BTTV's `z!`) become overlays of the emote before them, dropping the gap between.
 * BTTV modifiers apply to the emote after them, FFZ modifiers to the emote before. A zero-width emote or modifier with
 * no emote to go with stays an ordinary emote.
 */
export function tokenize(fragments: readonly RawFragment[] | null | undefined, emotes?: EmoteSet | null): Token[] {
  const out: Token[] = []
  const pushText = (text: string) => {
    const last = out.at(-1)
    if (last?.kind === 'text') last.text += text
    else out.push({ kind: 'text', text })
  }
  const layer = (emote: Emote, modifiers: Modifier[] = []): EmoteLayer => ({ emote, image: emoteImage(emote), modifiers })
  const pushEmote = (l: EmoteLayer) => out.push({ kind: 'emote', ...l, overlays: [] })
  // The emote right before, dropping the gap between. Null (and nothing dropped) when there is none.
  const previous = (): EmoteToken | null => {
    const last = out.at(-1)
    if (last?.kind === 'emote') return last
    const before = out.at(-2)
    if (last?.kind !== 'text' || before?.kind !== 'emote' || last.text.trim()) return null
    out.pop()
    return before
  }

  // BTTV modifiers seen so far, and what was typed with them, until an emote comes.
  let pending: Modifier[] = []
  let held: Part[] = []
  const release = () => {
    for (const p of held) {
      if (p.kind === 'emote') pushEmote(layer(p.emote))
      else pushText(p.text)
    }
    pending = []
    held = []
  }

  for (const part of parts(fragments ?? [], emotes)) {
    if (part.kind !== 'emote') {
      if (part.kind === 'space' && pending.length) held.push(part)
      else {
        release()
        pushText(part.text)
      }
      continue
    }
    const { emote } = part
    const mod = modifierOf(emote)
    const asModifier: Modifier | null = mod && { effect: mod.effect, code: emote.code, provider: emote.provider as 'bttv' | 'ffz', id: emote.id }
    if (mod?.before) {
      pending.push(asModifier!)
      held.push(part)
      continue
    }
    if (mod && !pending.length) {
      const target = previous()
      if (target) {
        target.modifiers.push(asModifier!)
        continue
      }
    }
    const l = layer(emote, pending)
    pending = []
    held = []
    if (emote.zeroWidth || l.modifiers.some((m) => m.effect === 'zeroSpace')) {
      const target = previous()
      if (target) {
        target.overlays.push(l)
        continue
      }
    }
    pushEmote(l)
  }
  release()
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
