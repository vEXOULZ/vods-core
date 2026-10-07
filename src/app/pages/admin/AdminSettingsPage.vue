<script setup lang="ts">
// /manage/settings: the worker settings the dashboard can override (GET /admin/settings), grouped as the worker groups
// them. Each shows its env default and when a change is seen; one Save sends every change, all or none.
import { timeAgo, VxButton, VxCallout, VxChip, VxInput, VxSkeleton, VxSwitch, useToast } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import type { RuntimeSetting } from '../../admin/api'
import ManageShell from '../../admin/ManageShell.vue'
import { admin } from '../../admin/session'
import { settingChanges, settingLabel, showValue, toDraft, type SettingDraft } from '../../admin/settings'
import { errorMessage } from '../../lib/errors'
import { site } from '../../site'

const toast = useToast()
const GROUPS = ['Capture', 'YouTube', 'Pipeline', 'Runner']

const items = ref<RuntimeSetting[] | null>(null)
const loadError = ref<string | null>(null)
const drafts = ref<Record<string, SettingDraft>>({})
const saving = ref(false)
const saveError = ref<string | null>(null)
const resetting = ref<string | null>(null)

function take(data: RuntimeSetting[]) {
  items.value = data
  drafts.value = Object.fromEntries(data.map((s) => [s.key, toDraft(s)]))
}
async function load() {
  loadError.value = null
  try {
    take((await admin.settings()).data)
  } catch (e) {
    loadError.value = errorMessage(e)
  }
}

const groups = computed(() => {
  const all = items.value ?? []
  const names = [...GROUPS, ...new Set(all.map((s) => s.group).filter((g) => !GROUPS.includes(g)))]
  return names.map((name) => ({ name, items: all.filter((s) => s.group === name) })).filter((g) => g.items.length)
})
const pending = computed(() => settingChanges(items.value ?? [], drafts.value))
const count = computed(() => Object.keys(pending.value.changes).length)
const changed = (key: string) => key in pending.value.changes

