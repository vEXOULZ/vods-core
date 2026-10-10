import { ProblemError } from '@vexoulz/platform-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowReactive } from 'vue'
import { Timeline } from '../../src/timeline'
import { type AdminVod, type Splice, type SpliceResult } from '../../src/app/admin/api'
import { admin } from '../../src/app/admin/session'
import { badGap, describeSplice, splitJoins, useSplice } from '../../src/app/composables/useSplice'
import { fixtureVod, rawFixture } from '../helpers'

const splice = (over: Partial<Splice>): Splice => ({
  id: 1, kind: 'merge', vodId: 'A', otherId: 'B', offset: 3600, gap: null, detail: {}, createdAt: '', undoneAt: null, undoable: true, ...over,
})
const flush = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => vi.restoreAllMocks())

describe('splice helpers', () => {
  it('describes merges and splits', () => {
    expect(describeSplice(splice({}))).toBe('B merged into A at 1:00:00')
    expect(describeSplice(splice({ gap: 252 }))).toBe('B merged into A at 1:00:00 (down 4m 12s)')
    expect(describeSplice(splice({ gap: -40 }))).toBe('B merged into A at 1:00:00 (overlapped 40s)')
    expect(describeSplice(splice({ kind: 'split', otherId: 'C' }))).toBe('A split at 1:00:00; the rest became C')
  })

  it('offers a split after every part but the last', () => {
    const timeline = new Timeline(fixtureVod('vod-plain'))
    const spans = timeline.partSpans()
    expect(splitJoins(timeline)).toEqual(spans.slice(0, -1).map((s, i) => ({ at: Math.round(s.end), label: `after P${i + 1}` })))
    expect(splitJoins(null)).toEqual([])
  })

  it('takes an empty gap or 0+ seconds, and nothing else', () => {
    expect(badGap('')).toBe(false)
    expect(badGap('0')).toBe(false)
    expect(badGap('4:12')).toBe(false)
    expect(badGap('-3')).toBe(true)
    expect(badGap('soon')).toBe(true)
  })
})

describe('useSplice', () => {
  it('asks before forcing an undo over later edits, then retries with force', async () => {
    vi.spyOn(admin, 'mergeCandidates').mockResolvedValue({ vod: {} as never, withinMinutes: 30, candidates: [] })
    const result = { error: false, msg: 'Unmerged', splice: splice({}), vod: {} as AdminVod } satisfies SpliceResult
    const unmerge = vi
      .spyOn(admin, 'unmerge')
      .mockRejectedValueOnce(new ProblemError(409, { msg: 'Edited since', edited: ['chapters'] }))
      .mockResolvedValueOnce(result)
    const changed = vi.fn()
    const notify = vi.fn()
    const props = shallowReactive({ vod: rawFixture<AdminVod>('vod-plain') })
    const scope = effectScope()
    const sp = scope.run(() => useSplice(props, { changed, job: vi.fn(), notify }))!

    sp.undo(splice({}))
    await flush()
    expect(unmerge).toHaveBeenLastCalledWith('A', 'B', false)
    expect(sp.forceAsk.value?.edited).toEqual(['chapters'])
    expect(changed).not.toHaveBeenCalled()

    sp.forceUndo()
    await flush()
    expect(unmerge).toHaveBeenLastCalledWith('A', 'B', true)
    expect(sp.forceAsk.value).toBeNull()
    expect(changed).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith('Unmerged', { duration: 4000 })
    expect(sp.touched.value).toEqual(['A', 'B'])
    await nextTick()
    scope.stop()
  })
})
