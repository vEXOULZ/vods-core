import type { GameUpload, Vod } from '../../src/index'
import { describe, expect, it } from 'vitest'
import { gameName, gameTimeline } from '../../src/app/lib/games'

const vod: Vod = {
  id: '1',
  title: 't',
  createdAt: new Date(0),
  duration: 10_000,
  chapters: [
    { name: 'A', gameId: null, image: null, start: 0, end: 3000, restricted: false },
    { name: 'B', gameId: null, image: null, start: 3000, end: 4000, restricted: true },
    { name: 'C', gameId: null, image: null, start: 4000, end: 10_000, restricted: false },
  ],
  uploads: [],
  drive: [],
  games: [],
  thumbnail: null,
  streamId: null,
  tags: [],
}
const game: GameUpload = { id: 'g', vodId: '1', start: 4000, end: 10_000, videoId: 'yt', gameId: null, gameName: 'C', title: null, thumbnail: null }

describe('gameTimeline', () => {
  const tl = gameTimeline(vod, game)

  it('starts the video at the game start in VOD time', () => {
    expect(tl.delay).toBe(4000)
    expect(tl.cuts).toEqual([])
    expect(tl.toVod({ index: 0, offset: 0 })).toBe(4000)
    expect(tl.toVod({ index: 0, offset: 90 })).toBe(4090)
  })

  it('maps VOD time back into the video', () => {
    expect(tl.locate(5000)).toEqual({ index: 0, offset: 1000 })
    expect(tl.locate(100)).toEqual({ index: 0, offset: 0 })
    expect(tl.partSpans()).toEqual([{ start: 4000, end: 10_000 }])
  })

  it('names games', () => {
    expect(gameName(game)).toBe('C')
    expect(gameName({ ...game, gameName: null, title: 'T' })).toBe('T')
    expect(gameName({ ...game, gameName: null })).toBe('Game')
  })
})
