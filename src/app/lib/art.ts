// Real images: YouTube thumbnails for VODs and Twitch box art for games. Both CDNs allow CORS, which lets
// vexoulz-ui read the box art's colour (learnGameColors).
import { boxArt, type Chapter } from '../../index'

export interface GameArt {
  name: string
  image?: string
}

/** Distinct games in chapter order, each with its box art if any chapter of it has one. A merge's gap isn't a game. */
export function gamesWithArt(chapters: readonly Chapter[]): GameArt[] {
  const out = new Map<string, GameArt>()
  for (const c of chapters) {
    if (c.kind === 'gap') continue
    const image = boxArt(c.image) ?? undefined
    const seen = out.get(c.name)
    if (!seen) out.set(c.name, image ? { name: c.name, image } : { name: c.name })
    else if (!seen.image && image) seen.image = image
  }
  return [...out.values()]
}
