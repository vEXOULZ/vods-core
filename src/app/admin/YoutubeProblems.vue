<script setup lang="ts">
// The YouTube check's problems, one panel per VOD with each upload's issues: the overview's recent ones and /manage/youtube's all.
import { VxChip } from '@vexoulz/ui'
import type { YoutubeVodReport } from './api'
import { YOUTUBE_ISSUES, issueLink, issueWhere, percent } from './health'
import { toClock } from '../../time'

defineProps<{ problems: YoutubeVodReport[] }>()
</script>

<template>
  <ul class="problems">
    <li v-for="p in problems" :key="p.id" class="problem vx-panel">
      <div class="problem-head">
        <RouterLink :to="`/manage/vods/${p.id}`" class="problem-title">{{ p.title || p.id }}</RouterLink>
        <span class="vx-muted small" :title="p.planned < p.seconds ? 'Restricted games are left out of the uploads on purpose' : undefined">
          <template v-if="p.createdAt">{{ p.createdAt.slice(0, 10) }} · </template>{{ percent(p.share) }} of {{ toClock(p.seconds) }} on YouTube<template v-if="p.planned < p.seconds - 60"> · {{ toClock(p.planned) }} planned</template>
        </span>
      </div>
      <ul class="issues">
        <li v-for="(i, n) in p.issues" :key="n" class="issue">
          <VxChip :tone="i.severity === 'bad' ? 'bad' : 'warn'">{{ YOUTUBE_ISSUES[i.kind] ?? i.kind }}</VxChip>
          <span class="small">{{ issueWhere(i) }}: {{ i.detail }}</span>
          <a v-if="issueLink(i)" class="link small" :href="issueLink(i)" target="_blank" rel="noopener">Open</a>
        </li>
      </ul>
    </li>
  </ul>
</template>

<style scoped>
.problems, .issues { list-style: none; margin: 0; padding: 0; }
.problems { display: flex; flex-direction: column; gap: 8px; }
.problem { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.problem-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.problem-title { color: var(--vx-ink); font-weight: 600; overflow-wrap: anywhere; }
.issues { display: flex; flex-direction: column; gap: 6px; }
.issue { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.link { color: var(--vx-accent); text-decoration: underline; text-underline-offset: 2px; }
.link:hover { color: var(--vx-ink); }
.small { font-size: 12px; }
</style>
