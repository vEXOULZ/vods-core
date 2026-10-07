import type { Chapter } from '../../src/index'
import { describe, expect, it } from 'vitest'
import { gamesWithArt } from '../../src/app/lib/art'

const ch = (name: string, image: string | null): Chapter => ({ name, image, gameId: null, start: 0, end: 1, restricted: false })

describe('gamesWithArt', () => {
  it('keeps chapter order, one entry per game, art from any chapter', () => {
    expect(gamesWithArt([ch('A', null), ch('B', 'https://x/b-40x53.jpg'), ch('A', 'https://x/a-40x53.jpg')])).toEqual([
      { name: 'A', image: 'https://x/a-144x192.jpg' },
      { name: 'B', image: 'https://x/b-144x192.jpg' },
    ])
    expect(gamesWithArt([ch('C', null)])).toEqual([{ name: 'C' }])
  })
})
