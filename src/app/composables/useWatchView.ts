// The watch page without its look: the YouTube player across parts, the part and chapter state, theater and
// fullscreen, copy link, the related VODs, a playthrough's handoff to its next stream (with its countdown), the
// end-of-VOD suggestion, chat replay, watch progress and the keyboard shortcuts. WatchView.vue draws it; a site with
// its own UI binds the same refs. Call it from a component's setup: it mounts the player once the component is.
import { computed, onMounted, onScopeDispose, ref, shallowRef, toRef, watch } from 'vue'
import {
  mountYouTube,
  toClock,
  WatchPlayer,
  watchPath,
  type ChatSources,
  type DriveFile,
  type PartStatus,
  type PlayableTimeline,
  type Position,
  type SegmentTimeline,
  type Span,
  type Vod,
} from '../../index'
import { useChat, useProgress } from '../../vue/index'
import { cutNote, unplayable } from '../lib/cuts'
import type { Notify } from '../lib/notify'
import { clamp } from '../lib/place'
import { partOffset, streamEntered } from '../lib/watch'
import { chatSourceFor, useChatSettings } from './useChatSettings'
import { useFullscreen } from './useFullscreen'
import { useNextVod, type NextVod } from './useNextVod'
import { useShortcuts, type Shortcut } from './useShortcuts'

export interface WatchViewProps {
  vod: Vod
  timeline: PlayableTimeline
  /** A synthetic VOD's timeline again, for chat and the related menu (null for a plain VOD). */
  segments?: SegmentTimeline | null
  /** A synthetic VOD's source VODs that loaded. */
  sources?: readonly Vod[]
  start: Position
  /** VOD time the timeline bar covers; defaults to the whole VOD. */
  range?: Span
  /** Label for part i in the picker and on the bar. */
  partLabel?: (i: number) => string
  /** Link to this page at VOD time t (for "copy link"). */
  shareUrl: (t: number) => string
  download?: DriveFile | null
  /** Save the watch position in this browser. */
  track?: boolean
}

/** Seconds a playthrough's handoff card counts down before it plays on into the next stream. */
export const AUTO_CONTINUE = 8

/** What a part that can't play says about why. */
export const PART_STATUS_TEXT: Record<PartStatus, string> = {
  ok: '',
  processing: 'processing',
  missing: 'not on YouTube',
  blocked: "can't embed",
  error: "won't play",
}

/**
 * The watch page's logic. Bind `ytEl` to the element the YouTube player replaces. `time` changes on every tick: read
 * it through `now`, `clockText` and `offsetText` in small children so the page itself doesn't re-render each time.
 */
