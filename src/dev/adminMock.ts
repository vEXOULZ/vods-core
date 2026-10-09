// Dev-only stand-in for the worker admin API (docs/admin-api.md), so `npm run dev` can show /manage without a real
// archive. Fake data, in memory; jobs advance on their own. Password: "admin"; "Sign in with Twitch" signs in a fake
// Twitch admin at once (no vexoulz-auth). The `dev` entry: only a site's vite config imports it, never its build.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import type { Plugin } from 'vite'
import { isTagColor, TAG_NAME } from '../app/lib/tagRules'

type State = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
const STATES: State[] = ['queued', 'running', 'paused', 'done', 'failed', 'cancelled']
// Same kinds and steps as the worker (twitch-archive README, "Job kinds"). manualSteps are the kind's default pause gates.
const KINDS: Record<string, { steps: string[]; manualSteps: string[]; description?: string; cooperative?: boolean }> = {
  archive: { steps: ['capture', 'finalize', 'chapters', 'chat', 'emotes', 'split', 'upload', 'describe', 'cleanup'], manualSteps: [], description: 'Record a live stream and publish it', cooperative: true },
  download: { steps: ['ensure_source', 'chapters', 'split', 'upload', 'describe', 'cleanup'], manualSteps: [], description: 'Download a Twitch VOD and upload it to YouTube' },
  reupload: { steps: ['ensure_source', 'split', 'upload', 'describe', 'cleanup'], manualSteps: ['upload'] },
  dmca: { steps: ['ensure_source', 'dmca_edit', 'split', 'upload', 'describe', 'cleanup'], manualSteps: ['upload'] },
  chat: { steps: ['chat'], manualSteps: [] },
  chapters: { steps: ['chapters'], manualSteps: [] },
  emotes: { steps: ['emotes'], manualSteps: [] },
  describe: { steps: ['describe'], manualSteps: [] },
  global_emotes_backfill: { steps: ['global_emotes_backfill'], manualSteps: [] },
  bot_chat: { steps: ['bot_chat'], manualSteps: [] },
  bot_chat_backfill: { steps: ['bot_chat_backfill'], manualSteps: [] },
}

interface Job {
  id: number; kind: string; vodId: string | null; state: State; step: string | null; attempts: number
  lastError: string | null; payload: Record<string, unknown>; notBefore: string | null
  pauseBefore: string[] | null; pauseNext: boolean; createdAt: string; updatedAt: string
  ticks: number; cancelRequested: boolean; actor: { kind: string; id: string | null; login: string | null; via: string }
  parentId?: number | null
}
interface Event { seq: number; at: string; level: 'info' | 'warning' | 'error'; step: string | null; message: string; progress: { done: number; total: number; unit: string } | null }

const iso = (ms = 0) => new Date(Date.now() - ms).toISOString()
let nextId = 1
const jobs: Job[] = []
const events = new Map<number, Event[]>()
let seq = 0

function log(job: Job, message: string, level: Event['level'] = 'info', progress: Event['progress'] = null) {
  const list = events.get(job.id) ?? []
  list.push({ seq: ++seq, at: iso(), level, step: job.step, message, progress })
  events.set(job.id, list.slice(-1000))
}

function add(kind: string, vodId: string | null, state: State, stepIndex: number, ageMin: number, extra: Partial<Job> = {}) {
  const steps = KINDS[kind]!.steps
  const job: Job = {
    id: nextId++, kind, vodId, state, step: state === 'done' ? null : steps[Math.min(stepIndex, steps.length - 1)]!,
    attempts: state === 'failed' ? 3 : 1, lastError: null, payload: {}, notBefore: null, pauseBefore: null, pauseNext: false,
    cancelRequested: false, actor: { kind: 'system', id: null, login: null, via: 'job' },
    createdAt: iso(ageMin * 60_000), updatedAt: iso(ageMin * 30_000), ticks: 0, ...extra,
  }
  jobs.unshift(job)
  log(job, `Job created (${kind})`)
  return job
}

// Seed: a history of finished work plus a few in flight.
for (let i = 0; i < 70; i++) add(i % 3 ? 'archive' : 'chapters', String(2300000000 + i * 7919), 'done', 99, 60 * 24 * (70 - i))
add('dmca', '2301234567', 'cancelled', 1, 60 * 30)
add('reupload', '2309876543', 'failed', 1, 60 * 5, { lastError: 'YouTube quota exceeded (403 quotaExceeded); retry after midnight Pacific.' })
add('download', '2311111111', 'paused', 2, 90, { pauseBefore: ['upload'] })
add('archive', '2312345678', 'running', 6, 40)
add('emotes', '2312345678', 'queued', 0, 1)
// A backfill and the bot_chat runs it queued (GET /api/v2/jobs/{id}/related shows them as a tree).
const backfillJob = add('bot_chat_backfill', null, 'done', 99, 25)
for (const [i, vodId] of ['2312345678', '2311111111', '2309876543'].entries()) {
  add('bot_chat', vodId, i < 2 ? 'done' : 'running', 0, 24 - i * 2, { parentId: backfillJob.id, payload: { backfill: true }, actor: childActor(backfillJob) })
}

/** The actor of a run another run queued (vex-platform's StepContext.enqueue). */
function childActor(parent: Job): Job['actor'] {
  return { kind: 'job', id: String(parent.id), login: parent.kind, via: 'job' }
}

function advance() {
  const queuedBy: Job[] = []
  for (const job of jobs) {
    if (job.state === 'queued') {
      job.state = 'running'
      job.updatedAt = iso()
      log(job, `Step ${job.step} started`)
      continue
    }
    if (job.state !== 'running') continue
    if (job.cancelRequested) {
      job.state = 'cancelled'
      job.cancelRequested = false
      job.updatedAt = iso()
      log(job, 'Cancelled', 'warning')
      continue
    }
    const steps = KINDS[job.kind]!.steps
    job.ticks++
    const total = 8
    if (job.ticks < total) {
      log(job, `${job.step}: part ${job.ticks}/${total}`, 'info', { done: job.ticks, total, unit: 'parts' })
      continue
    }
    job.ticks = 0
    const i = steps.indexOf(job.step!)
    log(job, `Step ${job.step} finished`)
    job.updatedAt = iso()
    if (i + 1 >= steps.length) {
      job.state = 'done'
      job.step = null
      log(job, 'Job done')
      if (job.kind === 'bot_chat' && job.vodId) botChats.set(job.vodId, fakeBotChat(job.vodId))
      if (job.kind === 'bot_chat_backfill') queuedBy.push(job)
    } else {
      job.step = steps[i + 1]!
      if (job.pauseNext || job.pauseBefore?.includes(job.step)) {
        job.state = 'paused'
        job.pauseNext = false
        log(job, `Paused before ${job.step}`, 'warning')
      } else log(job, `Step ${job.step} started`)
    }
  }
  // Like the worker's backfill: one bot_chat run per VOD without bot chat, queued by the backfill.
  for (const parent of queuedBy) {
    const ids = [...vods.keys()].filter((id) => !botChats.has(id)).slice(0, 4)
    for (const vodId of ids.length ? ids : ['2312345678', '2311111111']) {
      const child = add('bot_chat', vodId, 'queued', 0, 0, { parentId: parent.id, payload: { backfill: true }, actor: childActor(parent) })
      log(parent, `queued bot chat for ${vodId}: job ${child.id}`)
    }
  }
}

/** GET /api/v2/jobs' shape (vex-platform JobOut); inside, the mock keeps v1's names. */
const v2Job = (j: Job) => {
  const finished = ['done', 'failed', 'cancelled'].includes(j.state)
  return {
    id: j.id, kind: j.kind, subject: j.vodId ? `vod:${j.vodId}` : null, scope: null, parent_id: j.parentId ?? null,
    state: j.state === 'done' ? 'succeeded' : j.state, step: j.step, steps: KINDS[j.kind]!.steps, payload: j.payload,
    attempts: j.attempts, last_error: j.lastError, not_before: j.notBefore, pause_before: j.pauseBefore, pause_next: j.pauseNext,
    cancel_requested: j.cancelRequested, actor: j.actor, created_at: j.createdAt, updated_at: j.updatedAt,
    started_at: j.state === 'queued' && j.attempts <= 1 ? null : j.createdAt, finished_at: finished ? j.updatedAt : null,
  }
}
const v2State = (s: string): State => (s === 'succeeded' ? 'done' : (s as State))
const counts = () => Object.fromEntries(STATES.map((s) => [s, jobs.filter((j) => j.state === s).length]))

// ---- sessions ----
type User = { id: string; login: string; displayName: string; avatar: null; color: string }
const sessions = new Map<string, { csrf: string; expires: number; user: User | null }>()
const TWITCH_ADMIN: User = { id: '42', login: 'vexoulz', displayName: 'vexoulz', avatar: null, color: '#9146FF' }
const COOKIE = 'archive_admin'
const failures: number[] = []

function sessionOf(req: IncomingMessage) {
  const m = /(?:^|;\s*)archive_admin=([^;]+)/.exec(req.headers.cookie ?? '')
  const s = m ? sessions.get(m[1]!) : undefined
  return s && s.expires > Date.now() ? { token: m![1]!, ...s } : null
}

