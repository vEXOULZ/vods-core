<script setup lang="ts">
// One bar for the whole VOD (all parts): chapters in their game colour, restricted chapters hatched, parts that
// can't play hatched red, part labels above. Click, drag or use the arrow keys to seek (VOD seconds).
import { clamp, clampX } from '@vexoulz/ui'
import { previewFrame, toClock, type PartStatus, type PlayableTimeline, type Span } from '../../index'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { unplayable } from '../lib/cuts'
import { vodsConfig } from '../site'
import SnailMarker, { type SnailMode } from './SnailMarker.vue'

const props = defineProps<{
  timeline: PlayableTimeline
  /** The stretch of VOD time the bar covers. */
  range: Span
  time: number
  status: readonly PartStatus[]
  partIndex: number
  /** Label for part i (P1, or a game name on the games page). */
  partLabel?: (i: number) => string
  /**
   * Where a playthrough moves on to its next stream. Each gets a small hollow break with a jagged line: it takes room
   * on the bar but no time (unlike a "stream down" gap inside a stream, which is time the stream was down).
   */
  breaks?: readonly number[]
  /** Where a stream jumps within its VOD (`skipped`: source seconds left out; below 0, it goes back). */
  jumps?: readonly { at: number; skipped: number }[]
  /** Colours per game (gamePalette of the VOD), shared with the posters. */
  palette: Map<string, string>
  /** The snail on the playhead crawls while this is on, and sleeps otherwise. */
  playing?: boolean
  /** Playback speed, which the snail crawls at. */
  rate?: number
}>()
const emit = defineEmits<{ seek: [t: number] }>()

const len = computed(() => Math.max(1, props.range.end - props.range.start))
/** Width of a stream break, in px: a fixed size reads the same on a 2 h playthrough as on a 40 h one. */
const BREAK = 10
const brks = computed(() => [...(props.breaks ?? [])].filter((b) => b > props.range.start && b < props.range.end).sort((a, b) => a - b))
// A time's place on the bar: its share of the time (`f`), of the room left after the breaks, plus the breaks before
// it (`k`). A time right on a break is after it; a chapter ending there ends before it (`end`).
function at(t: number, end = false) {
  const f = clamp(t - props.range.start, 0, len.value) / len.value
  let k = 0
  for (const b of brks.value) {
    if (end ? b >= t : b > t) break
    k++
  }
  return { f, k }
}
const css = (f: number, k: number) => {
  const px = k * BREAK - f * brks.value.length * BREAK
  return px ? `calc(${f * 100}% ${px < 0 ? '-' : '+'} ${Math.abs(px)}px)` : `${f * 100}%`
}
const pct = (t: number) => {
  const p = at(t)
  return css(p.f, p.k)
}
const width = (a: number, b: number) => {
  const p = at(Math.max(a, props.range.start))
  const q = at(Math.min(b, props.range.end), true)
  return css(Math.max(0, q.f - p.f), Math.max(0, q.k - p.k))
}
/** Each break, placed just before its stream starts. */
const breakSpans = computed(() => brks.value.map((b, i) => ({ t: b, left: css(at(b).f, i) })))

const chapters = computed(() => props.timeline.chapters.filter((c) => c.end > props.range.start && c.start < props.range.end))
const spans = computed(() => props.timeline.partSpans())
// Worked out once per timeline, not on every render (the bar renders on every tick, asking for each part's label).
const labels = computed(() => spans.value.map((_, i) => props.partLabel?.(i) ?? `P${i + 1}`))
const label = (i: number) => labels.value[i] ?? `P${i + 1}`
const near = (t: number, list: readonly number[]) => list.some((x) => Math.abs(x - t) < 0.5)
const jumpList = computed(() => (props.jumps ?? []).filter((j) => j.at > props.range.start && j.at < props.range.end))
/** Part ticks, but not where a break or a jump already marks the spot. */
const ticks = computed(() => {
  const jumpAt = jumpList.value.map((j) => j.at)
  return spans.value.slice(1).filter((s) => !near(s.start, brks.value) && !near(s.start, jumpAt))
})
// The bar's fixed marks, placed once per timeline rather than on every tick of the playhead.
const chapterBars = computed(() =>
  chapters.value.map((c) => ({ c, style: { left: pct(c.start), width: width(c.start, c.end), '--c': props.palette.get(c.name) } })),
)
const unplayableBars = computed(() =>
  spans.value.flatMap((s, i) => (unplayable(props.status[i]) ? [{ left: pct(s.start), width: width(s.start, s.end) }] : [])),
)
const tickLefts = computed(() => ticks.value.map((s) => pct(s.start)))
const jumpBars = computed(() => jumpList.value.map((j) => ({ at: j.at, left: pct(j.at) })))
const labelLefts = computed(() => spans.value.map((s) => pct(s.start)))

