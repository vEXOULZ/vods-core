import { toSeconds } from '../time'
import type { Chapter, GamePlayed, GameUpload, Upload, Vod } from '../types'
import type { RawChapter, RawGameUpload, RawUpload, RawVod } from './types'

/** Name used for chapters where the stream had no Twitch category. */
export const NO_CATEGORY = 'No category'

export function normalizeChapter(c: RawChapter): Chapter {
  const start = Number(c.start) || 0
  const length = Math.max(0, Number(c.end) || 0)
  return {
    name: c.name?.trim() || NO_CATEGORY,
    gameId: c.gameId ?? null,
    image: c.image ?? null,
    start,
    end: start + length,
    restricted: !!c.restricted,
  }
}

export function normalizeUploads(raw: RawUpload[]): Upload[] {
  const uploads = raw.map((u, i) => ({
    id: u.id,
    type: u.type,
    part: u.part ?? i + 1,
    duration: typeof u.duration === 'number' && u.duration > 0 ? u.duration : null,
    thumbnail: u.thumbnail_url ?? null,
  }))
  // Stable sort per type: the API keeps upload order, but don't rely on it for the time math.
  return uploads.sort((a, b) => (a.type === b.type ? a.part - b.part : 0))
}

export function normalizeGameUpload(g: RawGameUpload): GameUpload {
  return {
    id: g.id,
    vodId: g.vodId,
    start: Number(g.start_time) || 0,
    end: Number(g.end_time) || 0,
    videoId: g.video_id,
    gameId: g.game_id ?? null,
    gameName: g.game_name ?? null,
    title: g.title ?? null,
    thumbnail: g.thumbnail_url ?? g.chapter_image ?? null,
  }
}

export function normalizeVod(raw: RawVod): Vod {
  const duration = toSeconds(raw.duration ?? '')
  return {
    id: raw.id,
    title: raw.title ?? '',
    createdAt: new Date(raw.createdAt),
    duration: Number.isFinite(duration) ? duration : 0,
    chapters: (raw.chapters ?? []).map(normalizeChapter).sort((a, b) => a.start - b.start),
    uploads: normalizeUploads(raw.youtube ?? []),
    drive: (raw.drive ?? []).map((d) => ({ id: d.id, type: d.type })),
    games: (raw.games ?? []).map(normalizeGameUpload),
    thumbnail: raw.thumbnail_url ?? null,
    streamId: raw.stream_id ?? null,
  }
}

/** Every game across these VODs with how many VODs it's in, most played first (ties: most recent, then name). */
export function aggregateGames(vods: readonly Pick<Vod, 'createdAt' | 'chapters'>[]): GamePlayed[] {
  const games = new Map<string, GamePlayed>()
  for (const v of vods) {
    for (const c of new Map(v.chapters.map((c) => [c.name, c])).values()) {
      const g = games.get(c.name)
      if (!g) {
        games.set(c.name, { name: c.name, gameId: c.gameId, image: c.image, vods: 1, lastPlayed: v.createdAt })
        continue
      }
      g.vods++
      if (v.createdAt > g.lastPlayed) {
        g.lastPlayed = v.createdAt
        if (c.image) g.image = c.image
      }
      g.gameId ??= c.gameId
      g.image ??= c.image
    }
  }
  return [...games.values()].sort(
    (a, b) => b.vods - a.vods || b.lastPlayed.getTime() - a.lastPlayed.getTime() || a.name.localeCompare(b.name),
  )
}

/** Distinct game names in chapter order, e.g. for the poster fan. */
export function gamesOf(vod: Vod): string[] {
  return [...new Set(vod.chapters.map((c) => c.name))]
}