function newSession(user: User | null) {
  const token = randomBytes(24).toString('hex')
  sessions.set(token, { csrf: randomBytes(16).toString('hex'), expires: Date.now() + 8 * 3600_000, user })
  return token
}
const sessionCookie = (token: string) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`
const sessionJson = (s: ReturnType<typeof sessionOf>) => ({
  authenticated: !!s, csrf: s?.csrf ?? null, expiresAt: s ? new Date(s.expires).toISOString() : null,
  passwordLogin: true, twitchLogin: true, user: s?.user ?? null,
})

/** The body as sent, for routes that don't take JSON (a tag's SVG). */
const rawBodies = new WeakMap<IncomingMessage, string>()
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  rawBodies.set(req, raw)
  if (!/json/.test(req.headers['content-type'] ?? 'json')) return {}
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function send(res: ServerResponse, status: number, data?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(data === undefined ? undefined : JSON.stringify(data))
}
const fail = (res: ServerResponse, status: number, msg: string) => send(res, status, { error: true, msg })
/** vex-platform's errors: RFC 9457 problem details. */
const problem = (res: ServerResponse, status: number, code: string, detail: string, errors?: Record<string, unknown>[]) =>
  send(res, status, { type: 'about:blank', title: code, status, detail, code, ...(errors ? { errors } : {}) }, { 'content-type': 'application/problem+json' })
const ok = (res: ServerResponse, msg: string, job?: Job) => send(res, 200, { error: false, msg, jobId: job?.id })

// ---- VODs: real ones from the public archive API, edited in memory ----
type Json = Record<string, any>
const vods = new Map<string, Json>()
const deleted = new Set<string>()
const locked = new Set<string>()
/** vods.bot_chat, set when a mock bot_chat job finishes. */
const botChats = new Map<string, Json>()
function fakeBotChat(vodId: string): Json {
  const now = Date.now()
  const odd = Number(vodId.slice(-1)) % 2 === 1
  return {
    fetched_at: new Date(now).toISOString(),
    keyed: odd,
    rows: 1000 + (Number(vodId.slice(-4)) % 5000),
    coverage: { gaps: odd ? [] : [{ from: now - 3_600_000, to: now - 3_540_000, reason: 'reconnect' }] },
  }
}
const emoteRows = new Map<string, Json | null>()
/** vods.hidden: the mock's public API answers 404 for these. */
const hidden = new Set<string>()
/** Games rows edited in the mock, by VOD id (the rest come from the public API). */
const gameRows = new Map<string, Json[]>()
const audit: Json[] = []
let auditId = 0

async function publicJson(api: string, path: string): Promise<unknown> {
  const res = await fetch(`${api}${path}`)
  if (!res.ok) throw new Error(`public API ${res.status}`)
  return res.json()
}

/** The list's `firstLiveAt` / `lastLiveAt` filters (vEXOULZ/twitch-archive#57) until the public API has them: the
 * rest of the query from the public API, unpaged, then filtered and paged here. A regular VOD's are its createdAt. */
async function liveFiltered(api: string, rawUrl: string, res: ServerResponse) {
  const url = new URL(rawUrl, 'http://x')
  const range = { firstLiveAt: {} as Record<string, number>, lastLiveAt: {} as Record<string, number> }
  const rest = new URLSearchParams()
  for (const [k, v] of url.searchParams) {
    const m = /^(firstLiveAt|lastLiveAt)\[(\$gte|\$lt)\]$/.exec(k)
    if (m) range[m[1] as keyof typeof range][m[2]!] = Date.parse(v)
    else if (k !== '$limit' && k !== '$skip') rest.append(k, v)
  }
  const limit = Number(url.searchParams.get('$limit') ?? 20)
  const skip = Number(url.searchParams.get('$skip') ?? 0)
  rest.set('$limit', '500')
  try {
    const all = ((await publicJson(api, `/vods?${rest}`)) as { data: Json[] }).data
    const at = (v: Json, f: keyof typeof range) => Date.parse(((v.synthetic as Json | null)?.[f] as string) ?? (v.createdAt as string))
    const inRange = (v: Json, f: keyof typeof range) =>
      (range[f].$gte == null || at(v, f) >= range[f].$gte) && (range[f].$lt == null || at(v, f) < range[f].$lt)
    const found = all.filter((v) => inRange(v, 'firstLiveAt') && inRange(v, 'lastLiveAt'))
    return send(res, 200, { total: found.length, limit, skip, data: found.slice(skip, skip + limit) })
  } catch (e) {
    return send(res, 502, { name: 'BadGateway', message: String(e), code: 502 })
  }
}

async function vodOf(api: string, id: string): Promise<Json | null> {
  if (!id || deleted.has(id)) return null
  const sv = synthetics.get(id)
  if (sv) return synthVod(sv)
  if (!vods.has(id)) {
    try {
      vods.set(id, (await publicJson(api, `/vods/${encodeURIComponent(id)}`)) as Json)
    } catch {
      return null
    }
  }
  return vods.get(id)!
}

// Synthetic VODs: windows of real ones, placed on their own timeline.
type Synth = { id: string; title: string | null; supersedes: boolean; tags: string[]; created_at: string | null; made_at: string; changed_at: string; segments: Json[] }
const synthetics = new Map<string, Synth>()
const synthLen = (sv: Synth) => sv.segments.reduce((n, g) => Math.max(n, g.at + g.end - g.start), 0)
const syntheticView = (sv: Synth) => ({ ...sv, hidden: hidden.has(sv.id), duration: hms(synthLen(sv)) })
/** The synthetic VOD as /admin/vods/{id} and the v2 list show it. */
const synthVod = (sv: Synth): Json => ({
  id: sv.id, title: sv.title, createdAt: sv.created_at, duration: hms(synthLen(sv)), duration_seconds: synthLen(sv),
  thumbnail_url: null, stream_id: null, tags: sv.tags, chapters: [], youtube: [], drive: [], games: [],
  synthetic: { supersedes: sv.supersedes, segments: sv.segments.map((g) => ({ vodId: g.vod_id, start: g.start, end: g.end, at: g.at, label: g.label })) },
})
/** Checks a POST or PUT body the way the worker does, filling start/end/at from the sources. */
async function buildSynthetic(api: string, id: string, b: Json, was: Synth | null): Promise<Synth | { status: number; code: string; error: string }> {
  const raw = Array.isArray(b.segments) ? (b.segments as Json[]) : []
  if (!raw.length) return { status: 422, code: 'invalid_synthetic', error: 'It needs at least one segment.' }
  const segments: Json[] = []
  let at = 0
  let first: Json | null = null
  for (const [i, g] of raw.entries()) {
    const src = await vodOf(api, String(g.vod_id ?? ''))
    if (!src) return { status: 404, code: 'vod_not_found', error: `Segment ${i + 1}: no VOD ${g.vod_id}.` }
    first ??= src
    const start = g.start ?? 0
    const end = g.end ?? durOf(src)
    if (end <= start) return { status: 422, code: 'invalid_synthetic', error: `Segment ${i + 1}: the end must come after the start.` }
    const place = g.at ?? at
    segments.push({ vod_id: String(src.id), start, end, at: place, label: g.label ?? null, stream: String(src.stream_id ?? src.id) })
    at = place + end - start
  }
  const now = iso()
  return {
    id, title: (b.title as string | null) ?? null, supersedes: !!b.supersedes, tags: (b.tags as string[]) ?? [],
    created_at: first!.createdAt ?? null, made_at: was?.made_at ?? now, changed_at: now, segments,
  }
}

async function listVods(api: string, sp: URLSearchParams, before: string | null) {
  const q = (sp.get('q') ?? '').trim()
  const limit = Math.min(Number(sp.get('limit')) || 30, 200)
  const want = sp.get('hidden')
  const beforeAt = before ? (await vodOf(api, before))?.createdAt : null
  const params = [`$limit=${limit + 1}`, '$sort[createdAt]=-1']
  if (beforeAt) params.push(`createdAt[$lt]=${encodeURIComponent(beforeAt)}`)
  let found: Json[]
  if (/^\d+$/.test(q)) {
    const one = await vodOf(api, q)
    found = one ? [one] : []
  } else {
    if (q) params.push(`title=${encodeURIComponent(q)}`)
    found = ((await publicJson(api, `/vods?${params.join('&')}`)) as { data: Json[] }).data
  }
  // Hidden VODs are gone from the public API: the mock adds back the ones it hid (on the first page).
  const extra = before ? [] : [...hidden].map((h) => vods.get(h)).filter((v): v is Json => !!v && !found.some((f) => String(f.id) === String(v.id)))
  const rows = [...found.map((v) => vods.get(String(v.id)) ?? v), ...extra]
    .filter((v) => !deleted.has(String(v.id)))
    .filter((v) => (want === 'true' ? hidden.has(String(v.id)) : want === 'false' ? !hidden.has(String(v.id)) : true))
    .filter((v) => !q || /^\d+$/.test(q) || String(v.title ?? '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, c) => Date.parse(c.createdAt) - Date.parse(a.createdAt))
  const page = rows.slice(0, limit)
  return { page, more: found.length > limit && page.length > 0 }
}

const adminVod = (v: Json) => ({
  ...v,
  hidden: hidden.has(String(v.id)),
  chaptersLocked: locked.has(String(v.id)),
  botChat: botChats.get(String(v.id)) ?? null,
  splices: splicesOf(String(v.id)),
})

const hms = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s % 60)].map((n) => String(n).padStart(2, '0')).join(':')
const secondsOf = (hhmmss: unknown) => String(hhmmss ?? '0').split(':').reduce((t, p) => t * 60 + Number(p), 0)

/** Same checks as the worker's vod_edits.chapters. */
function checkChapters(items: unknown, duration: number): Json[] {
  if (!Array.isArray(items)) throw new Error('chapters must be a list')
  let prevStart: number | null = null
  let prevEnd: number | null = null
  return items.map((c: Json, i) => {
    const where = `chapters[${i}]`
    const start = Number(c.start), length = Number(c.length)
    if (!(start >= 0)) throw new Error(`${where}.start must be a number of seconds >= 0`)
    if (!(length > 0)) throw new Error(`${where}.length must be a number of seconds > 0`)
    if (prevStart != null && start < prevStart) throw new Error(`${where} starts before chapters[${i - 1}]; sort chapters by start`)
    if (prevEnd != null && start < prevEnd - 0.001) throw new Error(`${where} starts at ${start}s, inside chapters[${i - 1}] (which ends at ${prevEnd}s)`)
    if (duration > 0 && start + length > duration + 1) throw new Error(`${where} ends at ${start + length}s, after the end of the VOD (${duration}s)`)
    prevStart = start
    prevEnd = start + length
    const t = (c.imageTemplate as string | null) ?? null
    return {
      gameId: c.gameId ?? null, name: c.name ?? null, image: t ? t.replace('{width}', '40').replace('{height}', '53') : null,
      imageTemplate: t, duration: hms(start), start, end: length, length, restricted: !!c.restricted,
      ...(c.kind === 'gap' ? { kind: 'gap' } : {}),
    }
  })
}

// ---- merges and splits (twitch-archive's splices.py, simplified: one upload type, no chat or games rows) ----
interface SpliceRow {
  id: number; kind: 'merge' | 'split'; vodId: string; otherId: string; offset: number; gap: number | null
  detail: Json; createdAt: string; undoneAt: string | null
  before: Record<string, Json | null>; after: Record<string, string>
}
const splices: SpliceRow[] = []
/** VODs whose rows a splice changed: the public side (`/backend/vods/:id`) answers these from here. */
const spliced = new Set<string>()
const GAP_NAME = 'Technical difficulties'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const durOf = (v: Json) => Number(v.duration_seconds) || secondsOf(v.duration)
const setDur = (v: Json, s: number) => ((v.duration = hms(s)), (v.duration_seconds = s))
const chapterLen = (c: Json) => Number(c.length ?? c.end) || 0
const touches = (o: SpliceRow, sp: SpliceRow) => [o.vodId, o.otherId].some((x) => x === sp.vodId || x === sp.otherId)
const laterThan = (sp: SpliceRow) => splices.filter((o) => !o.undoneAt && o.id > sp.id && touches(o, sp))

function spliceJson(sp: SpliceRow) {
  const { before: _b, after: _a, ...rest } = sp
  return { ...rest, undoable: !sp.undoneAt && laterThan(sp).length === 0 }
}
const splicesOf = (id: string) => splices.filter((sp) => sp.vodId === id || sp.otherId === id).map(spliceJson)
const played = (v: Json) => (((v.youtube as Json[]) ?? []).some((u) => u.type === 'live') ? 'live' : 'vod')

/** Where each part of the played type ends, in VOD time (the site's model: delay at the start, cuts skipped). */
function partEnds(v: Json): { at: number; from: number; to: number }[] {
  const type = played(v)
  const parts = ((v.youtube as Json[]) ?? []).filter((u) => u.type === type).sort((a, b) => a.part - b.part)
  const cuts = ((v.chapters as Json[]) ?? []).filter((c) => c.restricted).map((c) => ({ start: Number(c.start), end: Number(c.start) + chapterLen(c) }))
  const total = parts.reduce((t, u) => t + (Number(u.duration) || 0), 0)
  const delay = Math.max(0, durOf(v) - total - cuts.reduce((t, c) => t + c.end - c.start, 0))
  const out: { at: number; from: number; to: number }[] = []
  let u = 0
  for (const part of parts.slice(0, -1)) {
    u += Number(part.duration) || 0
    let t = u + delay
    for (const c of cuts) if (c.start < t - 0.5) t += c.end - c.start
    const cut = cuts.find((c) => Math.abs(c.start - t) < 1)
    out.push({ at: Math.round(t), from: Math.round(t), to: Math.round(cut ? cut.end : t) })
  }
  return out
}

function recordSplice(kind: SpliceRow['kind'], a: Json, b: Json, offset: number, gap: number | null, before: SpliceRow['before'], detail: Json = {}) {
  const sp: SpliceRow = {
    id: splices.length + 1, kind, vodId: String(a.id), otherId: String(b.id), offset, gap, detail: { offset, gap, ...detail },
    createdAt: iso(), undoneAt: null, before, after: { [a.id]: JSON.stringify(a), [b.id]: JSON.stringify(b) },
  }
  splices.push(sp)
  spliced.add(String(a.id))
  spliced.add(String(b.id))
  locked.add(String(a.id))
  return sp
}

const spliceError = (status: number, msg: string, extra: Json = {}) => Object.assign(new Error(msg), { status, extra })

function mergeVods(a: Json, b: Json, gapIn: unknown) {
  if (a.id === b.id) throw spliceError(400, 'A VOD cannot be merged with itself')
  if (a.merged_into || b.merged_into) throw spliceError(409, `${a.merged_into ? a.id : b.id} is already merged into another VOD`)
  if (Date.parse(b.createdAt) < Date.parse(a.createdAt)) throw spliceError(409, `${b.id} started before ${a.id}; merge the later VOD into the earlier one`)
  const aDur = durOf(a)
  const measured = Math.round((Date.parse(b.createdAt) - Date.parse(a.createdAt)) / 1000) - aDur
  if (gapIn == null && measured < 0) throw spliceError(409, `The VODs overlap by ${-measured}s; pass gap to set the real one`)
  const gap = gapIn == null ? measured : Number(gapIn)
  if (!(gap >= 0) || !Number.isInteger(gap)) throw spliceError(400, 'gap must be a whole number of seconds >= 0')
  const before = { [a.id]: clone(a), [b.id]: clone(b) }
  const offset = aDur + gap
  const shift = (c: Json) => ({ ...c, start: Number(c.start) + offset })
  const gapChapter = gap > 0 ? [{ name: GAP_NAME, gameId: null, image: null, imageTemplate: null, duration: hms(aDur), start: aDur, end: gap, length: gap, restricted: true, kind: 'gap' }] : []
  a.chapters = [...((a.chapters as Json[]) ?? []), ...gapChapter, ...((b.chapters as Json[]) ?? []).map(shift)]
  const count: Record<string, number> = {}
  a.youtube = [...((a.youtube as Json[]) ?? []), ...((b.youtube as Json[]) ?? [])].map((u) => ({ ...u, part: (count[u.type] = (count[u.type] ?? 0) + 1) }))
  a.drive = [...((a.drive as Json[]) ?? []), ...((b.drive as Json[]) ?? [])]
  setDur(a, offset + durOf(b))
  Object.assign(b, { chapters: [], youtube: [], drive: [], games: [], merged_into: { id: a.id, offset } })
  return recordSplice('merge', a, b, offset, gap, before, { playedType: played(a) })
}

function splitVod(a: Json, at: number) {
  if (a.merged_into) throw spliceError(409, `${a.id} is already merged into ${a.merged_into.id}`)
  const join = splices.findLast((sp) => sp.kind === 'merge' && !sp.undoneAt && sp.vodId === a.id && at >= sp.offset - (sp.gap ?? 0) - 2 && at <= sp.offset + 2)
  if (join) return { undid: undo(join, false) }
  const ends = partEnds(a)
  const hit = ends.find((p) => at >= p.from - 2 && at <= p.to + 2)
  if (!hit) {
    const validPoints = [...ends].sort((x, y) => Math.abs(x.at - at) - Math.abs(y.at - at)).slice(0, 4)
    throw spliceError(409, `${hms(at)} is inside an upload; split where one part ends and the next starts`, { validPoints })
  }
  const cut = Math.round(at)
  let n = 2
  while (vods.has(`${a.id}-${n}`) && !deleted.has(`${a.id}-${n}`)) n++
  const id = `${a.id}-${n}`
  const before: Record<string, Json | null> = { [a.id]: clone(a), [id]: null }
  const type = played(a)
  const parts = ((a.youtube as Json[]) ?? []).filter((u) => u.type === type)
  const idx = ends.indexOf(hit) + 1
  const b: Json = {
    ...clone(a), id, createdAt: new Date(Date.parse(a.createdAt) + cut * 1000).toISOString(),
    chapters: ((a.chapters as Json[]) ?? []).filter((c) => Number(c.start) + chapterLen(c) > cut).map((c) => {
      const start = Math.max(0, Number(c.start) - cut)
      const length = Number(c.start) + chapterLen(c) - cut - start
      return { ...c, start, end: length, length }
    }),
    youtube: parts.slice(idx).map((u, i) => ({ ...u, part: i + 1 })), drive: [], games: [],
  }
  setDur(b, durOf(a) - cut)
  a.chapters = ((a.chapters as Json[]) ?? []).filter((c) => Number(c.start) < cut).map((c) => {
    const length = Math.min(chapterLen(c), cut - Number(c.start))
    return { ...c, end: length, length }
  })
  a.youtube = parts.slice(0, idx)
  setDur(a, cut)
  vods.set(id, b)
  deleted.delete(id)
  return { splice: recordSplice('split', a, b, cut, null, before), newVodId: id }
}

function undo(sp: SpliceRow, force: boolean) {
  const later = laterThan(sp).at(-1)
  if (later) throw spliceError(409, `${later.vodId} was ${later.kind === 'merge' ? 'merged with' : 'split into'} ${later.otherId} since (splice ${later.id}); undo that first`)
  const edited = Object.entries(sp.after).flatMap(([id, was]) => {
    const now = vods.get(id)
    if (!now) return []
    const old = JSON.parse(was) as Json
    return ['title', 'chapters', 'youtube', 'duration'].filter((k) => JSON.stringify(now[k]) !== JSON.stringify(old[k])).map((k) => `${id}.${k}`)
  })
  if (edited.length && !force)
    throw spliceError(409, `Edited since the ${sp.kind}: ${edited.join(', ')}. Undoing it restores the rows as they were before, losing those edits; pass force to do it anyway`, { edited })
  for (const [id, row] of Object.entries(sp.before)) {
    if (row) vods.set(id, clone(row))
    else deleted.add(id)
  }
  sp.undoneAt = iso()
  return spliceJson(sp)
}

// ---- runtime settings (the worker's runtime_settings.ENTRIES) ----
interface SettingSpec { key: string; type: string; group: string; applies: string; help: string; default: unknown; min?: number; max?: number }
const SETTINGS: SettingSpec[] = [
  { key: 'vod_download', type: 'bool', group: 'Capture', applies: 'now', help: "Archive every stream's Twitch VOD", default: true },
  { key: 'chat_download', type: 'bool', group: 'Capture', applies: 'next job', help: 'Save the chat replay', default: true },
  { key: 'live_record', type: 'bool', group: 'Capture', applies: 'now', help: 'Record the live stream itself', default: true },
  { key: 'multi_track', type: 'bool', group: 'Capture', applies: 'now', help: 'Upload both the VOD copy and the live copy', default: false },
  { key: 'monitor_interval_seconds', type: 'int', group: 'Capture', applies: 'now', help: 'How often Twitch is checked for a live stream', default: 60, min: 5, max: 3600 },
  { key: 'youtube_upload', type: 'bool', group: 'YouTube', applies: 'next job', help: 'Upload to YouTube', default: true },
  { key: 'youtube_public', type: 'bool', group: 'YouTube', applies: 'next job', help: 'Public instead of unlisted (for the main copy)', default: false },
  { key: 'youtube_description', type: 'text', group: 'YouTube', applies: 'next job', help: 'Last line of every description', default: 'Archived by vods.vexoul.net' },
  { key: 'youtube_keepalive_hours', type: 'float', group: 'YouTube', applies: 'now', help: 'How often the YouTube token is refreshed (from the next refresh)', default: 72, min: 1, max: 720 },
  { key: 'restricted_games', type: 'list', group: 'Pipeline', applies: 'next job', help: 'Chapters of these games are left out of uploads', default: ['Music'] },
  { key: 'split_duration', type: 'int', group: 'Pipeline', applies: 'next job', help: 'Maximum YouTube part length in seconds', default: 43200, min: 600, max: 43200 },
  { key: 'keep_hls', type: 'bool', group: 'Pipeline', applies: 'next job', help: 'Keep the HLS segments after upload', default: false },
  { key: 'keep_mp4', type: 'bool', group: 'Pipeline', applies: 'next job', help: 'Keep the MP4 after upload', default: false },
  { key: 'manual_steps', type: 'steps', group: 'Pipeline', applies: 'now', help: "Steps a job pauses before until resumed, per job kind (a job's own list wins)", default: {} },
  { key: 'runner_concurrency', type: 'int', group: 'Runner', applies: 'now', help: 'Jobs run at once', default: 2, min: 1, max: 16 },
  { key: 'max_attempts', type: 'int', group: 'Runner', applies: 'now', help: 'Tries of a failing step before its job fails', default: 3, min: 1, max: 10 },
]
const overrides = new Map<string, { value: unknown; updatedAt: string; updatedBy: string }>()
const settingsJson = () =>
  SETTINGS.map((e) => {
    const o = overrides.get(e.key)
    return {
      key: e.key, value: o ? o.value : e.default, default: e.default, overridden: !!o, type: e.type, group: e.group, applies: e.applies,
      help: e.help, min: e.min ?? null, max: e.max ?? null, updatedAt: o?.updatedAt ?? null, updatedBy: o?.updatedBy ?? null,
      ...(e.type === 'steps' ? { choices: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.steps])) } : {}),
    }
  })
function checkSetting(key: string, v: unknown): string | null {
  const e = SETTINGS.find((x) => x.key === key)
  if (!e) return `No setting ${key}`
  const range = (n: number) => ((e.min != null && n < e.min) || (e.max != null && n > e.max) ? `${key} must be between ${e.min} and ${e.max}` : null)
  switch (e.type) {
    case 'bool': return typeof v === 'boolean' ? null : `${key} must be true or false`
    case 'int': return typeof v === 'number' && Number.isInteger(v) ? range(v) : `${key} must be a whole number`
    case 'float': return typeof v === 'number' && Number.isFinite(v) ? range(v) : `${key} must be a number`
    case 'text': return typeof v === 'string' && v.length <= 500 ? null : `${key} must be text of at most 500 characters`
    case 'list': return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim()) ? null : `${key} must be a list of names`
    case 'steps': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return `${key} must map job kinds to lists of steps`
      for (const [kind, steps] of Object.entries(v as Json)) {
        if (!KINDS[kind]) return `Unknown job kind ${kind}`
        if (!Array.isArray(steps)) return `${key}.${kind} must be a list of steps`
        const bad = steps.find((x) => !KINDS[kind]!.steps.includes(x))
        if (bad) return `${kind} has no step ${bad}`
      }
      return null
    }
  }
  return null
}

// ---- site tags (docs/admin-api.md, "Site tags"); MOCK_SITE_TAGS=no answers 404, like an archive without them ----
interface SiteTag {
  name: string; label: string; drawn: boolean; color: string | null; width: number | null; height: number | null
  text: string | null; textColor: string | null; textSize: number | null; textX: number | null; textY: number | null; textRotate: number | null
  pattern: 'stripes' | 'checks' | null; patternColor: string | null; patternSize: number | null
}
const NO_TEXT = { text: null, textColor: null, textSize: null, textX: null, textY: null, textRotate: null, pattern: null, patternColor: null, patternSize: null }
let siteTags: SiteTag[] = [
  { name: 'new', label: 'new', drawn: true, color: 'var(--vods-tag-new)', width: null, height: null, ...NO_TEXT },
  { name: 'updated', label: 'updated', drawn: true, color: 'var(--vods-tag-updated)', width: null, height: null, ...NO_TEXT },
  { name: 'complete', label: 'complete', drawn: true, color: 'var(--vods-tag-complete)', width: null, height: null, ...NO_TEXT },
  { name: 'compilation', label: 'playthrough', drawn: false, color: null, width: null, height: null, ...NO_TEXT },
]
/** Cleaned SVGs by tag name, with the hash that versions their URL. */
const tagShapes = new Map<string, { svg: string; v: string }>()
let tagsChanged: { at: string; by: string } | null = null
const siteTagsOff = () => process.env.MOCK_SITE_TAGS === 'no'
const siteTagsJson = (admin: boolean) => ({
  tags: siteTags.map((t) => {
    const sh = tagShapes.get(t.name)
    return { ...t, shape: sh ? `v1/site/tags/${t.name}.svg?v=${sh.v}` : null }
  }),
  ...(admin ? { updatedAt: tagsChanged?.at ?? null, updatedBy: tagsChanged?.by ?? null } : {}),
})
function checkTags(list: unknown): SiteTag[] | string {
  if (!Array.isArray(list) || list.length > 32) return 'tags must be a list of at most 32'
  const seen = new Set<string>()
  const out: SiteTag[] = []
  for (const t of list as Json[]) {
    if (!t || typeof t.name !== 'string' || !TAG_NAME.test(t.name)) return `Bad tag name ${JSON.stringify(t?.name)}`
    if (seen.has(t.name)) return `${t.name} is listed twice`
    seen.add(t.name)
    if (typeof t.label !== 'string' || !t.label.trim() || t.label.length > 40) return `${t.name}: label must be 1–40 characters`
    if (typeof t.drawn !== 'boolean') return `${t.name}: drawn must be true or false`
    if (t.color != null && (typeof t.color !== 'string' || !isTagColor(t.color))) return `${t.name}: not a color the site takes`
    for (const k of ['width', 'height'] as const) {
      if (t[k] != null && !(Number.isInteger(t[k]) && t[k] >= 8 && t[k] <= 200)) return `${t.name}: ${k} must be 8–200`
    }
    const text = t.text == null ? null : typeof t.text === 'string' ? t.text.trim() : undefined
    if (text === undefined || text === '' || (text && text.length > 24)) return `${t.name}: text must be 1–24 characters, or null`
    if (t.textColor != null && (typeof t.textColor !== 'string' || !isTagColor(t.textColor))) return `${t.name}: textColor is not a color the site takes`
    if (t.textSize != null && !(Number.isInteger(t.textSize) && t.textSize >= 6 && t.textSize <= 48)) return `${t.name}: textSize must be 6–48`
    for (const k of ['textX', 'textY'] as const) {
      if (t[k] != null && !(Number.isInteger(t[k]) && t[k] >= -100 && t[k] <= 100)) return `${t.name}: ${k} must be -100 to 100`
    }
    if (t.pattern != null && t.pattern !== 'stripes' && t.pattern !== 'checks') return `${t.name}: pattern must be stripes, checks or null`
    if (t.patternColor != null && (typeof t.patternColor !== 'string' || !isTagColor(t.patternColor))) return `${t.name}: patternColor is not a color the site takes`
    if (t.patternSize != null && !(Number.isInteger(t.patternSize) && t.patternSize >= 2 && t.patternSize <= 40)) return `${t.name}: patternSize must be 2–40`
    if (t.textRotate != null && !(Number.isInteger(t.textRotate) && t.textRotate >= -180 && t.textRotate <= 180)) return `${t.name}: textRotate must be -180 to 180`
    const pattern = t.pattern ? { pattern: t.pattern, patternColor: t.patternColor ?? null, patternSize: t.patternSize ?? null } : { pattern: null, patternColor: null, patternSize: null }
    const style = text ? { textColor: t.textColor ?? null, textSize: t.textSize ?? null, textX: t.textX ?? null, textY: t.textY ?? null, textRotate: t.textRotate ?? null } : NO_TEXT
    out.push({ name: t.name, label: t.label.trim(), drawn: t.drawn, color: t.color ?? null, width: t.width ?? null, height: t.height ?? null, ...style, text, ...pattern })
  }
  const gone = ['new', 'updated', 'compilation'].find((name) => !seen.has(name))
  if (gone) return `${gone} is set automatically and can't be removed`
  return out
}
/**
 * A rough stand-in for the archive's SVG cleaning: refuses what that would strip (scripts, handlers, outside
 * references, entities, embedded images). The archive parses it and keeps an allow-list instead; see the contract.
 */