// Part labels can't all fit when parts are short or the bar is narrow. They're placed in px, the one playing first,
// and a label that would run into one already placed is hidden (its tick stays; the part menu still lists it). A
// part labelled as the one before it (more of the same video) gets no label of its own.
const trackWidth = ref(0)
const labelEls: (HTMLElement | null)[] = []
const labelWidths = ref<number[]>([])
let resize: ResizeObserver | undefined
onMounted(() => {
  resize = new ResizeObserver(() => (trackWidth.value = track.value?.clientWidth ?? 0))
  if (track.value) resize.observe(track.value)
})
onUnmounted(() => resize?.disconnect())
watch(
  () => labels.value.join('|'),
  () => (labelWidths.value = spans.value.map((_, i) => labelEls[i]?.offsetWidth ?? 0)),
  { flush: 'post', immediate: true },
)
/** Where time `t` sits on the bar, in px. */
function px(t: number) {
  const p = at(t)
  return p.f * Math.max(1, trackWidth.value - brks.value.length * BREAK) + p.k * BREAK
}
/** For each part, the first part of the run of same-labelled parts it belongs to. */
const runStarts = computed(() => {
  const out: number[] = []
  labels.value.forEach((l, i) => out.push(i > 0 && l === labels.value[i - 1] ? out[i - 1]! : i))
  return out
})
const runStart = (i: number) => runStarts.value[i] ?? i
const shownLabels = computed(() => {
  const out = new Set<number>()
  if (!trackWidth.value) return out
  const cur = runStart(props.partIndex)
  const order = spans.value.map((_, i) => i).filter((i) => runStart(i) === i)
  order.sort((a, b) => Number(b === cur) - Number(a === cur))
  const placed: [number, number][] = []
  for (const i of order) {
    const x = px(spans.value[i]!.start) + 2
    const w = labelWidths.value[i] || label(i).length * 6.5 + 6
    if (placed.some(([a, b]) => x < b + 3 && x + w > a - 3)) continue
    placed.push([x, x + w])
    out.add(i)
  }
  return out
})

const track = ref<HTMLElement | null>(null)
const hover = ref<{ x: number; t: number; brk: boolean; jump?: { at: number; skipped: number } } | null>(null)
const dragging = ref(false)

// The snail floats while the time is being moved, and a moment after (so a click or a key shows it too).
const floating = ref(false)
let settle: ReturnType<typeof setTimeout> | undefined
function float() {
  floating.value = true
  clearTimeout(settle)
  settle = setTimeout(() => (floating.value = false), 500)
}
function seekTo(t: number) {
  float()
  emit('seek', t)
}
onUnmounted(() => clearTimeout(settle))

// A jump in the reported time that playing can't explain is a seek made somewhere else (YouTube's own progress bar,
// the part picker): the snail floats for those too.
let last = { t: props.time, at: performance.now() }
watch(
  () => props.time,
  (t) => {
    const now = performance.now()
    const played = props.playing ? ((now - last.at) / 1000) * (props.rate ?? 1) : 0
    if (Math.abs(t - last.t - played) > 2) float()
    last = { t, at: now }
  },
)

