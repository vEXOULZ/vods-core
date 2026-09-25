import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { isResumable, type Progress } from '../progress'
import { useVodsContext } from './context'

/**
 * Loads where the viewer left off (`resume`, null when there's nothing worth resuming) and saves the position
 * every `everyMs` while playing, on pause, and when the page goes away.
 */
export function useProgress(opts: {
  vodId: MaybeRefOrGetter<string>
  duration: MaybeRefOrGetter<number>
  time: Ref<number>
  playing: Ref<boolean>
  everyMs?: number
}) {
  const { progress } = useVodsContext()
  const resume = shallowRef<Progress | null>(null)
  const every = opts.everyMs ?? 10_000
  let lastSave = 0

  watch(
    () => toValue(opts.vodId),
    async (id) => {
      resume.value = null
      const p = await progress.get(id)
      if (id === toValue(opts.vodId)) resume.value = p && isResumable(p) ? p : null
    },
    { immediate: true },
  )

  function save() {
    const duration = toValue(opts.duration)
    if (!duration || opts.time.value <= 0) return
    lastSave = Date.now()
    void progress.set({ vodId: toValue(opts.vodId), t: opts.time.value, duration })
  }

  watch(opts.time, () => {
    if (opts.playing.value && Date.now() - lastSave >= every) save()
  })
  watch(opts.playing, (playing) => !playing && save())

  const onHide = () => document.visibilityState === 'hidden' && save()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide)
  onScopeDispose(() => {
    save()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide)
  })

  return { resume, save }
}
