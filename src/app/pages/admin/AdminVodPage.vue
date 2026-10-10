<script setup lang="ts">
// /manage/vods/:id: fix one VOD by hand (visibility, details, chapters, games, YouTube and Drive lists, emotes) and
// run its jobs.
import { timeAgo, VxButton, VxCallout, VxChip, VxDialog, VxSkeleton, VxSwitch, useToast } from '@vexoulz/ui'
import { toClock } from '../../../index'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isSpliced, type AdminVod } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import ChaptersEditor from '../../admin/ChaptersEditor.vue'
import DetailsEditor from '../../admin/DetailsEditor.vue'
import DriveEditor from '../../admin/DriveEditor.vue'
import { vodSeconds } from '../../admin/edits'
import EmotesPanel from '../../admin/EmotesPanel.vue'
import GamesEditor from '../../admin/GamesEditor.vue'
import SplicePanel from '../../admin/SplicePanel.vue'
import { errorText, stamp } from '@vexoulz/platform-web'
import { JobsTable, usePoll } from '@vexoulz/platform-web/vue'
import { admin } from '../../admin/session'
import { platform, vodSubject } from '../../admin/platform'
import VodActions from '../../admin/VodActions.vue'
import YoutubeEditor from '../../admin/YoutubeEditor.vue'
import { site } from '../../site'

const props = defineProps<{ id: string }>()
const router = useRouter()
const toast = useToast()

const vod = ref<AdminVod | null>(null)
const loadError = ref<string | null>(null)
const notFound = ref(false)

async function load() {
  loadError.value = null
  notFound.value = false
  try {
    vod.value = await admin.vod(props.id)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 404) notFound.value = true
    else loadError.value = errorText(e)
  }
}
watch(() => props.id, load, { immediate: true })

// The VOD's jobs refresh on their own; the VOD itself only reloads after an edit, so open forms keep their drafts.
const { data: jobPage, refresh: refreshJobs } = usePoll((signal) => platform.jobs({ subject: vodSubject(props.id), limit: 20 }, signal), 5_000)
const jobs = computed(() => jobPage.value?.items ?? [])
const activeJobs = computed(() => jobs.value.filter((j) => j.state === 'running' || j.state === 'queued' || j.state === 'paused').length)

/** The spans doomtp-bot wasn't listening, as text. */
const botGaps = computed(() =>
  (vod.value?.botChat?.coverage?.gaps ?? []).map(
    (g) => `${stamp(new Date(g.from).toISOString())} → ${stamp(new Date(g.to).toISOString())}${g.reason ? ` (${g.reason})` : ''}`,
  ),
)
const duration = computed(() => (vod.value ? vodSeconds(vod.value) : 0))

// Visibility: hiding asks first, since the VOD's links stop working; showing it again doesn't.
const hideOpen = ref(false)
const hiding = ref(false)
function toggleHidden(show: boolean) {
  if (!show) hideOpen.value = true
  else void setHidden(false)
}
async function setHidden(hidden: boolean) {
  if (!vod.value) return
  hiding.value = true
  try {
    vod.value = await admin.updateVod(vod.value.id, { hidden })
    hideOpen.value = false
    toast.show(hidden ? 'Hidden from the site' : 'Public again', { duration: 3000 })
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    hiding.value = false
  }
}

function saved(v: AdminVod) {
  vod.value = v
}
function jobStarted() {
  refreshJobs()
}
function deleted() {
  router.replace('/manage/vods')
}

watch(vod, (v) => (document.title = `${v?.title ?? props.id} · Manage · ${site.name}`))
onMounted(() => (document.title = `VOD ${props.id} · Manage · ${site.name}`))
</script>

