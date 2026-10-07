<script setup lang="ts">
// The newest VOD, above the list: a big thumbnail, when it was streamed and for how long, how many parts it was
// uploaded in, and every chapter with its game, start and length (each a link to that point). Resumes where you
// stopped, if you did. "See all VODs" goes to the VODs page.
import { gamePalette, learnGameColors, VxButton, VxChapterBar, VxChip, VxLink, VxPlaceholder, VxPosters } from '@vexoulz/ui'
import { boxArt, isFinished, toClock, watchPath, type Progress, type Vod } from '../../index'
import { computed, watchEffect } from 'vue'
import SeeAllButton from './SeeAllButton.vue'
import ThumbTags from './ThumbTags.vue'
import { useThumbnail } from '../composables/useThumbnail'
import { gamesWithArt } from '../lib/art'
import { relativeDay } from '../lib/dates'

const props = defineProps<{ vod: Vod; progress?: Progress | null }>()

const palette = computed(() => gamePalette(props.vod.chapters.map((c) => c.name)))
const games = computed(() => gamesWithArt(props.vod.chapters).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(games.value))

const title = computed(() => props.vod.title || 'Untitled stream')
const date = computed(() =>
  props.vod.createdAt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
)
const time = computed(() => props.vod.createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
const parts = computed(() => props.vod.uploads.filter((u) => u.type === 'vod').length || props.vod.uploads.length)
const cut = computed(() => props.vod.chapters.filter((c) => c.restricted && c.kind !== 'gap').length)
const to = computed(() => watchPath(props.vod, props.progress?.t))
// Finished before the VOD grew (a playthrough's new stream): `t` is where the new part starts.
const grown = computed(() => !!props.progress && isFinished(props.progress))
const watched = computed(() => (props.progress && props.vod.duration ? Math.min(1, props.progress.t / props.vod.duration) : 0))

const { src: thumb, srcset: thumbSet, onLoad: thumbLoaded, onError: thumbFailed } = useThumbnail(() => props.vod, 'always')
</script>

<template>
  <article class="latest vx-panel">
    <div class="main">
      <div class="thumb">
        <VxLink :to="to" class="thumb-link" :aria-label="title" tabindex="-1">
          <div class="vx-ring img">
            <img v-if="thumb" :src="thumb" :srcset="thumbSet" alt="" decoding="async" @load="thumbLoaded" @error="thumbFailed" />
            <VxPlaceholder v-else label="no thumbnail" ratio="16 / 9" />
          </div>
          <span class="dur vx-mono">{{ toClock(vod.duration) }}</span>
          <span v-if="progress" class="watched" :style="{ width: `${watched * 100}%` }"></span>
          <VxChapterBar v-if="vod.chapters.length" class="bar" :chapters="vod.chapters" :palette="palette" />
        </VxLink>
        <ThumbTags :vod="vod" class="tags" />
      </div>
      <div class="vx-eyebrow">Latest broadcast · {{ relativeDay(vod.createdAt) }}</div>
      <h2 class="title"><VxLink :to="to">{{ title }}</VxLink></h2>
    </div>

    <div class="side">
      <div v-if="vod.chapters.length" class="vx-eyebrow">Chapters · {{ vod.chapters.length }}</div>
      <ol v-if="vod.chapters.length" class="chapters">
        <li v-for="(c, i) in vod.chapters" :key="i">
          <VxLink v-if="!c.restricted" :to="watchPath(vod, c.start)" class="chapter">
            <VxPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="22" />
            <span class="name">{{ c.name }}</span>
            <span class="vx-mono vx-muted at">{{ toClock(c.start) }}</span>
            <span class="vx-mono vx-muted len">{{ toClock(c.end - c.start) }}</span>
          </VxLink>
          <span v-else class="chapter is-cut" title="Cut from the YouTube uploads">
            <VxPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="22" />
            <span class="name">{{ c.name }}</span>
            <span class="vx-mono vx-muted at">{{ toClock(c.start) }}</span>
            <VxChip>cut</VxChip>
          </span>
        </li>
      </ol>
      <div class="details">
        <div class="meta">
          <VxChip k="streamed">{{ date }}, {{ time }}</VxChip>
          <VxChip k="length">{{ toClock(vod.duration) }}</VxChip>
          <VxChip v-if="parts" k="parts">{{ parts }}</VxChip>
          <VxChip v-if="cut" k="cut" title="Chapters cut from the YouTube uploads">{{ cut }}</VxChip>
          <VxChip v-if="vod.drive.length" tone="ok">download</VxChip>
        </div>
        <div class="actions">
          <VxLink :to="to" class="vx-btn is-primary">
            {{ progress ? (grown ? `▶ Watch what's new (${toClock(progress.t)})` : `▶ Resume at ${toClock(progress.t)}`) : '▶ Watch' }}
          </VxLink>
          <VxLink v-if="progress" :to="watchPath(vod, 0)" class="vx-btn">From the start</VxLink>
          <SeeAllButton to="/vods" class="all">See all VODs</SeeAllButton>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Video and title on the left; chapters, details and buttons beside it. The chapter list takes whatever height the
   left side leaves and scrolls, so both columns end together. */
.latest { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 18px; padding: 14px; }
.main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
/* The side column doesn't add height of its own (contain: size): the video column sets it, the chapter list shrinks
   and scrolls when it's longer, and the details sit at the bottom either way. */
.side { display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; contain: size; }
.chapters {
  list-style: none; margin: 0; padding: 0; display: grid; align-content: start; gap: 2px;
  flex: 0 1 auto; min-height: 3rem; overflow-y: auto; scrollbar-width: thin;
}
@container vx-site (max-width: 760px) {
  .latest { grid-template-columns: minmax(0, 1fr); }
  .side { contain: none; }
  .chapters { flex: none; max-height: 16rem; }
}
.thumb { position: relative; margin-bottom: 4px; }
.thumb-link { display: block; position: relative; color: inherit; }
.img { border-radius: var(--vx-radius); overflow: hidden; aspect-ratio: 16 / 9; background: var(--vx-surface); }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dur {
  position: absolute; top: 8px; right: 8px; font-size: 12px; padding: 0 6px; border-radius: var(--vx-radius-sm);
  background: rgb(0 0 0 / 0.75); color: #fff;
}
.tags { position: absolute; left: -5px; top: 12px; z-index: 1; }
.watched { position: absolute; left: 0; bottom: 4px; height: 3px; background: var(--vx-accent); z-index: 1; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 0 0 var(--vx-radius) var(--vx-radius); overflow: hidden; }
.title { margin: 0; font-size: 19px; line-height: 1.3; overflow-wrap: anywhere; }
.title a { color: var(--vx-ink); text-decoration: none; }
.title a:hover { color: var(--vx-accent); }
.meta { display: flex; flex-wrap: wrap; gap: 6px; }
.details { display: flex; flex-direction: column; gap: 10px; margin-top: auto; padding-top: 6px; border-top: 1px solid var(--vx-line); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.all { margin-left: auto; }
.chapter {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px;
  padding: 4px 6px; border-radius: var(--vx-radius-sm); color: var(--vx-ink); text-decoration: none; font-size: 13px;
}
a.chapter:hover { background: var(--vx-surface); }
a.chapter:hover .name { color: var(--vx-accent); }
.chapter.is-cut { opacity: 0.6; }
.name { overflow-wrap: anywhere; line-height: 1.3; }
.at, .len { font-size: 12px; white-space: nowrap; }
.len::before { content: '· '; }
</style>
