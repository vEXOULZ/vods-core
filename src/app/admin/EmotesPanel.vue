<script setup lang="ts">
// The emote sets saved with a VOD (what its chat replay shows): counts per set, a preview, and re-capture actions.
import { timeAgo, VxButton, VxCallout, VxChip, VxDialog, VxSkeleton, VxTabs, useToast, type Option } from '@vexoulz/ui'
import { emoteImage, type RawThirdPartyEmote } from '../../index'
import { computed, ref, watch } from 'vue'
import type { AdminEmotes } from './api'
import { errorText, stamp } from '@vexoulz/platform-web'
import { admin } from './session'

const props = defineProps<{ vodId: string; /** Merged or split: the archive won't capture from Twitch for it. */ spliced?: boolean }>()
const emit = defineEmits<{ job: [jobId: number] }>()
const toast = useToast()

type Provider = '7tv' | 'bttv' | 'ffz'
type SetKey = `channel:${Provider}` | `global:${Provider}`

const data = ref<AdminEmotes | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    data.value = await admin.vodEmotes(props.vodId)
    error.value = null
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}
watch(() => props.vodId, load, { immediate: true })

const sets = computed(() => {
  const d = data.value
  const g = d?.global_emotes
  const list: { key: SetKey; provider: Provider; label: string; emotes: RawThirdPartyEmote[] | null }[] = [
    { key: 'channel:7tv', provider: '7tv', label: 'Channel 7TV', emotes: d?.['7tv_emotes'] ?? null },
    { key: 'channel:bttv', provider: 'bttv', label: 'Channel BTTV', emotes: d?.bttv_emotes ?? null },
    { key: 'channel:ffz', provider: 'ffz', label: 'Channel FFZ', emotes: d?.ffz_emotes ?? null },
    { key: 'global:7tv', provider: '7tv', label: 'Global 7TV', emotes: g?.['7tv'] ?? null },
    { key: 'global:bttv', provider: 'bttv', label: 'Global BTTV', emotes: g?.bttv ?? null },
    { key: 'global:ffz', provider: 'ffz', label: 'Global FFZ', emotes: g?.ffz ?? null },
  ]
  return list
})
const shown = ref<SetKey>('channel:7tv')
const tabs = computed<Option<SetKey>[]>(() => sets.value.map((s) => ({ value: s.key, label: `${s.label} · ${s.emotes?.length ?? 0}` })))
const current = computed(() => sets.value.find((s) => s.key === shown.value)!)
const preview = computed(() =>
  (current.value.emotes ?? [])
    .map((e) => ({ code: e.name ?? e.code ?? '?', img: emoteImage({ provider: current.value.provider, id: String(e.id) }) }))
    .slice(0, 400),
)
const empty = computed(() => sets.value.filter((s) => !s.emotes?.length).map((s) => s.label))

const busy = ref<string | null>(null)
const confirmForce = ref(false)
async function run(name: string, action: () => Promise<{ msg: string; jobId?: number }>) {
  busy.value = name
  try {
    const res = await action()
    toast.show(res.msg, { duration: 3000 })
    if (res.jobId != null) emit('job', res.jobId)
  } catch (e) {
    toast.show(errorText(e), { kind: 'error', duration: 5000 })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="emotes">
    <VxCallout v-if="error" tone="error" title="Couldn't load the saved emotes">
      {{ error }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <VxSkeleton v-else-if="loading && !data" h="120px" />
    <template v-else>
      <VxCallout v-if="!data" tone="warn" title="No emotes saved">
        Chat for this VOD shows the channel's current emotes. Capture them to keep today's sets with it.
      </VxCallout>
      <template v-else>
        <div class="meta">
          <VxChip v-if="data.global_emotes_source" :tone="data.global_emotes_source === 'captured' ? 'ok' : 'warn'" k="globals">
            {{ data.global_emotes_source }}
          </VxChip>
          <VxChip v-else tone="warn" k="globals">not saved</VxChip>
          <span v-if="data.global_emotes_at" class="vx-muted small" :title="stamp(data.global_emotes_at)">globals from {{ timeAgo(data.global_emotes_at) }}</span>
          <span v-if="data.updatedAt" class="vx-muted small" :title="stamp(data.updatedAt)">· row updated {{ timeAgo(data.updatedAt) }}</span>
        </div>
        <p v-if="empty.length" class="vx-muted small">Empty: {{ empty.join(', ') }}. "Fill missing sets" tries them again.</p>
        <VxTabs v-model="shown" :options="tabs" label="Emote set" class="tabs" />
        <div class="grid" role="list" :aria-label="current.label">
          <p v-if="!preview.length" class="vx-muted small">Nothing in this set.</p>
          <img
            v-for="(e, i) in preview"
            :key="i"
            role="listitem"
            :src="e.img.src"
            :srcset="e.img.srcset"
            :alt="e.code"
            :title="e.code"
            loading="lazy"
            height="28"
          />
        </div>
      </template>
      <div class="foot">
        <VxButton :disabled="spliced" :title="spliced ? 'Merged or split: Twitch’s VOD of this id no longer matches it' : undefined" :loading="busy === 'fill'" @click="run('fill', () => admin.captureEmotes(vodId))">{{ data ? 'Fill missing sets' : 'Capture emotes' }}</VxButton>
        <VxButton v-if="data" variant="danger" :disabled="spliced" :loading="busy === 'force'" @click="confirmForce = true">Replace with today's sets…</VxButton>
        <VxButton v-if="data && !data.global_emotes" :loading="busy === 'backfill'" @click="run('backfill', () => admin.backfillGlobalEmotes([vodId]))">
          Backfill global sets
        </VxButton>
        <VxButton variant="ghost" :loading="loading" @click="load">Reload</VxButton>
      </div>
    </template>

    <VxDialog v-model:open="confirmForce" title="Replace the saved emotes?">
      The sets saved with this VOD are history: they show what was an emote when it streamed. Replacing them puts today's
      channel and global sets in their place, and old chat may lose emotes that were removed since.
      <template #actions="{ close }">
        <VxButton @click="close">Keep them</VxButton>
        <VxButton variant="danger-solid" @click="confirmForce = false; run('force', () => admin.captureEmotes(vodId, true))">Replace</VxButton>
      </template>
    </VxDialog>
  </div>
</template>

<style scoped>
.emotes { display: flex; flex-direction: column; gap: 10px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.small { font-size: 12px; margin: 0; }
.tabs { max-width: 100%; overflow-x: auto; }
.grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow: auto; padding: 4px 0; }
.grid img { height: 28px; width: auto; }
.foot { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
