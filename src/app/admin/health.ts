// What the overview says about uploads and storage: the YouTube quota spent today, the VODs nothing is archiving,
// the worker's disk and whether the uploads are still on YouTube. The words and the warning thresholds, without the look, so keeki's overview reads the same.
import { bytes } from '@vex/platform-web'
import type { DoomtpStatus, StorageView, YoutubeCheck, YoutubeIssue, YoutubeQuota, YoutubeVideos, YoutubeVodReport } from './api'
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

/** "97.3%": one decimal, none at 0 and 100 (and 99.95% stays 99.9%, not a round 100% that hides a gap). */
export function percent(share: number): string {
  const p = Math.floor(Math.max(0, Math.min(1, share)) * 1000) / 10
  return `${p === 0 || p === 100 ? p.toFixed(0) : p.toFixed(1)}%`
}

const vodsWord = (n: number) => `${n} VOD${n === 1 ? '' : 's'}`

/** How much of the archive is on YouTube, and how many VODs have a problem there. The page adds when it was checked. */
export function youtubeCheckLine(v: YoutubeVideos): HealthLine {
  const c = v.last
  if (!c) return { text: 'Not checked yet', sub: v.running ? 'Checking now…' : 'Check now to see', warn: false }
  return {
    text: c.seconds ? `${percent(c.onYoutube / c.seconds)} on YouTube` : 'Nothing uploaded',
    sub: c.bad
      ? `${vodsWord(c.bad)} missing there${c.warn ? `, ${c.warn} with warnings` : ''}`
      : c.warn
        ? `${vodsWord(c.warn)} with warnings`
        : `All ${c.videos} upload${c.videos === 1 ? '' : 's'} there and whole`,
    warn: c.bad > 0,
  }
}

/** What a check found, for the toast after Check now. */
export function youtubeCheckMessage(c: YoutubeCheck): string {
  const found = c.bad || c.warn ? `${vodsWord(c.bad + c.warn)} with problems` : 'nothing wrong'
  return `Checked ${c.videos} upload${c.videos === 1 ? '' : 's'} on YouTube: ${found}`
}

export const YOUTUBE_ISSUES: Record<YoutubeIssue['kind'], string> = {
  removed: 'Removed',
  rejected: 'Rejected',
  failed: 'Failed',
  processing: 'Processing',
  blocked: 'Blocked',
  ageRestricted: 'Age-restricted',
  shorter: 'Cut short',
  missingPart: 'Part missing',
  incomplete: 'Incomplete',
}

/** "Live part 2", "VOD part 1", "Live copy": which upload an issue is about. */
export function issueWhere(i: YoutubeIssue): string {
  const copy = i.type === 'live' ? 'Live' : 'VOD'
  return i.part != null ? `${copy} part ${i.part}` : `${copy} copy`
}

/** The YouTube link for an issue's video, when it has one that could still be there. */
export function issueLink(i: YoutubeIssue): string | undefined {
  return i.video && i.kind !== 'removed' ? `https://www.youtube.com/watch?v=${encodeURIComponent(i.video)}` : undefined
}

/** Bad ones first, then the least on YouTube. */
export function sortedProblems(c: YoutubeCheck | null | undefined): YoutubeVodReport[] {
  const bad = (r: YoutubeVodReport) => (r.issues.some((i) => i.severity === 'bad') ? 0 : 1)
  return [...(c?.problems ?? [])].sort((a, b) => bad(a) - bad(b) || a.share - b.share || b.id.localeCompare(a.id))
}

/** How far back the overview lists upload problems; older ones are on /manage/youtube. */
export const RECENT_PROBLEM_DAYS = 14

/** The problems of VODs streamed in the last RECENT_PROBLEM_DAYS days, and the rest, each as sortedProblems orders
 * them. A report without a date (a check by an older worker) counts as recent, so nothing drops out of sight. */
export function splitProblems(
  c: YoutubeCheck | null | undefined,
  now = Date.now(),
): { recent: YoutubeVodReport[]; older: YoutubeVodReport[] } {
  const since = now - RECENT_PROBLEM_DAYS * 86_400_000
  const recent: YoutubeVodReport[] = []
  const older: YoutubeVodReport[] = []
  for (const r of sortedProblems(c)) {
    const at = r.createdAt ? Date.parse(r.createdAt) : NaN
    ;(Number.isNaN(at) || at >= since ? recent : older).push(r)
  }
  return { recent, older }
}

/** The doomtp-bot tile: whether the worker reaches the bot and the bot is in chat. `status` is the tile's dot. */
export function doomtpLine(d: DoomtpStatus, ago: (iso: string) => string): HealthLine & { status: 'ok' | 'warn' | 'off' } {
  if (!d.configured) return { text: 'Not set up', sub: 'No bot URL: bot chat is off', warn: false, status: 'off' }
  const access = d.keyed ? 'with a key' : 'public log only'
  if (!d.ok) return { text: 'Unreachable', sub: d.error ?? 'No answer', warn: true, status: 'warn' }
  if (d.listening) return { text: 'In chat', sub: `${d.since ? `since ${ago(d.since)}` : `#${d.login}`} · ${access}`, warn: false, status: 'ok' }
  return { text: 'Not in chat', sub: `${d.since ? `left ${ago(d.since)}` : `#${d.login}`} · ${access}`, warn: true, status: 'warn' }
}