/** The time under a point of the bar; on a break, the start of the stream after it. */
function pointAt(clientX: number): { t: number; brk: boolean } {
  const r = track.value!.getBoundingClientRect()
  const x = clientX - r.left
  const room = Math.max(1, r.width - brks.value.length * BREAK)
  let k = 0
  for (const b of brks.value) {
    const bx = ((b - props.range.start) / len.value) * room + k * BREAK
    if (x < bx) break
    if (x < bx + BREAK) return { t: b, brk: true }
    k++
  }
  return { t: props.range.start + clamp((x - k * BREAK) / room, 0, 1) * len.value, brk: false }
}
const timeAt = (clientX: number) => pointAt(clientX).t
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  onMove(e)
}
function onMove(e: PointerEvent) {
  const r = track.value!.getBoundingClientRect()
  const x = e.clientX - r.left
  const jump = jumpList.value.find((j) => Math.abs(px(j.at) - x) <= 4)
  hover.value = { x, ...pointAt(e.clientX), jump }
}
function onUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  seekTo(props.timeline.watchable(timeAt(e.clientX)))
}
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 60 : 10
  const map: Record<string, number> = { ArrowLeft: -step, ArrowRight: step, PageDown: -300, PageUp: 300 }
  if (e.key in map) {
    e.preventDefault()
    e.stopPropagation()
    seekTo(props.timeline.watchable(clamp(props.time + map[e.key]!, props.range.start, props.range.end)))
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    seekTo(props.timeline.watchable(e.key === 'Home' ? props.range.start : props.range.end - 1))
  }
}
// The time tip is centred on the pointer; near the ends of the bar it slides sideways to stay over the timeline
// (not off screen, and not over the chat beside it).
const root = ref<HTMLElement | null>(null)
const tip = ref<HTMLElement | null>(null)
const tipShift = ref(0)
watch(
  hover,
  () => {
    const box = tip.value?.getBoundingClientRect()
    const area = root.value?.getBoundingClientRect()
    tipShift.value =
      box && area ? clampX(box.left - tipShift.value - area.left, box.right - tipShift.value - area.left, area.width, 4) : 0
  },
  { flush: 'post' },
)
const hoverChapter = computed(() => (hover.value ? props.timeline.chapterAt(hover.value.t) : null))
const hoverCut = computed(() => (hover.value ? props.timeline.cutAt(hover.value.t) : null))
// The frame under the pointer, from the archive's preview sheets of the upload there; none over a break, a jump,
// a gap, a cut or a part that can't play.
const hoverPreview = computed(() => {
  const h = hover.value
  if (!h || h.brk || h.jump || hoverChapter.value?.kind === 'gap' || hoverCut.value) return null
  const pos = props.timeline.locate(h.t)
  const upload = props.timeline.uploads[pos.index]
  if (!upload || unplayable(props.status[pos.index])) return null
  return previewFrame(upload, pos.offset, vodsConfig.apiBase)
})
const shown = computed(() => (dragging.value && hover.value ? hover.value.t : props.time))
const snailMode = computed<SnailMode>(() => (dragging.value || floating.value ? 'float' : props.playing ? 'walk' : 'sleep'))
/** The colour of the game at the playhead, for the snail's shell (none in a "stream down" gap). */
const shownColor = computed(() => {
  const c = props.timeline.chapterAt(shown.value)
  return c && c.kind !== 'gap' ? props.palette.get(c.name) : undefined
})
</script>

<template>
  <div ref="root" class="timeline">
    <div class="labels" aria-hidden="true">
      <button
        v-for="(s, i) in spans"
        :key="i"
        :ref="(el) => (labelEls[i] = el as HTMLElement | null)"
        type="button"
        tabindex="-1"
        class="plabel vx-mono"
        :class="{ cur: i === runStart(partIndex), bad: unplayable(status[i]), hid: !shownLabels.has(i) }"
        :style="{ left: labelLefts[i] }"
        :title="`${label(i)} · ${toClock(s.start)}–${toClock(s.end)}${unplayable(status[i]) ? ' · unavailable' : ''}`"
        @click="seekTo(s.start)"
      >{{ label(i) }}</button>
    </div>
    <div
      ref="track"
      class="track"
      role="slider"
      tabindex="0"
      aria-label="Seek"
      :aria-valuemin="Math.floor(range.start)"
      :aria-valuemax="Math.floor(range.end)"
      :aria-valuenow="Math.floor(time)"
      :aria-valuetext="toClock(time)"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="!dragging && (hover = null)"
      @keydown="onKey"
    >
      <span
        v-for="({ c, style }, i) in chapterBars"
        :key="i"
        class="seg"
        :class="{ cut: c.restricted, gap: c.kind === 'gap' }"
        :style="style"
      ></span>
      <span v-for="(u, i) in unplayableBars" :key="'u' + i" class="unseg" :style="u"></span>
      <span v-for="(left, i) in tickLefts" :key="'t' + i" class="tick" :style="{ left }"></span>
      <span v-for="j in jumpBars" :key="'j' + j.at" class="jump" :style="{ left: j.left }"></span>
      <span v-for="b in breakSpans" :key="'b' + b.t" class="brk" :style="{ left: b.left, width: `${BREAK}px` }">
        <svg viewBox="0 0 6 20" preserveAspectRatio="none"><polyline points="3,0 1,3 5,7 1,11 5,15 1,18 3,20" /></svg>
      </span>
      <span class="rest" :style="{ left: pct(shown) }"></span>
      <span class="played" :style="{ width: pct(shown) }"></span>
      <SnailMarker class="head" :mode="snailMode" :rate="rate" :shell="shownColor" :style="{ left: pct(shown) }" />
      <span
        v-if="hover"
        ref="tip"
        class="tip vx-mono"
        :style="{ left: `${hover.x}px`, translate: tipShift ? `${tipShift}px 0` : undefined }"
      >
        <span
          v-if="hoverPreview"
          class="frame"
          :style="{
            width: `${hoverPreview.w}px`,
            height: `${hoverPreview.h}px`,
            backgroundImage: `url(${hoverPreview.url})`,
            backgroundPosition: `-${hoverPreview.x}px -${hoverPreview.y}px`,
            backgroundSize: `${hoverPreview.sheetW}px ${hoverPreview.sheetH}px`,
          }"
        ></span>
        <span><template v-if="hover.brk">stream change</template><template v-else-if="hover.jump">{{ toClock(hover.jump.at) }} · {{ hover.jump.skipped >= 0 ? `skips ${toClock(hover.jump.skipped)} of the stream` : `goes back ${toClock(-hover.jump.skipped)}` }}</template><template v-else>{{ toClock(hover.t) }}<template v-if="hoverChapter?.kind === 'gap'"> · stream down</template><template v-else-if="hoverCut"> · cut from YouTube</template><template v-else-if="hoverChapter"> · {{ hoverChapter.name }}</template></template></span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.timeline { padding: 2px 12px 0; }
