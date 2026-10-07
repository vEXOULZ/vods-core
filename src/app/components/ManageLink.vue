<script setup lang="ts">
// The header's way into Manage for the archive's admins, in Twitch purple with a Twitch mark so it stands out.
// The mark is a placeholder until the real icon exists (README, "Assets still needed").
import { VxButton, VxPlaceholder } from '@vexoulz/ui'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <VxButton to="/manage" size="sm" class="manage-link" :pressed="route.path.startsWith('/manage')">
    <VxPlaceholder label="tw" :w="16" :h="16" class="mark" />
    Manage
  </VxButton>
</template>

<style scoped>
.manage-link { gap: 6px; border-color: #9146ff; background: color-mix(in srgb, #9146ff 22%, transparent); color: var(--vx-ink); }
.manage-link:hover { background: color-mix(in srgb, #9146ff 34%, transparent); }
.mark { flex: none; font-size: 8px; border-color: #bf94ff; }
</style>
