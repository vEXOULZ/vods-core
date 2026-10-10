<script setup lang="ts">
// Pick a chapter's game from Twitch's categories (GET /admin/twitch/games). Shows the current game with its box art;
// typing searches, arrows + Enter pick, "No category" clears it.
import { VxButton, VxInput, VxSpinner } from '@vexoulz/ui'
import { boxArt, NO_CATEGORY } from '../../index'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { errorText } from '@vexoulz/platform-web'
import type { TwitchGame } from './api'
import type { GameValue } from './edits'
import { admin } from './session'

const props = defineProps<{ label?: string; invalid?: boolean }>()
const model = defineModel<GameValue>({ required: true })

const open = ref(false)
const query = ref('')
const results = ref<TwitchGame[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const active = ref(0)
const input = ref<InstanceType<typeof VxInput> | null>(null)
const listId = useId()

const options = computed<GameValue[]>(() => [
  ...results.value.map((g) => ({ name: g.name, gameId: g.gameId, imageTemplate: g.imageTemplate })),
  { name: null, gameId: null, imageTemplate: null },
])

let timer: ReturnType<typeof setTimeout> | undefined
let ctrl: AbortController | null = null
watch(query, (q) => {
  clearTimeout(timer)
  ctrl?.abort()
  active.value = 0
  if (!q.trim()) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(async () => {
    const mine = (ctrl = new AbortController())
    try {
      results.value = await admin.searchGames(q.trim(), mine.signal)
      error.value = null
    } catch (e) {
      if (mine.signal.aborted) return
      error.value = errorText(e)
      results.value = []
    } finally {
      if (ctrl === mine) loading.value = false
    }
  }, 250)
})

async function start() {
  open.value = true
  query.value = ''
  await nextTick()
  input.value?.focus()
}

function pick(g: GameValue) {
  model.value = g
  close()
}

function close() {
  open.value = false
  ctrl?.abort()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') active.value = Math.min(active.value + 1, options.value.length - 1)
  else if (e.key === 'ArrowUp') active.value = Math.max(active.value - 1, 0)
  else if (e.key === 'Enter') {
    const g = options.value[active.value]
    if (g && (results.value.length || !query.value.trim())) pick(g)
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  } else return
  e.preventDefault()
}

function onBlur(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  if (!next || !(e.currentTarget as HTMLElement).contains(next)) close()
}
</script>

<template>
  <div class="game" :class="{ 'is-invalid': props.invalid }" @focusout="onBlur">
    <button v-if="!open" type="button" class="current vx-input" :aria-label="`${label ?? 'Game'}: ${model.name ?? NO_CATEGORY}. Change`" @click="start">
      <img v-if="boxArt(model.imageTemplate, 30)" :src="boxArt(model.imageTemplate, 30)!" alt="" class="art" />
      <span v-else class="art ph" aria-hidden="true" />
      <span class="name" :class="{ 'vx-muted': !model.name }">{{ model.name ?? NO_CATEGORY }}</span>
    </button>
    <template v-else>
      <VxInput
        ref="input"
        v-model="query"
        class="search"
        :invalid="props.invalid"
        role="combobox"
        :aria-label="`Search Twitch categories for ${label ?? 'this chapter'}`"
        aria-autocomplete="list"
        :aria-expanded="true"
        :aria-controls="listId"
        :aria-activedescendant="`${listId}-${active}`"
        placeholder="Search Twitch categories…"
        @keydown="onKey"
      />
      <ul :id="listId" class="results vx-pop" role="listbox" tabindex="-1">
        <li v-if="loading" class="note"><VxSpinner :size="12" /> Searching…</li>
        <li v-else-if="error" class="note bad">{{ error }}</li>
        <li v-else-if="query.trim() && !results.length" class="note vx-muted">No categories match.</li>
        <li
          v-for="(g, i) in options"
          :id="`${listId}-${i}`"
          :key="g.gameId ?? 'none'"
          role="option"
          :aria-selected="i === active"
          :class="{ 'is-active': i === active }"
          @mousedown.prevent="pick(g)"
          @mousemove="active = i"
        >
          <img v-if="boxArt(g.imageTemplate, 30)" :src="boxArt(g.imageTemplate, 30)!" alt="" class="art" loading="lazy" />
          <span v-else class="art ph" aria-hidden="true" />
          <span :class="{ 'vx-muted': !g.name }">{{ g.name ?? NO_CATEGORY }}</span>
        </li>
      </ul>
      <VxButton class="cancel" variant="ghost" icon label="Cancel" @click="close">×</VxButton>
    </template>
  </div>
</template>

<style scoped>
.game { position: relative; display: flex; align-items: center; gap: 4px; min-width: 0; }
.current { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; text-align: left; cursor: pointer; }
.is-invalid .current { border-color: var(--vx-bad); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art { width: 18px; height: 24px; border-radius: 2px; flex: none; object-fit: cover; }
.ph { background: var(--vx-line); }
.search { flex: 1; min-width: 0; }
.results {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30; min-width: 220px;
  list-style: none; margin: 0; padding: 4px; max-height: 280px; overflow: auto;
}
.results li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; }
.results li.is-active { background: var(--vx-hover); }
.results .note { cursor: default; font-size: 12px; }
.bad { color: var(--vx-bad); }
</style>
