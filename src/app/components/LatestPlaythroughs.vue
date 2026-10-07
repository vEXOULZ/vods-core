<script setup lang="ts">
// The newest playthroughs on the home page: each card with what it is beside it (the game, how many streams it took
// and when they were, its length, whether it's complete, how far you are), and a button to all of them. Hidden while
// there are none or they couldn't load.
import { gamePalette, VxChip, VxLink, VxPosters, VxSkeleton } from '@vexoulz/ui'
import { boxArt, isFinished, toClock, watchPath, type Progress, type Vod } from '../../index'
import { computed } from 'vue'
import SeeAllButton from './SeeAllButton.vue'
import VodCard from './VodCard.vue'
import { COMPLETE_TAG } from '../lib/vodTags'

const props = defineProps<{ vods: Vod[]; loading: boolean; resume: (v: Vod) => Progress | null | undefined }>()

/** What sits beside one playthrough's card. */
function details(v: Vod, p: Progress | null | undefined) {
  const s = v.synthetic
  const names = [...new Set(v.chapters.filter((c) => c.kind !== 'gap').map((c) => c.name))]
  const palette = gamePalette(names)
  const games = names.map((name) => {
    const c = v.chapters.find((ch) => ch.name === name)!
    return { name, image: boxArt(c.image) ?? undefined, color: palette.get(name) }
  })
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const first = s?.firstLiveAt ?? v.createdAt
  const last = s?.lastLiveAt ?? first
  return {
    games,
    streams: s ? new Set(s.segments.map((g) => g.stream)).size : 0,
    played: day(first) === day(last) ? day(first) : `${day(first)} → ${day(last)}`,
    complete: v.tags.includes(COMPLETE_TAG),
    to: watchPath(v, p?.t),
    you: you(v, p),
  }
}

/** How far you are, and the button that picks it up. */
function you(v: Vod, p: Progress | null | undefined) {
  if (!p) return { text: null, cta: '▶ Watch' }
  if (isFinished(p)) return { text: `New since you finished it, from ${toClock(p.t)}`, cta: "▶ Watch what's new" }
  const pct = v.duration ? Math.min(99, Math.round((p.t / v.duration) * 100)) : 0
  return { text: `You're ${pct}% in, at ${toClock(p.t)}`, cta: `▶ Resume at ${toClock(p.t)}` }
}

const entries = computed(() => props.vods.map((vod) => ({ vod, progress: props.resume(vod), ...details(vod, props.resume(vod)) })))
</script>

<template>
  <section v-if="loading || vods.length" class="strip vx-panel" aria-label="Latest playthroughs">
    <div class="vx-eyebrow">Latest playthroughs</div>
    <ul class="list" :aria-busy="loading && !vods.length">
      <template v-if="!vods.length">
        <li v-for="i in 2" :key="i" class="item">
          <div class="sk">
            <VxSkeleton ratio="16 / 9" h="auto" />
            <VxSkeleton w="80%" />
          </div>
          <div class="sk">
            <VxSkeleton w="60%" />
            <VxSkeleton w="90%" h="0.8em" />
            <VxSkeleton w="70%" h="0.8em" />
          </div>
        </li>
      </template>
      <li v-for="d in entries" v-else :key="d.vod.id" class="item">
        <VodCard :vod="d.vod" :progress="d.progress" />
        <div class="info">
          <div v-if="d.games.length" class="games">
            <VxPosters :games="d.games" mode="row" :size="28" />
            <span class="game-names">{{ d.games.map((g) => g.name).join(', ') }}</span>
          </div>
          <dl class="facts">
            <div v-if="d.streams"><dt>Streams</dt><dd class="vx-mono">{{ d.streams }}</dd></div>
            <div><dt>Length</dt><dd class="vx-mono">{{ toClock(d.vod.duration) }}</dd></div>
            <div><dt>Played</dt><dd>{{ d.played }}</dd></div>
          </dl>
          <div class="status">
            <VxChip v-if="d.complete" tone="ok">complete</VxChip>
            <VxChip v-else tone="accent">ongoing</VxChip>
            <VxChip v-if="d.vod.drive.length" tone="ok">download</VxChip>
          </div>
          <p v-if="d.you.text" class="you vx-muted">{{ d.you.text }}</p>
          <VxLink :to="d.to" class="vx-btn is-primary watch">{{ d.you.cta }}</VxLink>
        </div>
      </li>
    </ul>
    <SeeAllButton to="/playthroughs" class="all">See all playthroughs</SeeAllButton>
  </section>
</template>

<style scoped>
.strip { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; container-type: inline-size; }
/* Two side by side, each its card with the details beside it; one above the other when the tile is narrow, and the
   details under the card when even one is. */
.list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; min-width: 0; }
@container (max-width: 900px) {
  .list { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 480px) {
  .item { grid-template-columns: minmax(0, 1fr); }
}
.sk { display: flex; flex-direction: column; gap: 8px; }
.info { display: flex; flex-direction: column; gap: 10px; min-width: 0; font-size: 13px; }
.games { display: flex; align-items: center; gap: 8px; min-width: 0; }
.game-names { font-weight: 600; overflow-wrap: anywhere; line-height: 1.3; }
.facts { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; }
.facts > div { display: contents; }
.facts dt { color: var(--vx-muted); }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.status { display: flex; flex-wrap: wrap; gap: 6px; }
.you { margin: 0; font-size: 12px; }
.watch { align-self: flex-start; margin-top: auto; }
.all { align-self: flex-end; }
</style>
