<script setup lang="ts">
// One VOD in the list: YouTube thumbnail with duration, fanned game posters (a button: opens the chapters, each a
// link to that point), chapter strip, and where you stopped (from watch progress) with a bar showing how much
// you've seen. Thumbnail and title link to the VOD; the posters sit outside those links. A tagged VOD (a playthrough)
// shows its tags by the date as chips, or hanging off the thumbnail (ThumbTags), as `site.tags` says.
import { gamePalette, learnGameColors, VxChapterBar, VxChip, VxLink, VxMenuItem, VxPopover, VxPosters } from '@vexoulz/ui'
import { boxArt, isFinished, toClock, watchPath, type Progress, type Vod } from '../../index'
import { computed, watchEffect } from 'vue'
import { useThumbnail } from '../composables/useThumbnail'
import NoThumbnail from './NoThumbnail.vue'
import { cutNote } from '../lib/cuts'
import { gamesWithArt } from '../lib/art'
import { splitTags, tagStyle } from '../lib/vodTags'
import ThumbTags from './ThumbTags.vue'

const props = defineProps<{ vod: Vod; progress?: Progress | null }>()

// One palette for this VOD's posters, chapter strip and chapter list, so similar games get told apart the same way.
const palette = computed(() => gamePalette(props.vod.chapters.map((c) => c.name)))
const games = computed(() => gamesWithArt(props.vod.chapters).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(games.value))
const date = computed(() =>
  props.vod.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
)
const to = computed(() => watchPath(props.vod, props.progress?.t))
// Finished before the VOD grew (a playthrough's new stream): `t` is where the new part starts.
const grown = computed(() => !!props.progress && isFinished(props.progress))
const watched = computed(() => (props.progress && props.vod.duration ? Math.min(1, props.progress.t / props.vod.duration) : 0))
const title = computed(() => props.vod.title || 'Untitled stream')
const chips = computed(() => splitTags(props.vod).chips.map((name) => ({ name, ...tagStyle(name) })))

const { src: thumb, srcset: thumbSet, onLoad: thumbLoaded, onError: thumbFailed } = useThumbnail(() => props.vod, 'hidpi')
</script>

<template>
  <article class="card">
    <div class="thumb">
      <VxLink :to="to" class="thumb-link" :aria-label="title" tabindex="-1">
        <div class="vx-ring img">
          <img v-if="thumb" :src="thumb" :srcset="thumbSet" alt="" loading="lazy" decoding="async" @load="thumbLoaded" @error="thumbFailed" />
          <NoThumbnail v-else flush />
        </div>
        <span class="dur vx-mono">{{ toClock(vod.duration) }}</span>
        <template v-if="progress">
          <span
            class="resume vx-mono"
            :title="grown ? `New since you finished it, from ${toClock(progress.t)}. Opens the VOD right there.` : `You stopped at ${toClock(progress.t)}. Opens the VOD right there.`"
          >
            ▶ {{ grown ? 'New ' : '' }}{{ toClock(progress.t) }}
          </span>
          <span class="watched" :style="{ width: `${watched * 100}%` }"></span>
        </template>
        <VxChapterBar v-if="vod.chapters.length" class="chapters" :chapters="vod.chapters" :palette="palette" />
      </VxLink>
      <ThumbTags :vod="vod" class="tags" />

      <VxPopover v-if="games.length" class="posters" width="min(320px, calc(100vw - 24px))" :cap="340">
        <template #trigger="{ toggle, open }">
          <button
            type="button"
            class="poster-btn"
            :class="{ open }"
            :aria-label="`Chapters: ${games.map((g) => g.name).join(', ')}`"
            :aria-expanded="open"
            @click="toggle"
          >
            <VxPosters :games="games" mode="fan" :size="30" />
          </button>
        </template>
        <template #default="{ close }">
          <div class="vx-eyebrow menu-head">Chapters · {{ vod.chapters.length }}</div>
          <VxMenuItem
            v-for="(c, i) in vod.chapters"
            :key="i"
            :to="c.restricted ? undefined : watchPath(vod, c.start)"
            :disabled="c.restricted"
            :sub="toClock(c.start)"
            @click="close()"
          >
            <template #lead>
              <VxPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="24" />
            </template>
            {{ c.name }}
            <template v-if="cutNote(c)" #trail><VxChip :title="cutNote(c)!.title">{{ cutNote(c)!.label }}</VxChip></template>
          </VxMenuItem>
        </template>
      </VxPopover>
    </div>

    <VxLink :to="to" class="text">
      <span class="title">{{ title }}</span>
      <span class="meta">
        <span class="vx-mono date">{{ date }}</span>
        <VxChip v-for="t in chips" :key="t.name" class="tag" :style="t.color ? { color: t.color, borderColor: t.color } : undefined">{{ t.label }}</VxChip>
        <span v-if="games.length" class="games">{{ games.map((g) => g.name).join(', ') }}</span>
      </span>
    </VxLink>
  </article>
</template>

<style scoped>
.card { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.thumb { position: relative; }
.thumb-link { display: block; position: relative; color: inherit; }
.img { border-radius: var(--vx-radius); overflow: hidden; aspect-ratio: 16 / 9; background: var(--vx-surface); }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dur, .resume {
  position: absolute; top: 6px; font-size: 11px; padding: 0 6px; border-radius: var(--vx-radius-sm);
  background: rgb(0 0 0 / 0.75);
}
.dur { right: 6px; color: #fff; }
.resume { left: 6px; color: var(--vx-accent); }
.watched { position: absolute; left: 0; bottom: 3px; height: 3px; background: var(--vx-accent); z-index: 1; }
.chapters { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 0 0 var(--vx-radius) var(--vx-radius); overflow: hidden; }
.tags { position: absolute; left: -5px; top: 30px; z-index: 1; }
.posters { position: absolute; left: 8px; bottom: 10px; z-index: 2; }
/* An open chapter list must cover the cards below it (their posters sit at the same level). */
.posters:has(.vx-popover-panel) { z-index: 30; }
.poster-btn {
  display: flex; padding: 2px 4px; margin: -2px -4px; background: none; border: none; cursor: pointer;
  border-radius: var(--vx-radius-sm); color: inherit;
}
.poster-btn:hover, .poster-btn.open { filter: brightness(1.15); }
.poster-btn:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }
.menu-head { padding: 6px 8px; }
.text { min-width: 0; display: flex; flex-direction: column; gap: 3px; color: inherit; text-decoration: none; }
.title { color: var(--vx-ink); font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.text:hover .title, .text:focus-visible .title, .card:has(.thumb-link:hover) .title { color: var(--vx-accent); }
.meta { display: flex; gap: 6px; align-items: center; min-width: 0; font-size: 12px; color: var(--vx-muted); }
.date, .tag { white-space: nowrap; flex: none; }
.games { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.games::before { content: '·'; margin-right: 6px; }
</style>
