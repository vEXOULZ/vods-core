// A VOD's YouTube thumbnail, sharp where it needs to be. The archive links YouTube's 320×180 one; the 1280×720 one
// exists for HD uploads only (YouTube sends a 120×90 grey image instead of an error when it doesn't), so it falls
// back to the small one, and to nothing (the placeholder) if that fails too.
import { youtubeThumb, vodThumbnail, type Vod } from '../../index'
import { computed, ref, watch } from 'vue'

/** `always`: shown large, so always the large one. `hidpi`: the small one, the large one on high-density screens. */
export type ThumbnailUse = 'always' | 'hidpi'

export function useThumbnail(vod: () => Vod, use: ThumbnailUse) {
  const small = computed(() => vodThumbnail(vod()))
  const large = computed(() => youtubeThumb(small.value, 'maxresdefault'))
  /** 0: fine; 1: the large one is missing; 2: nothing loads. */
  const failed = ref(0)
  watch(small, () => (failed.value = 0))
  const tryLarge = computed(() => !!large.value && failed.value === 0)

  const src = computed(() => (failed.value === 2 ? null : use === 'always' && tryLarge.value ? large.value : small.value))
  const srcset = computed(() => (use === 'hidpi' && tryLarge.value ? `${small.value} 1x, ${large.value} 2x` : undefined))

  function onLoad(e: Event) {
    const img = e.target as HTMLImageElement
    if (tryLarge.value && img.currentSrc === large.value && img.naturalWidth <= 120) failed.value = 1
  }
  function onError() {
    failed.value = tryLarge.value ? 1 : 2
  }
  return { src, srcset, onLoad, onError }
}
