// Ranking for the "Most played" cards: by how many VODs a game is in, or by how long it can be watched in total.
import type { GamePlayed } from '../../index'

export type MostPlayedBy = 'vods' | 'time'

/** Whether the archive sends play time at all (older archives don't). */
export const hasPlayTime = (games: readonly GamePlayed[]) => games.some((g) => g.watchableSeconds !== null)

export function rankGames(games: readonly GamePlayed[], by: MostPlayedBy, limit: number): GamePlayed[] {
  const time = (g: GamePlayed) => g.watchableSeconds ?? 0
  const recent = (a: GamePlayed, b: GamePlayed) => b.lastPlayed.getTime() - a.lastPlayed.getTime()
  return [...games]
    .sort(by === 'time' ? (a, b) => time(b) - time(a) || b.vods - a.vods || recent(a, b) : (a, b) => b.vods - a.vods || recent(a, b))
    .slice(0, limit)
}

/** "146h", "40h 36m", "52m": short enough for a card's corner. */
export function playTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h >= 100 || (h > 0 && m === 0)) return `${h}h`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
