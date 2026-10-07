<script setup lang="ts">
import { VxButton, VxEmptyState } from '@vexoulz/ui'
import VodsShell from '../components/VodsShell.vue'
</script>

<template>
  <VodsShell>
    <VxEmptyState code="404" title="Nothing here" text="That page doesn't exist. The VOD you're after is probably in the list.">
      <template #actions>
        <VxButton to="/vods" variant="primary">Browse VODs</VxButton>
        <VxButton href="https://vexoul.net">vexoul.net</VxButton>
      </template>
    </VxEmptyState>
  </VodsShell>
</template>
