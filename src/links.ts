// How a VOD is shown and linked outside its watch page: the thumbnail, box art and the watch path. Kept here so the vods
// site and every other site that links to a VOD (the stream card on vexoulz.net) pick the same ones.
import type { Vod } from './types'

type Thumbed = Pick<Vod, 'thumbnail'> & {
  uploads: readonly Pick<Vod['uploads'][number], 'thumbnail'>[]
  games: readonly Pick<Vod['games'][number], 'thumbnail'>[]
}

/** The archive's own thumbnail, else the first upload's, else the first game upload's. */
export function vodThumbnail(vod: Thumbed): string | null {
  return vod.thumbnail ?? vod.uploads.find((u) => u.thumbnail)?.thumbnail ?? vod.games.find((g) => g.thumbnail)?.thumbnail ?? null
}

/**
 * The watch page's path on the vods site: `/vods/:id` when there are VOD uploads, `/live/:id` for a live upload only,
 * else `/youtube/:id` (which picks one). `t` (seconds) resumes from there.
 */
export function watchPath(vod: { id: string; uploads: readonly { type: 'vod' | 'live' }[] }, t?: number): string {
  const id = encodeURIComponent(vod.id)
  const base = vod.uploads.some((u) => u.type === 'vod')
    ? `/vods/${id}`
    : vod.uploads.some((u) => u.type === 'live')
      ? `/live/${id}`
      : `/youtube/${id}`
  return t && t > 0 ? `${base}?t=${Math.floor(t)}s` : base
}

/** Twitch box art at `width` (3:4). Handles Twitch's `{width}x{height}` templates and URLs with a size baked in. */
export function boxArt(url: string | null | undefined, width = 144): string | null {
  if (!url) return null
  const size = `${width}x${Math.round((width * 4) / 3)}`
  if (url.includes('{width}x{height}')) return url.replace('{width}x{height}', size)
  return url.replace(/-\d+x\d+(\.\w+)(\?.*)?$/, `-${size}$1$2`)
}
