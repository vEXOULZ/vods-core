<script setup lang="ts">
// /manage/youtube: every problem the last YouTube check found (GET /admin/youtube/videos), the last two weeks' first and
// then the older ones, which the overview leaves out. Some of those will never be fixed (a removed upload of an old VOD).
import { timeAgo, VxButton, VxCallout, VxSkeleton, useToast } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { usePoll } from '@vexoulz/platform-web/vue'
import { errorText } from '@vexoulz/platform-web'
import { RECENT_PROBLEM_DAYS, splitProblems, youtubeCheckMessage } from '../../admin/health'
import ManageShell from '../../admin/ManageShell.vue'
import YoutubeProblems from '../../admin/YoutubeProblems.vue'
import { admin } from '../../admin/session'
import { site } from '../../site'

const toast = useToast()
const { data, error, loading, refresh } = usePoll((signal) => admin.youtubeVideos(signal), 60_000)
const split = computed(() => splitProblems(data.value?.last))
const checking = ref(false)
async function check() {
  checking.value = true
  try {
    const res = await admin.checkYoutubeVideos()
    data.value = res
    if (res.last) toast.show(youtubeCheckMessage(res.last), { duration: 4000 })
  } catch (e) {
    toast.show(`Couldn't check the uploads on YouTube: ${errorText(e)}`, { kind: 'error', duration: 6000 })
    void refresh()
  } finally {
    checking.value = false
  }
}
onMounted(() => (document.title = `YouTube uploads · Manage · ${site.name}`))
</script>

<template>
  <ManageShell title="YouTube uploads">
    <template #actions>
      <VxButton to="/manage">Overview</VxButton>
      <VxButton :loading="checking || !!data?.running" title="Look up every upload on YouTube now (1 API unit per 50 videos)" @click="check">Check now</VxButton>
    </template>

    <VxCallout v-if="error" tone="error" title="Couldn't load the YouTube check">
      {{ error }}
      <template #actions><VxButton size="sm" :loading="loading" @click="refresh">Try again</VxButton></template>
    </VxCallout>
    <VxSkeleton v-else-if="!data" h="120px" />
    <p v-else-if="!data.last" class="vx-muted small">Not checked yet.</p>
    <template v-else>
      <p class="vx-muted small">
        Checked {{ timeAgo(data.last.checkedAt) }}: {{ data.last.videos }} uploads of {{ data.last.vods }} VODs.
      </p>
      <section>
        <h2 class="vx-eyebrow">Last {{ RECENT_PROBLEM_DAYS }} days ({{ split.recent.length }})</h2>
        <YoutubeProblems v-if="split.recent.length" :problems="split.recent" />
        <p v-else class="vx-muted small">No problems with VODs from the last {{ RECENT_PROBLEM_DAYS }} days.</p>
      </section>
      <section>
        <h2 class="vx-eyebrow">Older ({{ split.older.length }})</h2>
        <YoutubeProblems v-if="split.older.length" :problems="split.older" />
        <p v-else class="vx-muted small">No problems with older VODs.</p>
      </section>
    </template>
  </ManageShell>
</template>

<style scoped>
section { margin: 20px 0 28px; }
h2 { margin: 0 0 10px; }
.small { font-size: 12px; }
</style>
