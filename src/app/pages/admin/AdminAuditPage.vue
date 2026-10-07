<script setup lang="ts">
// /manage/audit?action=&target=&actor=&actor_kind=&outcome=: the worker's audit log (GET /api/v2/audit), newest
// first: every change made through the admin API (dashboard or API key), what the worker's own jobs did, and refused
// or failed requests. Filters live in the URL.
import { AuditBrowser, type AuditFilters } from '@vexoulz/platform-web/vue'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '../../admin/ManageShell.vue'
import { platform } from '../../admin/platform'
import { site } from '../../site'

const KEYS = ['action', 'target', 'actor', 'actor_kind', 'outcome'] as const
const route = useRoute()
const router = useRouter()
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

const filters = computed<AuditFilters>({
  get: () => ({ action: q('action'), target: q('target'), actor: q('actor'), actor_kind: q('actor_kind'), outcome: q('outcome'), scope: '' }),
  set: (f) => {
    const query: Record<string, string> = {}
    for (const k of KEYS) if (f[k].trim()) query[k] = f[k].trim()
    router.replace({ query })
  },
})

onMounted(() => (document.title = `Audit log · Manage · ${site.name}`))
</script>

<template>
  <ManageShell title="Audit log">
    <AuditBrowser v-model:filters="filters" :client="platform" hide-scope :poll="30_000" action-hint="vod. or job.enqueue" target-hint="vod: or vod:2345678901" />
  </ManageShell>
</template>
