<script setup lang="ts">
import { timeAgo, VxButton, VxCallout, VxChip, VxSkeleton, VxStatusDot, useToast } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JobsTable, usePoll } from '@vexoulz/platform-web/vue'
import { errorText } from '@vexoulz/platform-web'
import type { Health, StorageView } from '../../admin/api'
import { STUCK_QUERY, diskLine, quotaLine, stuckLine, stuckVods } from '../../admin/health'
import ManageShell from '../../admin/ManageShell.vue'
import TwitchViewerTile from '../../admin/TwitchViewerTile.vue'
import { platform } from '../../admin/platform'
import { admin } from '../../admin/session'
import { site } from '../../site'

const { data: health, error, loading, refresh } = usePoll((signal) => admin.health(signal), 15_000)
const toast = useToast()
// v2 runs, as the jobs page lists them: per state, and the latest failures.
const { data: jobCounts } = usePoll((signal) => platform.jobCounts({}, signal), 15_000)
const { data: failures } = usePoll((signal) => platform.jobs({ state: ['failed'], limit: 10 }, signal), 15_000)

/** Counts by state, each linked to the jobs page filtered to it. */
const COUNT_STATES = [
  { state: 'queued', tone: 'default' },
  { state: 'running', tone: 'accent' },
  { state: 'paused', tone: 'warn' },
  { state: 'succeeded', tone: 'ok' },
  { state: 'failed', tone: 'bad' },
  { state: 'cancelled', tone: 'default' },
] as const

// Uploads and storage: the VODs nothing is archiving, and the disk (the worker caches its walk, so once is enough).
const { data: stuck } = usePoll((signal) => stuckVods(signal), 60_000)
const storage = ref<StorageView | null>(null)
onMounted(async () => {
  document.title = `Overview · Manage · ${site.name}`
  try {
    storage.value = await admin.storage()
  } catch {
    storage.value = null // the tile says unknown; /manage/storage has the error
  }
})

type Dot = 'live' | 'ok' | 'warn' | 'off'
const DAY = 86_400_000
/** How long the YouTube token has left, or how old it is when Google gave no end. */
function tokenAge(yt: NonNullable<Health['youtube']>): { text: string; soon: boolean } | undefined {
  if (yt.refreshTokenExpiresAt) {
    const left = new Date(yt.refreshTokenExpiresAt).getTime() - Date.now()
    if (left <= 0) return { text: 'token ended, connect again', soon: true }
    const days = Math.ceil(left / DAY)
    return { text: `token ends in ${days} day${days === 1 ? '' : 's'}`, soon: left < 2 * DAY }
  }
  if (yt.connectedAt) {
    // In days, so a Testing project's 7-day limit is easy to read off.
    const days = Math.floor((Date.now() - new Date(yt.connectedAt).getTime()) / DAY)
    return { text: days < 1 ? `connected ${timeAgo(yt.connectedAt)}` : `connected ${days} day${days === 1 ? '' : 's'} ago`, soon: false }
  }
  return undefined
}
const tiles = computed(() => {
  const h = health.value
  if (!h) return []
  const yt = h.youtube
  return [
    {
      name: 'Worker',
      status: (h.worker.ok ? 'ok' : 'warn') as Dot,
      text: h.worker.ok ? `${h.worker.runningJobs} running` : 'Not healthy',
      sub: h.worker.startedAt ? `up since ${timeAgo(h.worker.startedAt)}` : '',
    },
    { name: 'Archive API', status: (h.api?.ok ? 'ok' : 'warn') as Dot, text: h.api?.ok ? 'Reachable' : 'Unreachable', sub: '' },
    {
      name: 'YouTube',
      status: (!yt ? 'off' : yt.authorized && yt.valid ? 'ok' : 'warn') as Dot,
      text: !yt ? 'Unknown' : !yt.authorized ? 'Not connected' : yt.valid ? 'Connected' : yt.channel === null ? 'No channel' : 'Token invalid',
      // The channel uploads go to, so a wrong account is caught before a job uploads there.
      link: yt?.channel ? { text: yt.channel.title, href: yt.channel.url } : undefined,
      age: yt?.authorized ? tokenAge(yt) : undefined,
      sub: yt?.error ?? (yt?.checkedAt ? `checked ${timeAgo(yt.checkedAt)}` : ''),
      action: !yt ? undefined : yt.authorized && yt.valid ? 'switch' : 'connect',
    },
    {
      name: 'Stream',
      status: (h.live?.live ? 'live' : 'off') as Dot,
      text: h.live?.live ? 'Live' : 'Offline',
      sub: h.live?.live && h.live.startedAt ? `started ${timeAgo(h.live.startedAt)}` : '',
    },
  ]
})

