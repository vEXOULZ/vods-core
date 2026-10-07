<script setup lang="ts">
// Merge and split for one VOD. Merge: when a stream dropped and Twitch made two VODs of one broadcast, the later one
// is appended to this one, the time between becoming a "Technical difficulties" gap chapter. Split: from a point
// between two parts on becomes a new VOD. Both move chat with the video and can be undone (latest first).
import { VxButton, VxCallout, VxChip, VxDialog, VxField, VxInput, VxSkeleton, useToast } from '@vexoulz/ui'
import { normalizeVod, Timeline, toClock, toSeconds } from '../../index'
import { computed, ref, watch } from 'vue'
import { AdminApiError, type AdminVod, type MergeCandidate, type MergeCandidates, type Splice, type SpliceResult, type SplitPoint } from './api'
import { stamp } from '@vexoulz/platform-web'
import { admin } from './session'
import { errorMessage } from '../lib/errors'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ changed: []; job: [jobId: number] }>()
const toast = useToast()

const mergedInto = computed(() => props.vod.merged_into ?? null)
const splices = computed(() => [...(props.vod.splices ?? [])].reverse())

/** "4m 12s", "1h 02m", "40s". */
function span(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

// ---- after a merge or split: the YouTube descriptions still list the old parts ----
const touched = ref<string[]>([])
/** A merge's warnings (the other upload type plays a few seconds off), kept until dismissed. */
const warnings = ref<string[]>([])
const describing = ref(false)
const uploadTypes = computed(() => [...new Set((props.vod.youtube ?? []).map((u) => u.type))])
async function describe() {
  describing.value = true
  try {
    for (const id of touched.value)
      for (const type of uploadTypes.value.length ? uploadTypes.value : (['vod'] as const)) {
        const res = await admin.updateDescriptions(id, type)
        if (res.jobId != null) emit('job', res.jobId)
      }
    toast.show(`Updating the descriptions of ${touched.value.join(' and ')}`, { duration: 3500 })
    touched.value = []
  } catch (e) {
    toast.show(errorMessage(e), { kind: 'error', duration: 6000 })
  } finally {
    describing.value = false
  }
}

const busy = ref<string | null>(null)
/** An undo refused over edits made since; confirming retries it with force. */
const forceAsk = ref<{ edited: string[]; retry: () => Promise<SpliceResult> } | null>(null)

async function run(name: string, action: (force: boolean) => Promise<SpliceResult>, ids: (res: SpliceResult) => string[], force = false) {
  busy.value = name
  try {
    const res = await action(force)
    toast.show(res.msg, { duration: 4000 })
    warnings.value = res.warnings ?? []
    touched.value = [...new Set(ids(res))]
    splitErr.value = null
    emit('changed')
    loadCandidates()
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 409 && e.edited.length && !force) {
      forceAsk.value = { edited: e.edited, retry: () => action(true) }
      return
    }
    if (e instanceof AdminApiError && name === 'split' && e.validPoints.length) {
      splitErr.value = { msg: e.message, points: e.validPoints }
      return
    }
    toast.show(errorMessage(e), { kind: 'error', duration: 8000 })
  } finally {
    busy.value = null
  }
}
function forceUndo() {
  const ask = forceAsk.value
  forceAsk.value = null
  if (ask) run('force', () => ask.retry(), (r) => [r.splice.vodId, r.splice.otherId], true)
}

// ---- merge ----
const cands = ref<MergeCandidates | null>(null)
const candsError = ref<string | null>(null)
async function loadCandidates() {
  if (mergedInto.value) return
  candsError.value = null
  try {
    cands.value = await admin.mergeCandidates(props.vod.id)
  } catch (e) {
    candsError.value = errorMessage(e)
  }
}
watch(() => props.vod.id, () => ((cands.value = null), loadCandidates()), { immediate: true })

