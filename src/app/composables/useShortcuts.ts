import { onMounted, onUnmounted } from 'vue'

export interface Shortcut {
  keys: string[]
  /** Shown in the shortcuts popover. */
  label: string
  display: string
  run: (e: KeyboardEvent) => void
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  // Space and Enter on a focused button or link belong to that control.
  if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a, [role="slider"], [role="switch"]')) return true
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

/** Page-wide keyboard shortcuts, ignored while typing or with Ctrl/Alt/Meta held. */
export function useShortcuts(list: () => Shortcut[]) {
  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || typing(e)) return
    const s = list().find((s) => s.keys.includes(e.key))
    if (!s) return
    e.preventDefault()
    s.run(e)
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onUnmounted(() => window.removeEventListener('keydown', onKey))
}
