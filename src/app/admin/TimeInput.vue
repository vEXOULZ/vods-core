<script setup lang="ts">
// A VOD time as text ("1:02:03", "1h2m3s" or seconds). Commits on blur / Enter; unreadable text is flagged, not kept.
import { VxInput } from '@vexoulz/ui'
import { ref, watch } from 'vue'
import { formatTime, parseTime } from './edits'

const props = defineProps<{ id?: string; invalid?: boolean; label?: string; placeholder?: string; optional?: boolean }>()
const model = defineModel<number | null>({ required: true })
const text = ref(model.value == null ? '' : formatTime(model.value))
const bad = ref(false)

watch(model, (v) => {
  const shown = parseTime(text.value)
  if (v == null ? text.value !== '' : shown !== v) text.value = v == null ? '' : formatTime(v)
  bad.value = false
})

function commit() {
  if (props.optional && !text.value.trim()) {
    bad.value = false
    model.value = null
    return
  }
  const s = parseTime(text.value)
  bad.value = !Number.isFinite(s)
  if (!bad.value) {
    model.value = s
    text.value = formatTime(s)
  }
}
</script>

<template>
  <VxInput
    :id="id"
    v-model="text"
    class="time"
    mono
    :invalid="bad || invalid"
    :placeholder="placeholder ?? '0:00:00'"
    :aria-label="label"
    @blur="commit"
    @keydown.enter.prevent="commit"
  />
</template>

<style scoped>
.time { width: 108px; }
</style>
