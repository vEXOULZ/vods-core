<script setup lang="ts">
// Chat replay beside (or under) the player. Follows the newest line unless you scroll up; then a button takes you
// back down. Settings (which recording, delay, timestamps, badges, names, name colours, emote sources, size) are
// the viewer's own. The live recording (doomtp-bot's) also has notices (subs, raids, redemptions), rewards, bits and
// removed messages; the VOD recording (Twitch's replay) has none of those.
import { VxButton, VxChip, VxPopover, VxSegmented, VxSlider, VxStepper, VxSwitch } from '@vexoulz/ui'
import { toClock, type ChatMessage, type ChatSource, type ChatSources, type EmoteToken } from '../../index'
import { ChatLine } from '@vexoulz/platform-web/vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import EmoteMenu from './EmoteMenu.vue'
import { DELAY_LIMIT, WIDTH_DEFAULT, WIDTH_MAX, WIDTH_MIN, type ChatSettings } from '../composables/useChatSettings'

const props = defineProps<{
  messages: ChatMessage[]
  settings: ChatSettings
  error?: string | null
  playing: boolean
  /** Messages each recording has for this VOD; null until chat's first page (or from an older archive). */
  sources?: ChatSources | null
  /** The recording being shown. */
  served?: ChatSource | null
}>()
const emit = defineEmits<{ hide: [] }>()

const lines = ref<HTMLElement | null>(null)
const following = ref(true)

function atBottom(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight - el.scrollTop < 48
}
function onScroll() {
  if (lines.value) following.value = atBottom(lines.value)
}
function toBottom() {
  following.value = true
  if (lines.value) lines.value.scrollTop = lines.value.scrollHeight
}
// The emote menu, for one emote at a time: clicking the open one again closes it. Chat holds still while it's open
// (new lines would scroll its emote away), and catches up once it closes.
const menu = shallowRef<{ token: EmoteToken; anchor: HTMLElement } | null>(null)
function toggleMenu(token: EmoteToken, anchor: HTMLElement) {
  menu.value = menu.value?.anchor === anchor ? null : { token, anchor }
}

watch([() => props.messages, menu], async () => {
  if (!following.value || menu.value) return
  await nextTick()
  if (lines.value) lines.value.scrollTop = lines.value.scrollHeight
})

