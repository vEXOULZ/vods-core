import { computed, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { pickUploadType, Timeline } from '../timeline'
import type { UploadType, Vod } from '../types'
import { useVodsContext } from './context'

/** Loads a VOD and builds its timeline for the chosen upload set (`/vods/:id`, `/youtube/:id`, `/live/:id`). */
export function useWatch(vodId: MaybeRefOrGetter<string>, type?: MaybeRefOrGetter<UploadType | null | undefined>) {
  const { client, config } = useVodsContext()
  const vod = shallowRef<Vod | null>(null)
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
    try {
      const v = await client.getVod(id, mine.signal)
      if (mine.signal.aborted) return
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

  const uploadType = computed<UploadType | null>(() => (vod.value ? pickUploadType(vod.value, toValue(type)) : null))
  const timeline = computed(() =>
    vod.value && uploadType.value ? new Timeline(vod.value, uploadType.value, { defaultPartDuration: config.defaultPartDuration }) : null,
  )
  /** Drive download for the same upload set, if there is one. */
  const download = computed(() => vod.value?.drive.find((d) => d.type === uploadType.value) ?? null)

  return { vod, timeline, uploadType, download, loading, notFound, error, reload: () => load(toValue(vodId)) }
}
