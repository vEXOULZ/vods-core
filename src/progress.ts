// Where the viewer left off, per VOD. LocalProgressStore keeps it in the browser; AccountProgressStore
// (accountProgress.ts) keeps it with the viewer's account and imports the local entries on sign-in.

export interface Progress {
  vodId: string
  /** VOD seconds. */
  t: number
  /** VOD length, so lists can draw a progress bar without loading the VOD. */
  duration: number
  /** ms since epoch. */
  updatedAt: number
}

export interface ProgressStore {
  get(vodId: string): Promise<Progress | null>
  set(p: Omit<Progress, 'updatedAt'> & { updatedAt?: number }): Promise<void>
  remove(vodId: string): Promise<void>
  /** Most recent first. */
  list(limit?: number): Promise<Progress[]>
}

/** The bit of Storage used here, so tests can pass a Map-backed fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LocalProgressOptions {
  storage?: KeyValueStorage
  /** Key in storage. */
  key?: string
  /** Oldest entries are dropped past this many. */
  max?: number
  /** Positions this close to the start aren't worth resuming (seconds). */
  minT?: number
  /** @deprecated Unused: finished entries are kept (see resumeAt), so the store has no end rule. */
  endMargin?: number
}

export interface ResumeOptions {
  /** The VOD's length now, when known: a synthetic VOD (a playthrough) can grow after someone finished it. */
  duration?: number
  minT?: number
  endMargin?: number
}

/** True when `p` was watched to (near) the end of the VOD as it was then. */
export function isFinished(p: Progress, opts: { endMargin?: number } = {}): boolean {
  return p.t >= p.duration - (opts.endMargin ?? 60)
}

/**
 * Where to pick up from, or null when there's nothing worth resuming: the saved position, or, on an entry
 * finished before the VOD grew (`opts.duration` longer than it was), where the new part starts.
 */
export function resumeAt(p: Progress, opts: ResumeOptions = {}): number | null {
  const at = isFinished(p, opts) ? p.duration : p.t
  const duration = opts.duration || p.duration
  return at >= (opts.minT ?? 30) && at < duration - (opts.endMargin ?? 60) ? at : null
}

/** `p` with `t` moved to where to pick up (see resumeAt), or null when there's nothing worth resuming. */
export function resumeProgress(p: Progress | null | undefined, duration?: number): Progress | null {
  const t = p ? resumeAt(p, { duration }) : null
  return p && t != null ? { ...p, t } : null
}

/** True for a position worth offering "resume" for (see resumeAt). */
export function isResumable(p: Progress, opts: ResumeOptions = {}): boolean {
  return resumeAt(p, opts) !== null
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // blocked site data, private mode
  }
}

/** All entries under one key as a JSON map; every access is wrapped because storage can throw or be missing. */
export class LocalProgressStore implements ProgressStore {
  private readonly storage: KeyValueStorage | null
  private readonly key: string
  private readonly max: number
  private readonly minT: number

  constructor(opts: LocalProgressOptions = {}) {
    this.storage = opts.storage ?? defaultStorage()
    this.key = opts.key ?? 'vods.progress.v1'
    this.max = opts.max ?? 200
    this.minT = opts.minT ?? 30
  }

  private read(): Record<string, Progress> {
    try {
      const raw = this.storage?.getItem(this.key)
      const data: unknown = raw ? JSON.parse(raw) : {}
      return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, Progress>) : {}
    } catch {
      return {}
    }
  }

  private write(all: Record<string, Progress>): void {
    const entries = Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, this.max)
    try {
      this.storage?.setItem(this.key, JSON.stringify(Object.fromEntries(entries.map((e) => [e.vodId, e]))))
    } catch {
      // quota or blocked: progress is a convenience, never an error
    }
  }

  async get(vodId: string): Promise<Progress | null> {
    return this.read()[vodId] ?? null
  }

  async set(p: Omit<Progress, 'updatedAt'> & { updatedAt?: number }): Promise<void> {
    const all = this.read()
    const entry: Progress = { vodId: p.vodId, t: Math.floor(p.t), duration: Math.floor(p.duration), updatedAt: p.updatedAt ?? Date.now() }
    // A finished entry is kept: should the VOD grow (a playthrough's new stream), it resumes where that starts.
    if (entry.t < this.minT) {
      // Back at the start (a restart): nothing worth resuming.
      if (!all[p.vodId]) return
      delete all[p.vodId]
    } else all[p.vodId] = entry
    this.write(all)
  }

  /** Removes each of `vodIds` in one read and write. */
  async remove(...vodIds: string[]): Promise<void> {
    const all = this.read()
    for (const id of vodIds) delete all[id]
    this.write(all)
  }

  async list(limit = Infinity): Promise<Progress[]> {
    return Object.values(this.read())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }
}
