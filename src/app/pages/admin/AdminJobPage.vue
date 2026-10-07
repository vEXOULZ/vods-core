<script setup lang="ts">
// /manage/jobs/:id: one job run (/api/v2/jobs/:id): its steps, controls and log, polled while it can still change.
import { JobDetail } from '@vexoulz/platform-web/vue'
import { computed, onMounted } from 'vue'
import ManageShell from '../../admin/ManageShell.vue'
import { platform } from '../../admin/platform'
import { site } from '../../site'

const props = defineProps<{ id: string }>()
const jobId = computed(() => Number(props.id))

onMounted(() => (document.title = `Job ${props.id} · Manage · ${site.name}`))
</script>

<template>
  <ManageShell :title="`Job ${id}`">
    <p class="back"><RouterLink to="/manage/jobs">← All jobs</RouterLink></p>
    <JobDetail :key="jobId" :client="platform" :id="jobId">
      <template #subject="{ job }">
        <RouterLink v-if="job.subject" class="small" :to="{ path: '/manage/jobs', query: { subject: job.subject } }">its jobs</RouterLink>
      </template>
    </JobDetail>
  </ManageShell>
</template>

<style scoped>
.back { margin: 0 0 12px; }
.back a, .small { color: inherit; }
.small { display: block; font-size: 12px; }
</style>