const mergeOf = ref<MergeCandidate | null>(null)
const gapDraft = ref('')
const gapBad = computed(() => gapDraft.value.trim() !== '' && !(Number.isFinite(toSeconds(gapDraft.value)) && toSeconds(gapDraft.value) >= 0))
function askMerge(c: MergeCandidate) {
  mergeOf.value = c
  gapDraft.value = c.overlaps ? '0' : ''
}
function merge() {
  const c = mergeOf.value
  if (!c) return
  mergeOf.value = null
  const gap = gapDraft.value.trim() ? toSeconds(gapDraft.value) : undefined
  run(`merge-${c.id}`, () => admin.merge(props.vod.id, c.id, gap), (r) => [r.splice.vodId])
}

// ---- split ----
const timeline = computed(() => {
  try {
    return new Timeline(normalizeVod(props.vod))
  } catch {
    return null
  }
})
/** Where one part ends and the next starts: the places a split works without cutting an upload. */
const joins = computed(() => {
  const spans = timeline.value?.partSpans() ?? []
  return spans.slice(0, -1).map((s, i) => ({ at: Math.round(s.end), label: `after P${i + 1}` }))
})
const duration = computed(() => props.vod.duration_seconds ?? toSeconds(props.vod.duration ?? ''))
const atDraft = ref('')
const at = computed(() => (atDraft.value.trim() ? toSeconds(atDraft.value) : NaN))
const atBad = computed(() => atDraft.value.trim() !== '' && !(Number.isFinite(at.value) && at.value > 0 && at.value < duration.value))
const splitErr = ref<{ msg: string; points: SplitPoint[] } | null>(null)
const splitOpen = ref(false)
watch(atDraft, () => (splitErr.value = null))
function split() {
  splitOpen.value = false
  const t = at.value
  run('split', () => admin.split(props.vod.id, t), (r) => (r.newVodId ? [r.splice.vodId, r.newVodId] : [r.splice.vodId]))
}
const inGap = computed(() => timeline.value?.chapters.some((c) => c.kind === 'gap' && at.value >= c.start && at.value <= c.end) ?? false)

// ---- history ----
function describeSplice(sp: Splice): string {
  if (sp.kind === 'merge') {
    const down = sp.gap == null ? '' : sp.gap < 0 ? ` (overlapped ${span(sp.gap)})` : ` (down ${span(sp.gap)})`
    return `${sp.otherId} merged into ${sp.vodId} at ${toClock(sp.offset)}${down}`
  }
  return `${sp.vodId} split at ${toClock(sp.offset)}; the rest became ${sp.otherId}`
}
function undo(sp: Splice) {
  run(
    `undo-${sp.id}`,
    (force) => (sp.kind === 'merge' ? admin.unmerge(sp.vodId, sp.otherId, force) : admin.unsplit(sp.vodId, sp.otherId, force)),
    () => [sp.vodId, sp.otherId].filter((id) => id !== sp.otherId || sp.kind === 'merge'),
  )
}
function unmergeHere() {
  const m = mergedInto.value
  if (m) run('unmerge', (force) => admin.unmerge(m.id, props.vod.id, force), () => [m.id, props.vod.id])
}
</script>

