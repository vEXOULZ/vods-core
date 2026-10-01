import { computed, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { pickSyntheticUploadType, SegmentTimeline, sourceIds } from '../composite'
import { pickUploadType, Timeline, type PlayableTimeline } from '../timeline'
import type { UploadType, Vod } from '../types'
import { useVodsContext } from './context'

/**
 * Loads a VOD and builds its timeline for the chosen upload set (`/vods/:id`, `/youtube/:id`, `/live/:id`). For a
 * synthetic VOD it also loads the VODs it's made of (`sources`), and the timeline plays their windows.
 */
export function useWatch(vodId: MaybeRefOrGetter<string>, type?: MaybeRefOrGetter<UploadType | null | undefined>) {
  const { client, config } = useVodsContext()
  const vod = shallowRef<Vod | null>(null)
  /** A synthetic VOD's sources that loaded (a hidden one doesn't: its segments are skipped). Empty otherwise. */
  const sources = shallowRef<Vod[]>([])
  const loading = ref(true)
  const notFound = ref(false)
  const error = shallowRef<Error | null>(null)
  let ctrl: AbortController | undefined

  async function load(id: string) {
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    loading.value = true
    notFound.value = false
    error.value = null
    vod.value = null
    sources.value = []
    try {
      const v = await client.getVod(id, mine.signal)
      const found = v ? await Promise.all(sourceIds(v).map((s) => client.getVod(s, mine.signal))) : []
      if (mine.signal.aborted) return
      sources.value = found.filter((s): s is Vod => s !== null)
      vod.value = v
      notFound.value = v === null
    } catch (e) {
      if (!mine.signal.aborted) error.value = e as Error
    } finally {
      if (!mine.signal.aborted) loading.value = false
    }
  }

  watch(() => toValue(vodId), load, { immediate: true })
  onScopeDispose(() => ctrl?.abort())

  const uploadType = computed<UploadType | null>(() => {
    const v = vod.value
    if (!v) return null
    return v.synthetic ? pickSyntheticUploadType(sources.value, toValue(type)) : pickUploadType(v, toValue(type))
  })
  const timeline = computed<PlayableTimeline | null>(() => {
    const v = vod.value
    if (!v || !uploadType.value) return null
    const opts = { defaultPartDuration: config.defaultPartDuration }
    return v.synthetic ? new SegmentTimeline(v, sources.value, uploadType.value, opts) : new Timeline(v, uploadType.value, opts)
  })
  /** Set on a synthetic VOD (for chat and the segment marks). */
  const segments = computed(() => (timeline.value instanceof SegmentTimeline ? timeline.value : null))
  /** Drive download for the same upload set, if there is one. */
  const download = computed(() => vod.value?.drive.find((d) => d.type === uploadType.value) ?? null)

  return { vod, sources, timeline, segments, uploadType, download, loading, notFound, error, reload: () => load(toValue(vodId)) }
}
