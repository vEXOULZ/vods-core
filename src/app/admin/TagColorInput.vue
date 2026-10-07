<script setup lang="ts">
// A color on /manage/tags: typed (any color the site takes), picked, or one of the theme's swatches.
import { VxInput } from '@vexoulz/ui'

defineProps<{ id?: string; swatches: string[]; invalid?: boolean; placeholder?: string; pickLabel: string }>()
const model = defineModel<string>({ required: true })
/** The picker only takes #rrggbb; for anything else it starts from black. */
const pickerValue = (c: string) => (/^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : '#000000')
</script>

<template>
  <div class="color">
    <input type="color" class="picker" :value="pickerValue(model)" :aria-label="pickLabel" @input="model = ($event.target as HTMLInputElement).value" />
    <VxInput :id="id" v-model="model" mono :invalid="invalid" :placeholder="placeholder" />
  </div>
  <div class="swatches">
    <button
      v-for="s in swatches"
      :key="s"
      type="button"
      class="swatch"
      :style="{ background: s }"
      :aria-pressed="model === s"
      :title="s"
      :aria-label="s"
      @click="model = s"
    ></button>
  </div>
</template>

<style scoped>
.color { display: flex; gap: 6px; align-items: center; }
.picker { width: 34px; height: 30px; padding: 0; border: 1px solid var(--vx-line); border-radius: var(--vx-radius-sm); background: none; cursor: pointer; flex: none; }
.swatches { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--vx-line); cursor: pointer; padding: 0; }
.swatch[aria-pressed='true'] { outline: 2px solid var(--vx-ink); outline-offset: 1px; }
</style>
