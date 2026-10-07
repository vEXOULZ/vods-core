// What to watch after a VOD ends: a random VOD that isn't finished, either one with progress saved (picked up where
// it was left, or where it grew since it was finished) or one never opened. Drawn from the newest regular VODs and the
// saved progress, loaded once, on the first ask.
import { isResumable, redirectTarget, resumeProgress, type Progress, type Vod } from '../../index'
import { useVodsContext } from '../../vue/index'

export interface NextVod {
  vod: Vod
  /** Where to pick it up; null when it was never opened. */
  t: number | null
}

interface Candidate {
  id: string
  /** Null for a saved one that isn't among the newest: fetched when picked. */
  vod: Vod | null
  saved: Progress | null
}

/** How many of the newest VODs are drawn from. */
const NEWEST = 50

export function useNextVod(currentId: () => string) {
  const { client, progress } = useVodsContext()
  let pool: Promise<Candidate[]> | null = null

  async function load(): Promise<Candidate[]> {
    const [saved, page] = await Promise.all([
      progress.list(500).catch(() => [] as Progress[]),
      client.listVods({ perPage: NEWEST }).catch(() => ({ total: 0, vods: [] as Vod[] })),
    ])
    const byId = new Map(saved.map((p) => [p.vodId, p]))
    const out: Candidate[] = page.vods.map((v) => ({ id: v.id, vod: v, saved: byId.get(v.id) ?? null }))
    const listed = new Set(out.map((c) => c.id))
    for (const p of saved) if (!listed.has(p.vodId) && isResumable(p)) out.push({ id: p.vodId, vod: null, saved: p })
    return out
  }

  /** A random pick, other than the current VOD and `skip`; null when there's nothing left to suggest. */
  async function next(skip: readonly string[] = []): Promise<NextVod | null> {
    pool ??= load()
    const left = (await pool).filter((c) => c.id !== currentId() && !skip.includes(c.id))
    while (left.length) {
      const c = left.splice(Math.floor(Math.random() * left.length), 1)[0]!
      const vod = c.vod ?? (await client.getVod(c.id).catch(() => null))
      // Gone, or now played inside another VOD (that one's own entry, if any, stands for it).
      if (!vod || redirectTarget(vod, 0)) continue
      if (!c.saved) return { vod, t: null }
      const at = resumeProgress(c.saved, vod.duration)
      if (at) return { vod, t: at.t } // else finished: not a suggestion
    }
    return null
  }

  return { next }
}
