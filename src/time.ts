// Time formats used by the archive and the watch URLs. All values are seconds.

/** "HH:MM:SS", "MM:SS" or "SS" → seconds. Returns NaN for anything else. */
export function toSeconds(hms: string): number {
  const parts = hms.trim().split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  return parts.reduce((total, p) => total * 60 + Number(p), 0)
}

/** 3725 → "1h2m5s" (the `?t=` format, same as Twitch). */
export function toHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 3600)}h${Math.floor(s / 60) % 60}m${s % 60}s`
}

/** 3725 → "1:02:05"; under an hour → "2:05". For chat timestamps and labels. */
export function toClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/**
 * Parses a `?t=` value: "1h2m3s" (any subset, any case), "1:02:03", or plain seconds.
 * Returns 0 for anything it can't read, like the old site did.
 */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const v = value.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(Number(v))
  if (v.includes(':')) {
    const s = toSeconds(v)
    return Number.isFinite(s) ? Math.floor(s) : 0
  }
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v)
  if (!m || (!m[1] && !m[2] && !m[3])) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}
