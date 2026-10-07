import { onScopeDispose, watch, type WatchSource } from 'vue'

/** Runs `cb` once `source` has stopped changing for `ms` (typing into a search box). Returns a cancel function. */
export function watchDebounced<T>(source: WatchSource<T>, cb: (value: T) => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => clearTimeout(timer)
  watch(source, (value) => {
    cancel()
    timer = setTimeout(() => cb(value), ms)
  })
  onScopeDispose(cancel)
  return cancel
}
