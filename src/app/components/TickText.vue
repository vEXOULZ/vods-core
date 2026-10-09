<script setup lang="ts">
// Text that changes on every tick of the player (the clock, the time into the part), read here rather than by the
// page around it, so only this re-renders each time.
defineProps<{ text: () => string }>()
</script>

<template>{{ text() }}</template>
