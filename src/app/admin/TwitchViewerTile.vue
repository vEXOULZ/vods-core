<script setup lang="ts">
import { VxButton, VxCallout, VxDialog, VxField, VxInput, VxStatusDot, useToast } from '@vexoulz/ui'
import { errorText } from '@vexoulz/platform-web'
import { computed, onBeforeUnmount, ref } from 'vue'
import type { TwitchDeviceFlow, TwitchViewerStatus } from './api'
import { admin } from './session'
import { linkTwitch, viewerTile } from './twitchLink'

/**
 * The Overview tile for the Twitch account live recordings are asked for as: one that sees no ads on the channel
 * (Turbo, or a sub where the channel gives subs ad-free viewing) gets a stream without stitched ads. The broadcaster
 * links their own account with Twitch's device flow, or pastes a token when that one still gets ads.
 */
const props = defineProps<{ status: TwitchViewerStatus | null | undefined }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const tile = computed(() => viewerTile(props.status))

// ---- device flow ----
const linkOpen = ref(false)
const flow = ref<TwitchDeviceFlow | null>(null)
const linkError = ref<string | null>(null)
const starting = ref(false)
let abort: AbortController | null = null

async function startLink() {
  abort?.abort()
  const ctl = (abort = new AbortController())
  flow.value = null
  linkError.value = null
  linkOpen.value = true
  starting.value = true
  try {
    const res = await linkTwitch(admin, (f) => ((flow.value = f), (starting.value = false)), ctl.signal)
    if (res.state === 'cancelled') return
    if (res.state === 'failed') {
      linkError.value = res.error
      return
    }
    linkOpen.value = false
    toast.show(`Linked ${res.status?.login ?? 'the Twitch account'}`, { duration: 3500 })
    emit('changed')
  } catch (e) {
    if (!ctl.signal.aborted) linkError.value = errorText(e)
  } finally {
    if (abort === ctl) starting.value = false
  }
}

function onLinkOpen(open: boolean) {
  linkOpen.value = open
  if (!open) abort?.abort()
}
onBeforeUnmount(() => abort?.abort())

// ---- paste ----
const pasteOpen = ref(false)
const pasteDraft = ref('')
const pasteError = ref<string | null>(null)
const pasting = ref(false)

function openPaste() {
  pasteDraft.value = ''
  pasteError.value = null
  pasteOpen.value = true
}

async function paste() {
  pasting.value = true
  pasteError.value = null
  try {
    const st = await admin.twitchViewerPaste(pasteDraft.value.trim())
    pasteDraft.value = ''
    pasteOpen.value = false
    toast.show(`Linked ${st?.login ?? 'the Twitch account'}`, { duration: 3500 })
    emit('changed')
  } catch (e) {
    pasteError.value = errorText(e)
  } finally {
    pasting.value = false
  }
}

// ---- unlink ----
const unlinkOpen = ref(false)
const unlinking = ref(false)

async function unlink() {
  unlinking.value = true
  try {
    await admin.twitchViewerUnlink()
    unlinkOpen.value = false
    toast.show('Twitch account unlinked', { duration: 3500 })
    emit('changed')
  } catch (e) {
    toast.show(`Couldn't unlink the Twitch account: ${errorText(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    unlinking.value = false
  }
}
</script>

<template>
  <div class="tile vx-panel">
    <div class="vx-eyebrow">Twitch (ad-free)</div>
    <div class="tile-main"><VxStatusDot :status="tile.status" />{{ tile.text }}</div>
    <div v-if="tile.sub" class="vx-muted small">{{ tile.sub }}</div>
    <template v-if="status">
      <div v-if="!tile.linked" class="buttons">
        <VxButton title="Sign in on Twitch as an account that sees no ads on the channel" @click="startLink">Link Twitch account</VxButton>
        <VxButton size="sm" variant="ghost" @click="openPaste">Paste a token</VxButton>
      </div>
      <div v-else class="buttons">
        <VxButton size="sm" title="Link a different Twitch account" @click="startLink">Switch account</VxButton>
        <VxButton size="sm" variant="ghost" title="Link with a pasted token instead" @click="openPaste">Paste a token</VxButton>
        <VxButton size="sm" variant="ghost" @click="unlinkOpen = true">Unlink</VxButton>
      </div>
    </template>

    <VxDialog :open="linkOpen" title="Link a Twitch account" @update:open="onLinkOpen">
      <p>
        Sign in on Twitch as the account live recordings should be watched as: one that sees no ads on this channel
        (Turbo, or a sub where the channel gives subs ad-free viewing). Then enter this code there.
      </p>
      <VxCallout v-if="linkError" tone="error" title="The link didn't go through">{{ linkError }}</VxCallout>
      <template v-else-if="flow">
        <div class="code vx-mono" aria-label="Code to enter at Twitch">{{ flow.userCode }}</div>
        <a class="tile-link" :href="flow.verificationUri" target="_blank" rel="noopener">Open Twitch to enter the code</a>
        <p class="vx-muted small">Waiting for Twitch… this closes once the account is linked.</p>
      </template>
      <p v-else-if="starting" class="vx-muted small">Asking Twitch for a code…</p>
      <template #actions="{ close }">
        <VxButton @click="close">{{ linkError ? 'Close' : 'Cancel' }}</VxButton>
        <VxButton v-if="linkError" variant="primary" @click="startLink">Start again</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="pasteOpen" title="Paste a Twitch token">
      <p>
        If the linked account still gets ads in the recording, paste the <span class="vx-mono">auth-token</span> cookie
        of twitch.tv, signed in as that account. The worker checks it with Twitch and keeps it; it isn't shown again.
        Signing out on twitch.tv ends it.
      </p>
      <form @submit.prevent="pasteDraft.trim() && paste()">
        <VxField label="Token" :error="pasteError ?? undefined">
          <template #default="{ id }"><VxInput :id="id" v-model="pasteDraft" type="password" mono :invalid="!!pasteError" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" :loading="pasting" :disabled="!pasteDraft.trim()" @click="paste">Link</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="unlinkOpen" :title="`Unlink ${status?.login ?? 'the Twitch account'}?`">
      Live recordings are asked for anonymously again, with Twitch's ads cut out as gaps. The token isn't revoked; sign
      out on Twitch to end it.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="unlinking" @click="unlink">Unlink</VxButton>
      </template>
    </VxDialog>
  </div>
</template>

<style scoped>
.tile { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; align-items: flex-start; }
.tile-main { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.tile-link { color: var(--vx-accent); text-decoration: underline; text-underline-offset: 2px; }
.tile-link:hover { color: var(--vx-ink); }
.small { font-size: 12px; }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.code { font-size: 28px; letter-spacing: 0.15em; margin: 8px 0; }
p { margin: 0 0 10px; }
</style>
