// Normalized shapes every page works with. Built from the raw API types by api/normalize.ts.

export type UploadType = 'vod' | 'live'

export interface Chapter {
  name: string
  gameId: string | null
  /** Twitch box art: a `{width}x{height}` template when the archive has one, else a URL with a small baked size. */
  image: string | null
  /** VOD seconds. */
  start: number
  /** VOD seconds (absolute), unlike the API's length-as-`end`. */
  end: number
  /** Cut from the YouTube uploads (DMCA), so it can't be watched. */
  restricted: boolean
}

export interface Upload {
  /** YouTube video id. */
  id: string
  type: UploadType
  /** 1-based part number as uploaded. */
  part: number
  /** Seconds, or null while YouTube is still processing it. */
  duration: number | null
  thumbnail: string | null
}

export interface DriveFile {
  id: string
  type: UploadType
}

/** A per-game upload (`/games/:id` pages): one game's stretch of a VOD as its own video. */
export interface GameUpload {
  id: string
  vodId: string
  start: number
  end: number
  videoId: string
  gameId: string | null
  gameName: string | null
  title: string | null
  thumbnail: string | null
}

export interface Vod {
  id: string
  title: string
  createdAt: Date
  /** Seconds. */
  duration: number
  chapters: Chapter[]
  uploads: Upload[]
  drive: DriveFile[]
  games: GameUpload[]
  thumbnail: string | null
  streamId: string | null
}

/** A game that appears in the archive's chapters, for game pickers. */
export interface GamePlayed {
  name: string
  gameId: string | null
  /** Same as `Chapter.image`. */
  image: string | null
  /** How many VODs have at least one chapter of it. */
  vods: number
  /** How many chapters of it, across those VODs. */
  chapters: number
  /** Newest VOD it appears in. */
  lastPlayed: Date
  /** How long it was streamed in total (its chapters' lengths), in seconds; null when the archive doesn't say. */
  seconds: number | null
  /** The part of that you can still watch (without chapters cut from the YouTube uploads). */
  watchableSeconds: number | null
}

export interface VodPage {
  total: number
  vods: Vod[]
}
