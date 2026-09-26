import { describe, expect, it, vi } from 'vitest'
import { ArchiveClient } from '../src/api/client'
import { NO_CATEGORY, gamesOf, normalizeChapter, normalizeVod } from '../src/api/normalize'
import { restrictedSpans } from '../src/timeline'
import { toQueryString, vodListQuery } from '../src/api/query'

describe('ArchiveClient.gamesPlayed', () => {
  it('reads /v1/games-played, preferring box-art templates', async () => {
    const fetch = vi.fn(async (_url: string) =>
      new Response(
        JSON.stringify([
          { name: 'A', gameId: '1', image: 'a-40x53.jpg', imageTemplate: 'a-{width}x{height}.jpg', vods: 3, chapters: 5, lastPlayed: '2026-01-03T00:00:00Z', seconds: 7200, watchableSeconds: 5400 },
          { name: 'No category', gameId: null, image: null, imageTemplate: null, vods: 1, chapters: 1, lastPlayed: '2024-08-31T00:00:00Z' },
        ]),
      ),
    )
    const games = await new ArchiveClient({ apiBase: 'https://api.example', fetch }).gamesPlayed()
    expect(fetch.mock.calls[0]![0]).toBe('https://api.example/v1/games-played')
    expect(games[0]).toEqual({
      name: 'A', gameId: '1', image: 'a-{width}x{height}.jpg', vods: 3, chapters: 5,
      lastPlayed: new Date('2026-01-03T00:00:00Z'), seconds: 7200, watchableSeconds: 5400,
    })
    expect(games[1]!.name).toBe(NO_CATEGORY)
    // An archive without the time fields.
    expect([games[1]!.seconds, games[1]!.watchableSeconds]).toEqual([null, null])
  })
})

describe('game filter', () => {
  const qs = (game: string) => decodeURIComponent(toQueryString(vodListQuery({ game })))
  it('matches the name exactly, and uncategorised chapters by their null id', () => {
    expect(qs('The Wind Waker')).toContain('chapters[name][$eq]=The Wind Waker')
    expect(qs(NO_CATEGORY)).toContain('chapters[gameId]=null')
  })
})

describe('normalizeChapter', () => {
  it('names chapters without a Twitch category (the archive stores null)', () => {
    expect(normalizeChapter({ name: null, gameId: null, image: null, start: 0, end: 75 }).name).toBe(NO_CATEGORY)
    expect(normalizeChapter({ name: '  ', start: 0, end: 1 }).name).toBe(NO_CATEGORY)
  })

  it('prefers `length` and the box-art template when the archive sends them', () => {
    const c = normalizeChapter({ name: 'A', image: 'a-40x53.jpg', imageTemplate: 'a-{width}x{height}.jpg', start: 100, end: 999, length: 50 })
    expect([c.start, c.end, c.image]).toEqual([100, 150, 'a-{width}x{height}.jpg'])
  })
})

describe('normalizeVod', () => {
  it('prefers duration_seconds over the HH:MM:SS string', () => {
    const raw = { id: '1', title: 't', duration: '01:00:00', duration_seconds: 3601, chapters: [], youtube: [], drive: [], createdAt: '2026-01-01T00:00:00Z' }
    expect(normalizeVod(raw).duration).toBe(3601)
    expect(normalizeVod({ ...raw, duration_seconds: undefined }).duration).toBe(3600)
  })
  it('reads merged_into', () => {
    const raw = { id: 'b', title: 't', duration: '00:00:00', chapters: [], youtube: [], drive: [], createdAt: '2026-01-01T00:00:00Z' }
    expect(normalizeVod(raw).mergedInto).toBeNull()
    expect(normalizeVod({ ...raw, merged_into: { id: 'a', offset: 7322 } }).mergedInto).toEqual({ id: 'a', offset: 7322 })
  })
})

describe('merge gap chapters', () => {
  const raw = {
    id: 'a', title: 't', duration: '02:00:00', youtube: [], drive: [], createdAt: '2026-01-01T00:00:00Z',
    chapters: [
      { name: 'Game', start: 0, end: 3000 },
      { name: 'Technical difficulties', start: 3000, end: 240, restricted: true, kind: 'gap' as const },
      { name: 'Game', start: 3240, end: 3960 },
    ],
  }
  it('keeps kind and counts as a cut', () => {
    const vod = normalizeVod(raw)
    expect(vod.chapters.map((c) => c.kind)).toEqual([null, 'gap', null])
    expect(restrictedSpans(vod.chapters)).toEqual([{ start: 3000, end: 3240 }])
  })
  it('is not a game', () => {
    expect(gamesOf(normalizeVod(raw))).toEqual(['Game'])
  })
})
