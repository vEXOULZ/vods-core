<script setup lang="ts">
// The countdown on the player's cards (next stream, end of the VOD): a ring that empties as the seconds run out,
// the seconds left in the middle. Stopped (`left` null), it stays, dimmed, so the card doesn't change size.
defineProps<{ left: number | null; total: number; label: string }>()
</script>

<template>
  <div class="ring" :class="{ off: left === null }" role="timer" :aria-label="left !== null ? `${label} in ${Math.ceil(left)} seconds` : 'Timer stopped'">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle class="ring-track" cx="24" cy="24" r="21" pathLength="1" />
      <circle v-if="left !== null" class="ring-left" cx="24" cy="24" r="21" pathLength="1" :stroke-dashoffset="1 - left / total" />
    </svg>
    <span class="ring-n vx-mono" aria-hidden="true">{{ left !== null ? Math.ceil(left) : '–' }}</span>
  </div>
</template>

<style scoped>
.ring { position: relative; flex: none; display: grid; place-items: center; width: 100px; height: 100px; color: var(--vx-accent); }
.ring.off { color: inherit; opacity: 0.4; }
.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: currentColor; stroke-width: 3; }
.ring-track { opacity: 0.2; }
.ring-left { stroke-dasharray: 1; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear; }
.ring-n { font-size: 34px; line-height: 1; }
</style>
