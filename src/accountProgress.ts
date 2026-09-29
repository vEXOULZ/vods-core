// Watch progress kept with the viewer's account (vexoulz-auth's /v1/progress), so it follows them between
// browsers. Signed out, or when the service can't be reached, it falls back to the browser's LocalProgressStore;
// merge() moves those local entries to the account (newest wins per VOD) once someone signs in.
import { LocalProgressStore, type Progress, type ProgressStore } from './progress'

/** The signed-in account, as `@vexoulz/ui/account`'s Account provides it. */
export interface AccountLink {
  /** Whether someone is signed in right now. */
  signedIn(): boolean
  /** A credentialed request to vexoulz-auth, with its CSRF header on writes. */
  request(path: string, init?: RequestInit): Promise<Response>
}

export interface AccountProgressOptions {
  /** Where progress goes while signed out (and the entries merge() imports). */
  local?: LocalProgressStore
  /** As LocalProgressStore: positions this close to the start aren't kept (seconds). */
  minT?: number
  /** As LocalProgressStore: within this many seconds of the end counts as finished and is removed. */
  endMargin?: number
}

/** The service takes at most this many entries per merge request. */
export const MERGE_BATCH = 500

export class AccountProgressStore implements ProgressStore {
  readonly local: LocalProgressStore
  private readonly minT: number
  private readonly endMargin: number

  constructor(
    private readonly account: AccountLink,
    opts: AccountProgressOptions = {},
  ) {
    this.minT = opts.minT ?? 30
    this.endMargin = opts.endMargin ?? 60
    this.local = opts.local ?? new LocalProgressStore({ minT: this.minT, endMargin: this.endMargin })
  }

  private path(vodId: string) {
    return `/v1/progress/${encodeURIComponent(vodId)}`
  }

  async get(vodId: string): Promise<Progress | null> {
    if (!this.account.signedIn()) return this.local.get(vodId)
    try {
      const res = await this.account.request(this.path(vodId))
      if (res.status === 404) return null
      if (res.ok) return toProgress(await res.json())
    } catch {
      // fall through to what this browser has
    }
    return this.local.get(vodId)
  }

  async set(p: Omit<Progress, 'updatedAt'> & { updatedAt?: number }): Promise<void> {
    if (!this.account.signedIn()) return this.local.set(p)
    const entry: Progress = { vodId: p.vodId, t: Math.floor(p.t), duration: Math.floor(p.duration), updatedAt: p.updatedAt ?? Date.now() }
    // Finished, or back at the start: nothing worth resuming (the same rule as the local store).
    if (entry.t >= entry.duration - this.endMargin || entry.t < this.minT) return this.remove(p.vodId)
    try {
      const res = await this.account.request(this.path(p.vodId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: entry.t, duration: entry.duration, updatedAt: entry.updatedAt }),
      })
      if (res.ok) return
    } catch {
      // unreachable
    }
    await this.local.set(entry) // kept here, and merged into the account next time
  }

  async remove(vodId: string): Promise<void> {
    await this.local.remove(vodId)
    if (!this.account.signedIn()) return
    try {
      await this.account.request(this.path(vodId), { method: 'DELETE' })
    } catch {
      // progress is a convenience, never an error
    }
  }

  async list(limit = Infinity): Promise<Progress[]> {
    if (!this.account.signedIn()) return this.local.list(limit)
    try {
      const query = Number.isFinite(limit) ? `?limit=${Math.max(1, Math.floor(limit))}` : ''
      const res = await this.account.request(`/v1/progress${query}`)
      if (res.ok) return ((await res.json()).items as unknown[]).map(toProgress).slice(0, limit)
    } catch {
      // fall through
    }
    return this.local.list(limit)
  }

  /**
   * Moves this browser's entries into the account, newest winning per VOD, and clears the moved ones here.
   * Call it when someone signs in. Returns how many moved; entries that failed to send stay local.
   */
  async merge(): Promise<number> {
    if (!this.account.signedIn()) return 0
    const entries = await this.local.list()
    let moved = 0
    for (let i = 0; i < entries.length; i += MERGE_BATCH) {
      const items = entries.slice(i, i + MERGE_BATCH)
      try {
        const res = await this.account.request('/v1/progress/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })
        if (!res.ok) break
      } catch {
        break
      }
      for (const e of items) await this.local.remove(e.vodId)
      moved += items.length
    }
    return moved
  }
}

function toProgress(raw: unknown): Progress {
  const r = raw as Record<string, unknown>
  return { vodId: String(r.vodId), t: Number(r.t), duration: Number(r.duration), updatedAt: Number(r.updatedAt) }
}
