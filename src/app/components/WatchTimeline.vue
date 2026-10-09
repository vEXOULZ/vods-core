<script setup lang="ts">
// One bar for the whole VOD (all parts): chapters in their game colour, restricted chapters hatched, parts that
// can't play hatched red, part labels above. Click, drag or use the arrow keys to seek (VOD seconds). The logic is
// useTimeline's (kit); this draws it.
import { toClock, type PartStatus, type PlayableTimeline, type Span } from '../../index'
import { unplayable } from '../lib/cuts'
import { useTimeline } from '../composables/useTimeline'
import SnailMarker from './SnailMarker.vue'

const props = defineProps<{
  timeline: PlayableTimeline
  /** The stretch of VOD time the bar covers. */
  range: Span
  /** VOD seconds, or a getter for them (so the page passing it doesn't re-render on every tick). */
  time: number | (() => number)
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

const {
  BREAK,
  time,
  root,
  track,
  tip,
  labelEls,
  pct,
  spans,
  label,
  runStart,
  shownLabels,
  breakSpans,
  chapterBars,
  unplayableBars,
  tickLefts,
  jumpBars,
  labelLefts,
  hover,
  tipShift,
  hoverChapter,
  hoverCut,
  hoverPreview,
  shown,
  snailMode,
  shownColor,
  seekTo,
  onDown,
  onMove,
  onUp,
  onLeave,
  onKey,
} = useTimeline(props, { seek: (t) => emit('seek', t) })
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
      @pointerleave="onLeave"
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