const fmtDelay = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}s`
const colorOpts = [
  { value: 'readable' as const, label: 'readable' },
  { value: 'raw' as const, label: 'exact' },
]
const SOURCE_LABEL: Record<ChatSource, string> = { bot: 'Live', replay: 'VOD' }
const sourceOpts = computed(() =>
  (['bot', 'replay'] as const).map((value) => {
    const disabled = props.sources?.[value] === 0
    return { value, label: SOURCE_LABEL[value], disabled, title: disabled ? `No ${SOURCE_LABEL[value].toLowerCase()} chat for this VOD` : undefined }
  }),
)
/** The switch shows the recording on screen; picking one saves it as the viewer's choice. */
const source = computed<ChatSource>({
  get: () => props.served ?? props.settings.source,
  set: (v) => {
    props.settings.source = v
  },
})
const missing = computed(() => sourceOpts.value.filter((o) => o.disabled).map((o) => o.label))
/** The VOD recording has no usernames to trust, so it shows display names only (the saved choice stays). */
const vodChat = computed(() => source.value === 'replay')
const nameOpts = computed(() =>
  [
    { value: 'display' as const, label: 'Display name' },
    { value: 'login' as const, label: 'Username' },
    { value: 'both' as const, label: 'Both' },
  ].map((o) => {
    const off = vodChat.value && o.value !== 'display'
    return { ...o, disabled: off, title: off ? 'Live chat only' : undefined }
  }),
)
const names = computed<ChatSettings['names']>({
  get: () => (vodChat.value ? 'display' : props.settings.names),
  set: (v) => {
    props.settings.names = v
  },
})

const sizeOpts = [
  { value: 's' as const, label: 'S' },
  { value: 'm' as const, label: 'M' },
  { value: 'l' as const, label: 'L' },
]
</script>

<template>
  <aside class="chat" :class="`size-${settings.size}`" aria-label="Chat replay">
    <div class="head">
      <VxButton size="sm" variant="ghost" icon label="Hide chat" @click="emit('hide')">⇥</VxButton>
      <span class="vx-eyebrow">Chat replay</span>
      <span class="spacer"></span>
      <VxChip v-if="settings.delay" clickable tone="accent" class="vx-mono" title="Chat delay: click to reset" @click="settings.delay = 0">
        {{ fmtDelay(settings.delay) }}
      </VxChip>
      <VxPopover align="right" width="min(300px, calc(100vw - 24px))" role="dialog">
        <template #trigger="{ toggle, open }">
          <VxButton size="sm" variant="ghost" icon label="Chat settings" class="cog" :pressed="open" @click="toggle">⚙</VxButton>
        </template>
        <div class="settings">
          <div class="vx-eyebrow">Chat settings</div>
          <div class="set col">
            <span>Chat recording</span>
            <VxSegmented v-model="source" :options="sourceOpts" label="Chat recording" />
            <span v-for="l in missing" :key="l" class="vx-muted small">No {{ l.toLowerCase() }} chat for this VOD.</span>
            <span v-if="vodChat" class="warn small" role="note"
              >VOD chat has less: no subs, raids, redemptions, bits or removed messages, and display names only.</span
            >
          </div>
          <div class="set col">
            <span>Chat delay <span class="vx-muted small">shift-click for ±1s</span></span>
            <span class="row">
              <VxStepper v-model="settings.delay" :step="0.1" :min="-DELAY_LIMIT" :max="DELAY_LIMIT" size="sm" unit="s" label="Chat delay in seconds" />
              <VxButton size="sm" variant="ghost" :disabled="!settings.delay" @click="settings.delay = 0">reset</VxButton>
            </span>
          </div>
          <div class="set"><label for="chat-ts">Timestamps</label><VxSwitch id="chat-ts" v-model="settings.timestamps" /></div>
          <div class="set"><label for="chat-badges">Badges</label><VxSwitch id="chat-badges" v-model="settings.badges" /></div>
          <div class="set col">
            <span>Names</span>
            <VxSegmented v-model="names" :options="nameOpts" label="Names" />
          </div>
          <div class="set col">
            <span>Name colours <span class="vx-muted small">as chosen by each chatter</span></span>
            <VxSegmented v-model="settings.colors" :options="colorOpts" label="Name colours" />
          </div>
          <div class="set">
            <span>Emotes</span>
            <span class="row">
              <VxChip v-for="(on, k) in settings.emotes" :key="k" clickable :active="on" @click="settings.emotes[k] = !on">{{ k }}</VxChip>
            </span>
          </div>
          <div class="set"><span>Text size</span><VxSegmented v-model="settings.size" :options="sizeOpts" label="Text size" /></div>
          <div class="set col">
            <span>Chat width <span class="vx-muted small">on phones chat sits below</span></span>
            <span class="row wide">
              <VxSlider v-model="settings.width" :min="WIDTH_MIN" :max="WIDTH_MAX" :step="10" label="Chat width in pixels" class="grow" />
              <span class="vx-mono small pct">{{ settings.width }}px</span>
              <VxButton size="sm" variant="ghost" :disabled="settings.width === WIDTH_DEFAULT" @click="settings.width = WIDTH_DEFAULT">reset</VxButton>
            </span>
          </div>
        </div>
      </VxPopover>
    </div>

    <div ref="lines" class="lines" aria-live="off" @scroll.passive="onScroll">
      <p v-if="error" class="note vx-muted">Chat couldn't load: {{ error }}</p>
      <p v-else-if="!messages.length" class="note vx-muted">{{ playing ? 'No chat here yet.' : 'Chat plays along with the video.' }}</p>
      <ChatLine
        v-for="m in messages"
        :key="m.id"
        class="line"
        :line="m"
        :badges="settings.badges"
        :colors="settings.colors"
        :names="names"
        :emotes="settings.emotes"
        :open-token="menu?.token ?? null"
        @emote-menu="toggleMenu"
      >
        <template v-if="settings.timestamps" #before><span class="ts vx-mono">{{ toClock(m.at) }}</span></template>
      </ChatLine>
    </div>
    <EmoteMenu v-if="menu" :token="menu.token" :anchor="menu.anchor" :enabled="settings.emotes" @close="menu = null" />
    <VxButton v-if="!following" class="jump" size="sm" variant="primary" @click="toBottom">↓ Latest messages</VxButton>
  </aside>
</template>

<style scoped>
.chat { position: relative; display: flex; flex-direction: column; min-height: 0; background: #0b0b0d; }
.head { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 6px; border-bottom: 1px solid var(--vx-line); flex: none; }
.spacer { flex: 1; }
.settings { display: flex; flex-direction: column; padding: 8px; gap: 2px; }
.set { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.set.col { flex-direction: column; align-items: flex-start; gap: 6px; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.row.wide { width: 100%; flex-wrap: nowrap; }
.grow { flex: 1; min-width: 0; }
.pct { width: 5.5ch; text-align: right; }
.small { font-size: 11px; }
.warn { color: var(--vx-warn); line-height: 1.4; }
.cog { color: var(--vx-ink); font-size: 17px; }
.lines {
  flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 3px;
  font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; scrollbar-width: thin; scrollbar-color: var(--vx-line) transparent;
}
.size-s .lines { font-size: 12px; }
.size-l .lines { font-size: 15px; }
.note { margin: auto; text-align: center; font-size: 13px; }
.ts { color: var(--vx-muted); font-size: 10px; margin-right: 6px; opacity: 0.7; }
.jump { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); }
</style>
