<script setup lang="ts">
// /manage/jobs?state=&kind=&subject=: the worker's job runs (/api/v2/jobs), refreshed every few seconds. Filters live
// in the URL; the old `?vodId=` and `state=done` links still work.
import type { JobKindOut } from '@vexoulz/platform-web'
import { JobsBrowser, type JobFilters } from '@vexoulz/platform-web/vue'
import { VxButton } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '../../admin/ManageShell.vue'
import StartJobDialog from '../../admin/StartJobDialog.vue'
import { platform, vodSubject } from '../../admin/platform'
import { site } from '../../site'

const route = useRoute()
const router = useRouter()

const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

function setQuery(patch: Record<string, string>) {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...patch }
  delete next.vodId
  for (const k of Object.keys(next)) if (!next[k] || (k === 'state' && next[k] === 'all')) delete next[k]
  router.replace({ query: next })
}

const filters = computed<JobFilters>({
  get: () => ({
    state: q('state') === 'done' ? 'succeeded' : q('state') || 'all',
    kind: q('kind'),
    subject: q('subject') || (q('vodId') ? vodSubject(q('vodId')) : ''),
  }),
  set: (f) => setQuery({ state: f.state, kind: f.kind, subject: f.subject }),
})
/** The VOD the subject filter names, for the Start dialog. */
const vodId = computed(() => (filters.value.subject.startsWith('vod:') ? filters.value.subject.slice(4) : ''))

const kinds = ref<JobKindOut[] | null>(null)

const starting = computed({
  get: () => route.query.new === '1',
  set: (v: boolean) => setQuery({ new: v ? '1' : '' }),
})
function started(id: number) {
  starting.value = false
  router.push(`/manage/jobs/${id}`)
}

onMounted(async () => {
  document.title = `Jobs · Manage · ${site.name}`
  try {
    kinds.value = await platform.jobKinds()
  } catch {
    kinds.value = []
  }
})
</script>

<template>
  <ManageShell title="Jobs">
    <template #actions>
      <VxButton variant="primary" @click="starting = true">Start a job</VxButton>
    </template>

    <JobsBrowser v-if="kinds" v-model:filters="filters" :client="platform" :kinds="kinds" subject-hint="vod:2345678901" />

    <StartJobDialog v-model:open="starting" :kinds="kinds ?? []" :vod-id="vodId" @started="started" />
  </ManageShell>
</template>
