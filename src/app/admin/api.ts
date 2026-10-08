import type { RawDrive, RawEmoteSets, RawVod } from '../../index'
import type { RawTag } from '../lib/vodTags'

// Client for twitch-archive's worker admin API, as described in docs/admin-api.md. The browser holds no key: a
// password login gives it an HttpOnly session cookie, and every change carries the session's CSRF token.

/** A v1 job state, as /admin/health counts and /admin/storage folders report them (`done` is v2's `succeeded`). */
export type JobState = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'

export interface Session {
  authenticated: boolean
  csrf: string | null
  expiresAt: string | null
  /**
   * Whether the password is offered to this address: false when the archive has none configured, or when this
   * address is outside ARCHIVE_ADMIN_PASSWORD_NETWORKS (the local network by default).
   */
  passwordLogin: boolean
  /** Whether "Sign in with Twitch" (through vexoulz-auth) is set up on the worker. Older workers omit it. */
  twitchLogin?: boolean
  /** The signed-in Twitch user; null for a password login. */
  user?: AdminUser | null
}

export interface AdminUser {
  id: string
  login: string
  displayName: string
  avatar?: string | null
  color?: string | null
}

export interface Health {
  worker: { ok: boolean; runningJobs: number; startedAt?: string | null }
  api: { ok: boolean } | null
  youtube: {
    authorized: boolean
    valid: boolean
    error: string | null
    checkedAt?: string | null
    /** The channel uploads go to; null when the account has none (then valid is false), absent if unknown. */
    channel?: { id: string; title: string; url: string } | null
  } | null
  live: { live: boolean; streamId: string | null; startedAt: string | null } | null
  /** Counts over every job, legacy ones too; the job runs themselves come from /api/v2/jobs (platform.ts). */
  jobs: { counts: Partial<Record<JobState, number>> }
}

export interface ActionResult {
  error: false
  msg: string
  jobId?: number
}

/** GET /admin/vods/{id}: the VOD as the public API renders it, plus what only admins need. */
/** What the last bot_chat job read from doomtp-bot's log for a VOD (twitch-archive `vods.bot_chat`). */
export interface BotChatInfo {
  fetched_at: string
  /** The span asked for (the VOD's, ISO). */
  since?: string
  until?: string
  /** Read with a doomtp key, so removals (deletes, timeouts) and their reasons are included. */
  keyed: boolean
  /** Messages stored for the VOD. */
  rows?: number
  /** When the bot was listening; `gaps` are the spans it missed (ms since the epoch). */
  coverage?: { gaps?: { from: number; to: number; reason?: string | null }[] } | null
}

export interface AdminVod extends RawVod {
  /** Hidden VODs are gone from the public site (list, watch page, games, chat) but kept here. */
  hidden?: boolean
  chaptersLocked: boolean
  /** Null (or missing, from older workers) until a bot_chat job has read it. */
  botChat?: BotChatInfo | null
  /** Merges and splits touching this VOD, oldest first (undone ones included, with `undoneAt`). */
  splices?: Splice[]
}

/** A row of GET /admin/vods: every VOD, hidden and merged ones too. */
export interface AdminVodRow {
  id: string
  title: string | null
  createdAt: string
  duration: string
  duration_seconds: number
  thumbnail_url: string | null
  stream_id: string | null
  hidden: boolean
  merged_into: string | null
}

/** The fields PATCH /admin/vods/:id changes. A merged VOD takes only `hidden`. */
export interface VodPatch {
  title?: string
  hidden?: boolean
  /** An http(s) URL, or null for the default (YouTube's). */
  thumbnailUrl?: string | null
  /** HH:MM:SS; refused when chapters or games rows run past it. */
  duration?: string
  /** ISO 8601 with an offset. */
  createdAt?: string
}

