<script setup lang="ts">
// "Find on Twitch": every VOD Twitch still keeps for the channel (7 to 60 days back), with what the archive has of
// each. The ones it doesn't have are ticked; adding them queues an archive job for each, paused before its first step,
// so nothing downloads until it's resumed on /manage/jobs.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxSkeleton, useToast } from '@vexoulz/ui'
import { errorText } from '@vexoulz/platform-web'
import { computed, ref, watch } from 'vue'
import type { TwitchVideo } from './api'
import { admin } from './session'
import { jobStatus, uploadStatus } from './status'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()
const toast = useToast()

const videos = ref<TwitchVideo[]>([])
const picked = ref<Record<string, boolean>>({})
const loading = ref(false)
const error = ref<unknown>(null)
const adding = ref(false)

/** Already uploaded, or with an archive job queued, running or paused: not offered again. */
const taken = (v: TwitchVideo) => v.uploaded || !!v.archiveJob

async function load() {
  loading.value = true
  error.value = null
  try {
    videos.value = await admin.twitchVideos()
    picked.value = Object.fromEntries(videos.value.map((v) => [v.id, !v.inArchive && !v.archiveJob]))
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
watch(open, (o) => o && load(), { immediate: true })

const chosen = computed(() => videos.value.filter((v) => !taken(v) && picked.value[v.id]).map((v) => v.id))
const missing = computed(() => videos.value.filter((v) => !v.inArchive).length)
const status = (v: TwitchVideo) => (v.archiveJob ? jobStatus({ ...v.archiveJob, kind: 'archive' }) : uploadStatus(v.uploaded, v.inArchive))

async function addPicked() {
  adding.value = true
  try {
    const res = await admin.importFromTwitch(chosen.value)
    const skipped = res.skipped.map((s) => `${s.vodId}: ${s.reason}`).join('; ')
    toast.show(skipped ? `${res.msg}. ${skipped}` : res.msg, { duration: skipped ? 8000 : 4000 })
    open.value = false
    emit('added')
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 6000 })
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <VxDialog v-model:open="open" title="Find VODs on Twitch" width="620px">
    Twitch keeps past broadcasts for a while. The ones ticked are queued to archive, paused before they download: resume
    them on Jobs.
    <VxCallout v-if="error" tone="error" title="Couldn't ask Twitch" class="body">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="loading" class="body sk" aria-busy="true"><VxSkeleton v-for="i in 4" :key="i" h="44px" /></div>
    <p v-else-if="!videos.length" class="body vx-muted">Twitch has no past broadcasts for the channel.</p>
    <template v-else>
      <p class="body vx-muted small">{{ videos.length }} on Twitch, {{ missing }} not in the archive.</p>
      <ul class="list">
        <li v-for="v in videos" :key="v.id" :class="{ taken: taken(v) }">
          <VxCheckbox v-model="picked[v.id]" :disabled="taken(v)">
            <span class="text">
              <span class="title">{{ v.title || 'Untitled' }}</span>
              <span class="meta vx-mono vx-muted">{{ v.id }} · {{ v.createdAt.slice(0, 10) }} · {{ v.duration }}</span>
            </span>
          </VxCheckbox>
          <VxChip :tone="status(v).tone" :title="status(v).title">{{ status(v).text }}</VxChip>
        </li>
      </ul>
    </template>
    <template #actions="{ close }">
      <VxButton @click="close">Cancel</VxButton>
      <VxButton variant="primary" :disabled="!chosen.length" :loading="adding" @click="addPicked">
        Add {{ chosen.length || '' }} paused
      </VxButton>
    </template>
  </VxDialog>
</template>

<style scoped>
.body { margin-top: 12px; }
.sk { display: flex; flex-direction: column; gap: 6px; }
.small { font-size: 12px; }
.list { list-style: none; margin: 8px 0 0; padding: 0; max-height: min(55vh, 480px); overflow-y: auto; border-top: 1px solid var(--vx-line); }
.list li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; padding: 8px 0; border-bottom: 1px solid var(--vx-line); }
.list li.taken { opacity: 0.6; }
.list :deep(.vx-check) { flex: 1 1 240px; align-items: flex-start; min-width: 0; }
.text { min-width: 0; }
.title { display: block; color: var(--vx-ink); overflow-wrap: anywhere; }
.meta { display: block; font-size: 11px; margin-top: 2px; }
</style>
