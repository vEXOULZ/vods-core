import { toSeconds } from '../time'
import type { Chapter, GameUpload, Upload, Vod } from '../types'
import type { RawChapter, RawGameUpload, RawUpload, RawVod } from './types'

export function normalizeChapter(c: RawChapter): Chapter {
  const start = Number(c.start) || 0
  const length = Math.max(0, Number(c.end) || 0)
  return {
    name: c.name,
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

/** Distinct game names in chapter order, e.g. for the poster fan. */
export function gamesOf(vod: Vod): string[] {
  return [...new Set(vod.chapters.map((c) => c.name))]
}
