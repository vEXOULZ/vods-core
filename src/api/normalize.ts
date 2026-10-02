import { toSeconds } from '../time'
import type { Chapter, GamePlayed, GameUpload, Preview, Synthetic, Upload, Vod } from '../types'
import type { RawChapter, RawGamePlayed, RawGameUpload, RawPreview, RawSynthetic, RawUpload, RawVod } from './types'

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
    restricted: !!c.restricted || c.kind === 'gap',
    kind: c.kind === 'gap' ? 'gap' : null,
  }
}

function normalizePreview(p: RawPreview | null | undefined): Preview | null {
  if (!p || p.v !== 1) return null
  const { interval, w, h, cols, rows, count } = p
  const ok = [interval, w, h, cols, rows, count].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
  return ok ? { interval, w, h, cols, rows, count } : null
}

export function normalizeUploads(raw: RawUpload[]): Upload[] {
  const uploads = raw.map((u, i) => ({
    id: u.id,
    type: u.type,
    part: u.part ?? i + 1,
    duration: typeof u.duration === 'number' && u.duration > 0 ? u.duration : null,
    thumbnail: u.thumbnail_url ?? null,
    preview: normalizePreview(u.preview),
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
    sourceVodId: g.sourceVodId ?? null,
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
    mergedInto: raw.merged_into?.id ? { id: raw.merged_into.id, offset: Number(raw.merged_into.offset) || 0 } : null,
    tags: raw.tags ?? [],
    synthetic: raw.synthetic ? normalizeSynthetic(raw.synthetic) : null,
    supersededBy: raw.superseded_by?.length
      ? raw.superseded_by.map((s) => ({ id: s.id, start: Number(s.start) || 0, end: s.end == null ? null : Number(s.end), at: Number(s.at) || 0 }))
      : null,
    appearsIn: raw.appears_in?.length ? raw.appears_in.map((a) => ({ id: a.id, title: a.title ?? '', tags: a.tags ?? [] })) : null,
  }
}

export function normalizeSynthetic(raw: RawSynthetic): Synthetic {
  const sorted = (raw.segments ?? [])
    .map((s) => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0, at: Number(s.at) || 0 }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.at - b.at)
  // Without the archive's numbering, a new stream starts where the source VOD changes.
  let stream = -1
  const segments = sorted.map((s, i) => {
    stream = s.stream != null && Number.isFinite(Number(s.stream)) ? Number(s.stream) : i && sorted[i - 1]!.vodId === s.vodId ? stream : stream + 1
    return { vodId: s.vodId, start: s.start, end: s.end, at: s.at, label: s.label ?? null, stream }
  })
  return {
    supersedes: !!raw.supersedes,
    segments,
    madeAt: date(raw.madeAt),
    changedAt: date(raw.changedAt),
    firstLiveAt: date(raw.firstLiveAt),
    lastLiveAt: date(raw.lastLiveAt),
  }
}

function date(iso: string | null | undefined): Date | null {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

export function normalizeGamePlayed(g: RawGamePlayed): GamePlayed {
  return {
    name: g.name?.trim() || NO_CATEGORY,
    gameId: g.gameId ?? null,
    image: g.imageTemplate ?? g.image ?? null,
    vods: g.vods,
    chapters: g.chapters,
    lastPlayed: new Date(g.lastPlayed),
    seconds: g.seconds ?? null,
    watchableSeconds: g.watchableSeconds ?? g.seconds ?? null,
  }
}

/** Distinct game names in chapter order, e.g. for the poster fan. A merge's gap chapters aren't games. */
export function gamesOf(vod: Vod): string[] {
  return [...new Set(vod.chapters.filter((c) => c.kind !== 'gap').map((c) => c.name))]
}
