/** Everything a vods site needs to know about its channel. Replaces the old REACT_APP_* variables. */
export interface VodsConfig {
  /** Display name of the channel, e.g. "vEXOULZ". */
  channel: string
  /** Twitch user id: third-party emote sets (BTTV, FFZ, 7TV) are looked up by it. */
  twitchId: string
  /** Base URL of the archive API, without a trailing slash. */
  apiBase: string
  /** First day the archive has VODs for (the date filter's lower bound). */
  startDate: Date
  /**
   * Seconds assumed for an upload whose duration isn't known yet (still processing). Uploads are split every
   * 3 hours, hence the default. Was REACT_APP_DEFAULT_DELAY, which was a string and got concatenated.
   */
  defaultPartDuration: number
}

/** What a site writes: numbers and dates may come in as strings (env vars, JSON). */
export interface VodsConfigInput {
  channel: string
  twitchId: string | number
  apiBase: string
  startDate: string | Date
  defaultPartDuration?: string | number
}

export const DEFAULT_PART_DURATION = 3 * 3600

function toNumber(value: string | number | undefined, name: string, fallback?: number): number {
  if (value === undefined || value === '') {
    if (fallback === undefined) throw new Error(`vods config: ${name} is required`)
    return fallback
  }
  const n = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isFinite(n) || n <= 0) throw new Error(`vods config: ${name} must be a positive number, got ${JSON.stringify(value)}`)
  return n
}

/** Validates the config and parses numbers and dates, so a bad value fails at startup instead of mid-playback. */
export function defineVodsConfig(input: VodsConfigInput): VodsConfig {
  if (!input.channel) throw new Error('vods config: channel is required')
  const twitchId = String(input.twitchId).trim()
  if (!/^\d+$/.test(twitchId)) throw new Error(`vods config: twitchId must be numeric, got ${JSON.stringify(input.twitchId)}`)
  if (!input.apiBase) throw new Error('vods config: apiBase is required')
  const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate)
  if (Number.isNaN(startDate.getTime())) throw new Error(`vods config: startDate is not a date: ${JSON.stringify(input.startDate)}`)
  return {
    channel: input.channel,
    twitchId,
    apiBase: input.apiBase.replace(/\/+$/, ''),
    startDate,
    defaultPartDuration: toNumber(input.defaultPartDuration, 'defaultPartDuration', DEFAULT_PART_DURATION),
  }
}
