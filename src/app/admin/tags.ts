// The Tags page's drafts: each tag as its fields are typed (numbers as text), the checks the archive also makes, and
// the list PUT /admin/site/tags takes.
import type { TagInput } from './api'
import {
  AUTO_TAGS, isAutoTag, isTagColor, TAG_LABEL_MAX, TAG_NAME, TAG_SIZE, TAG_TEXT_MAX, TAG_TEXT_NUDGE, TAG_TEXT_ROTATE, TAG_TEXT_SIZE,
  TAG_PATTERN_SIZE, TAG_PATTERNS, type RawTag, type TagPattern,
} from '../lib/vodTags'
import { site, type TagStyle } from '../site'

/** As typed: a number input's v-model hands back a number once something is typed, '' when empty. */
type Typed = string | number

export interface TagDraft {
  /** Stable across edits, for v-for and errors (a name can change while it's new). */
  key: number
  name: string
  label: string
  drawn: boolean
  color: string
  width: Typed
  height: Typed
  /** Text written on the drawn tag; off keeps what was typed but saves none. */
  textOn: boolean
  text: string
  textColor: string
  textSize: Typed
  textX: Typed
  textY: Typed
  textRotate: Typed
  /** '' for plain; its color and size are kept while it's off but not saved. */
  pattern: TagPattern | ''
  patternColor: string
  patternSize: Typed
  /** The shape as saved (a path under the public API); uploads and removals apply straight away. */
  shape: string | null
  /** Saved in the archive: its name is fixed and it can take a shape. */
  saved: boolean
  /** Set automatically (AUTO_TAGS): its name is fixed and it can't be removed. */
  auto: boolean
}

export type TagField = 'name' | 'label' | 'color' | 'width' | 'height' | 'text' | 'textColor' | 'textSize' | 'textX' | 'textY' | 'textRotate' | 'patternColor' | 'patternSize'

const NO_TEXT = { text: null, textColor: null, textSize: null, textX: null, textY: null, textRotate: null }
const NO_PATTERN = { pattern: null, patternColor: null, patternSize: null }
const bare = (name: string, label: string, drawn: boolean): RawTag => ({
  name, label, drawn, color: null, shape: null, width: null, height: null, ...NO_TEXT, ...NO_PATTERN,
})
const typed = (n: number | null) => (n == null ? '' : String(n))

let nextKey = 0
export const draftOf = (t: RawTag, saved = true): TagDraft => ({
  key: ++nextKey,
  name: t.name,
  label: t.label,
  drawn: t.drawn,
  color: t.color ?? '',
  width: typed(t.width),
  height: typed(t.height),
  textOn: !!t.text,
  text: t.text ?? '',
  textColor: t.textColor ?? '',
  textSize: typed(t.textSize),
  textX: typed(t.textX),
  textY: typed(t.textY),
  textRotate: typed(t.textRotate),
  pattern: t.pattern ?? '',
  patternColor: t.patternColor ?? '',
  patternSize: typed(t.patternSize),
  shape: t.shape,
  saved,
  auto: isAutoTag(t.name),
})
export const blankDraft = (): TagDraft => draftOf(bare('', '', true), false)

/** `site.tags` as the archive's list: what the page starts from while the archive has none. */
export const rawOf = (tags: Record<string, TagStyle>): RawTag[] =>
  Object.entries(tags).map(([name, s]) => ({
    name, label: s.label, drawn: s.drawn, color: s.color ?? null, shape: null, width: s.width ?? null, height: s.height ?? null,
    text: s.text ?? null, textColor: s.textColor ?? null, textSize: s.textSize ?? null, textX: s.textX ?? null, textY: s.textY ?? null, textRotate: s.textRotate ?? null,
    pattern: s.pattern ?? null, patternColor: s.patternColor ?? null, patternSize: s.patternSize ?? null,
  }))

/** The archive's list as drafts, with any auto tag it lacks added from `site.tags` (unsaved, so Save adds it). */
export function draftsOf(list: RawTag[]): TagDraft[] {
  const builtIn = rawOf(site.tags)
  const missing = AUTO_TAGS.filter((name) => !list.some((t) => t.name === name)).map(
    (name) => builtIn.find((t) => t.name === name) ?? bare(name, name, false),
  )
  return [...list.map((t) => draftOf(t)), ...missing.map((t) => draftOf(t, false))]
}

const inputOf = (t: RawTag): TagInput => ({
  name: t.name, label: t.label, drawn: t.drawn, color: t.color, width: t.width, height: t.height,
  text: t.text ?? null, textColor: t.textColor ?? null, textSize: t.textSize ?? null, textX: t.textX ?? null, textY: t.textY ?? null, textRotate: t.textRotate ?? null,
  pattern: t.pattern ?? null, patternColor: t.patternColor ?? null, patternSize: t.patternSize ?? null,
})

