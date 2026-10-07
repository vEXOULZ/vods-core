<script setup lang="ts">
// One list of VODs, by tag, each its own page (lib/listQuery, TABS): /vods has the plain VODs (merges and splits
// included), /playthroughs the playthroughs (one game across streams, as one video). One filter bar (All resets, title
// search, game dropdown with every game in the archive, tag, date range; all combinable and kept in the URL), a grid
// of cards, and "load more". On phones the bar wraps. A tag on a card links here narrowed to it (ThumbTags).
import { VxButton, VxCallout, VxDateRange, VxEmptyState, VxInput, VxPopover, VxSkeleton } from '@vexoulz/ui'
import { resumeProgress, type GamePlayed, type Progress, type Vod } from '../../index'
import { useVods, useVodsContext } from '../../vue/index'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GamePicker from '../components/GamePicker.vue'
import TagPicker from '../components/TagPicker.vue'
import VodCard from '../components/VodCard.vue'
import { loadGamesPlayed } from '../lib/gamesPlayed'
import { hasFilters, parseListQuery, toApiFilter, toListQuery, type ListState, type Tab } from '../lib/listQuery'
import { site, vodsConfig } from '../site'
import VodsShell from '../components/VodsShell.vue'
import { watchDebounced } from '../composables/watchDebounced'

const props = defineProps<{ tab: Tab }>()

const { client, progress } = useVodsContext()
const route = useRoute()
const router = useRouter()
const state = computed(() => parseListQuery(route.query, props.tab))

function go(patch: Partial<ListState>, push = false) {
  const query = toListQuery({ ...state.value, page: 1, ...patch })
  return push ? router.push({ query }) : router.replace({ query })
}

// ---- list: pages [first .. last] of the current filters ----
const { vods, total, page, loading, error, refresh } = useVods(
  () => ({ ...toApiFilter(state.value), page: state.value.page, perPage: site.perPage }),
  { append: true },
)

const shownFrom = computed(() => (page.value - Math.ceil(vods.value.length / site.perPage)) * site.perPage)
const hasMore = computed(() => shownFrom.value + vods.value.length < total.value)
const loadMore = () => go({ page: page.value + 1 })

// ---- search (debounced into the URL) ----
const titleDraft = ref(state.value.title)
watch(
  () => state.value.title,
  (t) => {
    if (t !== titleDraft.value.trim()) titleDraft.value = t
  },
)
const cancelSearch = watchDebounced(
  titleDraft,
  (t) => {
    if (t.trim() !== state.value.title) go({ title: t.trim() })
  },
  350,
)

// ---- games: every game in the archive ----
const games = shallowRef<GamePlayed[] | null>(null)
const gamesError = ref<string | null>(null)
function fetchGames(retry = false) {
  gamesError.value = null
  loadGamesPlayed(client, retry)
    .then((g) => (games.value = g))
    .catch((e: Error) => (gamesError.value = e.message || 'Something went wrong'))
}
fetchGames()
const game = computed({
  get: () => state.value.game,
  set: (g: string) => go({ game: g }),
})

function resetAll() {
  cancelSearch()
  titleDraft.value = ''
  router.replace({ query: {} })
}

const playthroughs = computed(() => state.value.tab === 'playthroughs')

// ---- tag ----
const tag = computed({
  get: () => state.value.tag,
  set: (t: string) => go({ tag: t }),
})
// A tag picked on a card further down: bring the narrowed list's top (the bar) into view.
const bar = ref<HTMLElement | null>(null)
watch(
  () => state.value.tag,
  async (t) => {
    if (!t || !bar.value || bar.value.getBoundingClientRect().top >= 0) return
    await nextTick()
    bar.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  },
)

// ---- dates ----
const dateFrom = ref(state.value.from)
const dateTo = ref(state.value.to)
watch(state, (s) => {
  dateFrom.value = s.from
  dateTo.value = s.to
})
watch([dateFrom, dateTo], ([from, to]) => {
  if (from !== state.value.from || to !== state.value.to) go({ from, to })
})
const minDay = vodsConfig.startDate.toISOString().slice(0, 10)
const dateLabel = computed(() => {
  const { from, to } = state.value
  if (!from && !to) return 'Any date'
  return `${from || '…'} → ${to || 'now'}`
})