async function save() {
  if (!count.value || pending.value.errors.size) return
  saving.value = true
  saveError.value = null
  try {
    take((await admin.saveSettings(pending.value.changes)).data)
    toast.show(count.value === 1 ? 'Setting saved' : 'Settings saved', { duration: 3000 })
  } catch (e) {
    saveError.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
function undo() {
  if (items.value) take(items.value)
  saveError.value = null
}
/** Back to the env default: drops the override (and this setting's unsaved draft; the others stay). */
async function reset(s: RuntimeSetting) {
  resetting.value = s.key
  try {
    const keep = { ...drafts.value }
    const data = (await admin.resetSetting(s.key)).data
    items.value = data
    const fresh = data.find((x) => x.key === s.key)!
    drafts.value = { ...keep, [s.key]: toDraft(fresh) }
    toast.show(`${settingLabel(s.key)} is back to its default`, { duration: 3000 })
  } catch (e) {
    toast.show(errorMessage(e), { kind: 'error', duration: 5000 })
  } finally {
    resetting.value = null
  }
}

// Manual steps: which steps each job kind pauses before.
function steps(s: RuntimeSetting): Record<string, string[]> {
  return drafts.value[s.key] as Record<string, string[]>
}
function toggleStep(s: RuntimeSetting, kind: string, step: string) {
  const d = steps(s)
  const have = d[kind] ?? []
  d[kind] = have.includes(step) ? have.filter((x) => x !== step) : [...have, step]
}

onMounted(() => {
  document.title = `Settings · Manage · ${site.name}`
  void load()
})
</script>

<template>
  <ManageShell title="Settings">
    <p class="intro vx-muted">
      The worker's settings you can change while it runs. Each starts from the worker's environment (its default here);
      a change here overrides it until you reset it.
    </p>

    <VxCallout v-if="loadError" tone="error" title="Couldn't load the settings">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!items" class="sk" aria-busy="true"><VxSkeleton v-for="i in 3" :key="i" h="160px" /></div>

    <form v-else @submit.prevent="save">
      <section v-for="g in groups" :key="g.name" class="group vx-panel">
        <h2 class="vx-eyebrow">{{ g.name }}</h2>
        <div v-for="s in g.items" :key="s.key" class="setting" :class="{ 'is-changed': changed(s.key), 'has-error': pending.errors.has(s.key) }">
          <div class="about">
            <label class="name" :for="`set-${s.key}`">{{ settingLabel(s.key) }}</label>
            <VxChip :tone="s.applies === 'now' ? 'accent' : 'default'" :title="s.applies === 'now' ? 'Seen at the next check, pick or step' : 'Jobs read it when they start or resume'">
              {{ s.applies === 'now' ? 'applies now' : 'applies to the next job' }}
            </VxChip>
            <VxChip v-if="s.overridden" tone="warn" :title="s.updatedAt ? `Changed ${timeAgo(s.updatedAt)}${s.updatedBy ? ` by ${s.updatedBy}` : ''}` : undefined">overridden</VxChip>
            <p class="help vx-muted">{{ s.help }}</p>
            <p class="default vx-muted">
              Default: <span class="vx-mono">{{ showValue(s, s.default) }}</span>
              <template v-if="s.min != null || s.max != null"> · range {{ s.min ?? '…' }}–{{ s.max ?? '…' }}</template>
            </p>
          </div>

          <div class="control">
            <VxSwitch v-if="s.type === 'bool'" :id="`set-${s.key}`" v-model="(drafts[s.key] as boolean)" />
            <VxInput
              v-else-if="s.type === 'int' || s.type === 'float'"
              :id="`set-${s.key}`"
              v-model="(drafts[s.key] as string)"
              class="num"
              type="number"
              mono
              :invalid="pending.errors.has(s.key)"
            />
            <textarea
              v-else-if="s.type === 'list'"
              :id="`set-${s.key}`"
              v-model="(drafts[s.key] as string)"
              class="vx-input list"
              rows="3"
              placeholder="One per line"
            />
            <div v-else-if="s.type === 'steps'" :id="`set-${s.key}`" class="kinds" role="group" :aria-label="settingLabel(s.key)">
              <div v-for="(all, kind) in s.choices ?? {}" :key="kind" class="kind">
                <span class="kind-name vx-mono">{{ kind }}</span>
                <div class="steps">
                  <button
                    v-for="step in all"
                    :key="step"
                    type="button"
                    class="step"
                    :aria-pressed="steps(s)[kind]?.includes(step) ?? false"
                    :title="`${kind} jobs pause before ${step}`"
                    @click="toggleStep(s, String(kind), step)"
                  >{{ step }}</button>
                </div>
              </div>
            </div>
            <VxInput v-else :id="`set-${s.key}`" v-model="(drafts[s.key] as string)" class="text" :invalid="pending.errors.has(s.key)" />
            <p v-if="pending.errors.has(s.key)" class="err">{{ pending.errors.get(s.key) }}</p>
            <VxButton v-if="s.overridden" size="sm" variant="ghost" :loading="resetting === s.key" @click="reset(s)">Reset to default</VxButton>
          </div>
        </div>
      </section>

      <div class="savebar vx-panel" :class="{ 'is-on': count > 0 || saveError }">
        <VxCallout v-if="saveError" tone="error" title="Nothing was saved" class="save-err">{{ saveError }}</VxCallout>
        <span class="vx-muted">{{ count ? `${count} unsaved ${count === 1 ? 'change' : 'changes'}` : 'No changes' }}</span>
        <span class="spacer" />
        <VxButton :disabled="!count || saving" @click="undo">Undo changes</VxButton>
        <VxButton type="submit" variant="primary" :loading="saving" :disabled="!count || pending.errors.size > 0">Save</VxButton>
      </div>
    </form>
  </ManageShell>
</template>

<style scoped>
.intro { margin: -8px 0 16px; max-width: 70ch; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.group { padding: 14px 16px; margin-bottom: 16px; }
h2 { margin: 0 0 4px; }
.setting {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 8px 20px; padding: 12px 0;
  border-top: 1px solid var(--vx-line);
}
.setting:first-of-type { border-top: 0; }
.setting.is-changed .name::after { content: ' •'; color: var(--vx-accent); }
.about { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; align-content: flex-start; }
.name { font-weight: 600; cursor: pointer; }
.help, .default { flex-basis: 100%; margin: 0; font-size: 12px; }
.control { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.num { width: 160px; }
.text { width: 100%; }
.list { width: 100%; min-height: 70px; resize: vertical; font: inherit; font-size: 13px; }
.kinds { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.kind { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; align-items: baseline; }
.kind-name { font-size: 12px; overflow-wrap: anywhere; }
.steps { display: flex; flex-wrap: wrap; gap: 4px; }
.step {
  font: inherit; font-size: 11px; padding: 2px 8px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--vx-line); background: transparent; color: var(--vx-muted);
}
.step:hover { color: var(--vx-ink); }
.step[aria-pressed='true'] { border-color: var(--vx-warn, var(--vx-accent)); color: var(--vx-ink); background: var(--vx-hover); }
.err { margin: 0; color: var(--vx-bad); font-size: 12px; }
.savebar {
  position: sticky; bottom: 12px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--vx-bg);
}
.savebar.is-on { opacity: 1; box-shadow: 0 0 0 1px var(--vx-accent); }
.save-err { flex-basis: 100%; }
.spacer { flex: 1; }
@container vx-site (max-width: 760px) {
  .setting { grid-template-columns: minmax(0, 1fr); }
  .kind { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
</style>
