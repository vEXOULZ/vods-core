// A VOD's tags and how each shows. Two follow the dates: `new` (its first footage went live in the last week) and
// `updated` (a synthetic VOD, not new, that got footage from the last week). The others are tags set on the VOD, like
// `complete`, which an admin sets on a playthrough that was played to the end. Whether a tag is drawn on the
// thumbnail or is a chip, and its color and shape, come from the archive (edited on /manage/tags; docs/admin-api.md,
// "Site tags"), or from `site.tags` while the archive has none.
import type { Vod } from '../../index'
import { shallowRef } from 'vue'
import { site, vodsConfig, type TagStyle } from '../site'
import { isTagColor, TAG_NAME } from './tagRules'

export const RECENT_MS = 7 * 24 * 3600 * 1000
/** The tags that follow the dates (vodTags) rather than being set on a VOD. */
export const DATE_TAGS: readonly string[] = ['new', 'updated']
/** The VOD tag behind `complete`; set on the synthetic VOD's manage page. */
export const COMPLETE_TAG = 'complete'

/** How every tag shows: `site.tags` until loadTagConfig() gets the archive's. */
export const tagConfig = shallowRef<Record<string, TagStyle>>(site.tags)

/** The date tags first, then the VOD's own, each once. */
export function vodTags(vod: Vod, now = Date.now()): string[] {
  const recent = (d: Date | null | undefined) => !!d && now - d.getTime() < RECENT_MS
  const out: string[] = []
  if (recent(vod.synthetic?.firstLiveAt ?? vod.createdAt)) out.push('new')
  else if (vod.synthetic && recent(vod.synthetic.lastLiveAt)) out.push('updated')
  return [...new Set([...out, ...vod.tags])]
}

export const tagStyle = (tag: string, tags: Record<string, TagStyle> = tagConfig.value): TagStyle =>
  tags[tag] ?? { label: tag, drawn: false }

/** The tags drawn on the thumbnail, and the ones shown as chips. */
export function splitTags(vod: Vod, now = Date.now(), tags: Record<string, TagStyle> = tagConfig.value) {
  const all = vodTags(vod, now)
  return {
    drawn: all.filter((t) => tagStyle(t, tags).drawn),
    chips: all.filter((t) => !tagStyle(t, tags).drawn),
  }
}

// ---- the archive's tag config (GET /v1/site/tags) ----

/** One tag as the archive sends it. `shape` is a path under the public API (`v1/site/tags/new.svg?v=…`). */
export interface RawTag {
  name: string
  label: string
  drawn: boolean
  color: string | null
  shape: string | null
  width: number | null
  height: number | null
  text: string | null
  textColor: string | null
  textSize: number | null
  textX: number | null
  textY: number | null
  textRotate: number | null
  pattern: TagPattern | null
  patternColor: string | null
  patternSize: number | null
}

export { isTagColor, TAG_COLOR_MAX, TAG_NAME } from './tagRules'
export const TAG_SIZE = { min: 8, max: 200 }
export const TAG_LABEL_MAX = 40
export const TAG_TEXT_MAX = 24
export const TAG_TEXT_SIZE = { min: 6, max: 48 }
export const TAG_TEXT_NUDGE = { min: -100, max: 100 }
export const TAG_TEXT_ROTATE = { min: -180, max: 180 }
export const TAG_PATTERNS = ['stripes', 'checks'] as const
export type TagPattern = (typeof TAG_PATTERNS)[number]
export const TAG_PATTERN_SIZE = { min: 2, max: 40 }
/** Tags the site or the archive sets by itself: always listed on /manage/tags, and can't be removed there. */
export const AUTO_TAGS: readonly string[] = ['new', 'updated', 'compilation']
export const isAutoTag = (name: string) => AUTO_TAGS.includes(name)

/** The archive's list as tag styles: shapes resolved against the API, anything malformed dropped or defaulted. */
export function fromRaw(raw: RawTag[], apiBase: string): Record<string, TagStyle> {
  const within = (n: unknown, r: { min: number; max: number }) => (Number.isInteger(n) && (n as number) >= r.min && (n as number) <= r.max ? (n as number) : undefined)
  const size = (n: unknown) => within(n, TAG_SIZE)
  const color = (c: unknown) => (typeof c === 'string' && isTagColor(c) ? c : undefined)
  const out: Record<string, TagStyle> = {}
  for (const t of raw) {
    if (!t || typeof t.name !== 'string' || !TAG_NAME.test(t.name)) continue
    out[t.name] = {
      label: typeof t.label === 'string' && t.label ? t.label : t.name,
      drawn: t.drawn === true,
      color: color(t.color),
      shape: typeof t.shape === 'string' && /^v1\/site\/tags\/[\w.?=&-]+$/.test(t.shape) ? `${apiBase.replace(/\/+$/, '')}/${t.shape}` : null,
      width: size(t.width),
      height: size(t.height),
      text: typeof t.text === 'string' && t.text.trim() ? t.text.trim().slice(0, TAG_TEXT_MAX) : undefined,
      textColor: color(t.textColor),
      textSize: within(t.textSize, TAG_TEXT_SIZE),
      textX: within(t.textX, TAG_TEXT_NUDGE),
      textY: within(t.textY, TAG_TEXT_NUDGE),
      textRotate: within(t.textRotate, TAG_TEXT_ROTATE),
      ...(TAG_PATTERNS.includes(t.pattern as TagPattern) && {
        pattern: t.pattern as TagPattern,
        patternColor: color(t.patternColor),
        patternSize: within(t.patternSize, TAG_PATTERN_SIZE),
      }),
    }
  }
  return out
}

/** Takes the archive's tag config when it has one; on any failure (an archive without it answers 404) keeps what's there. */
export async function loadTagConfig(fetcher: typeof fetch = (...a) => fetch(...a), apiBase = vodsConfig.apiBase): Promise<void> {
  try {
    const res = await fetcher(`${apiBase.replace(/\/+$/, '')}/v1/site/tags`, { headers: { accept: 'application/json' } })
    if (!res.ok) return
    const body = (await res.json()) as { tags?: RawTag[] }
    if (Array.isArray(body?.tags)) tagConfig.value = fromRaw(body.tags, apiBase)
  } catch {
    // keep site.tags
  }
}
