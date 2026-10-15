<script setup lang="ts">
import { timeAgo, VxButton, VxCallout, VxChip, VxSkeleton, VxStatusDot, useToast } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JobsTable, usePoll } from '@vexoulz/platform-web/vue'
import { errorText } from '@vexoulz/platform-web'
import type { Health, StorageView } from '../../admin/api'
import {
  RECENT_PROBLEM_DAYS,
  STUCK_QUERY,
  diskLine,
  doomtpLine,
  quotaLine,
  splitProblems,
  stuckLine,
  stuckVods,
  youtubeCheckLine,
  youtubeCheckMessage,
} from '../../admin/health'
import ManageShell from '../../admin/ManageShell.vue'
import TwitchViewerTile from '../../admin/TwitchViewerTile.vue'
import YoutubeProblems from '../../admin/YoutubeProblems.vue'
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
// Whether the uploads are still on YouTube and whole: the worker's last check (an older worker has none: no tile).
const { data: ytCheck, refresh: refreshYtCheck } = usePoll((signal) => admin.youtubeVideos(signal), 60_000)
// The last two weeks' VODs here; the older problems (some never fixable) are on /manage/youtube.
const problems = computed(() => splitProblems(ytCheck.value?.last))
const checking = ref(false)
async function checkYoutube() {
  checking.value = true
  try {
    const res = await admin.checkYoutubeVideos()
    ytCheck.value = res
    if (res.last) toast.show(youtubeCheckMessage(res.last), { duration: 4000 })
  } catch (e) {
    toast.show(`Couldn't check the uploads on YouTube: ${errorText(e)}`, { kind: 'error', duration: 6000 })
    void refreshYtCheck()
  } finally {
    checking.value = false
  }
}
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
  const bot = h.doomtp ? doomtpLine(h.doomtp, timeAgo) : null
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
    // doomtp-bot, where bot chat comes from; a worker from before it leaves `doomtp` out.
    ...(bot ? [{ name: 'DTP bot', status: bot.status as Dot, text: bot.text, sub: bot.sub }] : []),
  ]
})

/** The YouTube quota spent today, the stuck VODs and the disk, each with where to look further. */
const uploadTiles = computed(() => {
  const quota = health.value?.youtube?.quota
  const disk = storage.value?.disk
  const out: { name: string; status: Dot; text: string; sub: string; to?: string; toText?: string; title?: string }[] = []
  if (quota) {
    const q = quotaLine(quota)
    const calls = Object.entries(quota.calls).map(([k, n]) => `${k} × ${n}`).join(', ')
    out.push({ name: 'YouTube quota', status: q.warn ? 'warn' : 'ok', text: q.text, sub: q.sub, title: calls || 'No calls today' })
  }
  if (ytCheck.value) {
    const y = youtubeCheckLine(ytCheck.value)
    const at = ytCheck.value.last?.checkedAt
    out.push({ name: 'On YouTube', status: y.warn ? 'warn' : ytCheck.value.last ? 'ok' : 'off', text: y.text, sub: at ? `${y.sub} · checked ${timeAgo(at)}` : y.sub, to: problems.value.recent.length ? '#youtube-uploads' : problems.value.older.length ? '/manage/youtube' : undefined, toText: 'See them' })
  }
  if (stuck.value) {
    const s = stuckLine(stuck.value)
    out.push({ name: 'Stuck VODs', status: s.warn ? 'warn' : 'ok', text: s.text, sub: s.sub, to: s.warn ? `/manage/vods?upload=${STUCK_QUERY.upload}` : undefined, toText: 'List them' })
  }
  if (disk) {
    const d = diskLine(disk)
    out.push({ name: 'Disk', status: d.warn ? 'warn' : 'ok', text: d.text, sub: d.sub, to: '/manage/storage', toText: 'Storage' })
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
          <a v-if="t.to?.startsWith('#')" class="tile-link small" :href="t.to">{{ t.toText }}</a>
          <RouterLink v-else-if="t.to" class="tile-link small" :to="t.to">{{ t.toText }}</RouterLink>
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

      <section v-if="ytCheck" id="youtube-uploads">
        <div class="section-head">
          <h2 class="vx-eyebrow">YouTube uploads</h2>
          <VxButton size="sm" :loading="checking || ytCheck.running" title="Look up every upload on YouTube now (1 API unit per 50 videos)" @click="checkYoutube">Check now</VxButton>
        </div>
        <p v-if="!ytCheck.last" class="vx-muted small">Not checked yet.</p>
        <p v-else-if="!problems.recent.length && !problems.older.length" class="vx-muted small">
          Every upload of {{ ytCheck.last.vods }} VODs is on YouTube and whole (checked {{ timeAgo(ytCheck.last.checkedAt) }}).
        </p>
        <template v-else>
          <p v-if="!problems.recent.length" class="vx-muted small">No problems with VODs from the last {{ RECENT_PROBLEM_DAYS }} days.</p>
          <YoutubeProblems v-else :problems="problems.recent" />
          <p v-if="problems.older.length" class="vx-muted small older">
            {{ problems.older.length }} older VOD{{ problems.older.length === 1 ? '' : 's' }} with problems.
            <RouterLink class="tile-link" to="/manage/youtube">See them all</RouterLink>
          </p>
        </template>
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
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.section-head h2 { margin: 0; }
.older { margin: 10px 0 0; }
</style>
