<script setup lang="ts">
// "See all VODs" / "See all playthroughs" on the home tiles: a link to that list's page, as a button in its own
// colour, so it stands out from the green Watch and the plain controls around it: a solid fill in the info colour.
import { VxButton } from '@vexoulz/ui'

defineProps<{ to: string }>()
</script>

<template>
  <VxButton :to="to" class="see-all"><slot /> →</VxButton>
</template>

<style scoped>
.see-all {
  color: var(--vx-bg); font-weight: 600; background: var(--vx-info); border-color: var(--vx-info);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
.see-all:hover { color: var(--vx-bg); background: var(--vx-info); border-color: var(--vx-info); filter: brightness(1.1); }
</style>
