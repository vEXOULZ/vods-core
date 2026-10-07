<script setup lang="ts">
// The menu a clicked emote opens: one row per emote drawn in the stack (the emote, the zero-width emotes over it, and
// the modifiers on each), linking to the emote's page on its provider's site. Twitch emotes have no such page, and
// the channel one belongs to isn't saved with chat, so their row says so instead of linking.
// One menu serves the whole chat. It follows its emote while chat scrolls and closes once the emote scrolls away.
import { clampX, place, VxMenuItem } from '@vexoulz/ui'
import type { EmoteToken } from '../../index'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { emoteMenuRows, type EmoteSources } from '../lib/emoteMenu'

const props = defineProps<{ token: EmoteToken; anchor: HTMLElement; enabled: EmoteSources }>()
const emit = defineEmits<{ close: [] }>()

const rows = computed(() => emoteMenuRows(props.token, props.enabled))
const unknown = computed(() => rows.value.some((r) => !r.href))

const panel = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0, maxHeight: 320 })

// Under the emote (or above it, when there's more room there), kept on screen sideways. Closes when the emote leaves
// the chat's view, or the page.
function follow() {
  const chat = props.anchor.closest('.lines')
  if (!props.anchor.isConnected || !chat) return emit('close')
  const a = props.anchor.getBoundingClientRect()
  const view = chat.getBoundingClientRect()
  if (a.bottom < view.top || a.top > view.bottom) return emit('close')
  const r = place({ anchor: a, bounds: { top: 0, bottom: window.innerHeight }, viewport: window.innerHeight, prefer: 'down', cap: 320, content: panel.value?.scrollHeight })
  const width = panel.value?.offsetWidth ?? 0
  const left = a.left + clampX(a.left, a.left + width, document.documentElement.clientWidth)
  const top = r.dir === 'down' ? a.bottom + 6 : a.top - 6 - Math.min(r.maxHeight, panel.value?.scrollHeight ?? r.maxHeight)
  pos.value = { top, left, maxHeight: r.maxHeight }
}
let frame = 0
const loop = () => {
  follow()
  frame = requestAnimationFrame(loop)
}

// A press outside the menu closes it; one on its own emote is left to that emote's click, which closes it.
function outside(e: PointerEvent) {
  const target = e.target as Node
  if (!panel.value?.contains(target) && !props.anchor.contains(target)) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  emit('close')
  props.anchor.focus()
}

watch(
  () => props.anchor,
  async () => {
    cancelAnimationFrame(frame)
    await nextTick()
    loop()
    panel.value?.querySelector<HTMLElement>('.vx-menu-item')?.focus({ preventScroll: true })
  },
  { immediate: true },
)
document.addEventListener('pointerdown', outside)
document.addEventListener('keydown', onKey)
onUnmounted(() => {
  cancelAnimationFrame(frame)
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="panel"
      class="emote-menu vx-overlay vx-pop"
      role="menu"
      :aria-label="`Emotes in ${token.emote.code}`"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px`, maxHeight: `${pos.maxHeight}px` }"
    >
      <VxMenuItem
        v-for="r in rows"
        :key="r.key"
        :href="r.href ?? undefined"
        external
        :disabled="!r.href"
        :sub="r.href ? `${r.provider} ↗` : r.provider"
        :title="r.href ? `Open ${r.code} on ${r.provider}` : undefined"
        :class="{ mod: r.effect }"
        @click="emit('close')"
      >
        <template #lead>
          <span class="icon"><img :src="r.src" :srcset="r.srcset" alt="" loading="lazy" /></span>
        </template>
        {{ r.code }}<span v-if="r.effect" class="effect vx-muted"> · {{ r.effect }}</span>
      </VxMenuItem>
      <p v-if="unknown" class="note vx-muted">Which channel a Twitch emote is from isn't saved with the chat, so it has no link.</p>
    </div>
  </Teleport>
</template>

<style scoped>
.emote-menu {
  position: fixed; z-index: 40; display: flex; flex-direction: column; gap: 1px; padding: 6px; overflow-y: auto;
  width: max-content; min-width: 200px; max-width: calc(100vw - 16px);
}
/* Every icon gets the same box, so the names and providers line up whatever the emote's shape. */
.icon { flex: none; display: grid; place-items: center; width: 44px; height: 28px; }
.icon img { max-width: 100%; max-height: 100%; }
/* A modifier sits under the emote it applies to, with a smaller icon in the same column. */
.mod .icon img { max-height: 20px; }
.effect { font-size: 12px; }
.note { margin: 4px 8px 2px; max-width: 30ch; font-size: 11px; line-height: 1.4; }
</style>
