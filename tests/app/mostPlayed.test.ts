import type { GamePlayed } from '../../src/index'
import { describe, expect, it } from 'vitest'
import { hasPlayTime, playTime, rankGames } from '../../src/app/lib/mostPlayed'

const game = (name: string, vods: number, watchableSeconds: number | null, day = 1): GamePlayed => ({
  name, gameId: null, image: null, vods, chapters: vods, lastPlayed: new Date(2026, 0, day),
  seconds: watchableSeconds, watchableSeconds,
})
const games = [game('Chatting', 34, 100_000), game('Balatro', 12, 150_000), game('Art', 6, 20_000, 3), game('Zelda', 6, 20_000, 2)]

describe('rankGames', () => {
  it('ranks by VODs, then by the most recent', () => {
    expect(rankGames(games, 'vods', 3).map((g) => g.name)).toEqual(['Chatting', 'Balatro', 'Art'])
  })
  it('ranks by watchable time', () => {
    expect(rankGames(games, 'time', 2).map((g) => g.name)).toEqual(['Balatro', 'Chatting'])
  })
  it('knows when the archive sends no time', () => {
    expect(hasPlayTime(games)).toBe(true)
    expect(hasPlayTime([game('Old', 1, null)])).toBe(false)
  })
})

describe('playTime', () => {
  it('fits a card corner', () => {
    expect(playTime(146_186)).toBe('40h 36m')
    expect(playTime(3_600)).toBe('1h')
    expect(playTime(3_119)).toBe('52m')
    expect(playTime(400 * 3_600 + 900)).toBe('400h')
  })
})
