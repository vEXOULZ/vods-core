<script setup lang="ts">
// /manage/vods?q=&hidden=&synthetic=: find a VOD to edit (GET /api/v2/vods, so hidden, merged and synthetic ones too;
// a title or an id), add ones the monitor missed, and make a synthetic one (a playthrough, say).
import { VxButton, VxCallout, VxChip, VxDialog, VxField, VxInput, VxSegmented, VxSkeleton, VxTable, useToast, type Option, type TableColumn } from '@vexoulz/ui'
import { toClock } from '../../../index'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { VodListRow } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import { errorMessage } from '../../lib/errors'
import { watchDebounced } from '../../composables/watchDebounced'
import { site } from '../../site'

const PER_PAGE = 30
const route = useRoute()
const router = useRouter()
const toast = useToast()

type Shown = 'all' | 'shown' | 'hidden'
const SHOWN: Option<Shown>[] = [
  { value: 'all', label: 'All' },
  { value: 'shown', label: 'Public' },
  { value: 'hidden', label: 'Hidden' },
]

type Kind = 'all' | 'twitch' | 'synthetic'
const KIND: Option<Kind>[] = [
  { value: 'all', label: 'All' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'synthetic', label: 'Synthetic' },
]

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const shown = computed<Shown>(() => (route.query.hidden === 'true' ? 'hidden' : route.query.hidden === 'false' ? 'shown' : 'all'))
const kind = computed<Kind>(() => (route.query.synthetic === 'true' ? 'synthetic' : route.query.synthetic === 'false' ? 'twitch' : 'all'))
const draft = ref(query.value)
const setQuery = (q: string, s: Shown, k: Kind) =>
  router.replace({
    query: {
      ...(q ? { q } : {}),
      ...(s !== 'all' ? { hidden: String(s === 'hidden') } : {}),
      ...(k !== 'all' ? { synthetic: String(k === 'synthetic') } : {}),
    },
  })
watchDebounced(draft, (v) => setQuery(v.trim(), shown.value, kind.value), 300)
const setShown = (s: Shown | undefined) => setQuery(query.value, s ?? 'all', kind.value)
const setKind = (k: Kind | undefined) => setQuery(query.value, shown.value, k ?? 'all')

const idLike = computed(() => /^\d{6,}$/.test(query.value) ? query.value : null)

const vods = ref<VodListRow[]>([])
const next = ref<string | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
let ctrl: AbortController | null = null
/** The first page again (`more` = the page after the last one). */
async function load(more = false) {
  ctrl?.abort()
  const mine = (ctrl = new AbortController())
  loading.value = true
  error.value = null
  try {
    const hidden = shown.value === 'all' ? undefined : shown.value === 'hidden'
    const synthetic = kind.value === 'all' ? undefined : kind.value === 'synthetic'
    const cursor = more ? next.value ?? undefined : undefined
    const page = await admin.vodList({ q: query.value || undefined, hidden, synthetic, limit: PER_PAGE, cursor }, mine.signal)
    vods.value = more ? [...vods.value, ...page.items] : page.items
    next.value = page.next_cursor
  } catch (e) {
    if (!mine.signal.aborted) error.value = e
  } finally {
    if (ctrl === mine) loading.value = false
  }
}
watch([query, shown, kind], () => load(), { immediate: true })
const refresh = () => load()
const more = () => load(true)

const columns: TableColumn[] = [
  { key: 'id', label: 'Id', mono: true },
  { key: 'title', label: 'Title' },
  { key: 'date', label: 'Streamed', muted: true },
  { key: 'length', label: 'Length', mono: true, align: 'right' },
]
const rows = computed(() =>
  vods.value.map((v) => ({
    id: v.id,
    title: v.title ?? 'Untitled',
    date: v.created_at.slice(0, 10),
    length: v.duration_seconds == null ? '' : toClock(v.duration_seconds),
    hidden: v.hidden,
    merged: v.merged_into?.id ?? null,
    synthetic: v.synthetic ? (v.synthetic.supersedes ? 'merge or split' : 'synthetic') : null,
    tags: v.tags,
    // A synthetic VOD is edited as its segments.
    to: v.synthetic ? `/manage/synthetic/${encodeURIComponent(v.id)}` : `/manage/vods/${v.id}`,
  })),
)

