<script setup lang="ts">
// Builds a playthrough: pick a game, then the windows of real VODs that played it
// (GET /api/v2/playthrough-candidates, oldest first), and add them as segments, in that order.
import { VxButton, VxCallout, VxCheckbox, VxSkeleton } from '@vexoulz/ui'
import { toClock } from '../../index'
import { computed, ref, watch } from 'vue'
import { errorText } from '@vexoulz/platform-web'
import type { PlaythroughWindow } from './api'
import type { GameValue } from './edits'
import GameSearch from './GameSearch.vue'
import { admin } from './session'

const emit = defineEmits<{ add: [windows: PlaythroughWindow[], game: string | null] }>()

const game = ref<GameValue>({ name: null, gameId: null, imageTemplate: null })
const windows = ref<PlaythroughWindow[] | null>(null)
const picked = ref(new Set<string>())
const error = ref<string | null>(null)
const key = (w: PlaythroughWindow) => `${w.vod_id}@${w.start}`

let ctrl: AbortController | null = null
watch(
  () => game.value.gameId,
  async (id) => {
    ctrl?.abort()
    windows.value = null
    error.value = null
    if (!id) return
    const mine = (ctrl = new AbortController())
    try {
      const { items } = await admin.playthroughCandidates(id, mine.signal)
      windows.value = items
      picked.value = new Set(items.map(key))
    } catch (e) {
      if (!mine.signal.aborted) error.value = errorText(e)
    }
  },
)

const toggle = (w: PlaythroughWindow, on: boolean) => {
  const next = new Set(picked.value)
  if (on) next.add(key(w))
  else next.delete(key(w))
  picked.value = next
}
const chosen = computed(() => (windows.value ?? []).filter((w) => picked.value.has(key(w))))
const total = computed(() => chosen.value.reduce((s, w) => s + w.length, 0))
</script>

<template>
  <div class="builder">
    <GameSearch v-model="game" label="Game" />
    <p v-if="!game.gameId" class="vx-muted small">Pick a game to see every window of a public VOD that played it.</p>
    <VxCallout v-else-if="error" tone="error" title="Couldn't find its windows">{{ error }}</VxCallout>
    <div v-else-if="!windows" class="sk" aria-busy="true"><VxSkeleton v-for="i in 3" :key="i" h="28px" /></div>
    <p v-else-if="!windows.length" class="vx-muted small">No public VOD has a chapter of {{ game.name }}.</p>
    <template v-else>
      <ul class="windows">
        <li v-for="w in windows" :key="key(w)">
          <VxCheckbox :model-value="picked.has(key(w))" :label="w.title ?? `VOD ${w.vod_id}`" @update:model-value="(on: boolean) => toggle(w, on)" />
          <span class="vx-muted small vx-mono">{{ w.created_at.slice(0, 10) }} · {{ w.vod_id }} · {{ toClock(w.start) }}–{{ toClock(w.end) }} ({{ toClock(w.length) }})</span>
        </li>
      </ul>
      <div class="row">
        <VxButton variant="primary" :disabled="!chosen.length" @click="emit('add', chosen, game.name)">
          Add {{ chosen.length }} {{ chosen.length === 1 ? 'window' : 'windows' }} ({{ toClock(total) }})
        </VxButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.builder { display: grid; gap: 10px; }
.small { font-size: 13px; margin: 0; }
.sk { display: grid; gap: 6px; }
.windows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.windows li { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; }
.row { display: flex; gap: 8px; }
</style>
