import { normalizeVod, type RawVod } from '../../src/index'
import { describe, expect, it } from 'vitest'
import { useThumbnail } from '../../src/app/composables/useThumbnail'

const SMALL = 'https://i.ytimg.com/vi/abc/mqdefault.jpg'
const LARGE = 'https://i.ytimg.com/vi/abc/maxresdefault.jpg'
const raw: RawVod = { id: '1', title: 't', duration: '1:00:00', chapters: [], drive: [], createdAt: '2026-01-01T00:00:00Z', thumbnail_url: SMALL, youtube: [] }
const vod = normalizeVod(raw)
const loaded = (currentSrc: string, naturalWidth: number) => ({ target: { currentSrc, naturalWidth } }) as unknown as Event

describe('useThumbnail', () => {
  it('shows the large thumbnail, and the small one when YouTube has no large one', () => {
    const t = useThumbnail(() => vod, 'always')
    expect(t.src.value).toBe(LARGE)
    t.onLoad(loaded(LARGE, 120))
    expect(t.src.value).toBe(SMALL)
    t.onError()
    expect(t.src.value).toBeNull()
  })

  it('offers the large one to high-density screens only', () => {
    const t = useThumbnail(() => vod, 'hidpi')
    expect(t.src.value).toBe(SMALL)
    expect(t.srcset.value).toBe(`${SMALL} 1x, ${LARGE} 2x`)
    t.onLoad(loaded(LARGE, 1280))
    expect(t.srcset.value).toBeDefined()
    t.onError()
    expect([t.src.value, t.srcset.value]).toEqual([SMALL, undefined])
  })
})
