// The scaffold every VOD editor shares: draft rows made from the VOD (again whenever the VOD's copy changes), "dirty"
// against what was loaded, per-row errors, and a save that shows its failure in the editor.
import { computed, ref, watch, type Ref } from 'vue'
import { errorText } from '@vexoulz/platform-web'

export interface DraftEditorOptions<Row> {
  /** What the drafts are made from; the editor resets when it changes. */
  source: () => unknown
  drafts: () => Row[]
  /** What would be saved, compared with the loaded one for "dirty". */
  edits: (rows: Row[]) => unknown
  /** Row key → problem. Saving is blocked while there are any. */
  validate: (rows: Row[]) => Map<number, string>
  save: (rows: Row[]) => Promise<void>
  /** Reset anything else the editor keeps (before the snapshot is taken). */
  onReset?: () => void
}

export function useDraftEditor<Row>(opts: DraftEditorOptions<Row>) {
  const rows = ref([]) as Ref<Row[]>
  const error = ref<string | null>(null)
  const saving = ref(false)
  const snapshot = ref('')
  const state = () => JSON.stringify(opts.edits(rows.value))

  function reset() {
    rows.value = opts.drafts()
    opts.onReset?.()
    snapshot.value = state()
    error.value = null
  }
  watch(() => JSON.stringify(opts.source()), reset, { immediate: true })

  const dirty = computed(() => state() !== snapshot.value)
  const errors = computed(() => opts.validate(rows.value))

  async function save() {
    if (errors.value.size) return
    saving.value = true
    error.value = null
    try {
      await opts.save(rows.value)
    } catch (e) {
      error.value = errorText(e)
    } finally {
      saving.value = false
    }
  }

  const remove = (row: Row) => (rows.value = rows.value.filter((x) => x !== row))

  return { rows, error, saving, dirty, errors, reset, save, remove }
}
