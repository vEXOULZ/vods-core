<script setup lang="ts">
// The VOD the end card suggests: its thumbnail (a link to it), title, when it was streamed and how long it is, and
// where you'd pick it up.
import { VxLink } from '@vexoulz/ui'
import { toClock, watchPath, type Vod } from '../../index'
import { computed } from 'vue'
import { useThumbnail } from '../composables/useThumbnail'
import NoThumbnail from './NoThumbnail.vue'

const props = defineProps<{ vod: Vod; t: number | null }>()

const to = computed(() => watchPath(props.vod, props.t ?? undefined))
const title = computed(() => props.vod.title || 'Untitled stream')
const date = computed(() => props.vod.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
const watched = computed(() => (props.t && props.vod.duration ? Math.min(1, props.t / props.vod.duration) : 0))
const { src, srcset, onLoad, onError } = useThumbnail(() => props.vod, 'hidpi')
</script>

<template>
  <div class="next">
    <VxLink :to="to" class="thumb" :aria-label="title" tabindex="-1">
      <div class="vx-ring img">
        <img v-if="src" :src="src" :srcset="srcset" alt="" decoding="async" @load="onLoad" @error="onError" />
        <NoThumbnail v-else />
      </div>
      <span class="dur vx-mono">{{ toClock(vod.duration) }}</span>
      <span v-if="watched" class="watched" :style="{ width: `${watched * 100}%` }"></span>
    </VxLink>
    <div class="text">
      <VxLink :to="to" class="title" :title="title">{{ title }}</VxLink>
      <span class="vx-muted sub">{{ date }}</span>
      <span v-if="t != null" class="vx-mono sub at">▶ from {{ toClock(t) }}</span>
    </div>
  </div>
</template>

<style scoped>
.next { display: flex; gap: 12px; align-items: center; min-width: 0; text-align: left; }
.thumb { position: relative; flex: none; width: 160px; display: block; border-radius: var(--vx-radius-sm); overflow: hidden; }
.img { aspect-ratio: 16 / 9; overflow: hidden; }
.img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dur { position: absolute; right: 4px; bottom: 6px; font-size: 11px; padding: 1px 4px; border-radius: 3px; background: rgb(0 0 0 / 0.75); color: #fff; }
.watched { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--vx-accent); }
.text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.title { font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: inherit; }
.sub { font-size: 12px; }
.at { color: var(--vx-accent); }

@container vx-site (max-width: 420px) {
  .thumb { width: 120px; }
}
</style>
