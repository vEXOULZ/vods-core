import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowReactive } from 'vue'
import { Timeline } from '../../src/timeline'
import { useTimeline, type TimelineProps } from '../../src/app/composables/useTimeline'
import { fixtureVod } from '../helpers'

/** The bar over vod-plain (three parts: 10800 s, 10800 s, 3400 s), 1010 px wide, with one stream break at 10000 s. */
function setup(over: Partial<TimelineProps> = {}) {
  const t = ref(5000)
  const props = shallowReactive<TimelineProps>({
    timeline: new Timeline(fixtureVod('vod-plain')),
    range: { start: 0, end: 25000 },
    time: () => t.value,
    status: [],
    partIndex: 0,
    breaks: [10000],
    palette: new Map(),
    ...over,
  })
  const seek = vi.fn()
  const scope = effectScope()
  const bar = scope.run(() => useTimeline(props, { seek }))!
  bar.track.value = { getBoundingClientRect: () => ({ left: 0, width: 1010 }) } as HTMLElement
  return { t, props, seek, bar, scope }
}
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, preventDefault() {}, stopPropagation() {} }) as KeyboardEvent

describe('useTimeline', () => {
  it('places times on the bar, leaving room for the breaks', () => {
    const { bar } = setup()
    expect(bar.pct(0)).toBe('0%')
    expect(bar.pct(5000)).toBe('calc(20% - 2px)')
    // Right on a break is after it; a span ending there ends before it.
    expect(bar.pct(10000)).toBe('calc(40% + 6px)')
    expect(bar.width(0, 10000)).toBe('calc(40% - 4px)')
    expect(bar.breakSpans.value).toEqual([{ t: 10000, left: 'calc(40% - 4px)' }])
  })

  it('reads the time under the pointer, and a break as the start of the stream after it', () => {
    const { bar } = setup()
    expect(bar.pointAt(200)).toEqual({ t: 5000, brk: false })
    expect(bar.pointAt(400)).toEqual({ t: 10000, brk: true })
    expect(bar.pointAt(409)).toEqual({ t: 10000, brk: true })
    expect(bar.pointAt(410)).toEqual({ t: 10000, brk: false })
    expect(bar.pointAt(-50)).toEqual({ t: 0, brk: false })
    expect(bar.pointAt(5000)).toEqual({ t: 25000, brk: false })
  })

  it('seeks by keyboard within the range', () => {
    const { t, bar, seek } = setup()
    bar.onKey(key('ArrowRight'))
    expect(seek).toHaveBeenLastCalledWith(5010)
    bar.onKey(key('ArrowLeft', true))
    expect(seek).toHaveBeenLastCalledWith(4940)
    t.value = 30
    bar.onKey(key('PageDown'))
    expect(seek).toHaveBeenLastCalledWith(0)
    bar.onKey(key('End'))
    expect(seek).toHaveBeenLastCalledWith(24999)
    bar.onKey(key('x'))
    expect(seek).toHaveBeenCalledTimes(4)
  })

  it('follows a time getter, and floats the playhead on a jump playing cannot explain', async () => {
    vi.useFakeTimers()
    const { t, bar, scope } = setup()
    expect(bar.shown.value).toBe(5000)
    expect(bar.snailMode.value).toBe('sleep')
    t.value = 9000
    await nextTick()
    expect(bar.shown.value).toBe(9000)
    expect(bar.snailMode.value).toBe('float')
    vi.advanceTimersByTime(600)
    expect(bar.snailMode.value).toBe('sleep')
    scope.stop()
    vi.useRealTimers()
  })

  it('gives a run of same-labelled parts one label', () => {
    const { bar } = setup({ partLabel: (i) => (i < 2 ? 'Game A' : 'Game B') })
    expect([0, 1, 2].map(bar.runStart)).toEqual([0, 0, 2])
    expect(bar.label(1)).toBe('Game A')
  })
})
