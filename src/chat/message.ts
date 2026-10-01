// Archive comments → chat lines with their VOD time. The parsing (tokens, badges, modifiers) lives in
// @vexoulz/platform-web, shared with doomtp-web; it is re-exported here so existing imports keep working.
import { resolveBadges, tokenize, type ChatLine, type Removal } from '@vexoulz/platform-web/chat'
import type { ChatSource, RawBadges, RawComment } from '../api/types'
import type { EmoteSet } from './emotes'

export {
  chatName,
  removalNote,
  resolveBadges,
  tokenize,
  type Badge,
  type ChatLine,
  type EmoteLayer,
  type EmoteToken,
  type Modifier,
  type NameMode,
  type Removal,
  type Token,
} from '@vexoulz/platform-web/chat'

export interface ChatMessage extends ChatLine {
  /** VOD seconds. */
  at: number
  source: ChatSource
}

const PLAIN_NAME = /^[A-Za-z0-9_]+$/

/** The username for a comment: the bot's, or derived from a plain-ASCII display name. */
export function loginOf(c: Pick<RawComment, 'display_name' | 'user_login'>): string | null {
  if (c.user_login) return c.user_login
  return c.display_name && PLAIN_NAME.test(c.display_name) ? c.display_name.toLowerCase() : null
}

function removalOf(c: RawComment): Removal | null {
  if (!c.deleted_at && !c.cleared_at) return null
  const r = c.bot?.removal
  return {
    type: r?.type ?? (c.deleted_at ? 'delete' : 'user_clear'),
    reason: r?.reason || null,
    seconds: r?.duration_s ?? null,
  }
}

export function toChatMessage(c: RawComment, emotes?: EmoteSet | null, badges?: RawBadges | null): ChatMessage {
  return {
    id: c.id,
    at: c.content_offset_seconds,
    user: c.display_name,
    login: loginOf(c),
    color: c.user_color || null,
    badges: resolveBadges(c.user_badges, badges),
    tokens: tokenize(c.message, emotes),
    source: c.source ?? 'replay',
    kind: c.kind === 'notice' ? 'notice' : 'message',
    noticeType: c.kind === 'notice' ? (c.bot?.type ?? null) : null,
    action: c.message_type === 'action',
    bits: c.bot?.bits || null,
    reward: c.bot?.reward?.title
      ? { title: c.bot.reward.title, cost: c.bot.reward.cost ?? null, input: c.bot.reward.input || null }
      : null,
    removed: removalOf(c),
  }
}