/** A games row (the public `/games` shape): which game was played when, for the games pages. */
export interface GameRow {
  id?: string
  /** Seconds, as strings from the API; numbers are taken too. */
  start_time: string | number
  end_time: string | number
  game_id: string | null
  game_name: string
  title?: string | null
  thumbnail_url?: string | null
  chapter_image?: string | null
  video_provider?: string | null
  video_id?: string | null
}

/** GET /admin/site/tags: how each VOD tag shows on the site, in order (docs/admin-api.md, "Site tags"). */
export interface SiteTags {
  tags: RawTag[]
  updatedAt: string | null
  updatedBy: string | null
}
/** A tag as PUT /admin/site/tags takes it: everything but the shape, which is uploaded on its own. */
export type TagInput = Omit<RawTag, 'shape'>

export type SettingType = 'bool' | 'int' | 'float' | 'text' | 'list' | 'steps'
export type SettingValue = boolean | number | string | string[] | Record<string, string[]>

/** One worker setting the dashboard can change (GET /admin/settings). */
export interface RuntimeSetting {
  key: string
  value: SettingValue
  /** The env value (or the built-in default): what Reset goes back to. */
  default: SettingValue
  overridden: boolean
  type: SettingType
  group: 'Capture' | 'YouTube' | 'Pipeline' | 'Runner' | string
  /** "now": the next check, pick or step; "next job": jobs read it when they start or resume. */
  applies: 'now' | 'next job'
  help: string
  min: number | null
  max: number | null
  updatedAt: string | null
  updatedBy: string | null
  /** For `steps`: each job kind's steps. */
  choices?: Record<string, string[]>
}

/** A folder the worker keeps on disk (GET /admin/storage). */
export interface StorageFolder {
  area: 'vods' | 'live'
  name: string
  /** `<area>/<name>`, relative to the data directory. */
  path: string
  bytes: number
  files: number
  modifiedAt: string | null
  vod: { id: string; title: string | null; hidden: boolean } | null
  jobs: { active: StorageJob[]; last: StorageJob | null }
  /** No job for it is queued, running or paused, and it has no VOD or its last job failed or was cancelled. */
  stale: boolean
}
export interface StorageJob {
  id: number
  kind: string
  state: JobState
  step: string | null
  updatedAt: string
}
export interface StorageView {
  disk: { total: number; used: number; free: number } | null
  folders: StorageFolder[]
  cacheSeconds: number
}

/** A merge (`otherId` appended to `vodId` at `offset`) or split (`vodId` from `offset` on became `otherId`). */
export interface Splice {
  id: number
  kind: 'merge' | 'split'
  vodId: string
  otherId: string
  /** Seconds into `vodId`. */
  offset: number
  /** Merges only: seconds the stream was down between the two (negative when they overlapped). */
  gap: number | null
  detail: Record<string, unknown>
  createdAt: string
  undoneAt: string | null
  /** False while a later splice on either VOD has to be undone first. */
  undoable: boolean
}

/** Whether Twitch's VOD of this id no longer matches it (merged or split), so the Twitch re-fetches refuse it. */
export const isSpliced = (v: Pick<AdminVod, 'merged_into' | 'splices'>) => !!v.merged_into || (v.splices ?? []).some((s) => !s.undoneAt)

export interface MergeCandidate {
  id: string
  streamId: string | null
  title: string | null
  createdAt: string
  /** "HH:MM:SS". */
  duration: string
  /** Seconds between the end of this VOD and the start of that one; negative when they overlap. */
  gap: number
  overlaps: boolean
  titlesMatch: boolean
}

/** GET /admin/vods/{id}/merge-candidates: VODs that started up to `withinMinutes` after this one ended. */
export interface MergeCandidates {
  vod: { id: string; streamId: string | null; title: string | null; createdAt: string; duration: string; endsAt: string; mergedInto: { id: string; offset: number } | null }
  withinMinutes: number
  candidates: MergeCandidate[]
}

