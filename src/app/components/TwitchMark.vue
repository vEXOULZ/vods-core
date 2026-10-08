<script setup lang="ts">
// Twitch's mark on the Manage button and "Sign in with Twitch": the site's own art (createVodsApp's
// `art.twitchGlyph`), or a placeholder of the same size.
import { VxPlaceholder } from '@vexoulz/ui'
import { art } from '../art'
</script>

<template>
  <component :is="art.twitchGlyph" v-if="art.twitchGlyph" class="twitch-mark" aria-hidden="true" />
  <VxPlaceholder v-else label="tw" :w="16" :h="16" class="twitch-mark ph" aria-hidden="true" />
</template>

<style scoped>
.twitch-mark { flex: none; }
.ph { font-size: 8px; border-color: #bf94ff; }
</style>