<template>
  <ManageShell :title="`VOD ${id}`">
    <template #actions>
      <VxButton :to="`/vods/${id}`">Watch page</VxButton>
      <VxButton :to="`/manage/jobs?subject=${encodeURIComponent(vodSubject(id))}`">All its jobs</VxButton>
    </template>
    <p class="back"><RouterLink to="/manage/vods">← VODs</RouterLink></p>

    <VxCallout v-if="notFound" tone="warn" title="No such VOD">The archive has no VOD {{ id }}.</VxCallout>
    <VxCallout v-else-if="loadError" tone="error" title="Couldn't load this VOD">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!vod" class="sk" aria-busy="true"><VxSkeleton h="90px" /><VxSkeleton h="200px" /></div>

    <template v-else>
      <VxCallout v-if="vod.hidden" tone="warn" title="Hidden">
        This VOD is gone from the public site: the list, its watch page, the games pages and its chat. It's still here.
      </VxCallout>

      <VxCallout v-if="vod.synthetic" tone="info" title="A synthetic VOD">
        It's made of windows of other VODs{{ vod.synthetic.supersedes ? ', and stands in for them' : '' }}. Its segments,
        title and tags are edited on its own page; here it can be hidden and its jobs run.
        <template #actions><VxButton size="sm" :to="`/manage/synthetic/${encodeURIComponent(id)}`">Edit its segments</VxButton></template>
      </VxCallout>

      <section class="panel vx-panel">
        <h2 class="title">{{ vod.title ?? 'Untitled' }}</h2>
        <div class="visibility">
          <VxSwitch id="vod-public" :model-value="!vod.hidden" :disabled="hiding" @update:model-value="toggleHidden" />
          <label for="vod-public">
            <strong>{{ vod.hidden ? 'Hidden' : 'Public' }}</strong>
            <span class="vx-muted"> · {{ vod.hidden ? 'only Manage shows it' : 'on the site for everyone' }}</span>
          </label>
        </div>
        <dl class="facts">
          <div><dt>Id</dt><dd class="vx-mono">{{ vod.id }}</dd></div>
          <div><dt>Streamed</dt><dd :title="stamp(vod.createdAt)">{{ new Date(vod.createdAt).toLocaleString() }}</dd></div>
          <div><dt>Duration</dt><dd class="vx-mono">{{ toClock(duration) }}</dd></div>
          <div v-if="vod.merged_into"><dt>Merged into</dt><dd class="vx-mono"><RouterLink :to="`/manage/vods/${vod.merged_into.id}`">{{ vod.merged_into.id }}</RouterLink> at {{ toClock(vod.merged_into.offset) }}</dd></div>
          <div v-if="vod.stream_id"><dt>Stream</dt><dd class="vx-mono">{{ vod.stream_id }}</dd></div>
          <div><dt>Parts</dt><dd>{{ vod.youtube?.length ?? 0 }} YouTube · {{ vod.drive?.length ?? 0 }} Drive</dd></div>
          <div><dt>Chapters</dt><dd>{{ vod.chapters?.length ?? 0 }} <VxChip v-if="vod.chaptersLocked" tone="warn">locked</VxChip></dd></div>
          <div>
            <dt>Bot chat</dt>
            <dd v-if="vod.botChat" :title="`read ${stamp(vod.botChat.fetched_at)}`">
              {{ vod.botChat.rows ?? '?' }} messages · read {{ timeAgo(vod.botChat.fetched_at) }}
              <VxChip :tone="vod.botChat.keyed ? 'ok' : 'default'" :title="vod.botChat.keyed ? 'Read with a key: removals and their reasons are in' : 'Public read: no removals'">{{ vod.botChat.keyed ? 'keyed' : 'public' }}</VxChip>
              <VxChip v-if="botGaps.length" tone="warn" :title="botGaps.join('\n')">{{ botGaps.length }} {{ botGaps.length === 1 ? 'gap' : 'gaps' }}</VxChip>
            </dd>
            <dd v-else class="vx-muted">not read</dd>
          </div>
        </dl>
      </section>

      <!-- A synthetic VOD's details and segments are edited on its own page (the worker refuses them here). -->
      <section v-if="!vod.synthetic" class="panel vx-panel">
        <h2 class="vx-eyebrow">Details</h2>
        <DetailsEditor :vod="vod" @saved="saved" />
      </section>

      <section class="panel vx-panel">
        <h2 class="vx-eyebrow">Actions</h2>
        <VodActions :vod="vod" @job="jobStarted" @changed="load" @deleted="deleted" />
      </section>

      <section v-if="!vod.synthetic" class="panel vx-panel">
        <h2 class="vx-eyebrow">Merge and split</h2>
        <SplicePanel :vod="vod" @changed="load" @job="jobStarted" />
      </section>

      <section class="panel vx-panel">
        <h2 class="vx-eyebrow">Jobs <span v-if="activeJobs" class="vx-muted">· {{ activeJobs }} active</span></h2>
        <JobsTable :jobs="jobs" empty="No jobs for this VOD." label="This VOD's jobs" />
      </section>

      <!-- A VOD merged into another, or a synthetic one, has no chapters, uploads or emotes of its own to edit. -->
      <template v-if="!vod.merged_into && !vod.synthetic">
        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Chapters</h2>
          <ChaptersEditor :vod="vod" :duration="duration" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Games</h2>
          <GamesEditor :vod="vod" :duration="duration" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">YouTube parts</h2>
          <YoutubeEditor :vod="vod" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Drive files</h2>
          <DriveEditor :vod="vod" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Emotes</h2>
          <EmotesPanel :vod-id="vod.id" :spliced="isSpliced(vod)" @job="jobStarted" />
        </section>
      </template>

      <VxDialog v-model:open="hideOpen" title="Hide this VOD?" width="460px">
        It leaves the public site at once: the VOD list, the games pages and the chat. Links to its watch page stop
        working (they show "not found") until it's made public again. Nothing is deleted.
        <template #actions="{ close }">
          <VxButton @click="close">Cancel</VxButton>
          <VxButton variant="danger" :loading="hiding" @click="setHidden(true)">Hide it</VxButton>
        </template>
      </VxDialog>
    </template>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.panel { padding: 14px 16px; margin-bottom: 16px; }
h2 { margin: 0 0 12px; }
.title { margin: 0 0 8px; font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
.visibility { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 13px; }
.visibility label { cursor: pointer; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 16px; margin: 0; }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 2px; }
dd { margin: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
</style>