function cleanSvg(svg: string): string | null {
  const t = svg.trim()
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t) || !/<\/svg>\s*$/i.test(t)) return null
  if (/<!(DOCTYPE|ENTITY)|<script|<foreignObject|<iframe|<image|\son\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)|@import/i.test(t)) return null
  return t
}

// ---- storage: made-up folders under vods/ and live/ ----
interface Folder { area: 'vods' | 'live'; name: string; bytes: number; files: number; ageH: number }
const GB = 1024 ** 3
const folders: Folder[] = [
  { area: 'vods' as const, name: '2311111111', bytes: 18.4 * GB, files: 12, ageH: 3 },
  { area: 'vods' as const, name: '2309876543', bytes: 42.1 * GB, files: 31, ageH: 72 },
  { area: 'vods' as const, name: '9999999901', bytes: 7.2 * GB, files: 4, ageH: 400 },
  { area: 'live' as const, name: '318204917655', bytes: 23.9 * GB, files: 1804, ageH: 1 },
  { area: 'live' as const, name: '318100000001', bytes: 11.5 * GB, files: 902, ageH: 900 },
  { area: 'vods' as const, name: '2300000002', bytes: 512 * 1024 ** 2, files: 2, ageH: 1500 },
].map((f) => ({ ...f, bytes: Math.round(f.bytes) }))
/** Not finished yet: queued, running or paused. */
const isActive = (j: { state: State }) => j.state === 'queued' || j.state === 'running' || j.state === 'paused'
const activeJobsFor = (name: string) => jobs.filter((j) => j.vodId === name && isActive(j))
function storageJson() {
  const used = folders.reduce((t, f) => t + f.bytes, 0) + 120 * GB
  const job = (j: Job) => ({ id: j.id, kind: j.kind, state: j.state, step: j.step, updatedAt: j.updatedAt })
  return {
    disk: { total: 500 * GB, used, free: 500 * GB - used },
    folders: folders.map((f) => {
      const known = vods.get(f.name)
      // Folders named 23… stand for VODs the archive has; the others are left over.
      const vod = f.area === 'vods' ? (known ? { id: String(known.id), title: known.title ?? null } : f.name.startsWith('23') ? { id: f.name, title: `Stream ${f.name}` } : null) : null
      const active = activeJobsFor(f.name)
      const last = jobs.filter((j) => j.vodId === f.name).sort((a, c) => c.id - a.id)[0] ?? null
      return {
        area: f.area, name: f.name, path: `${f.area}/${f.name}`, bytes: f.bytes, files: f.files, modifiedAt: iso(f.ageH * 3600_000),
        vod: vod ? { ...vod, hidden: hidden.has(f.name) } : null,
        jobs: { active: active.map(job), last: last ? job(last) : null },
        stale: !active.length && (!vod || !!(last && ['failed', 'cancelled'].includes(last.state))),
      }
    }),
    cacheSeconds: 30,
  }
}

