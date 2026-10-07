<script setup lang="ts">
// Tag filter for the list page: the tags the open tab can be narrowed to (lib/listQuery, tagFilters), each drawn as
// on the thumbnails at 2/3 size. Empty value = any tag.
import { VxButton, VxMenuItem, VxPopover } from '@vexoulz/ui'
import { computed } from 'vue'
import TagMark from './TagMark.vue'
import { tagFilters, type Tab } from '../lib/listQuery'
import { DATE_TAGS, tagConfig, tagStyle } from '../lib/vodTags'
import type { TagStyle } from '../site'

const props = defineProps<{ tab: Tab }>()
const model = defineModel<string>({ required: true })

const tags = computed(() =>
  [...new Set([...DATE_TAGS, ...Object.keys(tagConfig.value)])]
    .filter((name) => tagFilters(props.tab, name))
    .map((name) => ({ name, ...tagStyle(name) })),
)
const current = computed(() => (model.value ? tagStyle(model.value) : null))

/** The tag drawn at SCALE: its box shrunk to match, so it lines up with the text (TagMark's default size if unset). */
const SCALE = 0.66
const box = (t: TagStyle) => ({ '--scale': SCALE, width: `${(t.width ?? 62) * SCALE}px`, height: `${(t.height ?? 22) * SCALE}px` })

function pick(name: string, close: () => void) {
  model.value = name
  close()
}
</script>

<template>
  <VxPopover width="min(260px, calc(100vw - 24px))" :cap="400">
    <template #trigger="{ toggle, open }">
      <VxButton class="trigger" :pressed="open || !!model" :label="current ? `Tag: ${current.label}` : 'Tag: any'" @click="toggle">
        <span v-if="current" class="mark" :style="box(current)"><TagMark :tag="current" /></span>
        <span class="label">{{ current?.label ?? 'Any tag' }}</span>
        <span aria-hidden="true">▾</span>
      </VxButton>
    </template>
    <template #default="{ close }">
      <VxMenuItem :current="!model" @click="pick('', close)">Any tag</VxMenuItem>
      <VxMenuItem v-for="t in tags" :key="t.name" :current="t.name === model" @click="pick(t.name, close)">
        <template #lead><span class="mark" :style="box(t)"><TagMark :tag="t" /></span></template>
        {{ t.label }}
      </VxMenuItem>
    </template>
  </VxPopover>
</template>

<style scoped>
.trigger { max-width: 220px; }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mark { flex: none; display: block; position: relative; }
.mark > :deep(*) { position: absolute; top: 0; left: 0; transform: scale(var(--scale)); transform-origin: 0 0; }
</style>
