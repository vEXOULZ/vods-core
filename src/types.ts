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
  /** "gap": the stream was down between two Twitch VODs that were merged into this one (always restricted). */
  kind?: 'gap' | null
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
  /** On a synthetic VOD: the real VOD the upload is of (`start`/`end` are synthetic time). */
  sourceVodId?: string | null
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
  /** Set when this VOD was merged into another: watch `id` at `offset + t` instead. */
  mergedInto?: { id: string; offset: number } | null
  /** Empty for regular VODs; `compilation` for playthroughs. */
  tags: string[]
  /** Set on a synthetic VOD (a merge, a split, a playthrough): it plays windows of other VODs. */
  synthetic?: Synthetic | null
  /** Set on a VOD a merge or split replaced: watch those instead (see `supersededTarget`). */
  supersededBy?: SupersededBy[] | null
  /** Synthetic VODs (playthroughs) that use part of this one. */
  appearsIn?: AppearsIn[] | null
}

/** Source seconds [start, end) of VOD `vodId`, playing from `at` on the synthetic VOD. */
export interface Segment {
  vodId: string
  start: number
  end: number
  at: number
  label: string | null
  /**
   * Which stream it belongs to (0-based, in order). Two windows of one stream (a chapter cut out between them, or a
   * broadcast that went down and came back) share it; a playthrough numbers its streams S1, S2… by it.
   */
  stream: number
}

export interface Synthetic {
  /** A merge or split (its sources redirect to it), not a playthrough. */
  supersedes: boolean
  segments: Segment[]
  /** When it was made, and when what it plays last changed (segments added or moved, a source grew). */
  madeAt: Date | null
  changedAt: Date | null
  /** When the earliest and the latest footage it plays were live. */
  firstLiveAt: Date | null
  lastLiveAt: Date | null
}

export interface SupersededBy {
  id: string
  start: number
  end: number | null
  at: number
}

export interface AppearsIn {
  id: string
  title: string
  tags: string[]
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
