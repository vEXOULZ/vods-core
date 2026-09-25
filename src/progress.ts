// Where the viewer left off, per VOD. LocalProgressStore keeps it in the browser; an account-backed store
// implements the same interface later (and imports the local entries on first sign-in).

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
  /** Within this many seconds of the end counts as finished, and the entry is removed. */
  endMargin?: number
}

/** True for a position worth offering "resume" for. */
export function isResumable(p: Progress, opts: { minT?: number; endMargin?: number } = {}): boolean {
  return p.t >= (opts.minT ?? 30) && p.t < p.duration - (opts.endMargin ?? 60)
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
  private readonly endMargin: number

  constructor(opts: LocalProgressOptions = {}) {
    this.storage = opts.storage ?? defaultStorage()
    this.key = opts.key ?? 'vods.progress.v1'
    this.max = opts.max ?? 200
    this.minT = opts.minT ?? 30
    this.endMargin = opts.endMargin ?? 60
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
    if (entry.t >= entry.duration - this.endMargin) delete all[p.vodId]
    else if (entry.t < this.minT) {
      // Back at the start (a restart): nothing worth resuming.
      if (!all[p.vodId]) return
      delete all[p.vodId]
    } else all[p.vodId] = entry
    this.write(all)
  }

  async remove(vodId: string): Promise<void> {
    const all = this.read()
    delete all[vodId]
    this.write(all)
  }

  async list(limit = Infinity): Promise<Progress[]> {
    return Object.values(this.read())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }
}
