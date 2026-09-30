import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { ArchiveClient } from '../api/client'
import type { ChatSource, ChatSources, RawBadges, RawComment } from '../api/types'
import { loadEmotes, type EmoteSet } from '../chat/emotes'
import { toChatMessage, type ChatMessage } from '../chat/message'
import { ChatReplay, type ReplayOptions } from '../chat/replay'
import { useVodsContext } from './context'

export interface UseChatOptions extends ReplayOptions {
  vodId: MaybeRefOrGetter<string>
  /** VOD seconds from the player. */
  time: Ref<number>
  playing: Ref<boolean>
  /** The viewer's chat offset in seconds (positive shows chat later). */
  offset?: Ref<number>
  /** Messages kept on screen. */
  max?: number
  /** Which chat to replay (`auto` or left out: the archive picks). Changing it reloads chat at the current time. */
  chatSource?: MaybeRefOrGetter<ChatSource | 'auto' | undefined>
}

/**
 * Chat replay synced to the player. The chat clock is VOD time minus the viewer's offset; comments are resolved to
 * tokens (emotes, badges) as they arrive. Emotes and badges load once per VOD and never block chat.
 */
// The channel's and Twitch's global badges don't change per VOD: fetched once per client (a failure is retried next
// time).
const badgeRequests = new WeakMap<ArchiveClient, Promise<RawBadges>>()

function loadBadges(client: ArchiveClient): Promise<RawBadges> {
  let request = badgeRequests.get(client)
  if (!request) {
    request = client.badges()
    request.catch(() => badgeRequests.delete(client))
    badgeRequests.set(client, request)
  }
  return request
}

export function useChat(opts: UseChatOptions) {
  const { client, fetch } = useVodsContext()
  const messages = shallowRef<ChatMessage[]>([])
  const error = shallowRef<Error | null>(null)
  const max = opts.max ?? 200
  const emotes = shallowRef<EmoteSet | null>(null)
  const badges = shallowRef<RawBadges | null>(null)
  /** The messages each chat has for this VOD, once the first page is in (null before, or from older archives). */
  const sources = shallowRef<ChatSources | null>(null)
  /** The chat being shown: the one asked for, or the archive's pick once a page says which (null until then). */
  const served = shallowRef<ChatSource | null>(null)
  let replay: ChatReplay | null = null
  let ctrl: AbortController | undefined

  const wanted = (): ChatSource | undefined => {
    const s = toValue(opts.chatSource)
    return s === 'auto' ? undefined : s
  }

  /** A fresh replay of `vodId` from the chosen chat; emotes and badges stay. */
  function restart(vodId: string) {
    replay?.dispose()
    replay = new ChatReplay(client, vodId, { ...opts, source: wanted() })
    served.value = wanted() ?? null
    shown = []
    messages.value = []
  }

  function start(vodId: string) {
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    sources.value = null
    restart(vodId)
    emotes.value = null
    badges.value = null
    loadEmotes({ client, vodId, fetch, signal: mine.signal })
      .then((set) => !mine.signal.aborted && (emotes.value = set))
      .catch(() => undefined)
    loadBadges(client)
      .then((b) => !mine.signal.aborted && (badges.value = b))
      .catch(() => undefined)
  }

  // The comments on screen, kept raw so they can be rendered again once emotes or badges arrive (comments often come
  // in before those have loaded, e.g. right after a seek). Each comment is converted once per emotes/badges pair.
  let shown: RawComment[] = []
  let converted = new WeakMap<RawComment, ChatMessage>()
  const toMessage = (c: RawComment) => {
    let m = converted.get(c)
    if (!m) converted.set(c, (m = toChatMessage(c, emotes.value, badges.value)))
    return m
  }
  const render = (list: RawComment[]) => list.map(toMessage)
  watch([emotes, badges], () => {
    converted = new WeakMap()
    messages.value = render(shown)
  })

  const clock = () => toValue(opts.time) - (opts.offset?.value ?? 0)
  let busy = false
  let again = false // a forced tick came while busy: run it after

  async function tick(force = false) {
    if (!replay || (!opts.playing.value && !force)) return
    if (busy) {
      again ||= force
      return
    }
    busy = true
    const r = replay
    try {
      const { reset, comments } = await r.update(clock())
      if (r !== replay) return
      if (r.sources) sources.value = r.sources
      if (!served.value) served.value = comments[0]?.source ?? (reset && r.sources && !r.sources.bot ? 'replay' : null)
      if (reset || comments.length) {
        const next = reset ? comments : shown.concat(comments)
        shown = next.length > max ? next.slice(next.length - max) : next
        messages.value = render(shown)
      }
      error.value = null
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error.value = e as Error
    } finally {
      busy = false
      if (again) {
        again = false
        void tick(true)
      }
    }
  }

  watch(() => toValue(opts.vodId), start, { immediate: true })
  // A new chat shows at once, even while paused.
  watch(wanted, () => {
    restart(toValue(opts.vodId))
    void tick(true)
  })
  watch([opts.time, opts.playing, () => opts.offset?.value], () => tick())
  onScopeDispose(() => {
    replay?.dispose()
    ctrl?.abort()
  })

  return { messages, error, emotes, badges, sources, served }
}
