import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowReactive } from 'vue'
import type { AdminVod } from '../../src/app/admin/api'
import { splitChapter, useChaptersDraft } from '../../src/app/composables/useChaptersDraft'
import { rawFixture } from '../helpers'

describe('chapters draft', () => {
  it('splits a chapter in the middle, keeping its game', () => {
    const r = { key: -1, name: 'Game', gameId: '7', imageTemplate: null, start: 100, end: 301, restricted: true }
    const copy = splitChapter(r)
    expect(r.end).toBe(201)
    expect(copy).toMatchObject({ name: 'Game', gameId: '7', start: 201, end: 301, restricted: true })
    expect(copy.key).not.toBe(r.key)
  })

  it('splits, sorts and places rows on the strip', async () => {
    const vod = rawFixture<AdminVod>('vod-plain')
    const props = shallowReactive({ vod, duration: 1000 })
    const scope = effectScope()
    const ed = scope.run(() => useChaptersDraft(props, { saved: vi.fn(), notify: vi.fn() }))!
    await nextTick()
    ed.rows.value = [
      { key: 1, name: 'B', gameId: null, imageTemplate: null, start: 600, end: 1000, restricted: false },
      { key: 2, name: null, gameId: null, imageTemplate: null, start: 0, end: 600, restricted: false },
    ]
    expect(ed.sorted.value).toBe(false)
    ed.sortRows()
    expect(ed.rows.value.map((r) => r.key)).toEqual([2, 1])
    expect(ed.label(ed.rows.value[0]!)).not.toBe('B')

    ed.split(ed.rows.value[1]!)
    expect(ed.rows.value.map((r) => [r.start, r.end])).toEqual([[0, 600], [600, 800], [800, 1000]])
    expect(ed.sorted.value).toBe(true)

    expect(ed.total.value).toBe(1000)
    expect(ed.pct(250)).toBe('25%')
    ed.rows.value[2]!.end = 2000
    expect(ed.total.value).toBe(2000)
    expect(ed.pct(-5)).toBe('0%')
    scope.stop()
  })
})
