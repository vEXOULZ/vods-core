<script setup lang="ts">
// Frame for every Manage page: the site's own shell (public nav, account menu, the Manage button), the Manage bar,
// a dimmer sky, and the page's heading.
import VodsShell from '../components/VodsShell.vue'
import ManageBar from './ManageBar.vue'
import { session } from './session'

defineProps<{ title: string }>()
</script>

<template>
  <VodsShell sky="dim">
    <ManageBar v-if="session.authenticated" />
    <div class="head">
      <div class="vx-eyebrow">Manage</div>
      <h1 class="vx-display">{{ title }}</h1>
      <div v-if="$slots.actions" class="actions"><slot name="actions"></slot></div>
    </div>
    <slot></slot>
  </VodsShell>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 16px; margin-bottom: 20px; }
.head .vx-eyebrow { flex-basis: 100%; }
.head h1 { font-size: 28px; margin: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
