// Every game in the archive, for the list page's game picker. Loaded once per visit (the list is small and changes
// only when a new VOD is archived); a failed load can be retried.
import type { ArchiveClient, GamePlayed } from '../../index'

let cached: Promise<GamePlayed[]> | null = null

export function loadGamesPlayed(client: ArchiveClient, retry = false): Promise<GamePlayed[]> {
  if (cached && !retry) return cached
  const p = client.gamesPlayed()
  p.catch(() => {
    if (cached === p) cached = null
  })
  cached = p
  return p
}
