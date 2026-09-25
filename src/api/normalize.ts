import { toSeconds } from '../time'
import type { Chapter, GamePlayed, GameUpload, Upload, Vod } from '../types'
import type { RawChapter, RawGamePlayed, RawGameUpload, RawUpload, RawVod } from './types'

/** Name used for chapters where the stream had no Twitch category. */
export const NO_CATEGORY = 'No category'

export function normalizeChapter(c: RawChapter): Chapter {
  const start = Number(c.start) || 0
  // `length` where the archive sends it; older rows only have the length under `end`.
  const length = Math.max(0, Number(c.length ?? c.end) || 0)
  return {
    name: c.name?.trim() || NO_CATEGORY,
    gameId: c.gameId ?? null,
    image: c.imageTemplate ?? c.image ?? null,
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
  const duration = typeof raw.duration_seconds === 'number' ? raw.duration_seconds : toSeconds(raw.duration ?? '')
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

export function normalizeGamePlayed(g: RawGamePlayed): GamePlayed {
  return {
    name: g.name?.trim() || NO_CATEGORY,
    gameId: g.gameId ?? null,
    image: g.imageTemplate ?? g.image ?? null,
    vods: g.vods,
    chapters: g.chapters,
    lastPlayed: new Date(g.lastPlayed),
  }
}

/** Distinct game names in chapter order, e.g. for the poster fan. */
export function gamesOf(vod: Vod): string[] {
  return [...new Set(vod.chapters.map((c) => c.name))]
}
