<script setup lang="ts">
// The Manage bar, at the top of every Manage page (ManageShell): the archive's admin sections and who is signed in.
// On a narrow screen it wraps; nothing is dropped.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { session } from './session'

const route = useRoute()

const LINKS = [
  { label: 'Overview', to: '/manage', exact: true },
  { label: 'Jobs', to: '/manage/jobs' },
  { label: 'VODs', to: '/manage/vods' },
  { label: 'Storage', to: '/manage/storage' },
  { label: 'Settings', to: '/manage/settings' },
  { label: 'Tags', to: '/manage/tags' },
  { label: 'Audit', to: '/manage/audit' },
]
const current = (to: string, exact = false) => (exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`))

/** The password has no user: "admin" then. */
const who = computed(() => (session.user ? `@${session.user.login}` : 'admin (password)'))
</script>

<template>
  <nav class="manage vx-panel" aria-label="Manage">
    <span class="vx-eyebrow label">Manage</span>
    <div class="links">
      <RouterLink
        v-for="l in LINKS"
        :key="l.to"
        :to="l.to"
        class="link"
        :class="{ 'is-current': current(l.to, l.exact) }"
        :aria-current="current(l.to, l.exact) ? 'page' : undefined"
      >{{ l.label }}</RouterLink>
    </div>
    <span class="who vx-muted vx-mono">{{ who }}</span>
  </nav>
</template>

<style scoped>
.manage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 12px;
  margin: 0 0 20px;
}
.label { margin: 0; }
.links { display: flex; flex-wrap: wrap; gap: 2px; }
.link {
  padding: 5px 10px;
  border-radius: var(--vx-radius-sm);
  color: var(--vx-muted);
  text-decoration: none;
  font-size: 13px;
}
.link:hover { color: var(--vx-ink); background: var(--vx-hover); }
.link.is-current { color: var(--vx-accent); background: var(--vx-hover); }
.who { margin-left: auto; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
</style>
