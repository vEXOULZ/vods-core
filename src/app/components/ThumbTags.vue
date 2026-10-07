<script setup lang="ts">
// The drawn tags hanging off a VOD's thumbnail (lib/vodTags: which tags are drawn, their color and shape). The parent
// places it outside the thumbnail's link. Each names itself on hover, and is a link to the list narrowed to it (in
// the VOD's own tab) when the list can be (lib/listQuery, tagLink); the others let clicks through to the thumbnail.
import { VxLink, VxTooltip } from '@vexoulz/ui'
import type { Vod } from '../../index'
import { computed } from 'vue'
import TagMark from './TagMark.vue'
import { tagLink } from '../lib/listQuery'
import { splitTags, tagStyle } from '../lib/vodTags'

const props = defineProps<{ vod: Vod }>()
const tags = computed(() =>
  splitTags(props.vod).drawn.map((name) => ({ name, style: tagStyle(name), to: tagLink(props.vod, name) })),
)
</script>

<template>
  <ul v-if="tags.length" class="thumb-tags">
    <li v-for="t in tags" :key="t.name">
      <VxTooltip :text="t.style.label">
        <VxLink v-if="t.to" :to="t.to" class="tag-link" :aria-label="`${t.style.label}: list only these`">
          <TagMark :tag="t.style" />
        </VxLink>
        <TagMark v-else :tag="t.style" />
      </VxTooltip>
    </li>
  </ul>
</template>

<style scoped>
.thumb-tags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }
li { display: flex; }
li :deep(.vx-tooltip) { display: flex; pointer-events: auto; }
.tag-link { display: flex; color: inherit; text-decoration: none; border-radius: var(--vx-radius-sm); }
.tag-link:hover, .tag-link:focus-visible { filter: brightness(1.15); }
.tag-link:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }
</style>
