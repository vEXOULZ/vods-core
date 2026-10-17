<script setup lang="ts">
// What the YouTube uploads hide: stretches to blur, black out or mute, for what Twitch allows and YouTube doesn't
// (in-game nudity, say). The worker applies them to every upload after they're saved; the uploads already on YouTube
// keep what they had until the VOD is re-archived (the actions above).
import { VxButton, VxCallout, VxCheckbox, VxInput, VxSelect, useToast, type Option } from '@vex/ui'
import { computed } from 'vue'
import { toClock } from '../../index'
import type { AdminVod } from './api'
import { CENSOR_NOTE_MAX, censorDrafts, censorEdits, censorErrors, censoredSeconds, newCensor, type CensorDraft, type CensorVideo } from './edits'
import { admin } from './session'
import TimeInput from './TimeInput.vue'
import { useDraftEditor } from './useDraftEditor'

const props = defineProps<{ vod: AdminVod; duration: number }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const VIDEO: Option<CensorVideo>[] = [
  { value: 'none', label: 'Picture as is' },
  { value: 'blur', label: 'Blur' },
  { value: 'black', label: 'Black out' },
]

const { rows, error, saving, dirty, errors, reset, save, remove } = useDraftEditor<CensorDraft>({
  source: () => [props.vod.id, props.vod.censor],
  drafts: () => censorDrafts(props.vod.censor),
  edits: censorEdits,
  validate: (rows) => censorErrors(rows, props.duration),
  async save(rows) {
    emit('saved', await admin.saveCensor(props.vod.id, censorEdits(rows)))
    toast.show('Censor ranges saved. Re-archive the VOD to apply them to its uploads.', { duration: 6000 })
  },
})

const hidden = computed(() => censoredSeconds(props.vod.censor ?? []))
const uploaded = computed(() => (props.vod.youtube ?? []).length > 0)
</script>

<template>
  <div class="censor">
    <p class="vx-muted note">
      Blur, black out or mute stretches of the uploads, for what Twitch allows and YouTube doesn't. Saved ranges apply
      to every upload from then on; <template v-if="uploaded">the parts already on YouTube keep what they had until
      you re-archive the VOD.</template><template v-else>nothing is on YouTube yet.</template>
      The VOD on this site is never changed.
    </p>
    <p v-if="!rows.length" class="vx-muted empty">Nothing hidden.</p>
    <p v-else-if="hidden && !dirty" class="vx-muted empty">{{ toClock(hidden) }} hidden.</p>
    <ol class="rows">
      <li v-for="(r, i) in rows" :key="r.key" class="row" :class="{ 'has-error': errors.has(r.key) }">
        <TimeInput v-model="r.start" placeholder="start" :label="`Range ${i + 1} start`" :invalid="errors.has(r.key)" />
        <span class="vx-muted">to</span>
        <TimeInput v-model="r.end" placeholder="end" :label="`Range ${i + 1} end`" :invalid="errors.has(r.key)" />
        <VxSelect v-model="r.video" :options="VIDEO" width="140px" :aria-label="`Range ${i + 1} picture`" />
        <VxCheckbox v-model="r.mute">Mute</VxCheckbox>
        <VxInput
          v-model="r.note"
          class="what"
          :maxlength="CENSOR_NOTE_MAX"
          placeholder="Why (optional)"
          :aria-label="`Range ${i + 1} note`"
        />
        <VxButton variant="ghost" icon :label="`Remove range ${i + 1}`" @click="remove(r)">×</VxButton>
        <p v-if="errors.has(r.key)" class="err">{{ errors.get(r.key) }}</p>
      </li>
    </ol>
    <VxCallout v-if="error" tone="error" title="Couldn't save the censor ranges">{{ error }}</VxCallout>
    <div class="foot">
      <VxButton @click="rows.push(newCensor(rows, duration))">+ Add range</VxButton>
      <span class="spacer" />
      <VxButton :disabled="!dirty || saving" @click="reset">Undo changes</VxButton>
      <VxButton variant="primary" :loading="saving" :disabled="!dirty || errors.size > 0" @click="save">Save ranges</VxButton>
    </div>
  </div>
</template>

<style scoped>
.censor { display: flex; flex-direction: column; gap: 10px; }
.note, .empty { margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px;
  border-radius: var(--vx-radius); background: rgb(255 255 255 / 0.03);
}
.row.has-error { box-shadow: inset 0 0 0 1px var(--vx-bad); }
.what { flex: 1 1 180px; }
.err { flex-basis: 100%; margin: 0; color: var(--vx-bad); font-size: 12px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
</style>
