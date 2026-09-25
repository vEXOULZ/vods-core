// Plays a VOD across its YouTube uploads: loads the right part for a VOD time, reports VOD time while playing,
// moves on to the next part when one ends, and tracks which parts can't be played.
//
// The YouTube player sits behind `PlayerLike` so this runs (and is tested) without the real IFrame API.
import type { Position, Timeline } from './timeline'

/** The subset of YT.Player used here. */
export interface PlayerLike {
  loadVideoById(videoId: string, startSeconds?: number): void
  cueVideoById(videoId: string, startSeconds?: number): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  getCurrentTime(): number
  getPlayerState(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  destroy(): void
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

/**
 * Why a part can't be played. `processing`: YouTube hasn't finished it (no duration yet); `missing`: removed,
 * private or never uploaded; `blocked`: embedding refused (usually a copyright claim); `error`: anything else.
 */
export type PartStatus = 'ok' | 'processing' | 'missing' | 'blocked' | 'error'

/** YouTube IFrame error code → part status. */
export function statusFromYouTubeError(code: number): PartStatus {
  switch (code) {
    case 2:
    case 100:
      return 'missing'
    case 101:
    case 150:
      return 'blocked'
    default:
      return 'error'
  }
}

export interface PlayerEvents {
  /** VOD seconds, about 4× a second while playing, and once after every seek. */
  time: (t: number) => void
  playing: (playing: boolean) => void
  /** The upload being played changed. */
  part: (index: number) => void
  /** A part failed; `status` says why. */
  partError: (index: number, status: PartStatus) => void
  /** The last part ended. */
  ended: () => void
}

type Listeners = { [K in keyof PlayerEvents]: Set<PlayerEvents[K]> }

export interface WatchPlayerOptions {
  /** Report interval while playing, in ms. */
  tickMs?: number
  /** Skip to the next part automatically when one can't be played. Default on. */
  skipBroken?: boolean
}

export class WatchPlayer {
  private player: PlayerLike | null = null
  private index = -1
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly listeners: Listeners = { time: new Set(), playing: new Set(), part: new Set(), partError: new Set(), ended: new Set() }
  readonly status: PartStatus[]
  private readonly tickMs: number
  private readonly skipBroken: boolean

  constructor(
    readonly timeline: Timeline,
    opts: WatchPlayerOptions = {},
  ) {
    this.tickMs = opts.tickMs ?? 250
    this.skipBroken = opts.skipBroken ?? true
    this.status = timeline.uploads.map((u) => (u.duration === null ? 'processing' : 'ok'))
  }

  on<K extends keyof PlayerEvents>(event: K, fn: PlayerEvents[K]): () => void {
    ;(this.listeners[event] as Set<PlayerEvents[K]>).add(fn)
    return () => (this.listeners[event] as Set<PlayerEvents[K]>).delete(fn)
  }

  private emit<K extends keyof PlayerEvents>(event: K, ...args: Parameters<PlayerEvents[K]>): void {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<PlayerEvents[K]>) => void)(...args)
  }

  /** Attach the YouTube player (once it's ready) and start at `start`. */
  attach(player: PlayerLike, start: Position = { index: 0, offset: 0 }, autoplay = true): void {
    this.player = player
    this.index = -1
    this.go(start, autoplay)
  }

  get partIndex(): number {
    return this.index
  }

  /** Current VOD time, or 0 before a part is loaded. */
  currentTime(): number {
    if (!this.player || this.index < 0) return 0
    return this.timeline.toVod({ index: this.index, offset: this.player.getCurrentTime() || 0 })
  }

  isPlaying(): boolean {
    return this.player?.getPlayerState() === YT_STATE.PLAYING
  }

  /** Jump to a VOD time. Inside a cut it lands at the end of the cut. */
  seek(t: number): void {
    this.go(this.timeline.locate(t), this.isPlaying())
  }

  /** Relative seek, e.g. ±10 s from the keyboard. */
  skip(delta: number): void {
    this.seek(Math.max(0, this.currentTime() + delta))
  }

  /** Start of a part (the part picker). */
  playPart(index: number): void {
    this.go({ index, offset: 0 }, true)
  }

  play(): void {
    this.player?.playVideo()
  }

  pause(): void {
    this.player?.pauseVideo()
  }

  private go(pos: Position, autoplay: boolean): void {
    const player = this.player
    if (!player || pos.index < 0 || pos.index >= this.timeline.uploads.length) return
    const offset = Math.max(0, pos.offset)
    if (pos.index === this.index) {
      player.seekTo(offset, true)
    } else {
      const id = this.timeline.uploads[pos.index]!.id
      this.index = pos.index
      if (autoplay) player.loadVideoById(id, offset)
      else player.cueVideoById(id, offset)
      this.emit('part', pos.index)
    }
    this.emit('time', this.timeline.toVod({ index: pos.index, offset }))
  }

  private nextPlayable(from: number): number {
    for (let i = from + 1; i < this.status.length; i++) if (this.status[i] === 'ok') return i
    return -1
  }

  /** Wire these to the YT.Player `onStateChange` / `onError` events. */
  handleState(state: number): void {
    if (state === YT_STATE.PLAYING) {
      this.startTicking()
      this.emit('playing', true)
    } else if (state === YT_STATE.PAUSED || state === YT_STATE.ENDED) {
      this.stopTicking()
      this.emit('playing', false)
    }
    if (state === YT_STATE.ENDED) {
      const next = this.index + 1 < this.timeline.uploads.length ? this.index + 1 : -1
      if (next === -1) this.emit('ended')
      else this.go({ index: next, offset: 0 }, true)
    }
  }

  handleError(code: number): void {
    const index = this.index
    if (index < 0) return
    const status = statusFromYouTubeError(code)
    this.status[index] = status
    this.stopTicking()
    this.emit('partError', index, status)
    if (this.skipBroken) {
      const next = this.nextPlayable(index)
      if (next !== -1) this.go({ index: next, offset: 0 }, true)
    }
  }

  private startTicking(): void {
    this.stopTicking()
    this.emit('time', this.currentTime())
    this.timer = setInterval(() => this.emit('time', this.currentTime()), this.tickMs)
  }

  private stopTicking(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  destroy(): void {
    this.stopTicking()
    this.player?.destroy()
    this.player = null
    for (const set of Object.values(this.listeners)) set.clear()
  }
}

// ---- The real YouTube IFrame API ----

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: PlayerLike }) => void
        onStateChange?: (e: { data: number }) => void
        onError?: (e: { data: number }) => void
      }
    },
  ) => PlayerLike
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace> | null = null

/** Loads https://www.youtube.com/iframe_api once. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error('Could not load the YouTube player'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

/**
 * Creates the YouTube player in `el` and attaches it to `watch`. YouTube's own controls stay on by default
 * (`controls: 1`). Resolves once the player is ready.
 */
export async function mountYouTube(
  el: HTMLElement,
  watch: WatchPlayer,
  opts: { start?: Position; autoplay?: boolean; controls?: boolean } = {},
): Promise<PlayerLike> {
  const YT = await loadYouTubeApi()
  return new Promise((resolve) => {
    new YT.Player(el, {
      width: '100%',
      height: '100%',
      playerVars: { autoplay: opts.autoplay === false ? 0 : 1, playsinline: 1, rel: 0, controls: opts.controls === false ? 0 : 1 },
      events: {
        onReady: (e) => {
          watch.attach(e.target, opts.start, opts.autoplay !== false)
          resolve(e.target)
        },
        onStateChange: (e) => watch.handleState(e.data),
        onError: (e) => watch.handleError(e.data),
      },
    })
  })
}
