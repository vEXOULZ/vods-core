import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { VodListOptions } from '../api/query'
import type { Vod } from '../types'
import { useVodsContext } from './context'

export interface UseVodsOptions {
  /**
   * "Load more": asking for the page right after the last one, with the same filters, appends it to `vods` instead
   * of replacing them. Any other change starts over from an empty list.
   */
  append?: boolean
}

/** A page of VODs that refetches when the filters change. Stale responses are dropped. */
export function useVods(options: MaybeRefOrGetter<VodListOptions>, { append = false }: UseVodsOptions = {}) {
  const { client } = useVodsContext()
  const vods = shallowRef<Vod[]>([])
  const total = ref(0)
  /** The last page loaded (1-based). */
  const page = ref(0)
  const loading = ref(false)
  const error = shallowRef<Error | null>(null)
  let filterKey = ''
  let ctrl: AbortController | undefined

  async function refresh() {
    ctrl?.abort()
    const mine = (ctrl = new AbortController())
    const opts = toValue(options)
    const key = JSON.stringify({ ...opts, page: undefined })
    const at = opts.page ?? 1
    const more = append && key === filterKey && at === page.value + 1 && vods.value.length > 0
    if (append && !more) vods.value = []
    loading.value = true
    error.value = null
    try {
      const res = await client.listVods(opts, mine.signal)
      if (mine.signal.aborted) return
      vods.value = more ? [...vods.value, ...res.vods] : res.vods
      total.value = res.total
      page.value = at
      filterKey = key
    } catch (e) {
      if (!mine.signal.aborted) error.value = e as Error
    } finally {
      if (!mine.signal.aborted) loading.value = false
    }
  }

  watch(() => JSON.stringify(toValue(options)), refresh, { immediate: true })
  onScopeDispose(() => ctrl?.abort())
  return { vods, total, page, loading, error, refresh }
}