/** A whole number in `range`, or null when empty; `bad` hears about anything else. */
function whole(value: Typed, range: { min: number; max: number }, bad: () => void): number | null {
  const text = String(value).trim()
  if (!text) return null
  const n = Number(text)
  if (!Number.isInteger(n) || n < range.min || n > range.max) bad()
  return n
}

/** The list to save, the problems by draft key and field, and whether anything differs from `saved`. */
export function tagChanges(saved: RawTag[], drafts: TagDraft[]) {
  const errors = new Map<number, Partial<Record<TagField, string>>>()
  const flag = (key: number, field: TagField, msg: string) => errors.set(key, { ...errors.get(key), [field]: msg })
  const seen = new Set<string>()
  const colorOf = (key: number, field: 'color' | 'textColor' | 'patternColor', value: string) => {
    const c = value.trim()
    if (c && !isTagColor(c)) flag(key, field, 'A hex, var(--vx-…), a color name, or a color function: oklch(from var(--vx-ok) calc(l - 0.1) c h)')
    return c || null
  }
  const body: TagInput[] = drafts.map((d) => {
    const name = d.name.trim()
    const label = d.label.trim()
    if (!TAG_NAME.test(name)) flag(d.key, 'name', 'Lowercase letters, digits and dashes, up to 32')
    else if (seen.has(name)) flag(d.key, 'name', 'Another tag has this name')
    seen.add(name)
    if (!label) flag(d.key, 'label', 'Needs a label')
    else if (label.length > TAG_LABEL_MAX) flag(d.key, 'label', `Up to ${TAG_LABEL_MAX} characters`)
    const px = (f: 'width' | 'height') => whole(d[f], TAG_SIZE, () => flag(d.key, f, `${TAG_SIZE.min}–${TAG_SIZE.max} px`))
    const tag: TagInput = {
      name, label, drawn: d.drawn, color: colorOf(d.key, 'color', d.color), width: px('width'), height: px('height'),
      ...NO_TEXT, ...NO_PATTERN,
    }
    if (d.pattern && TAG_PATTERNS.includes(d.pattern)) {
      Object.assign(tag, {
        pattern: d.pattern,
        patternColor: colorOf(d.key, 'patternColor', d.patternColor),
        patternSize: whole(d.patternSize, TAG_PATTERN_SIZE, () => flag(d.key, 'patternSize', `${TAG_PATTERN_SIZE.min}–${TAG_PATTERN_SIZE.max} px`)),
      })
    }
    if (!d.textOn) return tag
    const text = d.text.trim()
    if (!text) flag(d.key, 'text', 'Needs text, or turn it off')
    else if (text.length > TAG_TEXT_MAX) flag(d.key, 'text', `Up to ${TAG_TEXT_MAX} characters`)
    const nudge = (f: 'textX' | 'textY') => whole(d[f], TAG_TEXT_NUDGE, () => flag(d.key, f, `${TAG_TEXT_NUDGE.min} to ${TAG_TEXT_NUDGE.max} px`))
    return {
      ...tag,
      text,
      textColor: colorOf(d.key, 'textColor', d.textColor),
      textSize: whole(d.textSize, TAG_TEXT_SIZE, () => flag(d.key, 'textSize', `${TAG_TEXT_SIZE.min}–${TAG_TEXT_SIZE.max} px`)),
      textX: nudge('textX'),
      textY: nudge('textY'),
      textRotate: whole(d.textRotate, TAG_TEXT_ROTATE, () => flag(d.key, 'textRotate', `${TAG_TEXT_ROTATE.min} to ${TAG_TEXT_ROTATE.max}°`)),
    }
  })
  const changed = JSON.stringify(body) !== JSON.stringify(saved.map(inputOf))
  return { body, errors, changed }
}

/** How a draft shows in the preview, with its saved shape resolved against the public API. */
export function previewOf(d: TagDraft, apiBase: string): TagStyle {
  const n = (value: Typed, range: { min: number; max: number }) => {
    const v = whole(value, range, () => {})
    return v != null && Number.isInteger(v) && v >= range.min && v <= range.max ? v : undefined
  }
  const color = (c: string) => (isTagColor(c.trim()) ? c.trim() : undefined)
  const text = d.textOn ? d.text.trim().slice(0, TAG_TEXT_MAX) : ''
  return {
    label: d.label.trim() || d.name || 'tag',
    drawn: d.drawn,
    color: color(d.color),
    shape: d.shape ? `${apiBase.replace(/\/+$/, '')}/${d.shape}` : null,
    width: n(d.width, TAG_SIZE),
    height: n(d.height, TAG_SIZE),
    ...(d.pattern && { pattern: d.pattern, patternColor: color(d.patternColor), patternSize: n(d.patternSize, TAG_PATTERN_SIZE) }),
    ...(text && {
      text,
      textColor: color(d.textColor),
      textSize: n(d.textSize, TAG_TEXT_SIZE),
      textX: n(d.textX, TAG_TEXT_NUDGE),
      textY: n(d.textY, TAG_TEXT_NUDGE),
      textRotate: n(d.textRotate, TAG_TEXT_ROTATE),
    }),
  }
}
