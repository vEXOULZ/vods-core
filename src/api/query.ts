// Feathers REST query strings, serialized the way the old site's @feathersjs/rest-client (qs) did:
// ?createdAt[$gte]=…&$limit=20&$sort[createdAt]=-1

import { NO_CATEGORY } from './normalize'

export type QueryValue = string | number | boolean | null | undefined | QueryObject | QueryValue[]
export interface QueryObject {
  [key: string]: QueryValue
}

function enc(s: string): string {
  // Keep brackets and $ readable; the API decodes either form.
  return encodeURIComponent(s).replace(/%5B/gi, '[').replace(/%5D/gi, ']').replace(/%24/g, '$')
}

function walk(prefix: string, value: QueryValue, out: string[]): void {
  if (value === undefined) return
  if (value === null) {
    out.push(`${enc(prefix)}=`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walk(`${prefix}[${i}]`, v, out))
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}[${k}]` : k, v, out)
  } else {
    out.push(`${enc(prefix)}=${enc(String(value))}`)
  }
}

/** Serializes a query object; returns "" or a string starting with "?". */
export function toQueryString(query: QueryObject): string {
  const out: string[] = []
  walk('', query, out)
  return out.length ? `?${out.join('&')}` : ''
}

export interface VodFilter {
  /** Case-insensitive title substring. */
  title?: string
  /** Exact game (chapter) name; `NO_CATEGORY` finds chapters without a Twitch category. */
  game?: string
  /** Created at or after. */
  from?: Date
  /** Created at or before. */
  to?: Date
}

export interface VodListOptions extends VodFilter {
  /** 1-based. */
  page?: number
  perPage?: number
}

/** Escapes LIKE wildcards so a search for "100%" means the literal text. */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Builds the `/vods` query for a list page. Filters combine (the old site allowed only one at a time). */
export function vodListQuery(opts: VodListOptions = {}): QueryObject {
  const perPage = Math.max(1, Math.floor(opts.perPage ?? 20))
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const q: QueryObject = {}
  const title = opts.title?.trim()
  if (title) q.title = { $iLike: `%${likeEscape(title)}%` }
  const game = opts.game?.trim()
  // Exact match (plain `chapters[name]` is a substring match). Uncategorised chapters have no name, only a null id.
  if (game) q.chapters = game === NO_CATEGORY ? { gameId: 'null' } : { name: { $eq: game } }
  if (opts.from || opts.to) {
    const range: QueryObject = {}
    if (opts.from) range.$gte = opts.from.toISOString()
    if (opts.to) range.$lte = opts.to.toISOString()
    q.createdAt = range
  }
  q.$limit = perPage
  q.$skip = (page - 1) * perPage
  q.$sort = { createdAt: -1 }
  return q
}
