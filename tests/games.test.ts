import { describe, expect, it, vi } from 'vitest'
import { ArchiveClient } from '../src/api/client'
import { aggregateGames, NO_CATEGORY, normalizeChapter } from '../src/api/normalize'
import type { Chapter } from '../src/types'

const ch = (name: string, image: string | null = null): Chapter => ({ name, gameId: null, image, start: 0, end: 1, restricted: false })

describe('aggregateGames', () => {
  it('counts VODs per game (not chapters) and sorts most played first', () => {
    const games = aggregateGames([
      { createdAt: new Date('2026-01-03'), chapters: [ch('A'), ch('B', 'b-new'), ch('A')] },
      { createdAt: new Date('2026-01-02'), chapters: [ch('B', 'b-old')] },
      { createdAt: new Date('2026-01-01'), chapters: [ch('C'), ch('B')] },
    ])
    expect(games.map((g) => [g.name, g.vods])).toEqual([
      ['B', 3],
      ['A', 1],
      ['C', 1],
    ])
    expect(games[0]!.image).toBe('b-new')
    expect(games[0]!.lastPlayed).toEqual(new Date('2026-01-03'))
  })
})

describe('ArchiveClient.gamesPlayed', () => {
  it('pages through the VODs asking only for dates and chapters', async () => {
    const vod = (d: string, name: string) => ({ createdAt: d, chapters: [{ name, start: 0, end: 10 }] })
    const pages = [
      { total: 3, limit: 50, skip: 0, data: [vod('2026-01-03', 'A'), vod('2026-01-02', 'B')] },
      { total: 3, limit: 50, skip: 50, data: [vod('2026-01-01', 'A')] },
    ]
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(pages.shift())))
    const games = await new ArchiveClient({ apiBase: 'https://api.example', fetch }).gamesPlayed()
    expect(games.map((g) => [g.name, g.vods])).toEqual([
      ['A', 2],
      ['B', 1],
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    const first = decodeURIComponent(fetch.mock.calls[0]![0])
    expect(first).toContain('$select[0]=createdAt&$select[1]=chapters')
    expect(first).toContain('$skip=0')
  })
})

describe('normalizeChapter', () => {
  it('names chapters without a Twitch category (the archive stores null)', () => {
    expect(normalizeChapter({ name: null, gameId: null, image: null, start: 0, end: 75 }).name).toBe(NO_CATEGORY)
    expect(normalizeChapter({ name: '  ', start: 0, end: 1 }).name).toBe(NO_CATEGORY)
  })
})
