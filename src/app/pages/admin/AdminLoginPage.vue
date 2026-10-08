<script setup lang="ts">
// /manage/login: where a Manage page sends someone without a dashboard session when the Twitch sign-in is off or
// failed, or after a session ended; and the admin password, for the archive's local network.
import { VxButton, VxCallout, VxField, VxInput } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '../../admin/api'
import TwitchMark from '../../components/TwitchMark.vue'
import VodsShell from '../../components/VodsShell.vue'
import { ensure, login, session, SIGNIN_ERRORS, twitchLoginUrl } from '../../admin/session'
import { site } from '../../site'

const route = useRoute()
const router = useRouter()
const password = ref('')
const field = ref<{ focus: () => void } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

const next = computed(() => {
  const n = route.query.next
  // Only paths inside Manage: never an absolute URL from the query.
  return typeof n === 'string' && n.startsWith('/manage') && !n.startsWith('//') ? n : '/manage'
})

/** A failed Twitch sign-in, as the worker's callback reports it. */
const signinError = computed(() => {
  const e = route.query.auth_error
  if (typeof e !== 'string' || !e) return null
  return SIGNIN_ERRORS[e] ?? `Signing in with Twitch failed (${e}).`
})
const offered = computed(() => session.passwordLogin || session.twitchLogin)

onMounted(async () => {
  document.title = `Sign in · Manage · ${site.name}`
  await ensure()
  if (session.authenticated) router.replace(next.value)
  else if (!session.twitchLogin) field.value?.focus()
})

async function submit() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await login(password.value)
    password.value = ''
    router.replace(next.value)
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 401) error.value = 'Wrong password.'
    else if (e instanceof AdminApiError && e.status === 429)
      error.value = `Too many attempts. Try again in ${e.retryAfter ? `${Math.ceil(e.retryAfter / 60)} min` : 'a few minutes'}.`
    else if (e instanceof AdminApiError && e.status === 404) error.value = 'Password login is turned off on the archive.'
    else if (e instanceof AdminApiError && e.status === 403)
      error.value = "The admin password only works from the archive's local network. Sign in with Twitch instead."
    else error.value = `Couldn't reach the archive admin API${e instanceof Error ? ` (${e.message})` : ''}.`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <VodsShell sky="dim">
    <form class="login vx-panel" @submit.prevent="submit">
      <div class="vx-eyebrow">{{ site.name }}</div>
      <h1 class="vx-display">Manage</h1>
      <VxCallout v-if="signinError" tone="error">{{ signinError }}</VxCallout>
      <VxCallout v-else-if="session.notice && !error" tone="warn">{{ session.notice }}</VxCallout>
      <VxCallout v-if="session.checked && !offered" tone="warn" title="Sign-in is off">
        Twitch sign-in isn't set up on the archive, and the admin password isn't offered here: either none is set
        (<code>ARCHIVE_ADMIN_PASSWORD</code>), or this address is outside the networks it works from
        (<code>ARCHIVE_ADMIN_PASSWORD_NETWORKS</code>, the local network by default).
      </VxCallout>
      <template v-if="session.twitchLogin">
        <VxButton :href="twitchLoginUrl(next)" variant="primary" class="twitch"><TwitchMark />Sign in with Twitch</VxButton>
        <p class="vx-muted note">For the archive's admins.</p>
        <div v-if="session.passwordLogin" class="or vx-muted" role="separator">or with the admin password</div>
      </template>
      <template v-if="session.passwordLogin">
        <VxField label="Password" :error="error ?? undefined">
          <template #default="{ id }">
            <VxInput :id="id" ref="field" v-model="password" type="password" :invalid="!!error" />
          </template>
        </VxField>
        <VxButton type="submit" :variant="session.twitchLogin ? 'default' : 'primary'" :loading="busy" :disabled="!password">Log in</VxButton>
      </template>
    </form>
  </VodsShell>
</template>

<style scoped>
.login { display: flex; flex-direction: column; gap: 14px; width: min(360px, 100%); margin: 8vh auto 0; padding: 24px; box-sizing: border-box; }
.login h1 { font-size: 28px; margin: 0 0 4px; }
.twitch { width: 100%; justify-content: center; gap: 8px; }
.note { margin: -6px 0 0; font-size: 12px; }
.or { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--vx-line); }
</style>
