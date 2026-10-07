// The list pages keep their filters in the URL so a link reproduces the view: /vods or /playthroughs (the tab), then
// ?tag=&title=&game=&from=&to=&page=
import type { Vod, VodListOptions } from '../../index'
import { DATE_TAGS, RECENT_MS, TAG_NAME, tagStyle } from './vodTags'

/**
 * The lists, one per VOD tag the site knows, each its own page. Plain VODs (no tags) first; a tag the site doesn't know
 * yet has no list, so its VODs stay out of every list until one is added here.
 */
export const TABS = [
  { value: 'vods', label: 'VODs', tag: undefined, path: '/vods' },
  { value: 'playthroughs', label: 'Playthroughs', tag: 'compilation', path: '/playthroughs' },
] as const

/** How a VOD tag reads (`site.tags`). */
export const tagLabel = (tag: string) => tagStyle(tag).label

export type Tab = (typeof TABS)[number]['value']

/** The page that lists `tab`. */
export const listPath = (tab: Tab): string => TABS.find((t) => t.value === tab)!.path

/** The tab a VOD is listed in: the first whose tag it has, else the plain VODs. */
export const tabOf = (vod: Vod): Tab => TABS.find((t) => t.tag && vod.tags.includes(t.tag))?.value ?? 'vods'

/**
 * Whether the list can be narrowed to `tag` within `tab`: the date tags anywhere; a tag set on VODs only in a tab of
 * tagged VODs (plain VODs have none), and not the tags the tabs themselves are made of.
 */
export function tagFilters(tab: Tab, tag: string): boolean {
  if (DATE_TAGS.includes(tag)) return true
  const kinds = TABS.map((t) => t.tag).filter(Boolean) as string[]
  return !!TABS.find((t) => t.value === tab)?.tag && TAG_NAME.test(tag) && !kinds.includes(tag)
}

export interface ListState {
  tab: Tab
  /** One tag the list is narrowed to (tagFilters), or ''. */
  tag: string
  page: number
  title: string
  game: string
  /** YYYY-MM-DD or '' (open-ended). */
  from: string
  to: string
}

type Query = Record<string, string | null | (string | null)[] | undefined>

const first = (v: Query[string]): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim()
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`))

/** The list's state from its query; the tab is the page's (listPath), not part of the query. */
export function parseListQuery(q: Query, tab: Tab = 'vods'): ListState {
  const page = Number.parseInt(first(q.page), 10)
  const from = first(q.from)
  const to = first(q.to)
  const tag = first(q.tag)
  return {
    tab,
    tag: tagFilters(tab, tag) ? tag : '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    title: first(q.title).slice(0, 200),
    game: first(q.game).slice(0, 200),
    from: isDay(from) ? from : '',
    to: isDay(to) ? to : '',
  }
}

/** Query object with defaults left out, so the plain list is just its page (the tab is in the path: listPath). */
export function toListQuery(s: ListState): Record<string, string> {
  const q: Record<string, string> = {}
  if (s.tag) q.tag = s.tag
  if (s.title) q.title = s.title
  if (s.game) q.game = s.game
  if (s.from) q.from = s.from
  if (s.to) q.to = s.to
  if (s.page > 1) q.page = String(s.page)
  return q
}

/** The archive's filter for a tag: the date tags by when the footage was live (lib/vodTags), others as set. */
function tagFilter(tag: string, now: number): Partial<VodListOptions> {
  const week = new Date(now - RECENT_MS)
  if (tag === 'new') return { firstLiveFrom: week }
  if (tag === 'updated') return { firstLiveBefore: week, lastLiveFrom: week }
  return tag ? { tags: [tag] } : {}
}

/**
 * Filters for the API. Dates are local days: `from` from its start, `to` through its end. `now` (to the minute, so
 * the same view asks the same thing) dates the tags `new` and `updated`.
 */
export function toApiFilter(s: ListState, now = Math.floor(Date.now() / 60_000) * 60_000): Omit<VodListOptions, 'page' | 'perPage'> {
  return {
    tag: TABS.find((t) => t.value === s.tab)?.tag,
    ...tagFilter(s.tag, now),
    title: s.title || undefined,
    game: s.game || undefined,
    from: s.from ? new Date(`${s.from}T00:00:00`) : undefined,
    to: s.to ? new Date(`${s.to}T23:59:59.999`) : undefined,
  }
}

/** Any filter on (the tab is the page, not a filter: "All" keeps it). */
export const hasFilters = (s: ListState) => !!(s.tag || s.title || s.game || s.from || s.to)

/** The list narrowed to `tag`, in the tab `vod` is listed in; null if that tab can't be. */
export function tagLink(vod: Vod, tag: string): string | null {
  const tab = tabOf(vod)
  if (!tagFilters(tab, tag)) return null
  return `${listPath(tab)}?${new URLSearchParams(toListQuery({ ...parseListQuery({}, tab), tag }))}`
}

