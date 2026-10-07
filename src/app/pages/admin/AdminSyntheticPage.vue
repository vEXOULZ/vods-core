<script setup lang="ts">
// /manage/synthetic/new and /manage/synthetic/:id: a VOD made of windows of real ones (GET/POST/PUT/DELETE
// /api/v2/synthetic). A merge or split supersedes its sources (they leave the public lists and redirect into it); a
// playthrough, built from a game's windows, is listed beside them and tagged `compilation`.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxField, VxInput, VxSkeleton, timeAgo, useToast } from '@vexoulz/ui'
import { toClock } from '../../../index'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import type { PlaythroughWindow, SyntheticInput, SyntheticVod } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import PlaythroughBuilder from '../../admin/PlaythroughBuilder.vue'
import { admin } from '../../admin/session'
import TimeInput from '../../admin/TimeInput.vue'
import { errorMessage } from '../../lib/errors'
import { COMPLETE_TAG } from '../../lib/vodTags'
import { site } from '../../site'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const toast = useToast()
const isNew = computed(() => !props.id)

interface Row { key: number; vod_id: string; start: number | null; end: number | null; at: number | null; label: string }
let keys = 0
const row = (s: Partial<Row> = {}): Row => ({ key: keys++, vod_id: '', start: null, end: null, at: null, label: '', ...s })

const vod = ref<SyntheticVod | null>(null)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const form = ref({ id: '', title: '', tags: '', supersedes: false })
const segments = ref<Row[]>([])

function fill(v: SyntheticVod | null) {
  vod.value = v
  form.value = { id: v?.id ?? '', title: v?.title ?? '', tags: (v?.tags ?? []).join(', '), supersedes: v?.supersedes ?? false }
  segments.value = (v?.segments ?? []).map((s) => row({ vod_id: s.vod_id, start: s.start, end: s.end, at: s.at, label: s.label ?? '' }))
  if (!segments.value.length) segments.value = [row()]
}
async function load() {
  loadError.value = null
  notFound.value = false
  if (!props.id) return fill(null)
  vod.value = null
  try {
    fill(await admin.synthetic(props.id))
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound.value = true
    else loadError.value = errorMessage(e)
  }
}
watch(() => props.id, load, { immediate: true })

// ── segments ──
const move = (i: number, by: -1 | 1) => {
  const list = [...segments.value]
  ;[list[i], list[i + by]] = [list[i + by]!, list[i]!]
  segments.value = list
}
const remove = (i: number) => (segments.value = segments.value.filter((_, j) => j !== i))
const addRow = () => (segments.value = [...segments.value, row()])
function addWindows(windows: PlaythroughWindow[], game: string | null) {
  const kept = segments.value.filter((s) => s.vod_id.trim())
  segments.value = [...kept, ...windows.map((w) => row({ vod_id: w.segment.vod_id, start: w.segment.start, end: w.segment.end, label: w.segment.label }))]
  // A playthrough stands beside its sources and is tagged so.
  form.value.supersedes = false
  const tags = tagList.value
  if (!tags.includes('compilation')) form.value.tags = [...tags, 'compilation'].join(', ')
  if (!form.value.title.trim() && game) form.value.title = `${game} playthrough`
  builderOpen.value = false
}
const builderOpen = ref(false)

// ── checks ──
const tagList = computed(() => [...new Set(form.value.tags.split(',').map((t) => t.trim()).filter(Boolean))])
// A playthrough played to the end gets the `complete` tag (a tag on its thumbnail).
const complete = computed({
  get: () => tagList.value.includes(COMPLETE_TAG),
  set: (on: boolean) => {
    const rest = tagList.value.filter((t) => t !== COMPLETE_TAG)
    form.value.tags = (on ? [...rest, COMPLETE_TAG] : rest).join(', ')
  },
})
const idError = computed(() => {
  if (!isNew.value) return null
  const id = form.value.id.trim()
  if (!id) return 'Give it an id.'
  if (/^\d+$/.test(id)) return "Not only digits: those are Twitch's VOD ids."
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return 'Letters, digits, - and _ only.'
  return null
})
const segError = (s: Row) =>
  !/^\d+$/.test(s.vod_id.trim()) ? 'A Twitch VOD id.' : s.start != null && s.end != null && s.end <= s.start ? 'The end must come after the start.' : null