export function adminMock(base = '/backend-admin', publicApi = 'https://vods.vexoul.net/backend'): Plugin {
  return {
    name: 'vods-admin-mock',
    apply: 'serve',
    configureServer(server) {
      const timer = setInterval(advance, 2000)
      timer.unref()
      server.httpServer?.on('close', () => clearInterval(timer))
      // The public API reads the same rows: VODs a mock merge or split changed answer from here.
      server.middlewares.use('/backend', (req, res, next) => {
        const tagsPath = (req.url ?? '').split('?')[0]!
        if (tagsPath === '/v1/site/tags' && !siteTagsOff()) return send(res, 200, siteTagsJson(false))
        const shm = /^\/v1\/site\/tags\/([a-z0-9-]+)\.svg$/.exec(tagsPath)
        if (shm && !siteTagsOff()) {
          const sh = tagShapes.get(shm[1]!)
          if (!sh) return send(res, 404, { name: 'NotFound', message: 'No shape', code: 404 })
          res.writeHead(200, {
            'content-type': 'image/svg+xml', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          })
          return res.end(sh.svg)
        }
        if (tagsPath === '/vods' && /[?&](first|last)LiveAt%5B|[?&](first|last)LiveAt\[/.test(req.url ?? '')) return liveFiltered(publicApi, req.url!, res)
        const pm = /^\/vods\/([^/?]+)(?:\?.*)?$/.exec(req.url ?? '')
        const id = pm ? decodeURIComponent(pm[1]!) : ''
        if (pm && hidden.has(id)) return send(res, 404, { name: 'NotFound', message: 'No record found', code: 404 })
        if (!pm || !spliced.has(id)) return next()
        if (deleted.has(id)) return send(res, 404, { name: 'NotFound', message: 'No record found', code: 404 })
        const { chaptersLocked: _c, botChat: _b, splices: _s, hidden: _h, ...pub } = adminVod(vods.get(id)!)
        return send(res, 200, pub)
      })
      server.middlewares.use(base, async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const path = url.pathname
        const method = req.method ?? 'GET'
        const s = sessionOf(req)

        if (path === '/admin/session') {
          if (method === 'GET') return send(res, 200, sessionJson(s))
          if (method === 'POST') {
            const now = Date.now()
            while (failures.length && failures[0]! < now - 300_000) failures.shift()
            if (failures.length >= 5) return send(res, 429, { error: true, msg: 'Too many attempts' }, { 'retry-after': '300' })
            const { password } = await body(req)
            if (password !== 'admin') {
              failures.push(now)
              return fail(res, 401, 'Wrong password')
            }
            const token = newSession(null)
            return send(res, 200, sessionJson({ token, ...sessions.get(token)! }), { 'set-cookie': sessionCookie(token) })
          }
          if (method === 'DELETE') {
            if (s) sessions.delete(s.token)
            res.writeHead(204, { 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` })
            return res.end()
          }
        }

        // The worker goes through vexoulz-auth here; the mock signs the fake Twitch admin in straight away. A quiet
        // check (?quiet=1) comes back with admin=1, or admin=0 when MOCK_ADMIN_QUIET=no (a plain viewer).
        if (path === '/admin/signin' && method === 'GET') {
          let next = url.searchParams.get('next') ?? ''
          if (!next.startsWith('/') || next.startsWith('//')) next = '/manage'
          const quiet = url.searchParams.get('quiet') === '1'
          const yes = !quiet || process.env.MOCK_ADMIN_QUIET !== 'no'
          const headers: Record<string, string> = {}
          if (yes) headers['set-cookie'] = sessionCookie(newSession(TWITCH_ADMIN))
          if (quiet) {
            const back = new URL(next, 'http://x')
            back.searchParams.set('admin', yes ? '1' : '0')
            next = back.pathname + back.search + back.hash
          }
          res.writeHead(302, { location: next, ...headers })
          return res.end()
        }

        // The worker answers 403 for both a missing and an expired session.
        if (!s) return fail(res, 403, 'Session expired; log in again')
        if (method !== 'GET' && req.headers['x-csrf-token'] !== s.csrf) return fail(res, 403, 'Missing or wrong X-CSRF-Token')
        const b: Json = method === 'GET' ? {} : await body(req)
        if (method !== 'GET') {
          res.on('finish', () => {
            if (res.statusCode >= 400) return
            const am = /\/(?:admin|api\/v2)\/(vods|jobs)\/([^/]+)/.exec(path)
            const target = am ? `${am[1] === 'vods' ? 'vod' : 'job'}:${am[2]}` : b.vodId ? `vod:${b.vodId}` : typeof b.subject === 'string' ? b.subject : null
            // vex-platform names its own job actions (job.enqueue, job.pause…); the worker's v1 routes keep the route as the name.
            const jm = /^\/api\/v2\/jobs(?:\/\d+(?:\/(\w+))?)?$/.exec(path)
            const action = jm ? `job.${jm[1] ?? (method === 'PATCH' ? 'update' : 'enqueue')}` : `${method} ${path.replace(/\/\d+/g, '/{id}')}`
            // GET /api/v2/audit's shape (the worker names actions "vod.update" and so on; the mock keeps the route).
            audit.unshift({
              id: ++auditId, at: iso(), actor_kind: 'user', actor_id: s.user ? s.user.id : 'password', actor_login: s.user?.login ?? null,
              via: 'web', action, target, scope: null, outcome: 'ok',
              before: null, after: null, detail: Object.keys(b).length ? b : null, request_id: null, job_run_id: null,
            })
          })
        }

        if (path === '/admin/health' && method === 'GET')
          return send(res, 200, {
            worker: { ok: true, runningJobs: jobs.filter((j) => j.state === 'running').length, startedAt: iso(3 * 86400_000) },
            api: { ok: true },
            youtube: { authorized: true, valid: true, error: null, checkedAt: iso(4 * 60_000), channel: { id: 'UCmock', title: 'vexoul VODs', url: 'https://www.youtube.com/@vexoul' }, connectedAt: iso(3 * 86_400_000), refreshTokenExpiresAt: null },
            live: { live: false, streamId: null, startedAt: null },
            jobs: { counts: counts() },
          })
        if (path === '/admin/youtube/auth') return send(res, 200, { url: 'https://accounts.google.com/' })
        if (path === '/api/v2/job-kinds' && method === 'GET')
          return send(res, 200, Object.entries(KINDS).map(([name, k]) => ({
            name, description: k.description ?? '', steps: k.steps, pause_before: k.manualSteps,
            cancel_mode: k.cooperative ? 'cooperative' : 'interrupt', max_attempts: 3,
          })))

        // ---- VOD list (every VOD, hidden and merged ones too) ----
        if (path === '/admin/vods' && method === 'GET') {
          const before = url.searchParams.get('before')
          const { page, more } = await listVods(publicApi, url.searchParams, before)
          return send(res, 200, {
            data: page.map((v) => ({
              id: String(v.id), title: v.title ?? null, createdAt: v.createdAt, duration: v.duration, duration_seconds: durOf(v),
              thumbnail_url: v.thumbnail_url ?? null, stream_id: v.stream_id ?? null, hidden: hidden.has(String(v.id)), merged_into: v.merged_into?.id ?? null,
            })),
            next: more ? String(page[page.length - 1]!.id) : null,
          })
        }
        // v2: the same, with synthetic VODs (?synthetic=), snake_case and an opaque cursor (here, the last id).
        if (path === '/api/v2/vods' && method === 'GET') {
          const cursor = url.searchParams.get('cursor')
          const kind = url.searchParams.get('synthetic')
          const { page, more } =
            kind === 'true' ? { page: [] as Json[], more: false } : await listVods(publicApi, url.searchParams, cursor)
          const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
          const want = url.searchParams.get('hidden')
          const synth = cursor || kind === 'false' ? [] : [...synthetics.values()]
            .filter((sv) => !q || sv.id === q || String(sv.title ?? '').toLowerCase().includes(q))
            .filter((sv) => (want === 'true' ? hidden.has(sv.id) : want === 'false' ? !hidden.has(sv.id) : true))
            .map(synthVod)
          const items = [...synth, ...page].map((v) => ({
            id: String(v.id), title: v.title ?? null, created_at: v.createdAt, duration: v.duration ?? null, duration_seconds: durOf(v),
            thumbnail_url: v.thumbnail_url ?? null, stream_id: v.stream_id ?? null, hidden: hidden.has(String(v.id)),
            merged_into: v.merged_into ?? null, tags: v.tags ?? [], synthetic: v.synthetic ? { supersedes: v.synthetic.supersedes } : null,
          }))
          return send(res, 200, { items, next_cursor: more ? String(page[page.length - 1]!.id) : null })
        }

        // ---- synthetic VODs (/api/v2/synthetic) ----
        const sm = /^\/api\/v2\/synthetic(?:\/([^/]+))?$/.exec(path)
        if (sm) {
          const id = sm[1] ? decodeURIComponent(sm[1]) : null
          if (!id && method === 'POST') {
            const nid = String(b.id ?? '').trim()
            if (!nid || /^\d+$/.test(nid)) return problem(res, 422, 'invalid_synthetic', 'The id must not be only digits: those are Twitch VOD ids.')
            if (synthetics.has(nid) || vods.has(nid)) return problem(res, 409, 'synthetic_conflict', `${nid} already exists.`)
            const made = await buildSynthetic(publicApi, nid, b, null)
            if ('error' in made) return problem(res, made.status, made.code, made.error)
            synthetics.set(nid, made)
            return send(res, 201, syntheticView(made))
          }
          const sv = id ? synthetics.get(id) : undefined
          if (!sv) return problem(res, 404, 'vod_not_found', `No synthetic VOD ${id}.`)
          if (method === 'GET') return send(res, 200, syntheticView(sv))
          if (method === 'PUT') {
            const next = await buildSynthetic(publicApi, sv.id, { ...sv, ...b }, sv)
            if ('error' in next) return problem(res, next.status, next.code, next.error)
            synthetics.set(sv.id, next)
            return send(res, 200, syntheticView(next))
          }
          if (method === 'DELETE') {
            synthetics.delete(sv.id)
            return send(res, 200, syntheticView(sv))
          }
        }
        if (path === '/api/v2/playthrough-candidates' && method === 'GET') {
          const game = url.searchParams.get('game_id')
          if (!game) return problem(res, 422, 'invalid_request', 'game_id is required.')
          const recent = ((await publicJson(publicApi, '/vods?$limit=50&$sort[createdAt]=-1')) as { data: Json[] }).data
          const items = recent
            .filter((v) => !hidden.has(String(v.id)))
            .flatMap((v) =>
              ((v.chapters as Json[]) ?? [])
                .filter((c) => String(c.gameId) === game)
                .map((c) => {
                  const start = Number(c.start) || 0
                  const end = Number(c.end) || durOf(v)
                  const label = String(v.createdAt).slice(0, 10)
                  return { vod_id: String(v.id), title: v.title ?? null, created_at: v.createdAt, start, end, length: end - start, segment: { vod_id: String(v.id), start, end, label } }
                }),
            )
            .sort((a, c) => Date.parse(a.created_at) - Date.parse(c.created_at))
          return send(res, 200, { items })
        }

        // ---- runtime settings ----
        if (path === '/admin/settings' && method === 'GET') return send(res, 200, { data: settingsJson() })
        if (path === '/admin/settings' && method === 'PATCH') {
          if (!Object.keys(b).length) return fail(res, 400, 'Send at least one setting')
          for (const [k, v] of Object.entries(b)) {
            const problem = checkSetting(k, v)
            if (problem) return fail(res, 400, problem)
          }
          for (const [k, v] of Object.entries(b)) overrides.set(k, { value: v, updatedAt: iso(), updatedBy: s.user ? `twitch:${s.user.id}` : 'password' })
          return send(res, 200, { data: settingsJson() })
        }
        const setm = /^\/admin\/settings\/([\w-]+)$/.exec(path)
        if (setm && method === 'DELETE') {
          if (!SETTINGS.some((x) => x.key === setm[1])) return fail(res, 404, `No setting ${setm[1]}`)
          overrides.delete(setm[1]!)
          return send(res, 200, { data: settingsJson() })
        }

        // ---- site tags ----
        if (path.startsWith('/admin/site/tags') && siteTagsOff()) return fail(res, 404, 'Not found')
        const by = s.user ? `twitch:${s.user.id}` : 'password'
        if (path === '/admin/site/tags' && method === 'GET') return send(res, 200, siteTagsJson(true))
        if (path === '/admin/site/tags' && method === 'PUT') {
          const list = checkTags(b.tags)
          if (typeof list === 'string') return fail(res, 400, list)
          for (const name of tagShapes.keys()) if (!list.some((t) => t.name === name)) tagShapes.delete(name)
          siteTags = list
          tagsChanged = { at: iso(), by }
          return send(res, 200, siteTagsJson(true))
        }
        const tsm = /^\/admin\/site\/tags\/([^/]+)\/shape$/.exec(path)
        if (tsm) {
          const name = decodeURIComponent(tsm[1]!)
          if (!siteTags.some((t) => t.name === name)) return fail(res, 404, `No tag ${name}`)
          if (method === 'PUT') {
            if (!/^image\/svg\+xml\b/.test(req.headers['content-type'] ?? '')) return fail(res, 415, 'Send the SVG as image/svg+xml')
            const raw = rawBodies.get(req) ?? ''
            if (Buffer.byteLength(raw) > 64 * 1024) return fail(res, 413, 'Over 64 KB')
            const svg = cleanSvg(raw)
            if (!svg) return fail(res, 400, 'Not an SVG the site can use (scripts, outside references and embedded images are refused)')
            tagShapes.set(name, { svg, v: createHash('sha256').update(svg).digest('hex').slice(0, 12) })
            tagsChanged = { at: iso(), by }
            return send(res, 200, siteTagsJson(true))
          }
          if (method === 'DELETE') {
            tagShapes.delete(name)
            tagsChanged = { at: iso(), by }
            return send(res, 200, siteTagsJson(true))
          }
        }

        // ---- storage ----
        if (path === '/admin/storage' && method === 'GET') return send(res, 200, storageJson())
        const stm = /^\/admin\/storage\/([^/]+)\/([^/]+)$/.exec(path)
        if (stm && method === 'DELETE') {
          const area = decodeURIComponent(stm[1]!)
          const name = decodeURIComponent(stm[2]!)
          if (!/^[\w-]+$/.test(name)) return fail(res, 400, 'Bad folder name')
          const f = folders.find((x) => x.area === area && x.name === name)
          if (!f) return fail(res, 404, `No folder ${area}/${name}`)
          const active = activeJobsFor(f.name)
          if (active.length) return fail(res, 409, `Job ${active[0]!.id} (${active[0]!.kind}) is ${active[0]!.state} for ${area}/${name}`)
          folders.splice(folders.indexOf(f), 1)
          return send(res, 200, { path: `${area}/${name}`, bytes: f.bytes, files: f.files })
        }

        // ---- jobs: vex-platform's /api/v2/jobs ----
        if (path === '/api/v2/jobs' && method === 'GET') {
          const wanted = url.searchParams.getAll('state').map(v2State)
          const subject = url.searchParams.get('subject')
          const kind = url.searchParams.get('kind')
          const parent = Number(url.searchParams.get('parent')) || null
          const before = Number(url.searchParams.get('cursor')) || Infinity
          const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)
          const rows = jobs.filter((j) => j.id < before && (!wanted.length || wanted.includes(j.state)) && (!subject || (j.vodId && `vod:${j.vodId}` === subject)) && (!kind || j.kind === kind) && (!parent || j.parentId === parent))
          const items = rows.slice(0, limit)
          return send(res, 200, { items: items.map(v2Job), next_cursor: rows.length > limit ? String(items[items.length - 1]!.id) : null })
        }
        if (path === '/api/v2/jobs/counts' && method === 'GET') {
          const kind = url.searchParams.get('kind')
          const subject = url.searchParams.get('subject')
          const since = Date.parse(url.searchParams.get('since') ?? '') || 0
          const rows = jobs.filter((j) => (!kind || j.kind === kind) && (!subject || `vod:${j.vodId}` === subject))
            .filter((j) => isActive(j) || !since || Date.parse(v2Job(j).finished_at ?? '') >= since)
          const n = Object.fromEntries(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'].map((s) => [s, rows.filter((j) => j.state === v2State(s)).length]))
          return send(res, 200, { counts: n, total: rows.length })
        }
        if (path === '/api/v2/jobs' && method === 'POST') {
          const kind = String(b.kind ?? '')
          if (!KINDS[kind]) return problem(res, 422, 'invalid', 'Invalid request', [{ loc: ['body', 'kind'], msg: `unknown kind ${kind}`, type: 'value_error' }])
          const subject = b.subject == null ? null : String(b.subject)
          if (subject && !/^vod:\d+$/.test(subject)) return problem(res, 422, 'invalid', 'Invalid request', [{ loc: ['body', 'subject'], msg: 'expected vod:<id>', type: 'value_error' }])
          const steps = KINDS[kind]!.steps
          const from = typeof b.step === 'string' && b.step ? steps.indexOf(b.step) : 0
          if (from < 0) return problem(res, 422, 'invalid', 'Invalid request', [{ loc: ['body', 'step'], msg: `not a step of ${kind}`, type: 'value_error' }])
          const job = add(kind, subject ? subject.slice(4) : null, b.paused ? 'paused' : 'queued', from, 0, {
            payload: (b.payload as Record<string, unknown>) ?? {},
            pauseBefore: Array.isArray(b.pause_before) ? (b.pause_before as string[]) : null,
            actor: { kind: 'user', id: s.user?.id ?? null, login: s.user?.login ?? null, via: 'session' },
          })
          return send(res, 201, v2Job(job))
        }

        const m = /^\/api\/v2\/jobs\/(\d+)(?:\/([\w-]+))?$/.exec(path)
        const job = m ? jobs.find((j) => j.id === Number(m[1])) : undefined
        if (m && !job) return problem(res, 404, 'not_found', `No job ${m[1]}`)
        if (m && job) {
          const action = m[2]
          const conflict = (why: string) => problem(res, 409, 'job_conflict', `Job ${job.id} is ${v2Job(job).state}; ${why}`)
          const done = () => {
            job.updatedAt = iso()
            return send(res, 200, v2Job(job))
          }
          if (!action && method === 'GET') return send(res, 200, v2Job(job))
          if (action === 'related' && method === 'GET') {
            let root = job
            for (let up = root; up.parentId != null; ) {
              const p = jobs.find((j) => j.id === up.parentId)
              if (!p) break
              root = up = p
            }
            const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 200)
            const tree = [root]
            for (let i = 0; i < tree.length; i++) tree.push(...jobs.filter((j) => j.parentId === tree[i]!.id))
            const items = tree.sort((a, b) => a.id - b.id).slice(0, limit)
            return send(res, 200, { root_id: root.id, items: items.map(v2Job), truncated: tree.length > limit })
          }
          if (!action && method === 'PATCH') {
            if (!isActive(job)) return conflict('only unfinished jobs can be changed')
            if ('pause_before' in b) job.pauseBefore = (b.pause_before as string[] | null) ?? null
            if ('pause_next' in b) job.pauseNext = !!b.pause_next
            return done()
          }
          if (action === 'events' && method === 'GET') {
            // The cursor is the last event id served; next_cursor is never null, so the page can keep following.
            const after = Number(url.searchParams.get('cursor')) || 0
            const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000)
            const items = (events.get(job.id) ?? []).filter((e) => e.seq > after).slice(0, limit)
              .map(({ seq: id, ...e }) => ({ id, ...e }))
            return send(res, 200, { items, next_cursor: String(items.length ? items[items.length - 1]!.id : after) })
          }
          if (method !== 'POST') return problem(res, 405, 'method_not_allowed', 'Method not allowed')
          if (action === 'pause') {
            if (job.state === 'queued') job.state = 'paused'
            else if (job.state === 'running') job.pauseNext = true
            else return conflict('only queued or running jobs can be paused')
            log(job, 'Pause requested', 'warning')
            return done()
          }
          if (action === 'resume') {
            if (job.state !== 'paused') return conflict('only paused jobs can be resumed')
            job.state = 'queued'
            job.pauseNext = !!b.once
            log(job, 'Resumed')
            return done()
          }
          if (action === 'retry') {
            if (!['failed', 'cancelled'].includes(job.state)) return conflict('only failed or cancelled jobs can be retried')
            if (typeof b.step === 'string' && b.step) {
              if (!KINDS[job.kind]!.steps.includes(b.step)) return problem(res, 422, 'invalid', `${b.step} is not a step of ${job.kind}`)
              job.step = b.step
            }
            job.state = 'queued'
            job.attempts++
            job.lastError = null
            log(job, `Retried from ${job.step}`)
            return done()
          }
          if (action === 'cancel') {
            if (!['queued', 'paused', 'running'].includes(job.state)) return conflict('only unfinished jobs can be cancelled')
            if (job.state === 'running' && KINDS[job.kind]!.cooperative) {
              job.cancelRequested = true
              log(job, 'Cancel requested', 'warning')
            } else {
              job.state = 'cancelled'
              log(job, 'Cancelled', 'warning')
            }
            return done()
          }
        }
        // ---- VODs ----
        const vm = /^\/admin\/vods\/([^/]+)(?:\/([\w-]+))?$/.exec(path)
        if (vm) {
          const id = decodeURIComponent(vm[1]!)
          const vod = await vodOf(publicApi, id)
          if (!vod) return fail(res, 404, 'No Vod Data')
          const part = vm[2]
          try {
            if (!part && method === 'GET') return send(res, 200, adminVod(vod))
            if (part === 'merge-candidates' && method === 'GET') {
              // The worker lists VODs that started up to 30 minutes after this one ended. Real back-to-back VODs are
              // rare, so the mock offers the next three whatever the gap, to have something to show.
              const aDur = durOf(vod)
              const ends = Date.parse(vod.createdAt) + aDur * 1000
              const page = (await publicJson(publicApi, `/vods?createdAt[$gt]=${encodeURIComponent(vod.createdAt)}&$sort[createdAt]=1&$limit=3`)) as { data: Json[] }
              const norm = (t: unknown) => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
              return send(res, 200, {
                vod: { id: vod.id, streamId: vod.stream_id ?? null, title: vod.title, createdAt: vod.createdAt, duration: vod.duration, endsAt: new Date(ends).toISOString(), mergedInto: vod.merged_into ?? null },
                withinMinutes: 30,
                candidates: page.data.filter((c) => !vods.get(String(c.id))?.merged_into && !deleted.has(String(c.id))).map((c) => {
                  const gap = Math.round((Date.parse(c.createdAt) - Date.parse(vod.createdAt)) / 1000) - aDur
                  return { id: c.id, streamId: c.stream_id ?? null, title: c.title, createdAt: c.createdAt, duration: c.duration, gap, overlaps: gap < 0, titlesMatch: norm(c.title) === norm(vod.title) }
                }),
              })
            }
            if (part === 'merge' && method === 'POST') {
              const src = await vodOf(publicApi, String(b.source ?? ''))
              if (!src) return fail(res, 404, `No Vod Data for ${b.source}`)
              const sp = mergeVods(vod, src, b.gap)
              return send(res, 200, { error: false, msg: `Merged ${src.id} into ${id} at ${sp.offset}s`, splice: spliceJson(sp), warnings: [], vod: adminVod(vod) })
            }
            if (part === 'unmerge' && method === 'POST') {
              const sp = splices.findLast((x) => x.kind === 'merge' && !x.undoneAt && x.vodId === id && x.otherId === String(b.source))
              if (!sp) return fail(res, 404, `${b.source} is not merged into ${id}`)
              const out = undo(sp, !!b.force)
              return send(res, 200, { error: false, msg: `Unmerged ${sp.otherId} from ${id}`, splice: out, vod: adminVod(vods.get(id)!) })
            }
            if (part === 'split' && method === 'POST') {
              if (typeof b.at !== 'number') return fail(res, 400, 'at must be a number of seconds')
              const r = splitVod(vod, b.at)
              if (r.undid)
                return send(res, 200, { error: false, msg: `${b.at}s is where ${r.undid.otherId} was merged in; undid that merge`, undid: 'merge', splice: r.undid, vod: adminVod(vods.get(id)!) })
              return send(res, 200, { error: false, msg: `Split ${id} at ${r.splice.offset}s into ${r.newVodId}`, splice: spliceJson(r.splice), newVodId: r.newVodId, vod: adminVod(vods.get(id)!) })
            }
            if (part === 'unsplit' && method === 'POST') {
              const sp = splices.findLast((x) => x.kind === 'split' && !x.undoneAt && x.vodId === id && (!b.source || x.otherId === String(b.source)))
              if (!sp) return fail(res, 404, `${id} has no split to undo`)
              const out = undo(sp, !!b.force)
              return send(res, 200, { error: false, msg: `Joined ${sp.otherId} back into ${id}`, splice: out, vod: adminVod(vods.get(id)!) })
            }
            if (!part && method === 'PATCH') {
              const FIELDS = ['title', 'hidden', 'thumbnailUrl', 'duration', 'createdAt']
              const unknown = Object.keys(b).filter((k) => !FIELDS.includes(k))
              if (!Object.keys(b).length) return fail(res, 400, `Send at least one of ${FIELDS.join(', ')}`)
              if (unknown.length) return fail(res, 400, `unknown field(s) ${unknown.join(', ')}; these can be changed: ${FIELDS.join(', ')}`)
              if (vod.merged_into && Object.keys(b).some((k) => k !== 'hidden')) return fail(res, 409, `vod ${id} is merged into ${vod.merged_into.id}; only hidden can change`)
              if ('title' in b && (typeof b.title !== 'string' || !b.title.trim())) return fail(res, 400, 'title must be a non-empty string')
              if ('hidden' in b && typeof b.hidden !== 'boolean') return fail(res, 400, 'hidden must be true or false')
              if ('thumbnailUrl' in b && b.thumbnailUrl && !/^https?:\/\/\S+$/.test(String(b.thumbnailUrl))) return fail(res, 400, 'thumbnailUrl must be an http(s) URL or null')
              if ('duration' in b && !/^\d+:[0-5]\d:[0-5]\d$/.test(String(b.duration))) return fail(res, 400, 'duration must be HH:MM:SS')
              if ('createdAt' in b && (!/(Z|[+-]\d\d:?\d\d)$/.test(String(b.createdAt)) || Number.isNaN(Date.parse(String(b.createdAt)))))
                return fail(res, 400, 'createdAt must be an ISO date and time with an offset, e.g. 2026-09-30T18:00:00Z')
              if ('duration' in b) {
                const d = secondsOf(b.duration)
                const lastChapter = Math.max(0, ...((vod.chapters as Json[]) ?? []).map((c) => Number(c.start) + chapterLen(c)))
                const lastGame = Math.max(0, ...(gameRows.get(id) ?? []).map((g) => Number(g.end_time)))
                const last = Math.max(lastChapter, lastGame)
                if (last > d + 1) return fail(res, 400, `duration ${b.duration} is shorter than the chapters or games (they run to ${hms(last)})`)
                setDur(vod, d)
              }
              if ('title' in b) vod.title = b.title.trim()
              if ('hidden' in b) {
                if (b.hidden) hidden.add(id)
                else hidden.delete(id)
              }
              if ('thumbnailUrl' in b) vod.thumbnail_url = b.thumbnailUrl || null
              if ('createdAt' in b) vod.createdAt = new Date(String(b.createdAt)).toISOString()
              return send(res, 200, adminVod(vod))
            }
            if (part === 'games' && method === 'GET') {
              if (!gameRows.has(id)) {
                const page = (await publicJson(publicApi, `/games?vod_id=${encodeURIComponent(id)}&$limit=100&$sort[start_time]=1`)) as { data: Json[] }
                gameRows.set(id, page.data)
              }
              return send(res, 200, gameRows.get(id))
            }
            if (part === 'games' && method === 'PUT') {
              if (vod.merged_into) return fail(res, 409, `vod ${id} is merged into ${vod.merged_into.id}`)
              if (!Array.isArray(b.games)) return fail(res, 400, 'games must be a list')
              const dur = durOf(vod)
              let prevStart = -1
              let prevEnd = -1
              const rows: Json[] = []
              for (const [i, g] of (b.games as Json[]).entries()) {
                const start = Number(g.start_time)
                const end = Number(g.end_time)
                if (!Number.isFinite(start) || start < 0) return fail(res, 400, `games[${i}].start_time must be a number of seconds >= 0`)
                if (!Number.isFinite(end) || end <= start) return fail(res, 400, `games[${i}] must end after it starts`)
                if (start < prevStart) return fail(res, 400, `games[${i}] starts before games[${i - 1}]; sort games by start_time`)
                if (start < prevEnd - 0.5) return fail(res, 400, `games[${i}] starts at ${start}s, inside games[${i - 1}] (which ends at ${prevEnd}s)`)
                if (dur > 0 && end > dur + 1) return fail(res, 400, `games[${i}] ends at ${end}s, after the end of the VOD (${dur}s)`)
                if (typeof g.game_name !== 'string' || !g.game_name.trim()) return fail(res, 400, `games[${i}].game_name must be a non-empty string`)
                prevStart = start
                prevEnd = end
                rows.push({ ...g, id: g.id ?? `mock-${id}-${i}`, vodId: id, start_time: String(start), end_time: String(end), updatedAt: iso() })
              }
              gameRows.set(id, rows)
              return send(res, 200, adminVod(vod))
            }
            if (part === 'chapters' && method === 'PUT') {
              if (typeof b.locked !== 'boolean') return fail(res, 400, 'locked must be true or false')
              vod.chapters = checkChapters(b.chapters, durOf(vod))
              if (b.locked) locked.add(id)
              else locked.delete(id)
              return send(res, 200, adminVod(vod))
            }
            if (part === 'youtube' && method === 'PUT') {
              const old = new Map<unknown, Json>(((vod.youtube as Json[]) ?? []).map((y) => [y.id, y]))
              vod.youtube = ((b.youtube as Json[]) ?? []).map((y) => ({
                id: y.id, type: y.type, duration: y.duration ?? old.get(y.id)?.duration ?? null, part: y.part,
                thumbnail_url: old.get(y.id)?.thumbnail_url ?? `https://i.ytimg.com/vi/${y.id}/mqdefault.jpg`,
              }))
              return send(res, 200, adminVod(vod))
            }
            if (part === 'drive' && method === 'PUT') {
              vod.drive = ((b.drive as Json[]) ?? []).map((d) => ({ id: d.id, type: d.type }))
              return send(res, 200, adminVod(vod))
            }
            if (part === 'emotes' && method === 'GET') {
              if (!emoteRows.has(id)) {
                const page = (await publicJson(publicApi, `/emotes?vod_id=${encodeURIComponent(id)}&$limit=1`)) as { data: Json[] }
                emoteRows.set(id, page.data[0] ?? null)
              }
              return send(res, 200, emoteRows.get(id))
            }
          } catch (e) {
            const err = e as Error & { status?: number; extra?: Json }
            return send(res, err.status ?? 400, { error: true, msg: err.message, ...(err.extra ?? {}) })
          }
        }
        if (path === '/admin/twitch/games') {
          const q = (url.searchParams.get('query') ?? '').trim().toLowerCase()
          if (!q) return fail(res, 400, 'Missing parameter: query')
          // Stand-in for Helix category search: the archive's own games.
          const games = (await publicJson(publicApi, '/v1/games-played')) as Json[]
          return send(res, 200, games
            .filter((g) => g.gameId && String(g.name).toLowerCase().includes(q))
            .slice(0, 10)
            .map((g) => ({ gameId: g.gameId, name: g.name, imageTemplate: g.imageTemplate ?? null })))
        }
        if (path === '/api/v2/audit') {
          // The cursor is opaque to the page; here it is just the last id served.
          const before = Number(url.searchParams.get('cursor')) || Infinity
          const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500)
          const p = (k: string) => url.searchParams.get(k)?.trim() || ''
          // action and target: a prefix ending in . or :, else exact.
          const match = (v: string, want: string) => !want || (/[.:]$/.test(want) ? v.startsWith(want) : v === want)
          const actor = p('actor').replace(/^@/, '').toLowerCase()
          const who = actor === 'me' ? (s.user?.login ?? '').toLowerCase() : actor
          const rows = audit.filter((a) =>
            (a.id as number) < before &&
            match(String(a.action), p('action')) &&
            match(String(a.target ?? ''), p('target')) &&
            (!p('actor_kind') || a.actor_kind === p('actor_kind')) &&
            (!p('outcome') || a.outcome === p('outcome')) &&
            (!actor || String(a.actor_login ?? '').toLowerCase() === who))
          const items = rows.slice(0, limit)
          return send(res, 200, { items, next_cursor: rows.length > limit ? String(items[items.length - 1]!.id) : null })
        }

        // ---- the worker's VOD routes: each starts a job ----
        const vodId = b.vodId ? String(b.vodId) : ''
        const start = (kind: string, msg: string) => ok(res, msg, add(kind, vodId || null, 'queued', 0, 0, { payload: { ...b } }))
        if (method === 'POST' || method === 'DELETE') {
          const needsVod = ['/admin/bot-chat', '/admin/chapters', '/admin/emotes', '/admin/logs', '/admin/duration', '/admin/youtube/parts', '/admin/download', '/admin/reupload', '/admin/delete']
          if (needsVod.includes(path) && !(await vodOf(publicApi, vodId))) return fail(res, 404, 'No Vod Data')
          // A merged or split VOD no longer matches Twitch's VOD of that id: the worker refuses to re-fetch it.
          const twitch = ['/admin/chapters', '/admin/emotes', '/admin/logs', '/admin/duration', '/admin/download', '/admin/reupload', '/admin/delete', '/admin/hls/download', '/admin/bot-chat']
          if (twitch.includes(path) && (vods.get(vodId)?.merged_into || splicesOf(vodId).some((sp) => !sp.undoneAt)))
            return fail(res, 409, `vod ${vodId} was merged or split; it no longer matches Twitch's VOD of that id`)
          switch (path) {
            case '/admin/chapters': return start('chapters', `Saving Chapters for ${vodId}`)
            case '/admin/emotes': return start('emotes', b.force ? 'Saving emotes (overwriting)..' : 'Saving emotes..')
            case '/admin/emotes/backfill': return start('global_emotes_backfill', 'Backfilling global emotes..')
            case '/admin/bot-chat':
              if (jobs.some((j) => j.kind === 'bot_chat' && j.vodId === vodId && isActive(j)))
                return fail(res, 409, `A bot chat job for ${vodId} is already running`)
              return start('bot_chat', `Reading bot chat for ${vodId}..`)
            case '/admin/bot-chat/backfill': return start('bot_chat_backfill', 'Backfilling bot chat..')
            case '/admin/logs': return start('chat', 'Getting logs..')
            case '/admin/youtube/parts': return start('describe', `Updating YouTube descriptions for ${vodId}`)
            case '/admin/download': return start('download', 'Starting download..')
            case '/admin/reupload': return start('reupload', `Re-uploading ${vodId} part ${b.part}..`)
            case '/admin/hls/download': return start('archive', `Downloading ${vodId} via HLS..`)
            case '/admin/generate/vod': return start('chapters', `Created vod ${vodId}`)
            case '/admin/duration': return send(res, 200, { error: false, msg: 'Saved duration!', duration: (await vodOf(publicApi, vodId))!.duration })
            case '/admin/delete':
              deleted.add(vodId)
              return send(res, 200, { error: false, msg: `Deleted ${vodId} (vod, logs, emotes, games)` })
          }
        }
        return fail(res, 404, 'Not in the dev mock')
      })
    },
  }
}
