<script setup lang="ts">
// /manage/storage: what the worker keeps on disk (GET /admin/storage), one row per folder under vods/ and live/, with
// the jobs that use it. Stale folders (no job needs them) can be deleted; the worker refuses while a job is active.
import {
  timeAgo, VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxProgress, VxSegmented, VxSkeleton, VxTable, useToast,
  type Option, type TableColumn,
} from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import type { StorageFolder, StorageView } from '../../admin/api'
import { bytes } from '@vexoulz/platform-web'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import { errorMessage } from '../../lib/errors'
import { site } from '../../site'

const toast = useToast()

type Area = 'all' | 'vods' | 'live'
const AREAS: Option<Area>[] = [
  { value: 'all', label: 'All' },
  { value: 'vods', label: 'vods/' },
  { value: 'live', label: 'live/' },
]

const view = ref<StorageView | null>(null)
const loadError = ref<string | null>(null)
const loading = ref(false)
const area = ref<Area>('all')
const staleOnly = ref(false)

async function load(refresh = false) {
  loading.value = true
  loadError.value = null
  try {
    view.value = await admin.storage(refresh)
  } catch (e) {
    loadError.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

const disk = computed(() => view.value?.disk ?? null)
const folders = computed(() =>
  (view.value?.folders ?? []).filter((f) => (area.value === 'all' || f.area === area.value) && (!staleOnly.value || f.stale)),
)
const staleBytes = computed(() => (view.value?.folders ?? []).filter((f) => f.stale).reduce((n, f) => n + f.bytes, 0))
const staleCount = computed(() => (view.value?.folders ?? []).filter((f) => f.stale).length)

const columns: TableColumn[] = [
  { key: 'name', label: 'Folder', sortable: true },
  { key: 'vod', label: 'VOD' },
  { key: 'bytes', label: 'Size', sortable: true, align: 'right', mono: true },
  { key: 'files', label: 'Files', sortable: true, align: 'right', mono: true, muted: true },
  { key: 'modified', label: 'Last change', sortable: true },
  { key: 'jobs', label: 'Jobs' },
  { key: 'actions', label: '', align: 'right' },
]
const rows = computed(() =>
  folders.value.map((f) => ({
    key: `${f.area}/${f.name}`,
    name: `${f.area}/${f.name}`,
    vod: f.vod?.title ?? '',
    bytes: f.bytes,
    files: f.files,
    modified: f.modifiedAt ?? '',
    jobs: f.jobs.active.length,
    actions: '',
    folder: f,
  })),
)

// Delete: asks first; refused (and disabled) while a job uses the folder.
const target = ref<StorageFolder | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
function ask(f: StorageFolder) {
  target.value = f
  deleteError.value = null
}
async function remove() {
  const f = target.value
  if (!f) return
  deleting.value = true
  deleteError.value = null
  try {
    const r = await admin.deleteFolder(f.area, f.name)
    target.value = null
    toast.show(`Deleted ${r.path}: ${bytes(r.bytes)} freed (${r.files} files)`, { duration: 5000 })
    await load(true)
  } catch (e) {
    deleteError.value = errorMessage(e)
  } finally {
    deleting.value = false
  }
}
const dialogOpen = computed({
  get: () => !!target.value,
  set: (v) => { if (!v) target.value = null },
})

onMounted(() => {
  document.title = `Storage · Manage · ${site.name}`
  void load()
})
</script>

<template>
  <ManageShell title="Storage">
    <VxCallout v-if="loadError" tone="error" title="Couldn't read the storage">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="load()">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!view" class="sk" aria-busy="true"><VxSkeleton h="70px" /><VxSkeleton h="300px" /></div>

    <template v-else>
      <section class="disk vx-panel">
        <div class="disk-head">
          <h2 class="vx-eyebrow">Disk</h2>
          <span class="spacer" />
          <span class="vx-muted small">Sizes are cached for {{ view.cacheSeconds }} s</span>
          <VxButton size="sm" :loading="loading" @click="load(true)">Refresh</VxButton>
        </div>
        <template v-if="disk">
          <VxProgress :value="disk.used" :max="disk.total" :label="`${bytes(disk.used)} of ${bytes(disk.total)} used`" />
          <p class="facts vx-mono small">
            <span>{{ bytes(disk.used) }} used</span>
            <span>{{ bytes(disk.free) }} free</span>
            <span>{{ bytes(disk.total) }} total</span>
            <span v-if="staleCount" class="stale-sum">{{ bytes(staleBytes) }} in {{ staleCount }} stale {{ staleCount === 1 ? 'folder' : 'folders' }}</span>
          </p>
        </template>
        <p v-else class="vx-muted small">The worker couldn't read the disk's size.</p>
      </section>

      <div class="filters">
        <VxSegmented v-model="area" :options="AREAS" label="Area" />
        <VxCheckbox v-model="staleOnly">Stale only</VxCheckbox>
        <span class="vx-muted small">{{ folders.length }} {{ folders.length === 1 ? 'folder' : 'folders' }}</span>
      </div>

      <div class="table">
        <VxTable
          :columns="columns"
          :rows="rows"
          row-key="key"
          label="Folders"
          :empty="staleOnly ? 'No stale folders.' : 'No folders.'"
        >
          <template #cell-name="{ row }">
            <span class="vx-mono folder">{{ row.name }}</span>
            <VxChip v-if="row.folder.stale" tone="warn" title="No job needs it: not linked to a VOD, or its last job failed or was cancelled">stale</VxChip>
          </template>
          <template #cell-vod="{ row }">
            <RouterLink v-if="row.folder.vod" :to="`/manage/vods/${row.folder.vod.id}`" class="vod">{{ row.folder.vod.title ?? row.folder.vod.id }}</RouterLink>
            <VxChip v-if="row.folder.vod?.hidden" tone="warn">hidden</VxChip>
            <span v-if="!row.folder.vod" class="vx-muted">—</span>
          </template>
          <template #cell-bytes="{ row }">{{ bytes(row.bytes) }}</template>
          <template #cell-modified="{ row }">
            <span v-if="row.modified" :title="row.modified">{{ timeAgo(row.modified) }}</span>
            <span v-else class="vx-muted">—</span>
          </template>
          <template #cell-jobs="{ row }">
            <RouterLink v-for="j in row.folder.jobs.active" :key="j.id" :to="`/manage/jobs/${j.id}`" class="job">
              <VxChip tone="accent" :title="`${j.kind}${j.step ? ` · ${j.step}` : ''}`">#{{ j.id }} {{ j.state }}</VxChip>
            </RouterLink>
            <RouterLink v-if="!row.folder.jobs.active.length && row.folder.jobs.last" :to="`/manage/jobs/${row.folder.jobs.last.id}`" class="job">
              <VxChip :tone="row.folder.jobs.last.state === 'failed' ? 'bad' : 'default'" :title="`Last: ${row.folder.jobs.last.kind}`">#{{ row.folder.jobs.last.id }} {{ row.folder.jobs.last.state }}</VxChip>
            </RouterLink>
            <span v-if="!row.folder.jobs.active.length && !row.folder.jobs.last" class="vx-muted">none</span>
          </template>
          <template #cell-actions="{ row }">
            <VxButton
              size="sm"
              variant="danger"
              :disabled="row.folder.jobs.active.length > 0"
              :title="row.folder.jobs.active.length ? 'A job is using it' : undefined"
              @click="ask(row.folder)"
            >Delete files</VxButton>
          </template>
        </VxTable>
      </div>

      <VxDialog v-model:open="dialogOpen" title="Delete these files?" width="460px">
        <template v-if="target">
          <p>
            <span class="vx-mono">{{ target.area }}/{{ target.name }}</span>: {{ bytes(target.bytes) }} in {{ target.files }}
            {{ target.files === 1 ? 'file' : 'files' }}. They're gone for good; nothing on YouTube or Drive is touched.
          </p>
          <p v-if="target.vod" class="vx-muted">
            It belongs to “{{ target.vod.title ?? target.vod.id }}”. A job for that VOD would have to download again.
          </p>
          <p v-if="!target.stale" class="warn">This folder isn't stale.</p>
          <VxCallout v-if="deleteError" tone="error" title="Nothing was deleted">{{ deleteError }}</VxCallout>
        </template>
        <template #actions="{ close }">
          <VxButton @click="close">Cancel</VxButton>
          <VxButton variant="danger-solid" :loading="deleting" @click="remove">Delete files</VxButton>
        </template>
      </VxDialog>
    </template>
  </ManageShell>
</template>

<style scoped>
.sk { display: flex; flex-direction: column; gap: 12px; }
.disk { padding: 14px 16px; margin-bottom: 16px; }
.disk-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
h2 { margin: 0; }
.spacer { flex: 1; }
.small { font-size: 12px; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 0; }
.stale-sum { color: var(--vx-warn, var(--vx-accent)); }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-bottom: 10px; }
.table { overflow-x: auto; }
.folder { margin-right: 6px; white-space: nowrap; }
.vod { overflow-wrap: anywhere; margin-right: 6px; }
.job { text-decoration: none; margin-right: 4px; }
.warn { color: var(--vx-warn, var(--vx-accent)); }
</style>