const segErrors = computed(() => segments.value.map(segError))
const valid = computed(() => !idError.value && segments.value.length > 0 && segErrors.value.every((e) => !e))
const total = computed(() =>
  segments.value.every((s) => s.start != null && s.end != null) ? segments.value.reduce((n, s) => n + (s.end! - s.start!), 0) : null,
)

// ── save / delete ──
const saving = ref(false)
const saveError = ref<string | null>(null)
async function save() {
  if (!valid.value) return
  saving.value = true
  saveError.value = null
  const body: SyntheticInput = {
    title: form.value.title.trim() || null,
    supersedes: form.value.supersedes,
    tags: tagList.value,
    segments: segments.value.map((s) => ({
      vod_id: s.vod_id.trim(),
      ...(s.start != null ? { start: s.start } : {}),
      ...(s.end != null ? { end: s.end } : {}),
      ...(s.at != null ? { at: s.at } : {}),
      ...(s.label.trim() ? { label: s.label.trim() } : {}),
    })),
  }
  try {
    if (isNew.value) {
      const made = await admin.createSynthetic({ ...body, id: form.value.id.trim() })
      toast.show(`Made ${made.id}`)
      router.replace(`/manage/synthetic/${encodeURIComponent(made.id)}`)
    } else {
      fill(await admin.updateSynthetic(props.id!, body))
      toast.show('Saved')
    }
  } catch (e) {
    saveError.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
async function destroy() {
  deleting.value = true
  try {
    await admin.deleteSynthetic(props.id!)
    toast.show(`Deleted ${props.id}`)
    router.push('/manage/vods?synthetic=true')
  } catch (e) {
    toast.show(errorMessage(e), { kind: 'error', duration: 6000 })
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

const when = (at: string | null) => (at ? new Date(at).toLocaleString() : '—')
watchEffect(() => (document.title = `${props.id ?? 'New synthetic VOD'} · Manage · ${site.name}`))
</script>

<template>
  <ManageShell :title="isNew ? 'New synthetic VOD' : `Synthetic VOD ${id}`">
    <template #actions>
      <VxButton v-if="!isNew" :to="`/vods/${encodeURIComponent(id!)}`">Watch page</VxButton>
      <VxButton v-if="!isNew" variant="danger" @click="deleteOpen = true">Delete</VxButton>
    </template>
    <p class="back"><RouterLink to="/manage/vods?synthetic=true">← Synthetic VODs</RouterLink></p>

    <VxCallout v-if="notFound" tone="warn" title="No such synthetic VOD">The archive has no synthetic VOD {{ id }}.</VxCallout>
    <VxCallout v-else-if="loadError" tone="error" title="Couldn't load it">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!isNew && !vod" class="sk" aria-busy="true"><VxSkeleton h="90px" /><VxSkeleton h="200px" /></div>

    <form v-else @submit.prevent="save">
      <section v-if="vod" class="panel vx-panel">
        <dl class="facts">
          <div><dt>Length</dt><dd class="vx-mono">{{ vod.duration ?? '—' }}</dd></div>
          <div><dt>Streamed</dt><dd>{{ when(vod.created_at) }}</dd></div>
          <div><dt>Made</dt><dd :title="when(vod.made_at)">{{ vod.made_at ? timeAgo(vod.made_at) : '—' }}</dd></div>
          <div><dt>Changed</dt><dd :title="when(vod.changed_at)">{{ vod.changed_at ? timeAgo(vod.changed_at) : '—' }}</dd></div>
          <div><dt>Visibility</dt><dd><VxChip :tone="vod.hidden ? 'warn' : 'ok'">{{ vod.hidden ? 'hidden' : 'public' }}</VxChip></dd></div>
        </dl>
        <p class="vx-muted small">Hiding it, and its chapters and the like, are on <RouterLink :to="`/manage/vods/${encodeURIComponent(vod.id)}`">its VOD page</RouterLink>.</p>
      </section>

      <section class="panel vx-panel">
        <h2 class="vx-eyebrow sec">Details</h2>
        <div class="fields">
          <VxField v-if="isNew" label="Id" :error="form.id && idError ? idError : undefined" help="In its link: /vods/<id>. Can't change later.">
            <template #default="{ id: fid }"><VxInput :id="fid" v-model="form.id" mono placeholder="elden-ring" /></template>
          </VxField>
          <VxField label="Title" help="Empty: the first source's.">
            <template #default="{ id: fid }"><VxInput :id="fid" v-model="form.title" /></template>
          </VxField>
          <VxField label="Tags" help="Comma-separated; a playthrough is tagged compilation, and complete once played to the end.">
            <template #default="{ id: fid }"><VxInput :id="fid" v-model="form.tags" placeholder="compilation" /></template>
          </VxField>
        </div>
        <VxCheckbox v-model="complete" label="Played to the end: shows a complete tag on its thumbnail" />
        <VxCheckbox v-model="form.supersedes" label="Stands in for its sources (a merge or split): they leave the public lists and redirect here" />
      </section>

      <section class="panel vx-panel">
        <div class="head">
          <h2 class="vx-eyebrow sec">Segments</h2>
          <span class="vx-muted small">{{ segments.length }} · {{ total == null ? 'some run to their source’s end' : toClock(total) }}</span>
          <VxButton size="sm" class="push" @click="builderOpen = !builderOpen">{{ builderOpen ? 'Close builder' : 'Build a playthrough…' }}</VxButton>
        </div>
        <div v-if="builderOpen" class="builder"><PlaythroughBuilder @add="addWindows" /></div>
        <p class="vx-muted small">
          Each is a window of a Twitch VOD, played one after another. Empty start or end: the source's own; empty
          “at”: right after the one before.
        </p>
        <ol class="segs">
          <li v-for="(s, i) in segments" :key="s.key" class="seg">
            <span class="n vx-mono">{{ i + 1 }}</span>
            <VxField label="VOD" :error="s.vod_id && segErrors[i] ? segErrors[i]! : undefined">
              <template #default="{ id: fid }"><VxInput :id="fid" v-model="s.vod_id" mono placeholder="2200000000" class="vodid" /></template>
            </VxField>
            <VxField label="Start"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.start" optional placeholder="start" /></template></VxField>
            <VxField label="End"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.end" optional placeholder="end" /></template></VxField>
            <VxField label="At"><template #default="{ id: fid }"><TimeInput :id="fid" v-model="s.at" optional placeholder="next" /></template></VxField>
            <VxField label="Label" class="grow">
              <template #default="{ id: fid }"><VxInput :id="fid" v-model="s.label" placeholder="Part 1" /></template>
            </VxField>
            <span class="acts">
              <VxButton size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move segment ${i + 1} up`" @click="move(i, -1)">↑</VxButton>
              <VxButton size="sm" variant="ghost" :disabled="i === segments.length - 1" :aria-label="`Move segment ${i + 1} down`" @click="move(i, 1)">↓</VxButton>
              <VxButton size="sm" variant="ghost" :aria-label="`Remove segment ${i + 1}`" @click="remove(i)">✕</VxButton>
            </span>
          </li>
        </ol>
        <VxButton size="sm" @click="addRow">Add a segment</VxButton>
      </section>

      <VxCallout v-if="saveError" tone="error" title="Couldn't save">{{ saveError }}</VxCallout>
      <div class="save">
        <VxButton type="submit" variant="primary" :loading="saving" :disabled="!valid">{{ isNew ? 'Make it' : 'Save' }}</VxButton>
        <VxButton v-if="!isNew" :disabled="saving" @click="fill(vod)">Undo changes</VxButton>
      </div>
    </form>

    <VxDialog v-model:open="deleteOpen" :title="`Delete ${id}?`">
      Its link stops working and, if it stood in for its sources, they come back. The sources themselves aren't touched.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="deleting" @click="destroy">Delete</VxButton>
      </template>
    </VxDialog>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.panel { padding: 14px 16px; margin-bottom: 16px; }
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 8px 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 16px; margin: 0; }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 2px; }
dd { margin: 0; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 4px 12px; margin-bottom: 8px; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.head .sec { margin: 0; }
.push { margin-left: auto; }
.builder { margin: 10px 0; padding: 12px; border: 1px solid var(--vx-line); border-radius: var(--vx-radius, 8px); }
.segs { list-style: none; margin: 8px 0 12px; padding: 0; display: grid; gap: 8px; }
.seg { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 10px; padding-top: 8px; border-top: 1px solid var(--vx-line); }
.seg :deep(.vx-field) { margin: 0; }
.n { align-self: center; min-width: 1.5em; opacity: 0.6; }
.vodid { width: 9.5rem; }
.grow { flex: 1 1 10rem; }
.acts { display: flex; gap: 2px; }
.save { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