/** What merge, unmerge, split and unsplit answer: the splice and this VOD as it is now. */
export interface SpliceResult {
  error: false
  msg: string
  splice: Splice
  vod: AdminVod
  /** Merges: the source's other upload type now plays a few seconds off. */
  warnings?: string[]
  /** Splits: the id of the new VOD. */
  newVodId?: string
  /** Set when the split point was a merge's join, so the split undid that merge instead. */
  undid?: 'merge'
}

/** Where a split can go instead (a 409's `validPoints`): `at`, anywhere from `from` to `to` works too. */
export interface SplitPoint {
  at: number
  from: number
  to: number
}

/** A row of GET /api/v2/vods: every VOD, hidden, merged and synthetic ones too. */
export interface VodListRow {
  id: string
  title: string | null
  created_at: string
  duration: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  stream_id: string | null
  hidden: boolean
  merged_into: { id: string; offset: number } | null
  /** [] for a regular VOD; a playthrough is tagged `compilation`. */
  tags: string[]
  /** Set on a synthetic VOD. */
  synthetic: { supersedes?: boolean } | null
}

/** A window `[start, end)` of a real VOD, placed at `at` on the synthetic VOD's timeline (seconds). */
export interface SyntheticSegment {
  vod_id: string
  /** Null: from the source's start. */
  start: number | null
  /** Null: to the source's end. */
  end: number | null
  /** Null on the way in: right after the segment before. */
  at: number | null
  label: string | null
  stream?: string
}

/** GET/PUT /api/v2/synthetic/{id}: a VOD made of windows of real ones (a merge, a split or a playthrough). */
export interface SyntheticVod {
  id: string
  title: string | null
  /** Its sources leave the public lists and redirect into it (a merge or split); otherwise it's listed beside them. */
  supersedes: boolean
  tags: string[]
  hidden: boolean
  duration: string | null
  created_at: string | null
  /** When it was made, and when its segments, title or tags last changed. */
  made_at: string | null
  changed_at: string | null
  segments: SyntheticSegment[]
}

/** POST /api/v2/synthetic (with `id`) or PUT /api/v2/synthetic/{id} (only the fields sent change). */
export interface SyntheticInput {
  /** New ones only; not only digits (those are Twitch's). */
  id?: string
  /** Null: the first source's. */
  title?: string | null
  supersedes?: boolean
  tags?: string[]
  segments?: Partial<SyntheticSegment>[]
}

/** GET /api/v2/playthrough-candidates: a window of a real, shown VOD playing the game, oldest first. */
export interface PlaythroughWindow {
  vod_id: string
  title: string | null
  created_at: string
  start: number
  end: number
  length: number
  /** Ready to send as a segment. */
  segment: { vod_id: string; start: number; end: number; label: string }
}

/** A chapter as PUT /admin/vods/{id}/chapters takes it. Times in seconds; `length`, not an end time. */
export interface ChapterEdit {
  name: string | null
  gameId: string | null
  imageTemplate?: string | null
  start: number
  length: number
  restricted: boolean
  /** "gap" keeps a merge's gap chapter one (the worker drops nothing else it doesn't know). */
  kind?: 'gap'
}

export interface YoutubeEdit {
  id: string
  type: 'vod' | 'live'
  part: number
  /** Seconds; omit to keep what the archive has. */
  duration?: number
}

export interface TwitchGame {
  gameId: string
  name: string
  imageTemplate: string | null
}

export interface AdminEmotes extends RawEmoteSets {
  createdAt?: string
  updatedAt?: string
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds, from Retry-After (rate-limited logins). */
    readonly retryAfter: number | null = null,
    /** The rest of the error body (a 409's `validPoints`, `edited`, `blockedBy`, …). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'AdminApiError'
  }

  /** The session is gone (expired, or the worker restarted): log in again. */
  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** A split refused inside an upload: the nearest points where it would work. */
  get validPoints(): SplitPoint[] {
    return Array.isArray(this.extra.validPoints) ? (this.extra.validPoints as SplitPoint[]) : []
  }

