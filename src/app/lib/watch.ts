// The watch page's time math that isn't the timeline's own: where in its part the playhead is, and when playing on
// (not seeking) carries a playthrough into its next stream.
import type { PlayableTimeline } from '../../index'

/** Seconds into the part at VOD time `t` (a synthetic VOD's part can start partway into its YouTube video). */
export function partOffset(timeline: PlayableTimeline, t: number): number {
  const at = timeline.locate(t)
  return Math.max(0, at.offset - timeline.partStart(at.index))
}

/** The longest step between two time reports still taken for playing on rather than a seek. */
export const PLAYED_STEP = 5

/**
 * The stream (an index into `streams`, never the first) that playing on from `prev` to `t` just entered, or -1: none
 * crossed, time went back, or it moved further than playing does between two reports.
 */
export function streamEntered(streams: readonly { start: number }[], prev: number, t: number): number {
  if (t <= prev || t - prev > PLAYED_STEP) return -1
  return streams.findIndex((s, k) => k > 0 && prev < s.start && t >= s.start)
}
