<script setup lang="ts">
// Game filter for the list page: a dropdown of every game in the archive (most played first, with how many VODs
// each is in), with a filter field for long lists. Empty value = all games.
import { learnGameColors, VxButton, VxInput, VxMenuItem, VxPopover, VxPosters } from '@vexoulz/ui'
import { boxArt, type GamePlayed } from '../../index'
import { computed, ref } from 'vue'

const props = defineProps<{ games: GamePlayed[] | null; error?: string | null }>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ retry: [] }>()

const filter = ref('')
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const all = props.games ?? []
  return q ? all.filter((g) => g.name.toLowerCase().includes(q)) : all
})
const current = computed(() => props.games?.find((g) => g.name === model.value) ?? null)
const art = (g: GamePlayed) => boxArt(g.image) ?? undefined

function opened() {
  filter.value = ''
  if (props.games) learnGameColors(props.games.map((g) => ({ name: g.name, image: art(g) })))
}
function pick(name: string, close: () => void) {
  model.value = name
  close()
}
</script>

<template>
  <VxPopover width="min(340px, calc(100vw - 24px))" :cap="440" role="dialog" @open="opened">
    <template #trigger="{ toggle, open }">
      <VxButton class="trigger" :pressed="open || !!model" :label="model ? `Game: ${model}` : 'Game: all games'" @click="toggle">
        <VxPosters v-if="current" :games="[{ name: current.name, image: art(current) }]" mode="row" :size="16" />
        <span class="label">{{ model || 'All games' }}</span>
        <span aria-hidden="true">▾</span>
      </VxButton>
    </template>
    <template #default="{ close }">
      <div class="head">
        <VxInput v-model="filter" autofocus type="search" placeholder="Find a game…" clearable />
      </div>
      <p v-if="error" class="note">
        Couldn't load the games: {{ error }}
        <VxButton size="sm" @click="emit('retry')">Try again</VxButton>
      </p>
      <p v-else-if="!games" class="note vx-muted">Loading games…</p>
      <template v-else>
        <VxMenuItem v-if="!filter" :current="!model" @click="pick('', close)">All games</VxMenuItem>
        <VxMenuItem
          v-for="g in shown"
          :key="g.name"
          :current="g.name === model"
          :sub="`${g.vods} VOD${g.vods === 1 ? '' : 's'}`"
          @click="pick(g.name, close)"
        >
          <template #lead><VxPosters :games="[{ name: g.name, image: art(g) }]" mode="row" :size="20" /></template>
          {{ g.name }}
        </VxMenuItem>
        <p v-if="!shown.length" class="note vx-muted">No game matches “{{ filter }}”.</p>
      </template>
    </template>
  </VxPopover>
</template>

<style scoped>
.trigger { max-width: 260px; }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head { position: sticky; top: -6px; z-index: 1; padding: 2px 2px 6px; margin-bottom: 2px; background: var(--vx-bg); }
.note { margin: 8px; font-size: 13px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
</style>