/** The YouTube quota spent today, the stuck VODs and the disk, each with where to look further. */
const uploadTiles = computed(() => {
  const quota = health.value?.youtube?.quota
  const disk = storage.value?.disk
  const out: { name: string; status: Dot; text: string; sub: string; to?: string; title?: string }[] = []
  if (quota) {
    const q = quotaLine(quota)
    const calls = Object.entries(quota.calls).map(([k, n]) => `${k} × ${n}`).join(', ')
    out.push({ name: 'YouTube quota', status: q.warn ? 'warn' : 'ok', text: q.text, sub: q.sub, title: calls || 'No calls today' })
  }
  if (stuck.value) {
    const s = stuckLine(stuck.value)
    out.push({ name: 'Stuck VODs', status: s.warn ? 'warn' : 'ok', text: s.text, sub: s.sub, to: s.warn ? `/manage/vods?upload=${STUCK_QUERY.upload}` : undefined })
  }
  if (disk) {
    const d = diskLine(disk)
    out.push({ name: 'Disk', status: d.warn ? 'warn' : 'ok', text: d.text, sub: d.sub, to: '/manage/storage' })
  }
  return out
})

const router = useRouter()
const backfilling = ref(false)
/** Bot chat for every VOD that has none yet. */
async function backfillBotChat() {
  backfilling.value = true
  try {
    const res = await admin.botChatBackfill()
    toast.show(res.msg, { duration: 3500 })
    if (res.jobId != null) void router.push(`/manage/jobs/${res.jobId}`)
  } catch (e) {
    toast.show(`Couldn't start the bot chat backfill: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    backfilling.value = false
  }
}

async function connectYoutube() {
  try {
    const { url } = await admin.youtubeAuthUrl()
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    toast.show(`Couldn't start the YouTube connection: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  }
}
</script>

<template>
  <ManageShell title="Overview">
    <template #actions>
      <VxButton :loading="loading" @click="refresh">Refresh</VxButton>
      <VxButton :loading="backfilling" title="Read doomtp-bot’s chat for every VOD that doesn’t have it yet" @click="backfillBotChat">Backfill bot chat</VxButton>
      <VxButton variant="primary" to="/manage/jobs?new=1">Start a job</VxButton>
    </template>

    <VxCallout v-if="error" tone="error" title="Couldn't load the archive's status">
      {{ error }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>

    <div v-if="!health && !error" class="tiles" aria-busy="true">
      <VxSkeleton v-for="i in 4" :key="i" h="84px" />
    </div>

    <template v-if="health">
      <div class="tiles">
        <div v-for="t in tiles" :key="t.name" class="tile vx-panel">
          <div class="vx-eyebrow">{{ t.name }}</div>
          <div class="tile-main"><VxStatusDot :status="t.status" />{{ t.text }}</div>
          <a v-if="t.link" class="tile-link small" :href="t.link.href" target="_blank" rel="noopener">{{ t.link.text }}</a>
          <div v-if="t.sub" class="vx-muted small">{{ t.sub }}</div>
          <div v-if="t.age" class="small" :class="t.age.soon ? 'tile-soon' : 'vx-muted'">{{ t.age.text }}</div>
          <VxButton v-if="t.action === 'connect'" @click="connectYoutube">Connect YouTube</VxButton>
          <VxButton v-else-if="t.action === 'switch'" size="sm" title="Connect a different Google account or channel" @click="connectYoutube">Switch account</VxButton>
        </div>
        <div v-for="t in uploadTiles" :key="t.name" class="tile vx-panel" :title="t.title">
          <div class="vx-eyebrow">{{ t.name }}</div>
          <div class="tile-main"><VxStatusDot :status="t.status" />{{ t.text }}</div>
          <div class="vx-muted small">{{ t.sub }}</div>
          <RouterLink v-if="t.to" class="tile-link small" :to="t.to">{{ t.name === 'Disk' ? 'Storage' : 'List them' }}</RouterLink>
        </div>
        <!-- A worker from before the ad-free account leaves twitchViewer out. -->
        <TwitchViewerTile v-if="health.twitchViewer !== undefined" :status="health.twitchViewer" @changed="refresh" />
      </div>

      <section>
        <h2 class="vx-eyebrow">Jobs</h2>
        <div class="counts">
          <RouterLink v-for="s in COUNT_STATES" :key="s.state" :to="`/manage/jobs?state=${s.state}`" class="count">
            <VxChip :tone="jobCounts?.counts[s.state] ? s.tone : 'default'" :k="s.state">{{ jobCounts?.counts[s.state] ?? '…' }}</VxChip>
          </RouterLink>
        </div>
      </section>

      <section>
        <h2 class="vx-eyebrow">Recent failures</h2>
        <JobsTable :jobs="failures?.items ?? []" empty="No failed jobs. 🎉" label="Recent failures" />
      </section>
    </template>
  </ManageShell>
</template>

<style scoped>
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 28px; }
.tile { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; align-items: flex-start; }
.tile-main { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.tile-link { color: var(--vx-accent); text-decoration: underline; text-underline-offset: 2px; }
.tile-link:hover { color: var(--vx-ink); }
.tile-soon { color: var(--vx-warn); }
.small { font-size: 12px; }
section { margin-bottom: 28px; }
h2 { margin: 0 0 10px; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; }
.count { text-decoration: none; }
</style>
