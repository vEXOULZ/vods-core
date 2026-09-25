import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { VodListOptions } from '../api/query'
import type { Vod } from '../types'
import { useVodsContext } from './context'

/** A page of VODs that refetches when the filters change. Stale responses are dropped. */
export function useVods(options: MaybeRefOrGetter<VodListOptions>) {
  const { client } = useVodsContext()
  const vods = shallowRef<Vod[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = shallowRef<Error | null>(null)
  let ctrl: AbortController | undefined

  async function refresh() {
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    loading.value = true
    error.value = null
    try {
      const page = await client.listVods(toValue(options), mine.signal)
      if (mine.signal.aborted) return
      vods.value = page.vods
      total.value = page.total
    } catch (e) {
      if (!mine.signal.aborted) error.value = e as Error
    } finally {
      if (!mine.signal.aborted) loading.value = false
    }
  }

  watch(() => JSON.stringify(toValue(options)), refresh, { immediate: true })
  onScopeDispose(() => ctrl?.abort())
  return { vods, total, loading, error, refresh }
}
