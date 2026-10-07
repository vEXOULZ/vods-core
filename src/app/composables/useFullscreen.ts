// Browser fullscreen for the whole page (what F11 does), with Safari's prefixed API. iPhone Safari has no page
// fullscreen at all; `supported` is false there and the button says so instead of disappearing.
import { onMounted, onUnmounted, ref } from 'vue'

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export function useFullscreen() {
  const doc = document as WebkitDocument
  const supported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
  const active = ref(false)
  const sync = () => (active.value = !!(doc.fullscreenElement || doc.webkitFullscreenElement))

  /** Resolves false when the browser refused (no user gesture, blocked by policy). */
  async function toggle(): Promise<boolean> {
    try {
      if (active.value) await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      else {
        const el = document.documentElement as WebkitElement
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())
      }
    } catch {
      sync()
      return false
    }
    sync()
    return true
  }

  onMounted(() => {
    sync()
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
  })
  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('webkitfullscreenchange', sync)
  })

  return { supported, active, toggle }
}
