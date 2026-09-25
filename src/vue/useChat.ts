import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { RawBadges, RawComment } from '../api/types'
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
}

/**
 * Chat replay synced to the player. The chat clock is VOD time minus the viewer's offset; comments are resolved to
 * tokens (emotes, badges) as they arrive. Emotes and badges load once per VOD and never block chat.
 */
export function useChat(opts: UseChatOptions) {
  const { client, fetch } = useVodsContext()
  const messages = shallowRef<ChatMessage[]>([])
  const error = shallowRef<Error | null>(null)
  const max = opts.max ?? 200
  const emotes = shallowRef<EmoteSet | null>(null)
  const badges = shallowRef<RawBadges | null>(null)
  let replay: ChatReplay | null = null
  let ctrl: AbortController | undefined

  function start(vodId: string) {
    replay?.dispose()
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    replay = new ChatReplay(client, vodId, opts)
    shown = []
    messages.value = []
    emotes.value = null
    badges.value = null
    loadEmotes({ client, vodId, fetch, signal: mine.signal })
      .then((set) => !mine.signal.aborted && (emotes.value = set))
      .catch(() => undefined)
    client
      .badges(mine.signal)
      .then((b) => !mine.signal.aborted && (badges.value = b))
      .catch(() => undefined)
  }

  // The comments on screen, kept raw so they can be rendered again once emotes or badges arrive (comments often come
  // in before those have loaded, e.g. right after a seek).
  let shown: RawComment[] = []
  const render = (list: RawComment[]) => list.map((c) => toChatMessage(c, emotes.value, badges.value))
  watch([emotes, badges], () => (messages.value = render(shown)))

  const clock = () => toValue(opts.time) - (opts.offset?.value ?? 0)
  const busy = ref(false)

  async function tick() {
    if (!replay || !opts.playing.value || busy.value) return
    busy.value = true
    const r = replay
    try {
      const { reset, comments } = await r.update(clock())
      if (r !== replay) return
      if (reset || comments.length) {
        const next = reset ? comments : shown.concat(comments)
        shown = next.length > max ? next.slice(next.length - max) : next
        messages.value = render(shown)
      }
      error.value = null
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error.value = e as Error
    } finally {
      busy.value = false
    }
  }

  watch(() => toValue(opts.vodId), start, { immediate: true })
  watch([opts.time, opts.playing, () => opts.offset?.value], tick)
  onScopeDispose(() => {
    replay?.dispose()
    ctrl?.abort()
  })

  return { messages, error, emotes, badges }
}
