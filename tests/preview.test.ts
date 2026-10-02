import { describe, expect, it } from 'vitest'
import { normalizeUploads } from '../src/api/normalize'
import { previewFrame } from '../src/preview'

const raw = { v: 1, interval: 10, w: 160, h: 90, cols: 10, rows: 10, count: 377 }

describe('upload previews', () => {
  it('normalizes the archive layout and drops unknown or broken ones', () => {
    const previews = normalizeUploads([
      { id: 'a', type: 'vod', part: 1, preview: raw },
      { id: 'b', type: 'vod', part: 2 },
      { id: 'c', type: 'vod', part: 3, preview: { ...raw, v: 2 } },
      { id: 'd', type: 'vod', part: 4, preview: { ...raw, count: 0 } },
    ]).map((u) => u.preview)
    expect(previews).toEqual([{ interval: 10, w: 160, h: 90, cols: 10, rows: 10, count: 377 }, null, null, null])
  })

  it('picks the nearest tile on the right sheet', () => {
    const up = normalizeUploads([{ id: '9ssWyh-hVpA', type: 'vod', preview: raw }])[0]!
    expect(previewFrame(up, 0, '/backend/')).toEqual({
      url: '/backend/v1/previews/9ssWyh-hVpA/0.jpg', x: 0, y: 0, w: 160, h: 90, sheetW: 1600, sheetH: 900,
    })
    expect(previewFrame(up, 134, '/backend')).toMatchObject({ url: '/backend/v1/previews/9ssWyh-hVpA/0.jpg', x: 480, y: 90 })
    expect(previewFrame(up, 136, '/backend')).toMatchObject({ x: 640, y: 90 }) // frame 14 (140 s) is nearer
    expect(previewFrame(up, 1000, 'https://a.example')).toMatchObject({ url: 'https://a.example/v1/previews/9ssWyh-hVpA/1.jpg', x: 0, y: 0 })
    expect(previewFrame(up, 3999, '')).toMatchObject({ url: '/v1/previews/9ssWyh-hVpA/3.jpg', x: 960, y: 630 }) // last: 376
    expect(previewFrame(up, -5, '')).toMatchObject({ x: 0, y: 0 })
  })

  it('has nothing without previews', () => {
    const up = normalizeUploads([{ id: 'x', type: 'vod' }])[0]!
    expect(previewFrame(up, 10, '')).toBeNull()
  })
})
