import { readFileSync } from 'node:fs'
import { normalizeVod } from '../src/api/normalize'
import type { RawCommentPage, RawVod } from '../src/api/types'
import type { Chapter, Upload, Vod } from '../src/types'

export function rawFixture<T = RawVod>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T
}

export const fixtureVod = (name: string): Vod => normalizeVod(rawFixture(name))
export const fixtureComments = (): RawCommentPage => rawFixture<RawCommentPage>('comments-plain-0')

/** A made-up VOD for edge cases the real ones don't cover. */
export function makeVod(opts: { duration: number; parts: (number | null)[]; chapters?: Partial<Chapter>[]; type?: 'vod' | 'live' }): Vod {
  const uploads: Upload[] = opts.parts.map((d, i) => ({ id: `yt${i + 1}`, type: opts.type ?? 'vod', part: i + 1, duration: d, thumbnail: null }))
  return {
    id: 'v1',
    title: 'test',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    duration: opts.duration,
    chapters: (opts.chapters ?? []).map((c) => ({ name: 'Game', gameId: null, image: null, start: 0, end: 0, restricted: false, ...c })),
    uploads,
    drive: [],
    games: [],
    thumbnail: null,
    streamId: null,
  }
}