// Add a VOD the monitor missed
const addOpen = ref(false)
const addId = ref('')
const adding = ref<string | null>(null)
const addBad = computed(() => !/^\d+$/.test(addId.value.trim()))
async function add(mode: 'archive' | 'create') {
  const id = addId.value.trim()
  adding.value = mode
  try {
    const res = mode === 'archive' ? await admin.archiveFromTwitch(id) : await admin.createFromTwitch(id)
    toast.show(res.msg, { duration: 3500 })
    addOpen.value = false
    router.push(`/manage/vods/${id}`)
  } catch (e) {
    toast.show(errorMessage(e), { kind: 'error', duration: 6000 })
  } finally {
    adding.value = null
  }
}

onMounted(() => (document.title = `VODs · Manage · ${site.name}`))
</script>

<template>
  <ManageShell title="VODs">
    <template #actions>
      <VxButton to="/manage/synthetic/new">New synthetic VOD</VxButton>
      <VxButton variant="primary" @click="addId = ''; addOpen = true">Add from Twitch</VxButton>
    </template>

    <div class="search">
      <VxInput v-model="draft" type="search" placeholder="Search titles, or paste a VOD id…" clearable>
        <template #icon>⌕</template>
      </VxInput>
      <VxSegmented :model-value="shown" :options="SHOWN" label="Visibility" @update:model-value="setShown" />
      <VxSegmented :model-value="kind" :options="KIND" label="Kind" @update:model-value="setKind" />
      <VxButton v-if="idLike" :to="`/manage/vods/${idLike}`" variant="primary">Open VOD {{ idLike }}</VxButton>
    </div>

    <VxCallout v-if="error" tone="error" title="Couldn't load the VODs">
      {{ errorMessage(error) }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="loading && !vods.length" class="sk" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" h="36px" /></div>
    <template v-else>
      <VxTable :columns="columns" :rows="rows" row-key="id" manual label="VODs" empty="No VODs match.">
        <template #cell-id="{ row }"><RouterLink :to="row.to">{{ row.id }}</RouterLink></template>
        <template #cell-title="{ row }">
          <RouterLink :to="row.to" class="title">{{ row.title }}</RouterLink>
          <VxChip v-if="row.synthetic" tone="accent" :title="row.synthetic === 'synthetic' ? 'Made of windows of other VODs' : 'Stands in for the VODs it was made of'">{{ row.synthetic }}</VxChip>
          <VxChip v-for="t in row.tags" :key="t">{{ t }}</VxChip>
          <VxChip v-if="row.hidden" tone="warn" title="Gone from the public site">hidden</VxChip>
          <VxChip v-if="row.merged" :title="`Merged into ${row.merged}`">merged</VxChip>
        </template>
      </VxTable>
      <div class="more">
        <VxButton v-if="next" :loading="loading" @click="more">More</VxButton>
        <span class="vx-muted vx-mono small">{{ vods.length }} shown</span>
      </div>
    </template>

    <VxDialog v-model:open="addOpen" title="Add a VOD from Twitch" width="460px">
      For a stream the monitor missed, while Twitch still has the VOD.
      <form class="form" @submit.prevent="!addBad && add('archive')">
        <VxField label="Twitch VOD id" help="The number in twitch.tv/videos/…">
          <template #default="{ id }"><VxInput :id="id" v-model="addId" mono placeholder="2375792832" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton :disabled="addBad" :loading="adding === 'create'" @click="add('create')">Details only</VxButton>
        <VxButton variant="primary" :disabled="addBad" :loading="adding === 'archive'" @click="add('archive')">Archive it</VxButton>
      </template>
    </VxDialog>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.search { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.search { align-items: center; }
.search > :first-child { flex: 1 1 260px; max-width: 480px; }
.sk { display: flex; flex-direction: column; gap: 6px; }
.title { margin-right: 6px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 16px; }
.small { font-size: 11px; }
.form { margin-top: 12px; color: var(--vx-text, inherit); }
</style>
