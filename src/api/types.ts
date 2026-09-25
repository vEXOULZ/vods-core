// Shapes as the archive API sends them (snake_case, quirks included). Normalized types are in ../types.ts.

export interface Page<T> {
  total: number
  limit: number
  skip: number
  data: T[]
}

export interface RawChapter {
  name: string
  gameId?: string | null
  image?: string | null
  start: number
  /** Careful: the chapter's LENGTH in seconds, not its end time. */
  end: number
  restricted?: boolean | null
}

export interface RawUpload {
  id: string
  type: 'vod' | 'live'
  /** Seconds; missing while YouTube is still processing. */
  duration?: number | null
  part?: number | null
  thumbnail_url?: string | null
}

export interface RawDrive {
  id: string
  type: 'vod' | 'live'
}

export interface RawGameUpload {
  id: string
  vodId: string
  start_time: string
  end_time: string
  video_provider?: string | null
  video_id: string
  thumbnail_url?: string | null
  game_id?: string | null
  game_name?: string | null
  title?: string | null
  chapter_image?: string | null
}

export interface RawVod {
  id: string
  title: string | null
  /** "HH:MM:SS". */
  duration: string
  chapters: RawChapter[] | null
  youtube: RawUpload[] | null
  drive: RawDrive[] | null
  games?: RawGameUpload[] | null
  thumbnail_url?: string | null
  stream_id?: string | null
  platform?: string | null
  createdAt: string
  updatedAt?: string
}

export interface RawStream {
  id: string
  started_at: string | null
  platform: string
  is_live: boolean | null
}

export interface RawBadgeVersion {
  id: string
  image_url_1x: string
  image_url_2x: string
  image_url_4x: string
  title?: string
}

export interface RawBadgeSet {
  set_id: string
  versions: RawBadgeVersion[]
}

export interface RawBadges {
  channel?: RawBadgeSet[]
  global?: RawBadgeSet[]
}

/** One piece of a chat message: plain text, or a native Twitch emote (two historical shapes). */
export interface RawFragment {
  text: string
  emote?: { emoteID: string } | null
  emoticon?: { emoticon_id: string } | null
}

export interface RawUserBadge {
  _id?: string
  setID?: string
  version: string
}

export interface RawComment {
  id: string
  _id?: string
  vod_id: string
  display_name: string
  content_offset_seconds: number
  message: RawFragment[] | null
  user_badges: RawUserBadge[] | null
  user_color: string | null
}

export interface RawCommentPage {
  comments: RawComment[]
  cursor?: string
}

/** Emote sets saved per VOD (`/emotes?vod_id=`); items keep whatever shape the provider had. */
export interface RawEmoteSets {
  vodId?: string
  ffz_emotes?: RawThirdPartyEmote[] | null
  bttv_emotes?: RawThirdPartyEmote[] | null
  '7tv_emotes'?: RawThirdPartyEmote[] | null
}

export interface RawThirdPartyEmote {
  id: string | number
  name?: string
  code?: string
}
