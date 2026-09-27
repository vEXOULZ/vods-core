import { describe, expect, it } from 'vitest'
import { boxArt, normalizeVod, vodThumbnail, watchPath, youtubeThumb, type RawVod } from '../src'

const raw: RawVod = {
  id: '42',
  title: 't',
  duration: '1:00:00',
  chapters: [],
  drive: [],
  createdAt: '2026-02-21T00:00:00Z',
  thumbnail_url: 'own.jpg',
  youtube: [
    { id: 'b', type: 'vod', part: 2, thumbnail_url: 'part2.jpg' },
    { id: 'a', type: 'vod', part: 1, thumbnail_url: 'part1.jpg' },
  ],
}

describe('vodThumbnail', () => {
  it("prefers the archive's own thumbnail over the uploads'", () => {
    expect(vodThumbnail(normalizeVod(raw))).toBe('own.jpg')
  })
  it('falls back to the first upload, then a game upload', () => {
    expect(vodThumbnail(normalizeVod({ ...raw, thumbnail_url: null }))).toBe('part1.jpg')
    const games = [{ id: 'g', vodId: '42', start_time: '0', end_time: '1', video_id: 'v', thumbnail_url: 'game.jpg' }]
    expect(vodThumbnail(normalizeVod({ ...raw, thumbnail_url: null, youtube: [], games }))).toBe('game.jpg')
    expect(vodThumbnail(normalizeVod({ ...raw, thumbnail_url: null, youtube: [] }))).toBeNull()
  })
})

describe('youtubeThumb', () => {
  it("switches a YouTube thumbnail's size", () => {
    expect(youtubeThumb('https://i.ytimg.com/vi/1npf9NXVZ-U/mqdefault.jpg', 'maxresdefault')).toBe(
      'https://i.ytimg.com/vi/1npf9NXVZ-U/maxresdefault.jpg',
    )
    expect(youtubeThumb('https://i9.ytimg.com/vi_webp/a_b-c/hqdefault.webp?x=1', 'mqdefault')).toBe(
      'https://i9.ytimg.com/vi_webp/a_b-c/mqdefault.webp',
    )
  })
  it('leaves other images alone', () => {
    expect(youtubeThumb('https://static-cdn.jtvnw.net/cf_vods/x/thumb/thumb0-320x180.jpg', 'maxresdefault')).toBeNull()
    expect(youtubeThumb(null, 'maxresdefault')).toBeNull()
  })
})

describe('watchPath', () => {
  it('picks the route from the uploads it has', () => {
    expect(watchPath(normalizeVod(raw))).toBe('/vods/42')
    expect(watchPath({ id: '42', uploads: [{ type: 'live' }] }, 90.5)).toBe('/live/42?t=90s')
    expect(watchPath({ id: '42', uploads: [] })).toBe('/youtube/42')
  })
})

describe('boxArt', () => {
  it('fills templates and resizes baked-in sizes', () => {
    expect(boxArt('https://static-cdn.jtvnw.net/ttv-boxart/509658-{width}x{height}.jpg')).toBe(
      'https://static-cdn.jtvnw.net/ttv-boxart/509658-144x192.jpg',
    )
    expect(boxArt('https://static-cdn.jtvnw.net/ttv-boxart/491327_IGDB-40x53.jpg', 60)).toBe(
      'https://static-cdn.jtvnw.net/ttv-boxart/491327_IGDB-60x80.jpg',
    )
    expect(boxArt('https://x/a-40x53.jpg?v=2')).toBe('https://x/a-144x192.jpg?v=2')
    expect(boxArt(null)).toBeNull()
  })
})
