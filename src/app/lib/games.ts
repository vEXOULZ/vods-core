// Per-game uploads (`/games/:id`): one YouTube video per game, cut from the VOD without its restricted chapters.
import { Timeline, type GameUpload, type TimelineOptions, type Vod } from '../../index'

/**
 * A timeline for one game's video that still speaks VOD time: the VOD as if that video were its only upload,
 * ending where the game ends, so the delay is the game's start and nothing counts as cut.
 */
export function gameTimeline(vod: Vod, game: GameUpload, opts: TimelineOptions = {}): Timeline {
  const synthetic: Vod = {
    ...vod,
    duration: game.end,
    chapters: vod.chapters.map((c) => ({ ...c, restricted: false })),
    uploads: [{ id: game.videoId, type: 'vod', part: 1, duration: Math.max(0, game.end - game.start), thumbnail: game.thumbnail, preview: null }],
  }
  return new Timeline(synthetic, 'vod', opts)
}

export const gameName = (g: GameUpload) => g.gameName ?? g.title ?? 'Game'
