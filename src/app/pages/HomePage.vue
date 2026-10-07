<script setup lang="ts">
// The home page: the newest VOD in its own panel, the latest playthroughs with what each one is, and the most played
// games. The full lists are their own pages (/vods, /playthroughs: the header and each tile's "see all" button); a
// game card opens the VODs list narrowed to that game.
import { resumeProgress, type GamePlayed, type Progress, type Vod } from '../../index'
import { useVods, useVodsContext } from '../../vue/index'
import { computed, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import LatestPlaythroughs from '../components/LatestPlaythroughs.vue'
import LatestVod from '../components/LatestVod.vue'
import MostPlayed from '../components/MostPlayed.vue'
import VodsShell from '../components/VodsShell.vue'
import { loadGamesPlayed } from '../lib/gamesPlayed'
import { listPath, parseListQuery, toApiFilter, toListQuery, type Tab } from '../lib/listQuery'

const { client, progress } = useVodsContext()
const router = useRouter()

const tabFilter = (t: Tab) => toApiFilter(parseListQuery({}, t))
const { vods: latestVods } = useVods(() => ({ ...tabFilter('vods'), page: 1, perPage: 1 }))
const latest = computed(() => latestVods.value[0] ?? null)
const { vods: latestPlaythroughs, loading: playthroughsLoading } = useVods(() => ({ ...tabFilter('playthroughs'), page: 1, perPage: 2 }))

const games = shallowRef<GamePlayed[] | null>(null)
const gamesError = ref<string | null>(null)
function fetchGames(retry = false) {
  gamesError.value = null
  loadGamesPlayed(client, retry)
    .then((g) => (games.value = g))
    .catch((e: Error) => (gamesError.value = e.message || 'Something went wrong'))
}
fetchGames()
const openGame = (game: string) => router.push({ path: listPath('vods'), query: toListQuery({ ...parseListQuery({}), game }) })

const saved = shallowRef(new Map<string, Progress>())
progress
  .list(500)
  .then((all) => (saved.value = new Map(all.map((p) => [p.vodId, p]))))
  .catch(() => undefined)
/** Where to pick a VOD up, if anywhere: one that grew since it was finished (a playthrough's new stream) at the new part. */
const resumeOf = (v: Vod) => resumeProgress(saved.value.get(v.id), v.duration)
</script>

<template>
  <VodsShell>
    <section class="top">
      <LatestVod v-if="latest" :vod="latest" :progress="resumeOf(latest)" />
      <LatestPlaythroughs :vods="latestPlaythroughs" :loading="playthroughsLoading" :resume="resumeOf" />
      <MostPlayed :games="games" :error="gamesError" @game="openGame" @retry="fetchGames(true)" />
    </section>
  </VodsShell>
</template>

<style scoped>
.top { display: flex; flex-direction: column; gap: 10px; }
</style>
