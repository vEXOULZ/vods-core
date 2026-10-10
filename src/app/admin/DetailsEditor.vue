<script setup lang="ts">
// A VOD's details: title, thumbnail (a URL, or the default), duration and when it was streamed. Only what changed is
// sent. A VOD merged into another keeps its details as they were.
import { VxButton, VxCallout, VxField, VxInput, useToast } from '@vexoulz/ui'
import { computed, ref, watch } from 'vue'
import { errorText } from '@vexoulz/platform-web'
import type { AdminVod } from './api'
import { detailsDraft, detailsErrors, detailsPatch, type DetailsDraft } from './edits'
import { admin } from './session'
import TimeInput from './TimeInput.vue'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const draft = ref<DetailsDraft>(detailsDraft(props.vod))
const error = ref<string | null>(null)
const saving = ref(false)
function reset() {
  draft.value = detailsDraft(props.vod)
  error.value = null
}
watch(() => JSON.stringify(detailsDraft(props.vod)), reset)

/** Where the last chapter ends: the duration can't be shorter (the worker also checks the games rows). */
const contentEnd = computed(() => Math.max(0, ...(props.vod.chapters ?? []).map((c) => c.start + (c.length ?? c.end))))
const errors = computed(() => detailsErrors(draft.value, contentEnd.value))
const patch = computed(() => detailsPatch(draft.value, props.vod))
const dirty = computed(() => Object.keys(patch.value).length > 0)
const merged = computed(() => !!props.vod.merged_into)

// The date and the time are two inputs over the draft's one `datetime-local` value.
const date = computed({
  get: () => draft.value.createdAt.slice(0, 10),
  set: (v: string) => (draft.value.createdAt = `${v}T${time.value}`),
})
const time = computed({
  get: () => draft.value.createdAt.slice(11) || '00:00:00',
  set: (v: string) => (draft.value.createdAt = `${date.value}T${v.trim()}`),
})
const zone = (() => {
  const min = -new Date().getTimezoneOffset()
  const sign = min < 0 ? '−' : '+'
  const a = Math.abs(min)
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`
})()

/** What the page shows with no thumbnail of its own: the first YouTube part's. */
const fallback = computed(() => props.vod.youtube?.find((u) => u.thumbnail_url)?.thumbnail_url ?? null)
const preview = computed(() => (errors.value.has('thumbnailUrl') ? null : draft.value.thumbnailUrl.trim() || fallback.value))
const previewBroken = ref(false)
watch(preview, () => (previewBroken.value = false))

async function save() {
  if (errors.value.size || !dirty.value) return
  saving.value = true
  error.value = null
  try {
    const vod = await admin.updateVod(props.vod.id, patch.value)
    toast.show('Details saved', { duration: 3000 })
    emit('saved', vod)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="details" @submit.prevent="save">
    <VxCallout v-if="merged" tone="info">Merged into another VOD: only its visibility can change.</VxCallout>
    <VxField label="Title" :error="errors.get('title')">
      <template #default="{ id }"><VxInput :id="id" v-model="draft.title" :disabled="merged" :invalid="errors.has('title')" /></template>
    </VxField>

    <div class="thumb">
      <div class="preview">
        <img v-if="preview && !previewBroken" :src="preview" alt="Thumbnail preview" @error="previewBroken = true" />
        <span v-else class="none vx-muted">{{ previewBroken ? "Can't load this image" : 'No thumbnail' }}</span>
      </div>
      <VxField
        class="thumb-field"
        label="Thumbnail URL"
        :help="draft.thumbnailUrl.trim() ? undefined : 'Empty: the first YouTube part’s thumbnail.'"
        :error="errors.get('thumbnailUrl')"
      >
        <template #default="{ id }">
          <div class="inline">
            <VxInput :id="id" v-model="draft.thumbnailUrl" type="url" mono placeholder="https://…" :disabled="merged" :invalid="errors.has('thumbnailUrl')" />
            <VxButton :disabled="merged || !draft.thumbnailUrl" @click="draft.thumbnailUrl = ''">Use default</VxButton>
          </div>
        </template>
      </VxField>
    </div>

    <div class="grid">
      <VxField label="Duration" :error="errors.get('duration')">
        <template #default="{ id }">
          <TimeInput :id="id" v-model="draft.duration" :invalid="errors.has('duration')" />
        </template>
      </VxField>
      <VxField label="Streamed on" :help="`Your time (${zone}).`" :error="errors.get('createdAt')">
        <template #default="{ id }">
          <div class="inline">
            <VxInput :id="id" v-model="date" type="date" :disabled="merged" :invalid="errors.has('createdAt')" />
            <VxInput v-model="time" mono class="clock" aria-label="Time streamed (HH:MM:SS)" placeholder="20:00:00" :disabled="merged" :invalid="errors.has('createdAt')" />
          </div>
        </template>
      </VxField>
    </div>

    <VxCallout v-if="error" tone="error" title="Couldn't save the details">{{ error }}</VxCallout>
    <div class="foot">
      <VxButton :disabled="!dirty || saving" @click="reset">Undo changes</VxButton>
      <VxButton type="submit" variant="primary" :loading="saving" :disabled="merged || !dirty || errors.size > 0">Save details</VxButton>
    </div>
  </form>
</template>

<style scoped>
.details { display: flex; flex-direction: column; gap: 12px; }
.thumb { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.preview {
  flex: none; width: 192px; aspect-ratio: 16 / 9; border-radius: var(--vx-radius); overflow: hidden;
  background: var(--vx-line); display: grid; place-items: center;
}
.preview img { width: 100%; height: 100%; object-fit: cover; }
.none { font-size: 12px; padding: 8px; text-align: center; }
.thumb-field { flex: 1 1 260px; min-width: 0; }
.inline { display: flex; flex-wrap: wrap; gap: 8px; }
.inline > :first-child { flex: 1 1 180px; min-width: 0; }
.clock { flex: 0 0 110px; }
.grid { display: flex; flex-wrap: wrap; gap: 12px 24px; }
.grid > * { flex: 1 1 240px; }
.foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
