// The viewer's chat settings, remembered in this browser. Storage can be missing or throw (private mode, blocked
// site data); the page then just starts from the defaults.
import { reactive, watch } from 'vue'
import type { ChatSource, ChatSources } from '../../index'

export interface ChatSettings {
  /** Seconds; positive shows chat later. */
  delay: number
  timestamps: boolean
  badges: boolean
  /** Name colours: each chatter's own, or adjusted to stay readable on black. */
  colors: 'readable' | 'raw'
  emotes: { '7tv': boolean; bttv: boolean; ffz: boolean }
  size: 's' | 'm' | 'l'
  /** Chat's width beside the video, in pixels (wide layouts; on phones chat sits below). */
  width: number
  open: boolean
  /** Which chat to replay: doomtp-bot's live recording, or Twitch's VOD recording (less detail). */
  source: ChatSource
  /** How chatters are named: display name, username, or both (`Name (username)`). */
  names: 'display' | 'login' | 'both'
}

const KEY = 'vods.chat.v3'
/**
 * Older saves, newest first. v1 saved timestamps on by default (v2 starts them off), and v1 and v2 saved the width
 * as a share of the page, so those aren't carried over.
 */
const OLD_KEYS = ['vods.chat.v2', 'vods.chat.v1'] as const
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export const DELAY_LIMIT = 600
export const WIDTH_MIN = 240
export const WIDTH_MAX = 720
export const WIDTH_DEFAULT = 340

export const defaultChatSettings = (): ChatSettings => ({
  delay: 0,
  timestamps: false,
  badges: true,
  colors: 'readable',
  emotes: { '7tv': true, bttv: true, ffz: true },
  size: 'm',
  width: WIDTH_DEFAULT,
  open: true,
  source: 'bot',
  names: 'display',
})

/**
 * The chat to ask for: the viewer's choice, unless this VOD has none of it and has the other one (then the other).
 * `sources` is unknown (null) until the first page is in; the choice is asked for as is until then.
 */
export function chatSourceFor(pref: ChatSource | 'auto', sources: ChatSources | null): ChatSource | 'auto' {
  if (pref === 'auto' || !sources) return pref
  const other: ChatSource = pref === 'bot' ? 'replay' : 'bot'
  return sources[pref] === 0 && sources[other] > 0 ? other : pref
}

/** The saved settings (from `get`, e.g. localStorage's), with anything missing or odd set to the default. */
export function readSaved(get: (key: string) => string | null): ChatSettings {
  const base = defaultChatSettings()
  try {
    let raw = get(KEY)
    let from: string = KEY
    for (const old of OLD_KEYS) {
      if (raw) break
      raw = get(old)
      from = old
    }
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<ChatSettings>
    if (from === 'vods.chat.v1') delete saved.timestamps
    if (from !== KEY) delete saved.width
    return {
      delay: typeof saved.delay === 'number' && Number.isFinite(saved.delay) ? clamp(saved.delay, -DELAY_LIMIT, DELAY_LIMIT) : base.delay,
      timestamps: typeof saved.timestamps === 'boolean' ? saved.timestamps : base.timestamps,
      badges: typeof saved.badges === 'boolean' ? saved.badges : base.badges,
      colors: saved.colors === 'raw' ? 'raw' : 'readable',
      emotes: { ...base.emotes, ...(saved.emotes && typeof saved.emotes === 'object' ? saved.emotes : {}) },
      size: saved.size === 's' || saved.size === 'l' ? saved.size : 'm',
      width:
        typeof saved.width === 'number' && Number.isFinite(saved.width)
          ? clamp(Math.round(saved.width), WIDTH_MIN, WIDTH_MAX)
          : base.width,
      open: typeof saved.open === 'boolean' ? saved.open : base.open,
      source: saved.source === 'replay' || saved.source === 'bot' ? saved.source : base.source,
      names: saved.names === 'login' || saved.names === 'both' ? saved.names : base.names,
    }
  } catch {
    return base
  }
}

function load(): ChatSettings {
  return readSaved((key) => localStorage.getItem(key))
}

let shared: ChatSettings | null = null

export function useChatSettings(): ChatSettings {
  if (shared) return shared
  const s = reactive(load())
  watch(
    s,
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s))
      } catch {
        // not saved; still works for this visit
      }
    },
    { deep: true },
  )
  shared = s
  return s
}
