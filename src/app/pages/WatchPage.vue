<script setup lang="ts">
// /vods/:id, /live/:id and /youtube/:id. `?t=` is VOD time (wins), `?part=` starts a part from its beginning;
// with neither, playback resumes where this browser left off. A VOD merged into another one, or replaced by a
// synthetic VOD (a merge or split that keeps the original), sends you to the same moment in that one.
import { useToast, VxButton, VxCallout, VxEmptyState, VxSkeleton } from '@vexoulz/ui'
import { isFinished, isResumable, parseTimestamp, redirectTarget, resumeProgress, toClock, toHMS, type Position, type UploadType } from '../../index'
import { useVodsContext, useWatch } from '../../vue/index'
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WatchView from '../components/WatchView.vue'
import { site } from '../site'
import VodsShell from '../components/VodsShell.vue'

const props = defineProps<{ id: string; type: UploadType | null }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { progress } = useVodsContext()
const { vod, sources, timeline, segments, uploadType, download, loading, notFound, error, reload } = useWatch(
  () => props.id,
  () => props.type,
)

// Old links to a VOD that now plays inside another one: the later half of a merged broadcast, or an original a
// synthetic VOD replaces (merge or split). Same route type, same moment, and this browser's progress on the old id
// carries over.
const moved = computed(() => !!vod.value && redirectTarget(vod.value, 0) !== null)
watch(
  moved,
  async (m) => {
    const v = vod.value
    if (!m || !v) return
    const from = props.id
    let t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
    if (!t) {
      const saved = await progress.get(from).catch(() => null)
      if (saved && isResumable(saved)) t = saved.t
    }
    if (props.id !== from) return
    const base = route.path.split('/')[1] || 'vods'
    const to = redirectTarget(v, t ?? 0)!
    router.replace({ path: `/${base}/${encodeURIComponent(to.id)}`, query: to.t > 0 ? { t: `${Math.floor(to.t)}s` } : {}, hash: route.hash })
  },
  { immediate: true },
)

const start = shallowRef<Position | null>(null)
watch(
  timeline,
  async (tl) => {
    start.value = null
    if (!tl || tl.isEmpty || moved.value) return
    const t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
    const part = Number(route.query.part) || null
    if (!t && !part) {
      const saved = await progress.get(props.id).catch(() => null)
      if (tl !== timeline.value) return
      // Finished before it grew (a playthrough's new stream): picks up where the new part starts.
      const at = resumeProgress(saved, vod.value?.duration)
      if (saved && at) {
        start.value = tl.locate(at.t)
        toast.show(isFinished(saved) ? `New since you finished it: from ${toClock(at.t)}` : `Resumed at ${toClock(at.t)}`, { kind: 'info' })
        return
      }
    }
    start.value = tl.resolveStart({ t, part })
  },
  { immediate: true },
)

/** The other upload set, when this one is empty but that one isn't. */
const other = computed(() => {
  const v = vod.value
  if (!v || !timeline.value?.isEmpty) return null
  const alt: UploadType = uploadType.value === 'live' ? 'vod' : 'live'
  return v.uploads.some((u) => u.type === alt) ? `/${alt === 'vod' ? 'vods' : 'live'}/${v.id}` : null
})

/** A playthrough's parts are numbered within their stream: S1-P1, S1-P2, S2-P1… (a merge or split keeps P1, P2…). */
const partLabel = computed(() => {
  const seg = segments.value
  if (!seg || vod.value?.synthetic?.supersedes) return undefined
  return (i: number) => {
    const at = seg.clipInStream(i)
    return at ? `S${at.stream + 1}-P${at.part + 1}` : `P${i + 1}`
  }
})

const shareUrl = (t: number) => `${location.origin}${route.path}?t=${toHMS(t)}`

watchEffect(() => {
  document.title = vod.value ? `${vod.value.title} · ${site.name}` : site.name
})
</script>

<template>
  <WatchView
    v-if="vod && timeline && start && !moved"
    :key="`${vod.id}:${uploadType}`"
    :vod="vod"
    :timeline="timeline"
    :segments="segments"
    :sources="sources"
    :part-label="partLabel"
    :start="start"
    :download="download"
    :share-url="shareUrl"
  />
  <VodsShell v-else>
    <VxCallout v-if="error" tone="error" title="Couldn't load this VOD">
      {{ error.message }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <VxEmptyState v-else-if="notFound" code="404" title="No VOD with that id" text="It may never have been archived, or the link is mistyped.">
      <template #actions><VxButton to="/vods" variant="primary">Browse VODs</VxButton></template>
    </VxEmptyState>
    <VxEmptyState
      v-else-if="vod && timeline?.isEmpty && !moved"
      title="Not on YouTube yet"
      :text="`“${vod.title}” has no ${uploadType === 'live' ? 'live' : 'VOD'} uploads yet. Chat replay needs a video to follow.`"
    >
      <template #actions>
        <VxButton v-if="other" :to="other" variant="primary">Watch the other upload</VxButton>
        <VxButton :href="site.twitchUrl" external>Twitch channel</VxButton>
        <VxButton to="/vods">All VODs</VxButton>
      </template>
    </VxEmptyState>
    <div v-else-if="loading || !start" class="loading" aria-busy="true">
      <VxSkeleton ratio="16 / 9" h="auto" />
      <VxSkeleton w="60%" />
      <VxSkeleton w="30%" h="0.8em" />
    </div>
  </VodsShell>
</template>

<style scoped>
.loading { display: flex; flex-direction: column; gap: 10px; }
</style>