.labels { position: relative; height: 16px; }
.plabel {
  position: absolute; top: 1px; transform: translateX(2px); font-size: 10px; line-height: 1; padding: 1px 3px;
  background: none; border: none; color: var(--vx-muted); cursor: pointer; border-radius: 3px; white-space: nowrap;
  max-width: 12ch; overflow: hidden; text-overflow: ellipsis;
}
.plabel.cur { color: var(--vx-accent); }
.plabel.hid { visibility: hidden; }
.plabel.bad { text-decoration: line-through; opacity: 0.6; }
.plabel:hover { color: var(--vx-ink); }
.track { position: relative; height: 8px; cursor: pointer; margin: 2px 0 4px; touch-action: none; border-radius: 2px; outline-offset: 4px; }
.track:hover, .track:focus-visible { height: 10px; margin-top: 1px; margin-bottom: 3px; }
.seg { position: absolute; top: 0; bottom: 0; border-right: 2px solid rgb(0 0 0 / 0.85); background: var(--c); }
.seg.cut { background: repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.18) 0 3px, transparent 3px 6px); }
/* A merge's gap: the stream was down, so nothing to hatch; a dotted line through the middle marks the join. */
.seg.gap { background: radial-gradient(circle, rgb(255 255 255 / 0.35) 1px, transparent 1.5px) 0 50% / 5px 100% repeat-x; }
.unseg { position: absolute; top: 0; bottom: 0; pointer-events: none; background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--vx-bad) 55%, transparent) 0 2px, rgb(0 0 0 / 0.65) 2px 6px); }
.tick { position: absolute; top: -9px; bottom: -2px; width: 1px; background: var(--vx-muted); pointer-events: none; }
/* Where a stream jumps within its VOD: a thin slit through the bar, with a notch above it. */
.jump { position: absolute; top: -5px; bottom: 0; width: 3px; margin-left: -1.5px; z-index: 1; pointer-events: none; background: var(--vx-bg); }
.jump::before { content: ""; position: absolute; left: -2px; right: -2px; top: 0; height: 3px; background: var(--vx-muted); clip-path: polygon(0 0, 100% 0, 50% 100%); }
/* Between two streams of a playthrough: an empty notch in the bar with a jagged line down it. It's no time, so it
   isn't hatched or dotted like the gaps and cuts that are. */
.brk { position: absolute; top: -3px; bottom: -3px; z-index: 1; pointer-events: none; color: var(--vx-muted); }
.brk svg { display: block; width: 100%; height: 100%; overflow: visible; }
.brk polyline { fill: none; stroke: currentColor; stroke-width: 1.2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
/* Progress never paints over the chapter colours: what's still ahead is dimmed, and a thin accent line runs under
   what's been played. */
.rest { position: absolute; right: 0; top: 0; bottom: 0; background: rgb(0 0 0 / 0.55); pointer-events: none; }
.played { position: absolute; left: 0; bottom: -4px; height: 2px; background: var(--vx-accent); border-radius: 1px; pointer-events: none; }
/* The snail's head sits on the time, its foot on the bar. */
.head { position: absolute; z-index: 2; bottom: -2px; width: 24px; height: 24px; margin-left: -22px; pointer-events: none; filter: drop-shadow(0 0 2px rgb(0 0 0 / 0.7)); }
.tip {
  position: absolute; bottom: calc(100% + 22px); transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  font-size: 11px; padding: 2px 6px; border-radius: var(--vx-radius-sm); background: var(--vx-pop); border: 1px solid var(--vx-line);
  z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.frame { display: block; margin: 2px -4px 0; border-radius: 2px; background-color: #000; background-repeat: no-repeat; }
</style>