// ---- resume positions ----
const saved = shallowRef(new Map<string, Progress>())
progress
  .list(500)
  .then((all) => (saved.value = new Map(all.map((p) => [p.vodId, p]))))
  .catch(() => undefined)
/** Where to pick each listed VOD up, if anywhere: one that grew since it was finished (a playthrough's new stream) at the new part. */
const resumeOf = (v: Vod) => resumeProgress(saved.value.get(v.id), v.duration)
const resume = computed(() => new Map(vods.value.map((v) => [v.id, resumeOf(v)])))

const countText = computed(() => `${(shownFrom.value + vods.value.length).toLocaleString()} of ${total.value.toLocaleString()}`)
</script>

<template>
  <VodsShell>

    <div ref="bar" class="bar">
      <h1 class="vx-display">{{ playthroughs ? 'Playthroughs' : 'Past broadcasts' }}</h1>
      <div class="filters">
        <VxButton :pressed="!hasFilters(state)" label="Clear every filter" @click="resetAll">All</VxButton>
        <VxInput v-model="titleDraft" class="search" type="search" placeholder="Search titles…" clearable>
          <template #icon>⌕</template>
        </VxInput>
        <GamePicker v-model="game" :games="games" :error="gamesError" @retry="fetchGames(true)" />
        <TagPicker v-model="tag" :tab="state.tab" />
        <VxPopover width="min(320px, calc(100vw - 32px))" role="dialog">
          <template #trigger="{ toggle, open }">
            <VxButton :pressed="open || !!(state.from || state.to)" @click="toggle">{{ dateLabel }} ▾</VxButton>
          </template>
          <div class="date-pop">
            <div class="vx-eyebrow">Streamed between</div>
            <VxDateRange v-model:from="dateFrom" v-model:to="dateTo" :min="minDay" />
          </div>
        </VxPopover>
      </div>
    </div>

    <VxCallout v-if="error" tone="error" title="Couldn't load the VODs">
      {{ error.message || 'Something went wrong' }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>

    <div v-else-if="loading && !vods.length" class="grid" aria-busy="true">
      <div v-for="i in 8" :key="i" class="sk">
        <VxSkeleton ratio="16 / 9" h="auto" />
        <VxSkeleton w="80%" />
        <VxSkeleton w="45%" h="0.8em" />
      </div>
    </div>

    <VxEmptyState
      v-else-if="!vods.length"
      :title="playthroughs ? 'No playthroughs match' : 'No VODs match'"
      :text="hasFilters(state) ? 'Try another search, tag or date range.' : playthroughs ? 'No playthroughs have been put together yet.' : 'Nothing archived yet.'"
    >
      <template v-if="hasFilters(state)" #actions>
        <VxButton @click="resetAll">Clear filters</VxButton>
      </template>
    </VxEmptyState>

    <template v-else>
      <div class="grid">
        <VodCard v-for="v in vods" :key="v.id" :vod="v" :progress="resume.get(v.id)" />
      </div>
      <div class="more">
        <VxButton v-if="hasMore" :loading="loading" @click="loadMore">Load {{ site.perPage }} more</VxButton>
        <span class="vx-muted vx-mono small">{{ countText }}</span>
      </div>
    </template>
  </VodsShell>
</template>

<style scoped>
.bar { scroll-margin-top: 16px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.bar h1 { font-size: 28px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.search { flex: 1 1 220px; max-width: 360px; }
@container vx-site (max-width: 700px) {
  /* Search gets its own full-width line; All, game and dates share the next. */
  .search { order: -1; flex-basis: 100%; max-width: none; }
}
.date-pop { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 24px 18px; }
.sk { display: flex; flex-direction: column; gap: 8px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 28px; }
.small { font-size: 11px; }
</style>