export function useWatchView(props: WatchViewProps, options: { notify: Notify }) {
  const { notify } = options
  const chat = useChatSettings()

  const range = computed<Span>(() => props.range ?? { start: 0, end: props.vod.duration })
  const spans = computed(() => props.timeline.partSpans())
  const label = (i: number) => props.partLabel?.(i) ?? `Part ${props.timeline.uploads[i]?.part ?? i + 1}`

  // ---- player ----
  const ytEl = ref<HTMLElement | null>(null)
  const time = ref(props.timeline.toVod(props.start))
  const playing = ref(false)
  const rate = ref(1)
  const partIndex = ref(props.start.index)
  const status = shallowRef<PartStatus[]>([])
  const playerError = ref<string | null>(null)
  let wp: WatchPlayer | null = null

  onMounted(() => {
    const p = (wp = new WatchPlayer(props.timeline, { skipBroken: false }))
    status.value = [...p.status]
    p.on('time', (t) => (time.value = t))
    p.on('playing', (v) => (playing.value = v))
    p.on('rate', (r) => (rate.value = r))
    p.on('part', (i) => (partIndex.value = i))
    p.on('partError', () => (status.value = [...p.status]))
    p.on('ended', () => {
      playing.value = false
      if (handoff.value === null) void openEnd()
    })
    mountYouTube(ytEl.value!, p, { start: props.start, autoplay: true }).catch((e: Error) => {
      if (wp === p) playerError.value = e.message || 'The YouTube player could not load.'
    })
  })
  onScopeDispose(() => {
    wp?.destroy()
    wp = null
  })

  function seek(t: number) {
    jumped = true
    ending.value = null
    if (handoff.value !== null) closeHandoff(true)
    const to = props.timeline.watchable(clamp(t, range.value.start, range.value.end))
    time.value = to
    wp?.seek(to)
  }
  function playPart(i: number) {
    jumped = true
    if (handoff.value !== null) closeHandoff(false)
    if (wp) wp.playPart(i)
    else time.value = spans.value[i]?.start ?? time.value
  }
  function togglePlay() {
    if (!wp) return
    if (handoff.value !== null) return closeHandoff(true)
    if (wp.isPlaying()) wp.pause()
    else wp.play()
  }

  // ---- what changes on every tick, as getters for small children ----
  /** The playhead (for the timeline bar). */
  const now = () => time.value
  /** "1:02:03", the playhead. */
  const clockText = () => toClock(time.value)
  /** How far into its part the playhead is, "12:34". */
  const offsetText = () => toClock(partOffset(props.timeline, time.value))

  // ---- parts ----
  const curBad = computed(() => unplayable(status.value[partIndex.value]))
  const playable = (i: number) => !unplayable(status.value[i])
  const prevOk = computed(() => {
    for (let i = partIndex.value - 1; i >= 0; i--) if (playable(i)) return i
    return -1
  })
  const nextOk = computed(() => {
    for (let i = partIndex.value + 1; i < spans.value.length; i++) if (playable(i)) return i
    return -1
  })

  // ---- chapters ----
  const chapters = computed(() => props.timeline.chapters.filter((c) => c.end > range.value.start && c.start < range.value.end))
  const chapter = computed(() => props.timeline.chapterAt(time.value))
  const chapterIdx = computed(() => (chapter.value ? chapters.value.indexOf(chapter.value) : -1))
  /** A playthrough's streams (a merge or split plays as one VOD, so it has none to tell apart). */
  const streams = computed(() => (props.segments && !props.vod.synthetic?.supersedes ? props.segments.streams() : []))
  /** Where each stream after the first starts: a break on the bar. */
  const streamBreaks = computed(() => streams.value.slice(1).map((s) => s.start))
  /** Where a playthrough's stream skips part of its VOD (two windows of one VOD, back to back). */
  const streamJumps = computed(() => (streams.value.length ? props.segments!.jumps().map((j) => ({ at: j.at, skipped: j.to - j.from })) : []))
  /** "S2" for a chapter of the second stream, when there's more than one. */
  function chapterStream(c: { start: number }): string | null {
    if (streams.value.length < 2) return null
    const s = props.segments?.segmentAt(c.start)?.segment.stream
    return s == null ? null : `S${s + 1}`
  }
  function stepChapter(dir: 1 | -1) {
    const open = chapters.value.filter((c) => !c.restricted)
    const t = time.value
    const target = dir > 0 ? open.find((c) => c.start > t + 1) : [...open].reverse().find((c) => c.start < t - 3)
    if (target) seek(Math.max(target.start, range.value.start))
    else if (dir < 0) seek(range.value.start)
  }

  // ---- actions ----
  const theater = ref(false)
  /** In theater mode the controls tuck away; a faint strip under the video brings them back. */
  const controlsOpen = ref(true)
  watch(theater, (on) => (controlsOpen.value = !on))
  const showControls = computed(() => !theater.value || controlsOpen.value)
  const fullscreen = useFullscreen()
  async function toggleFullscreen() {
    if (!(await fullscreen.toggle())) notify("The browser didn't allow fullscreen", { kind: 'error' })
  }
  const fullscreenLabel = computed(() =>
    !fullscreen.supported ? "Fullscreen isn't available in this browser" : fullscreen.active.value ? 'Exit fullscreen' : 'Fullscreen',
  )
  async function copyLink() {
    const url = props.shareUrl(time.value)
    try {
      await navigator.clipboard.writeText(url)
      notify(`Link copied at ${toClock(time.value)}`)
    } catch {
      notify("Couldn't copy the link", { kind: 'error' })
    }
  }
  const downloadUrl = computed(() => (props.download ? `https://drive.google.com/open?id=${encodeURIComponent(props.download.id)}` : null))

  // ---- related VODs ----
  const sourceById = computed(() => new Map((props.sources ?? []).map((s) => [s.id, s])))
  const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  /**
   * A playthrough's streams: picking one plays it here, and the arrow beside it opens the VOD it comes from. (A merge
   * or split replaces its VODs, so those aren't listed: they lead back here.)
   */
  const madeOf = computed(() => {
    const segs = props.segments?.segments ?? []
    return streams.value.map((st) => {
      const first = segs[st.segment]!
      const last = segs.filter((s) => s.stream === st.stream).at(-1) ?? first
      const src = sourceById.value.get(st.vodId)
      return {
        key: `${st.stream}:${st.vodId}`,
        mark: `S${st.stream + 1}`,
        title: first.label ?? src?.title ?? st.vodId,
        sub: src ? shortDate(src.createdAt) : '',
        range: `${toClock(first.start)}–${toClock(last.end)} of the VOD`,
        original: watchPath(src ?? { id: st.vodId, uploads: [] }, first.start),
        at: st.start,
        /** Its VOD, from where this stream's last window ends (to watch on past it). */
        finish: watchPath(src ?? { id: st.vodId, uploads: [] }, last.end),
      }
    })
  })
  /** Index into `madeOf` of the stream playing (kept out of `madeOf`, which then doesn't rebuild on every tick). */
  const currentStream = computed(() => streams.value.findLastIndex((st) => st.start <= time.value))
  const appearsIn = computed(() => props.vod.appearsIn ?? [])
  const relatedCount = computed(() => madeOf.value.length + appearsIn.value.length)

  // ---- stream handoff ----
  // Playing on into a playthrough's next stream (not seeking there) pauses on a card: go on (by itself after a
  // countdown, which can be stopped), or finish the stream before on its own VOD.
  /** Index into `madeOf` of the stream that's about to play, while the card is up. */
  const handoff = ref<number | null>(null)
  /** Seconds left before it goes on by itself; null once stopped. */
  const countdown = ref<number | null>(null)
  let countdownTimer: ReturnType<typeof setInterval> | undefined
  /** Set by a seek, so the time it lands on isn't taken for playing on. */
  let jumped = false
  let lastTime = time.value
  watch(time, (t) => {
    const prev = lastTime
    lastTime = t
    if (jumped) return void (jumped = false)
    if (handoff.value !== null) return
    const i = streamEntered(streams.value, prev, t)
    if (i > 0) openHandoff(i)
  })
  /** Just after the timer is stopped, while its button can't continue yet (a double click shouldn't go on). */
  const grace = ref(false)
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  function stopCountdown() {
    if (countdown.value === null) return
    clearInterval(countdownTimer)
    countdown.value = null
    grace.value = true
    clearTimeout(graceTimer)
    graceTimer = setTimeout(() => (grace.value = false), 500)
  }
  function openHandoff(i: number) {
    handoff.value = i
    wp?.pause()
    countdown.value = AUTO_CONTINUE
    const until = Date.now() + AUTO_CONTINUE * 1000
    countdownTimer = setInterval(() => {
      countdown.value = Math.max(0, (until - Date.now()) / 1000)
      if (countdown.value <= 0) closeHandoff(true)
    }, 100)
  }
  function closeHandoff(play: boolean) {
    clearInterval(countdownTimer)
    clearTimeout(graceTimer)
    countdown.value = null
    grace.value = false
    handoff.value = null
    if (play) wp?.play()
  }
  onScopeDispose(() => (clearInterval(countdownTimer), clearTimeout(graceTimer)))
  const handoffCard = computed(() => {
    const i = handoff.value
    if (i === null) return null
    const from = madeOf.value[i - 1]
    const to = madeOf.value[i]
    return from && to ? { from, to } : null
  })

  // ---- end of the VOD ----
  // Played to the end, a card like the handoff one suggests a random VOD that isn't finished: one to pick up where it
  // was left, or one never opened (useNextVod). Its timer is stopped from the start for now, so nothing goes on by
  // itself. Playing again (or seeking) puts it away.
  const nextVod = useNextVod(() => props.vod.id)
  const ending = shallowRef<NextVod | null>(null)
  const rolling = ref(false)
  /** Suggested since this card came up, so "another one" goes through them all before repeating. */
  const shown: string[] = []
  async function suggest(): Promise<NextVod | null> {
    rolling.value = true
    try {
      let pick = await nextVod.next(shown)
      if (!pick && shown.length) {
        shown.splice(0, shown.length - 1) // all seen: start over, just not with the one up now
        pick = await nextVod.next(shown)
      }
      if (pick) shown.push(pick.vod.id)
      return pick
    } finally {
      rolling.value = false
    }
  }
  async function openEnd() {
    shown.length = 0
    const pick = await suggest()
    if (pick && !playing.value) ending.value = pick
  }
  async function another() {
    const pick = await suggest()
    if (pick && ending.value) ending.value = pick
  }
  watch(playing, (v) => v && (ending.value = null))

  // ---- chat + progress ----
  // The chats the VOD whose chat is showing has (on a synthetic VOD, the playing source's), once chat's first page
  // says (kept here, since useChat's own ref doesn't exist yet when its options are first read). Tagged with the VOD,
  // so the next VOD doesn't start from this one's.
  const knownSources = shallowRef<{ vodId: string; sources: ChatSources } | null>(null)
  const replay = useChat({
    vodId: () => props.vod.id,
    time,
    playing,
    offset: toRef(chat, 'delay'),
    segments: () => props.segments ?? null,
    chatSource: () =>
      chatSourceFor(chat.source, knownSources.value && knownSources.value.vodId === replay.vodId.value ? knownSources.value.sources : null),
  })
  watch(replay.sources, (s) => {
    if (s) knownSources.value = { vodId: replay.vodId.value, sources: s }
  })
  const chatError = computed(() => replay.error.value?.message ?? null)
  if (props.track !== false) useProgress({ vodId: () => props.vod.id, duration: () => props.vod.duration, time, playing })

  // ---- keyboard ----
  const shortcuts = computed<Shortcut[]>(() => [
    { keys: [' ', 'k'], display: 'space / k', label: 'Play / pause', run: togglePlay },
    { keys: ['j', 'ArrowLeft'], display: 'j / ←', label: 'Back 10s', run: () => seek(time.value - 10) },
    { keys: ['l', 'ArrowRight'], display: 'l / →', label: 'Forward 10s', run: () => seek(time.value + 10) },
    { keys: [','], display: ',', label: 'Previous chapter', run: () => stepChapter(-1) },
    { keys: ['.'], display: '.', label: 'Next chapter', run: () => stepChapter(1) },
    { keys: ['['], display: '[', label: 'Previous part', run: () => partIndex.value > 0 && playPart(partIndex.value - 1) },
    { keys: [']'], display: ']', label: 'Next part', run: () => partIndex.value < spans.value.length - 1 && playPart(partIndex.value + 1) },
    { keys: ['c'], display: 'c', label: 'Show / hide chat', run: () => (chat.open = !chat.open) },
    { keys: ['t'], display: 't', label: 'Theater mode', run: () => (theater.value = !theater.value) },
    { keys: ['h'], display: 'h', label: 'Show / hide controls (theater)', run: () => theater.value && (controlsOpen.value = !controlsOpen.value) },
    { keys: ['f'], display: 'f', label: 'Fullscreen', run: () => fullscreen.supported && toggleFullscreen() },
    { keys: ['y'], display: 'y', label: 'Copy link at this time', run: copyLink },
  ])
  useShortcuts(() => shortcuts.value)

  return {
    chat,
    range,
    spans,
    label,
    cutNote,
    unplayable,
    // player
    ytEl,
    time,
    now,
    clockText,
    offsetText,
    playing,
    rate,
    partIndex,
    status,
    playerError,
    seek,
    playPart,
    togglePlay,
    // parts
    statusText: PART_STATUS_TEXT,
    curBad,
    prevOk,
    nextOk,
    // chapters
    chapters,
    chapter,
    chapterIdx,
    streams,
    streamBreaks,
    streamJumps,
    chapterStream,
    stepChapter,
    // actions
    theater,
    controlsOpen,
    showControls,
    fullscreen,
    toggleFullscreen,
    fullscreenLabel,
    copyLink,
    downloadUrl,
    // related
    madeOf,
    currentStream,
    appearsIn,
    relatedCount,
    // handoff
    AUTO_CONTINUE,
    handoff,
    handoffCard,
    countdown,
    grace,
    stopCountdown,
    closeHandoff,
    // end of the VOD
    ending,
    rolling,
    another,
    // chat
    replay,
    chatError,
    shortcuts,
  }
}
