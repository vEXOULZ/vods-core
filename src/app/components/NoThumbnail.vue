<script setup lang="ts">
// The stand-in for a VOD with no thumbnail: the site's own art (createVodsApp's `art.noThumbnail`), or a plain
// placeholder.
import { VxPlaceholder } from '@vexoulz/ui'
import { art } from '../art'
</script>

<template>
  <component :is="art.noThumbnail" v-if="art.noThumbnail" />
  <VxPlaceholder v-else label="no thumbnail" ratio="16 / 9" />
</template>
