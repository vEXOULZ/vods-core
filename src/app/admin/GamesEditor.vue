<script setup lang="ts">
// Hand-edit a VOD's games rows: which game was played when, as the games pages list them (not the chapters). Laid out
// like ChaptersEditor; "Copy from chapters" starts the rows from the chapters when a VOD has none.
import { gamePalette, VxButton, VxCallout, VxSkeleton, useToast, clamp } from '@vexoulz/ui'
import { toClock } from '../../index'
import { computed, ref, watch } from 'vue'
import type { AdminVod, GameRow } from './api'
import { gameDrafts, gameEdits, gameErrors, gamesFromChapters, newGame, type GameDraft, type GameValue } from './edits'
import GameSearch from './GameSearch.vue'
import { admin } from './session'
import TimeInput from './TimeInput.vue'
import { useDraftEditor } from './useDraftEditor'
import { errorMessage } from '../lib/errors'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const loaded = ref<GameRow[] | null>(null)
const loadError = ref<string | null>(null)
async function load() {
  loadError.value = null
  try {
    loaded.value = await admin.games(props.vod.id)
  } catch (e) {
    loadError.value = errorMessage(e)
  }
}
watch(() => props.vod.id, load, { immediate: true })

const { rows, error, saving, dirty, errors, reset, save, remove } = useDraftEditor<GameDraft>({
  source: () => loaded.value,
  drafts: () => gameDrafts(loaded.value),
  edits: gameEdits,
  validate: (rows) => gameErrors(rows, props.duration),
  async save(rows) {
    const edits = gameEdits(rows)
    const vod = await admin.saveGames(props.vod.id, edits)
    loaded.value = await admin.games(props.vod.id).catch(() => edits)
    toast.show('Games saved', { duration: 3000 })
    emit('saved', vod)
  },
})
const sorted = computed(() => rows.value.every((r, i) => i === 0 || rows.value[i - 1]!.start <= r.start))

const label = (r: GameDraft) => r.name ?? '?'
const palette = computed(() => gamePalette(rows.value.map(label)))
const total = computed(() => Math.max(props.duration, ...rows.value.map((r) => (Number.isFinite(r.end) ? r.end : 0)), 1))
const pct = (s: number) => `${(clamp(s, 0, total.value) / total.value) * 100}%`

const game = (r: GameDraft): GameValue => ({ name: r.name, gameId: r.gameId, imageTemplate: r.imageTemplate })
function setGame(r: GameDraft, g: GameValue) {
  r.name = g.name
  r.gameId = g.gameId
  r.imageTemplate = g.imageTemplate
}
const add = () => rows.value.push(newGame(rows.value, props.duration))
const fromChapters = () => (rows.value = gamesFromChapters(props.vod.chapters))
const sortRows = () => (rows.value = [...rows.value].sort((a, b) => a.start - b.start))
</script>

<template>
  <div class="games">
    <VxCallout v-if="loadError" tone="error" title="Couldn't load the games">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <VxSkeleton v-else-if="!loaded" h="60px" />
    <template v-else>
      <div class="strip" role="img" :aria-label="`${rows.length} games over ${toClock(total)}`">
        <span
          v-for="r in rows"
          :key="r.key"
          class="seg"
          :class="{ 'is-bad': errors.has(r.key) }"
          :style="{ left: pct(r.start), width: `calc(${pct(r.end)} - ${pct(r.start)})`, background: palette.get(label(r)) }"
          :title="`${label(r)} · ${toClock(r.start)}–${toClock(r.end)}`"
        />
      </div>
      <div class="strip-scale vx-mono vx-muted"><span>0:00</span><span>{{ toClock(total) }}</span></div>

      <p v-if="!rows.length" class="vx-muted empty">No games rows: this VOD isn't on any game's page. Add one, or copy them from the chapters.</p>
      <ol class="rows">
        <li v-for="(r, i) in rows" :key="r.key" class="row" :class="{ 'has-error': errors.has(r.key) }">
          <span class="n vx-mono vx-muted">{{ i + 1 }}</span>
          <GameSearch class="g" :model-value="game(r)" :label="`games row ${i + 1}`" :invalid="!r.name" @update:model-value="setGame(r, $event)" />
          <div class="times">
            <TimeInput v-model="r.start" :label="`Games row ${i + 1} start`" :invalid="errors.has(r.key)" />
            <span class="vx-muted" aria-hidden="true">→</span>
            <TimeInput v-model="r.end" :label="`Games row ${i + 1} end`" :invalid="errors.has(r.key)" />
            <span class="len vx-mono vx-muted" title="Length">{{ Number.isFinite(r.end - r.start) && r.end > r.start ? toClock(r.end - r.start) : '—' }}</span>
          </div>
          <VxButton class="rm" variant="ghost" icon :label="`Remove games row ${i + 1}`" @click="remove(r)">×</VxButton>
          <p v-if="errors.has(r.key)" class="err">{{ errors.get(r.key) }}</p>
        </li>
      </ol>

      <VxCallout v-if="error" tone="error" title="Couldn't save the games">{{ error }}</VxCallout>

      <div class="foot">
        <VxButton @click="add">+ Add row</VxButton>
        <VxButton variant="ghost" :disabled="!vod.chapters?.length" @click="fromChapters">Copy from chapters</VxButton>
        <VxButton v-if="!sorted" variant="ghost" @click="sortRows">Sort by start</VxButton>
        <span class="spacer" />
        <VxButton :disabled="!dirty || saving" @click="reset">Undo changes</VxButton>
        <VxButton variant="primary" :loading="saving" :disabled="!dirty || errors.size > 0" @click="save">Save games</VxButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.games { display: flex; flex-direction: column; gap: 10px; }
.strip { position: relative; height: 14px; border-radius: 3px; background: var(--vx-line); overflow: hidden; }
.seg { position: absolute; top: 0; bottom: 0; border-right: 1px solid var(--vx-bg); box-sizing: border-box; }
.seg.is-bad { outline: 2px solid var(--vx-bad); outline-offset: -2px; }
.strip-scale { display: flex; justify-content: space-between; font-size: 11px; margin-top: -6px; }
.empty { margin: 4px 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row {
  display: grid; grid-template-columns: 22px minmax(160px, 1fr) auto auto; align-items: center; gap: 6px 10px;
  padding: 6px 8px; border-radius: var(--vx-radius); background: rgb(255 255 255 / 0.03);
}
.row.has-error { box-shadow: inset 0 0 0 1px var(--vx-bad); }
.n { font-size: 12px; text-align: right; }
.g { min-width: 0; }
.times { display: flex; align-items: center; gap: 6px; }
.len { font-size: 11px; min-width: 52px; }
.err { grid-column: 2 / -1; margin: 0; color: var(--vx-bad); font-size: 12px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
@container vx-site (max-width: 760px) {
  .row { grid-template-columns: 22px minmax(0, 1fr) auto; }
  .times { grid-column: 2 / -1; flex-wrap: wrap; }
  .rm { grid-column: 3; grid-row: 1; }
  .spacer { display: none; }
}
</style>
