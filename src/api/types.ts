// Shapes as the archive API sends them (snake_case, quirks included). Normalized types are in ../types.ts.

export interface Page<T> {
  total: number
  limit: number
  skip: number
  data: T[]
}

export interface RawChapter {
  /** null when the stream had no Twitch category set. */
  name: string | null
  gameId?: string | null
  image?: string | null
  /** Box art with `{width}x{height}` in place of the baked size. */
  imageTemplate?: string | null
  start: number
  /** Careful: the chapter's LENGTH in seconds, not its end time. */
  end: number
  /** The chapter's length again, under an honest name. */
  length?: number | null
  restricted?: boolean | null
  /** "gap" on the cut a merge puts between two VODs of one broadcast; absent on every other chapter. */
  kind?: 'gap' | null
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
  /** On a synthetic VOD's games: the VOD the row belongs to (its times are already on the synthetic timeline). */
  sourceVodId?: string | null
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
  duration_seconds?: number | null
  chapters: RawChapter[] | null
  youtube: RawUpload[] | null
  drive: RawDrive[] | null
  games?: RawGameUpload[] | null
  thumbnail_url?: string | null
  stream_id?: string | null
  /** Set on a VOD merged into another one: its footage now starts `offset` seconds into VOD `id`. */
  merged_into?: { id: string; offset: number } | null
  /** Untagged VODs are the regular ones; `compilation` (a playthrough) and others are listed apart. */
  tags?: string[] | null
  /** Only on a synthetic VOD: it has no uploads of its own, it plays windows (`segments`) of other VODs. */
  synthetic?: RawSynthetic | null
  /** On a VOD a merge or split replaced: where each window of it plays now. */
  superseded_by?: RawSupersededBy[] | null
  /** On a VOD that synthetic VODs (playthroughs) use without replacing it. */
  appears_in?: RawAppearsIn[] | null
  platform?: string | null
  createdAt: string
  updatedAt?: string
}

/** A window of a real VOD on a synthetic VOD's timeline: source seconds [start, end) play from `at`. */
export interface RawSegment {
  vodId: string
  start: number
  /** Resolved by the archive (the source's end, or the next segment's start). */
  end: number
  at: number
  label?: string | null
}

export interface RawSynthetic {
  /** A merge or split: its sources are left out of lists and their links lead here. */
  supersedes: boolean
  segments: RawSegment[]
}

export interface RawSupersededBy {
  id: string
  start: number
  /** null: to the end of the source. */
  end: number | null
  at: number
}

export interface RawAppearsIn {
  id: string
  title: string | null
  tags?: string[] | null
}

export interface RawStream {
  id: string
  started_at: string | null
  platform: string
  is_live: boolean | null
}

/** `/v1/games-played`: one entry per distinct game across every VOD's chapters. */
export interface RawGamePlayed {
  name: string
  gameId: string | null
  image: string | null
  imageTemplate?: string | null
  /** VODs it appears in. */
  vods: number
  /** Chapters of it across those VODs. */
  chapters: number
  lastPlayed: string
  /** Total length of its chapters, in seconds. Older archives don't send it. */
  seconds?: number
  /** The same, without chapters cut from the YouTube uploads. */
  watchableSeconds?: number
}

/** `/v1/emotes/third-party`: the channel's and global sets, cached by the archive; `failed` names providers that
 *  couldn't be reached. */
export interface RawThirdPartyEmotes {
  '7tv'?: RawThirdPartyEmote[] | null
  bttv?: RawThirdPartyEmote[] | null
  ffz?: RawThirdPartyEmote[] | null
  failed?: string[]
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

/**
 * Where a VOD's chat came from: Twitch's replay of the VOD (`replay`), or doomtp-bot's log, recorded live (`bot`).
 * `auto` (the archive's default) serves the bot's when it has about as many messages as the replay.
 */
export type ChatSource = 'replay' | 'bot'

/** The chat messages each source has for a VOD (on a page fetched by offset). */
export type ChatSources = Record<ChatSource, number>

/** What doomtp-bot's log knew about a message or notice; only the fields the sites use are typed. */
export interface RawBotEntry {
  /** A notice's type: `sub`, `resub`, `sub_gift`, `raid`, `redemption`… */
  type?: string
  bits?: number | null
  /** The channel-point reward a message was sent with. */
  reward?: { id?: string; title?: string; cost?: number; input?: string; status?: string } | null
  /** What removed the message (the removal's own time is in `at`, epoch ms). */
  removal?: { type?: string; reason?: string | null; duration_s?: number | null; at?: number } | null
  reply_parent_id?: string | null
  [key: string]: unknown
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
  /** Which chat the row came from (archives before bot chat leave it out: the replay). */
  source?: ChatSource
  // The rest only come with the bot's chat.
  /** `notice`: a sub, gift, raid or redemption, its text in `message`. */
  kind?: 'message' | 'notice'
  user_id?: string | null
  user_login?: string | null
  /** Twitch's message type, e.g. `action` for /me. */
  message_type?: string | null
  /** When a moderator deleted the message, or cleared it (a timeout, ban or chat clear); ISO. */
  deleted_at?: string | null
  cleared_at?: string | null
  bot?: RawBotEntry | null
}

export interface RawCommentPage {
  comments: RawComment[]
  cursor?: string
  /** Pages fetched by offset from archives that know bot chat: the messages each source has for the VOD. */
  sources?: ChatSources
}

/** Emote sets saved per VOD (`/emotes?vod_id=`); items keep whatever shape the provider had. */
export interface RawEmoteSets {
  vodId?: string
  ffz_emotes?: RawThirdPartyEmote[] | null
  bttv_emotes?: RawThirdPartyEmote[] | null
  '7tv_emotes'?: RawThirdPartyEmote[] | null
  /** The providers' global sets as they were when the VOD was archived; null on rows saved before they were kept. */
  global_emotes?: { '7tv'?: RawThirdPartyEmote[] | null; bttv?: RawThirdPartyEmote[] | null; ffz?: RawThirdPartyEmote[] | null } | null
  /** `captured` with the VOD, or `backfilled` later (today's globals at backfill time). */
  global_emotes_source?: 'captured' | 'backfilled' | null
  global_emotes_at?: string | null
}

export interface RawThirdPartyEmote {
  id: string | number
  name?: string
  code?: string
  /** 7TV: the set entry's flags (1 = zero-width). Saved sets keep it; `/v1/emotes/third-party` doesn't send it yet. */
  flags?: number
  /** 7TV's own emote shape (the live global set): `data.flags` 256 = zero-width. */
  data?: { flags?: number } | null
}
