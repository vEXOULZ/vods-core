import type { GamePlayed, Vod, VodPage } from '../types'
import { normalizeGamePlayed, normalizeVod } from './normalize'
import { toQueryString, vodListQuery, type QueryObject, type VodListOptions } from './query'
import type { Page, RawBadges, RawCommentPage, RawEmoteSets, RawGamePlayed, RawStream, RawThirdPartyEmotes, RawVod } from './types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ArchiveClientOptions {
  /** Base URL without a trailing slash. */
  apiBase: string
  /** Injectable for tests and SSR; defaults to the global fetch. */
  fetch?: Fetch
}

/** Typed client for the read-only archive API. */
export class ArchiveClient {
  readonly apiBase: string
  private readonly fetcher: Fetch

  constructor(opts: ArchiveClientOptions) {
    this.apiBase = opts.apiBase.replace(/\/+$/, '')
    this.fetcher = opts.fetch ?? ((input, init) => globalThis.fetch(input, init))
  }

  /** GET a path (with query string) and parse JSON. Throws ApiError on HTTP errors. */
  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await this.fetcher(`${this.apiBase}${path}`, { signal, headers: { accept: 'application/json' } })
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        // Feathers errors carry `message`; the legacy routes send `{error: true, msg}`.
        const body = (await res.json()) as { message?: string; msg?: string; error?: unknown }
        message = body.message ?? body.msg ?? (typeof body.error === 'string' ? body.error : undefined) ?? message
      } catch {
        // not JSON
      }
      throw new ApiError(res.status, path, message)
    }
    return (await res.json()) as T
  }

  find<T>(service: string, query: QueryObject, signal?: AbortSignal): Promise<Page<T>> {
    return this.get<Page<T>>(`/${service}${toQueryString(query)}`, signal)
  }

  /** A page of VODs, newest first, with title / game / date filters. */
  async listVods(opts: VodListOptions = {}, signal?: AbortSignal): Promise<VodPage> {
    const page = await this.find<RawVod>('vods', vodListQuery(opts), signal)
    return { total: page.total, vods: page.data.map(normalizeVod) }
  }

  /** Every game played across the archive (from the VODs' chapters), most played first. */
  async gamesPlayed(signal?: AbortSignal): Promise<GamePlayed[]> {
    return (await this.get<RawGamePlayed[]>('/v1/games-played', signal)).map(normalizeGamePlayed)
  }

  /** The channel's and global 7TV / BTTV / FFZ emotes, fetched and cached by the archive. */
  thirdPartyEmotes(signal?: AbortSignal): Promise<RawThirdPartyEmotes> {
    return this.get<RawThirdPartyEmotes>('/v1/emotes/third-party', signal)
  }

  /** One VOD, or null when it doesn't exist. */
  async getVod(id: string, signal?: AbortSignal): Promise<Vod | null> {
    try {
      return normalizeVod(await this.get<RawVod>(`/vods/${encodeURIComponent(id)}`, signal))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  }

  /** The live stream, if the channel is live right now. */
  async liveStream(signal?: AbortSignal): Promise<RawStream | null> {
    const page = await this.find<RawStream>('streams', { is_live: true, $limit: 1 }, signal)
    return page.data[0] ?? null
  }

  /** Emote sets saved for a VOD, or null when none were saved. */
  async vodEmotes(vodId: string, signal?: AbortSignal): Promise<RawEmoteSets | null> {
    const page = await this.find<RawEmoteSets>('emotes', { vod_id: vodId, $limit: 1 }, signal)
    return page.data[0] ?? null
  }

  badges(signal?: AbortSignal): Promise<RawBadges> {
    return this.get<RawBadges>('/v2/badges', signal)
  }

  /** The 200-comment page containing `offset` (VOD seconds). */
  commentsAt(vodId: string, offset: number, signal?: AbortSignal): Promise<RawCommentPage> {
    const q = toQueryString({ content_offset_seconds: Math.max(0, Math.floor(offset)) })
    return this.get<RawCommentPage>(`/v1/vods/${encodeURIComponent(vodId)}/comments${q}`, signal).catch((e: unknown) => {
      // The archive answers 500 when nothing was said at or after the offset (past the last message): no chat, not
      // an error.
      if (e instanceof ApiError && e.status === 500 && e.message.startsWith('Failed to retrieve comments from offset')) return { comments: [] }
      throw e
    })
  }

  /** The page after `cursor` (from the previous page). */
  commentsAfter(vodId: string, cursor: string, signal?: AbortSignal): Promise<RawCommentPage> {
    return this.get<RawCommentPage>(`/v1/vods/${encodeURIComponent(vodId)}/comments${toQueryString({ cursor })}`, signal)
  }
}
