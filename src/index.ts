export { defineVodsConfig, DEFAULT_PART_DURATION, type VodsConfig, type VodsConfigInput } from './config'
export { toSeconds, toHMS, toClock, parseTimestamp } from './time'
export type * from './types'

export { ArchiveClient, ApiError, type ArchiveClientOptions, type Fetch } from './api/client'
export { normalizeVod, normalizeChapter, normalizeUploads, gamesOf } from './api/normalize'
export { toQueryString, vodListQuery, type QueryObject, type QueryValue, type VodFilter, type VodListOptions } from './api/query'
export type * from './api/types'

export { Timeline, pickUploadType, restrictedSpans, type Position, type Span, type TimelineOptions } from './timeline'
export {
  WatchPlayer,
  mountYouTube,
  loadYouTubeApi,
  statusFromYouTubeError,
  YT_STATE,
  type PlayerLike,
  type PartStatus,
  type PlayerEvents,
  type WatchPlayerOptions,
} from './player'

export { EmoteSet, loadEmotes, emoteImage, EMOTE_CDN, EMOTE_API, type Emote, type EmoteImage, type EmoteProvider, type LoadEmotesOptions } from './chat/emotes'
export { tokenize, resolveBadges, toChatMessage, type Token, type Badge, type ChatMessage } from './chat/message'
export { ChatReplay, type CommentSource, type ReplayOptions, type ReplayUpdate } from './chat/replay'

export { LocalProgressStore, isResumable, type Progress, type ProgressStore, type KeyValueStorage, type LocalProgressOptions } from './progress'
