// What the overview says about uploads and storage: the YouTube quota spent today, the VODs nothing is archiving and
// the worker's disk. The words and the warning thresholds, without the look, so keeki's overview reads the same.
import { bytes } from '@vexoulz/platform-web'
import type { StorageView, YoutubeQuota } from './api'
import { admin } from './session'

/** Units an upload costs (videos.insert). */
export const UPLOAD_UNITS = 1600
/** The share of the quota or the disk past which the overview warns. */
export const WARN_SHARE = 0.8

export interface HealthLine {
  text: string
  sub: string
  warn: boolean
}

const hoursUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 3_600_000))

/** "4,809 of 10,000 units", how many uploads are left, and when the count starts again. */
export function quotaLine(q: YoutubeQuota, now = Date.now()): HealthLine {
  const left = Math.max(0, q.limit - q.used)
  const uploads = Math.floor(left / UPLOAD_UNITS)
  const h = hoursUntil(q.resetsAt, now)
  return {
    text: `${q.used.toLocaleString('en-US')} of ${q.limit.toLocaleString('en-US')} units`,
    sub: `${uploads ? `room for ${uploads} more upload${uploads === 1 ? '' : 's'}` : 'no room for another upload'} · resets in ${h} h`,
    warn: q.used >= q.limit * WARN_SHARE,
  }
}

/** "120 GB free of 2 TB", warning past WARN_SHARE used. */
export function diskLine(disk: NonNullable<StorageView['disk']>): HealthLine {
  return {
    text: `${bytes(disk.free)} free`,
    sub: `${bytes(disk.used)} of ${bytes(disk.total)} used`,
    warn: disk.total > 0 && disk.used >= disk.total * WARN_SHARE,
  }
}

/** How many VODs a stuck count looks at: more shows as "50+". */
export const STUCK_LIMIT = 50
/** The /manage/vods filter for them. */
export const STUCK_QUERY = { upload: 'stuck' } as const

/** The Twitch VODs not on YouTube with no job queued, running or paused: `count`, and `more` past STUCK_LIMIT. */
export async function stuckVods(signal?: AbortSignal): Promise<{ count: number; more: boolean; ids: string[] }> {
  const page = await admin.vodList({ uploaded: false, busy: false, synthetic: false, limit: STUCK_LIMIT }, signal)
  return { count: page.items.length, more: !!page.next_cursor, ids: page.items.map((v) => v.id) }
}

export function stuckLine(s: { count: number; more: boolean }): HealthLine {
  const n = `${s.count}${s.more ? '+' : ''}`
  return {
    text: s.count ? `${n} VOD${s.count === 1 && !s.more ? '' : 's'}` : 'None',
    sub: s.count ? 'Not on YouTube, and no job for them' : 'Every VOD is uploaded or has a job',
    warn: s.count > 0,
  }
}