<template>
  <div class="splices">
    <VxCallout v-if="touched.length" tone="warn" title="Update the YouTube descriptions">
      The descriptions of {{ touched.join(' and ') }} still list the parts as they were.
      <template #actions>
        <VxButton size="sm" variant="primary" :loading="describing" @click="describe">Update descriptions</VxButton>
        <VxButton v-for="id in touched.filter((x) => x !== vod.id)" :key="id" size="sm" :to="`/manage/vods/${id}`">Open {{ id }}</VxButton>
        <VxButton size="sm" @click="touched = []">Later</VxButton>
      </template>
    </VxCallout>

    <VxCallout v-if="warnings.length" tone="warn" title="Merged, with a warning">
      <p v-for="(w, i) in warnings" :key="i" class="warning">{{ w }}</p>
      <template #actions><VxButton size="sm" @click="warnings = []">OK</VxButton></template>
    </VxCallout>

    <VxCallout v-if="mergedInto" tone="info" title="Merged into another VOD">
      Its video, chapters and chat are part of <RouterLink :to="`/manage/vods/${mergedInto.id}`" class="vx-mono">{{ mergedInto.id }}</RouterLink>
      now, from {{ toClock(mergedInto.offset) }}. Old links to this VOD open that one at the same moment.
      <template #actions>
        <VxButton size="sm" :to="`/manage/vods/${mergedInto.id}`">Open {{ mergedInto.id }}</VxButton>
        <VxButton size="sm" :loading="busy === 'unmerge'" @click="unmergeHere">Unmerge</VxButton>
      </template>
    </VxCallout>

    <template v-else>
      <div class="group">
        <div class="vx-eyebrow">Merge the next VOD into this one</div>
        <p class="vx-muted note">
          For a stream that dropped and came back as a second Twitch VOD. The time between becomes a “Technical
          difficulties” chapter; nothing is downloaded or uploaded again.
        </p>
        <VxCallout v-if="candsError" tone="error">
          {{ candsError }}
          <template #actions><VxButton size="sm" @click="loadCandidates">Try again</VxButton></template>
        </VxCallout>
        <VxSkeleton v-else-if="!cands" h="40px" />
        <p v-else-if="!cands.candidates.length" class="vx-muted note">
          No VOD started within {{ cands.withinMinutes }} minutes of this one's end ({{ stamp(cands.vod.endsAt) }}).
        </p>
        <ul v-else class="list">
          <li v-for="c in cands.candidates" :key="c.id" class="row">
            <div class="what">
              <RouterLink :to="`/manage/vods/${c.id}`" class="vx-mono">{{ c.id }}</RouterLink>
              <span class="title">{{ c.title || 'Untitled' }}</span>
              <span class="vx-muted small" :title="stamp(c.createdAt)">{{ new Date(c.createdAt).toLocaleString() }} · {{ c.duration }}</span>
            </div>
            <div class="chips">
              <VxChip v-if="c.overlaps" tone="bad" title="It started before this one ended">overlaps {{ span(c.gap) }}</VxChip>
              <VxChip v-else k="down">{{ span(c.gap) }}</VxChip>
              <VxChip v-if="c.titlesMatch" tone="ok">same title</VxChip>
              <VxChip v-else tone="warn">other title</VxChip>
            </div>
            <VxButton size="sm" :loading="busy === `merge-${c.id}`" @click="askMerge(c)">Merge…</VxButton>
          </li>
        </ul>
      </div>

      <div class="group">
        <div class="vx-eyebrow">Split</div>
        <p class="vx-muted note">
          From that point on becomes a new VOD ({{ vod.id }}-2), with its parts, chapters and chat. It has to be where
          one part ends and the next starts; inside a merge's gap chapter it undoes that merge instead.
        </p>
        <form class="split" @submit.prevent="!atBad && atDraft.trim() && (splitOpen = true)">
          <VxInput v-model="atDraft" mono placeholder="H:MM:SS" aria-label="Split at" :invalid="atBad" class="at" />
          <VxButton type="submit" :disabled="atBad || !atDraft.trim()" :loading="busy === 'split'">Split here…</VxButton>
          <template v-if="joins.length">
            <span class="vx-muted small">Part ends:</span>
            <VxChip v-for="j in joins" :key="j.at" clickable :active="at === j.at" :title="j.label" @click="atDraft = toClock(j.at)">{{ toClock(j.at) }}</VxChip>
          </template>
        </form>
        <VxCallout v-if="splitErr" tone="warn" title="Not there">
          {{ splitErr.msg }}
          <div class="points">
            <VxChip v-for="p in splitErr.points" :key="p.at" clickable :title="p.from !== p.to ? `anywhere from ${toClock(p.from)} to ${toClock(p.to)}` : undefined" @click="atDraft = toClock(p.at)">
              {{ toClock(p.at) }}<template v-if="p.from !== p.to"> ({{ toClock(p.from) }}–{{ toClock(p.to) }})</template>
            </VxChip>
          </div>
        </VxCallout>
      </div>
    </template>

    <div v-if="splices.length" class="group">
      <div class="vx-eyebrow">History</div>
      <ul class="list">
        <li v-for="sp in splices" :key="sp.id" class="row" :class="{ undone: sp.undoneAt }">
          <div class="what">
            <span>{{ describeSplice(sp) }}</span>
            <span class="vx-muted small">
              {{ stamp(sp.createdAt) }}<template v-if="sp.undoneAt"> · undone {{ stamp(sp.undoneAt) }}</template>
            </span>
          </div>
          <VxChip v-if="sp.undoneAt">undone</VxChip>
          <VxButton
            v-else
            size="sm"
            :disabled="!sp.undoable"
            :title="sp.undoable ? undefined : 'A later merge or split of one of these VODs has to be undone first'"
            :loading="busy === `undo-${sp.id}`"
            @click="undo(sp)"
          >
            {{ sp.kind === 'merge' ? 'Unmerge' : 'Unsplit' }}
          </VxButton>
        </li>
      </ul>
    </div>

    <VxDialog :open="!!mergeOf" :title="`Merge ${mergeOf?.id} into ${vod.id}?`" @update:open="(o: boolean) => !o && (mergeOf = null)">
      <template v-if="mergeOf">
        {{ mergeOf.id }} becomes the rest of {{ vod.id }}: its parts, chapters, chat and emotes move here, after a
        “Technical difficulties” chapter of {{ gapDraft.trim() && !gapBad ? span(toSeconds(gapDraft)) : mergeOf.overlaps ? 'the gap you set' : span(mergeOf.gap) }}. Its page sends
        viewers here. You can unmerge it later.
        <div class="form">
          <VxField label="Gap (optional)" :error="gapBad ? 'Seconds or H:MM:SS, 0 or more.' : mergeOf.overlaps ? 'The start times overlap; set the real gap.' : undefined">
            <template #default="{ id }"><VxInput :id="id" v-model="gapDraft" mono :placeholder="`${mergeOf.gap} (from the start times)`" :invalid="gapBad" /></template>
          </VxField>
        </div>
      </template>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" :disabled="gapBad || (mergeOf?.overlaps && !gapDraft.trim())" @click="merge">Merge</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="splitOpen" :title="inGap ? `Undo the merge at ${toClock(at)}?` : `Split ${vod.id} at ${toClock(at)}?`">
      <template v-if="inGap">That's inside a merge's gap chapter, so this undoes that merge.</template>
      <template v-else>Everything from {{ toClock(at) }} on becomes a new VOD with its own page. You can unsplit it later.</template>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" @click="split">{{ inGap ? 'Undo the merge' : 'Split' }}</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="!!forceAsk" title="Undo anyway?" @update:open="(o: boolean) => !o && (forceAsk = null)">
      These were edited since: <span class="vx-mono">{{ forceAsk?.edited.join(', ') }}</span>. Undoing puts the rows back
      as they were before, so those edits are lost.
      <template #actions="{ close }">
        <VxButton @click="close">Keep them</VxButton>
        <VxButton variant="danger-solid" @click="forceUndo">Undo and lose them</VxButton>
      </template>
    </VxDialog>
  </div>
</template>

<style scoped>
a { color: inherit; }
.splices { display: flex; flex-direction: column; gap: 14px; }
.group { display: flex; flex-direction: column; gap: 6px; }
.note { margin: 0; font-size: 13px; max-width: 72ch; }
.small { font-size: 12px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 10px; border: 1px solid var(--vx-line); border-radius: 6px; }
.row.undone { opacity: 0.6; }
.what { display: flex; flex-direction: column; gap: 2px; flex: 1 1 240px; min-width: 0; }
.what .title { overflow-wrap: anywhere; }
.chips, .points { display: flex; flex-wrap: wrap; gap: 6px; }
.points { margin-top: 8px; }
.warning { margin: 0 0 4px; }
.split { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.at { width: 120px; }
.form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
</style>