  /** An undo refused because it would throw away edits made since ("vodId.field", …); retry with force. */
  get edited(): string[] {
    return Array.isArray(this.extra.edited) ? (this.extra.edited as string[]) : []
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export class AdminClient {
  /** The admin API's URL, without a trailing slash. The app sets it once, before the first request (configureAdmin). */
  base: string
  private readonly fetcher: Fetch
  /** Sent as X-CSRF-Token on every change; set from the session. */
  csrf: string | null = null
  /** Called when a request comes back 401/403, so the app can send the admin to the login page. */
  onUnauthorized: (() => void) | null = null

  constructor(opts: { base: string; fetch?: Fetch }) {
    this.base = opts.base.replace(/\/+$/, '')
    this.fetcher = opts.fetch ?? ((input, init) => globalThis.fetch(input, init))
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    // A Blob (an uploaded file) goes as it is, with its own type; anything else as JSON.
    const raw = body instanceof Blob
    if (body !== undefined) headers['content-type'] = raw ? body.type || 'application/octet-stream' : 'application/json'
    if (method !== 'GET' && this.csrf) headers['x-csrf-token'] = this.csrf
    const res = await this.fetcher(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
    if (res.status === 204) return undefined as T
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      // not JSON (a proxy error page, say)
    }
    if (!res.ok) {
      // v1 answers {msg} (or {message}); /api/v2 answers problem details, whose text is `detail`.
      const problem = data as { msg?: string; message?: string; detail?: unknown } | null
      const msg = problem?.msg ?? problem?.message ?? (typeof problem?.detail === 'string' ? problem.detail : undefined)
      const retry = Number(res.headers.get('retry-after'))
      const { error: _e, msg: _m, message: _msg, ...extra } = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
      const err = new AdminApiError(res.status, msg || `HTTP ${res.status}`, Number.isFinite(retry) && retry > 0 ? retry : null, extra)
      if (err.unauthorized && path !== '/admin/session') this.onUnauthorized?.()
      throw err
    }
    return data as T
  }

  // ---- session ----
  session(signal?: AbortSignal): Promise<Session> {
    return this.request('GET', '/admin/session', undefined, signal)
  }
  login(password: string): Promise<Session> {
    return this.request('POST', '/admin/session', { password })
  }
  logout(): Promise<void> {
    return this.request('DELETE', '/admin/session')
  }

  // ---- overview ----
  health(signal?: AbortSignal): Promise<Health> {
    return this.request('GET', '/admin/health', undefined, signal)
  }
  youtubeAuthUrl(): Promise<{ url: string }> {
    return this.request('GET', '/admin/youtube/auth')
  }

  // ---- VODs ----
  /** Newest first; `q` is an exact id or part of a title; `before` is the last page's `next`. */
  vods(q: { q?: string; hidden?: boolean; limit?: number; before?: string } = {}, signal?: AbortSignal): Promise<{ data: AdminVodRow[]; next: string | null }> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v))
    const qs = params.toString()
    return this.request('GET', `/admin/vods${qs ? `?${qs}` : ''}`, undefined, signal)
  }
  vod(id: string, signal?: AbortSignal): Promise<AdminVod> {
    return this.request('GET', `/admin/vods/${enc(id)}`, undefined, signal)
  }
  updateVod(id: string, patch: VodPatch): Promise<AdminVod> {
    return this.request('PATCH', `/admin/vods/${enc(id)}`, patch)
  }
  games(id: string, signal?: AbortSignal): Promise<GameRow[]> {
    return this.request('GET', `/admin/vods/${enc(id)}/games`, undefined, signal)
  }
  /** Replaces the VOD's games rows: sorted by start, no overlaps, inside the duration. */
  saveGames(id: string, games: GameRow[]): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/games`, { games })
  }
  saveChapters(id: string, chapters: ChapterEdit[], locked: boolean): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/chapters`, { chapters, locked })
  }
  saveYoutube(id: string, youtube: YoutubeEdit[]): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/youtube`, { youtube })
  }
  saveDrive(id: string, drive: RawDrive[]): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/drive`, { drive })
  }
  vodEmotes(id: string, signal?: AbortSignal): Promise<AdminEmotes | null> {
    return this.request('GET', `/admin/vods/${enc(id)}/emotes`, undefined, signal)
  }
  searchGames(query: string, signal?: AbortSignal): Promise<TwitchGame[]> {
    return this.request('GET', `/admin/twitch/games?query=${encodeURIComponent(query)}`, undefined, signal)
  }

  // ---- merges and splits (one broadcast that Twitch cut in two, or two streams in one VOD) ----
  mergeCandidates(id: string, signal?: AbortSignal): Promise<MergeCandidates> {
    return this.request('GET', `/admin/vods/${enc(id)}/merge-candidates`, undefined, signal)
  }
  /** Appends `source` (the later VOD) to `id`; `gap` (seconds) replaces the gap worked out from the start times. */
  merge(id: string, source: string, gap?: number): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/merge`, { source, gap: gap ?? undefined })
  }
  unmerge(id: string, source: string, force = false): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/unmerge`, { source, force: force || undefined })
  }
  /** From `at` (VOD seconds) on becomes a new VOD; at a merge's join, undoes that merge. */
  split(id: string, at: number, force = false): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/split`, { at, force: force || undefined })
  }
  /** Undoes the latest split of `id`, or the one that made `source`. */
  unsplit(id: string, source?: string, force = false): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/unsplit`, { source: source || undefined, force: force || undefined })
  }

  // ---- /api/v2: the VOD list and synthetic VODs ----
  /** Newest first; `q` is an exact id or part of a title; `synthetic` keeps only those (or only real ones). */
  vodList(
    q: { q?: string; hidden?: boolean; synthetic?: boolean; tag?: string; cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ items: VodListRow[]; next_cursor: string | null }> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v))
    const qs = params.toString()
    return this.request('GET', `/api/v2/vods${qs ? `?${qs}` : ''}`, undefined, signal)
  }
  synthetic(id: string, signal?: AbortSignal): Promise<SyntheticVod> {
    return this.request('GET', `/api/v2/synthetic/${enc(id)}`, undefined, signal)
  }
  createSynthetic(body: SyntheticInput & { id: string }): Promise<SyntheticVod> {
    return this.request('POST', '/api/v2/synthetic', body)
  }
  updateSynthetic(id: string, body: SyntheticInput): Promise<SyntheticVod> {
    return this.request('PUT', `/api/v2/synthetic/${enc(id)}`, body)
  }
  /** The whole undo: its sources were never changed, so they list and play as before. */
  deleteSynthetic(id: string): Promise<SyntheticVod> {
    return this.request('DELETE', `/api/v2/synthetic/${enc(id)}`)
  }
  playthroughCandidates(gameId: string, signal?: AbortSignal): Promise<{ items: PlaythroughWindow[] }> {
    return this.request('GET', `/api/v2/playthrough-candidates?game_id=${encodeURIComponent(gameId)}`, undefined, signal)
  }

  // ---- VOD jobs and fixes (the worker's existing routes) ----
  /** Chapters from Twitch; `force` also replaces chapters edited by hand. */
  refetchChapters(vodId: string, force = false): Promise<ActionResult> {
    return this.request('POST', '/admin/chapters', { vodId, force: force || undefined })
  }
  /** Fill the VOD's missing emote sets; `force` replaces the saved ones with today's. */
  captureEmotes(vodId: string, force = false): Promise<ActionResult> {
    return this.request('POST', '/admin/emotes', { vodId, force: force || undefined })
  }
  saveChat(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/logs', { vodId })
  }
  refreshDuration(vodId: string): Promise<ActionResult & { duration?: string }> {
    return this.request('POST', '/admin/duration', { vodId })
  }
  /** Download again (whole VOD or a part range), split and upload. */
  redownload(vodId: string, opts: { type?: 'vod' | 'live'; startPart?: number; endPart?: number } = {}): Promise<ActionResult> {
    return this.request('POST', '/admin/download', { vodId, ...opts })
  }
  reuploadPart(vodId: string, part: number, type: 'vod' | 'live' = 'vod'): Promise<ActionResult> {
    return this.request('POST', '/admin/reupload', { vodId, part, type })
  }
  updateDescriptions(vodId: string, type: 'vod' | 'live' = 'vod'): Promise<ActionResult> {
    return this.request('POST', '/admin/youtube/parts', { vodId, type })
  }
  /** Removes the VOD with its chat, emotes and game uploads from the archive (not from YouTube). */
  deleteVod(vodId: string): Promise<ActionResult> {
    return this.request('DELETE', '/admin/delete', { vodId })
  }
  /** A VOD the monitor missed: create it from Twitch and run the whole archive pipeline. */
  archiveFromTwitch(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/hls/download', { vodId })
  }
  /** Create the VOD row from Twitch (plus its chapters and emotes) without downloading anything. */
  createFromTwitch(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/generate/vod', { vodId })
  }
  backfillGlobalEmotes(vodIds?: string[]): Promise<ActionResult> {
    return this.request('POST', '/admin/emotes/backfill', vodIds?.length ? { vodIds } : {})
  }
  /** Read the VOD's chat from doomtp-bot's log (adds or updates rows; 409 while one runs for it). */
  botChat(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/bot-chat', { vodId })
  }
  /** Bot chat for every VOD without it, or only `vodIds`; merged or split VODs are skipped. */
  botChatBackfill(vodIds?: string[]): Promise<ActionResult> {
    return this.request('POST', '/admin/bot-chat/backfill', vodIds?.length ? { vodIds } : {})
  }

  // ---- settings and storage ----
  settings(signal?: AbortSignal): Promise<{ data: RuntimeSetting[] }> {
    return this.request('GET', '/admin/settings', undefined, signal)
  }
  /** All of them or none (400 names the refused one). */
  saveSettings(changes: Record<string, SettingValue>): Promise<{ data: RuntimeSetting[] }> {
    return this.request('PATCH', '/admin/settings', changes)
  }
  resetSetting(key: string): Promise<{ data: RuntimeSetting[] }> {
    return this.request('DELETE', `/admin/settings/${enc(key)}`)
  }
  // ---- site tags ----
  siteTags(signal?: AbortSignal): Promise<SiteTags> {
    return this.request('GET', '/admin/site/tags', undefined, signal)
  }
  /** Replaces the whole list (all or nothing); a tag left out loses its shape too. */
  saveSiteTags(tags: TagInput[]): Promise<SiteTags> {
    return this.request('PUT', '/admin/site/tags', { tags })
  }
  /** The tag's vector shape: an SVG, which the archive cleans before keeping. The tag has to be saved first. */
  uploadTagShape(name: string, svg: Blob): Promise<SiteTags> {
    return this.request('PUT', `/admin/site/tags/${enc(name)}/shape`, svg.type ? svg : new Blob([svg], { type: 'image/svg+xml' }))
  }
  /** Back to the placeholder. */
  deleteTagShape(name: string): Promise<SiteTags> {
    return this.request('DELETE', `/admin/site/tags/${enc(name)}/shape`)
  }
  storage(refresh = false, signal?: AbortSignal): Promise<StorageView> {
    return this.request('GET', `/admin/storage${refresh ? '?refresh=true' : ''}`, undefined, signal)
  }
  /** 409 while a job for the folder is queued, running or paused. */
  deleteFolder(area: string, name: string): Promise<{ path: string; bytes: number; files: number }> {
    return this.request('DELETE', `/admin/storage/${enc(area)}/${enc(name)}`)
  }
}

const enc = encodeURIComponent
