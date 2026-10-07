// The rows of the emote menu chat opens on a clicked emote: every emote drawn in the stack, each followed by its
// modifiers, with a link to its page on its provider's site where there is one.
import { emoteImage, emotePage, type EmoteProvider, type EmoteToken, type ModifierEffect } from '../../index'

export type EmoteSources = Record<'7tv' | 'bttv' | 'ffz', boolean>

export interface EmoteMenuRow {
  key: string
  code: string
  /** What a modifier does, for modifier rows. */
  effect?: ModifierEffect
  provider: string
  src: string
  srcset: string
  /** Null for Twitch emotes: the channel one belongs to isn't saved with chat. */
  href: string | null
}

const PROVIDERS: Record<EmoteProvider, string> = { twitch: 'Twitch', '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ' }

/** Only what's drawn: emotes and modifiers from providers the viewer turned off show as text, so they're left out. */
export function emoteMenuRows(token: EmoteToken, enabled: EmoteSources): EmoteMenuRow[] {
  const on = (p: EmoteProvider) => p === 'twitch' || enabled[p]
  const layers = [...(on(token.emote.provider) ? [token] : []), ...token.overlays.filter((o) => on(o.emote.provider))]
  return layers.flatMap((l, i) => [
    { key: `${i}`, code: l.emote.code, provider: PROVIDERS[l.emote.provider], src: l.image.src, srcset: l.image.srcset, href: emotePage(l.emote) },
    ...l.modifiers
      .filter((m) => on(m.provider))
      .map((m, j) => {
        const { src, srcset } = emoteImage(m)
        return { key: `${i}.${j}`, code: m.code, effect: m.effect, provider: PROVIDERS[m.provider], src, srcset, href: emotePage(m) }
      }),
  ])
}
