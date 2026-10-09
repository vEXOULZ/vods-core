// Manage's merge and split for one VOD, without its look. Merge: when a stream dropped and Twitch made two VODs of one
// broadcast, the later one is appended to this one, the time between becoming a "Technical difficulties" gap chapter.
// Split: from a point between two parts on becomes a new VOD. Both move chat with the video and can be undone (latest
// first). SplicePanel.vue draws it; a site with its own UI binds the same refs.
import { computed, ref, watch } from 'vue'
import { duration as formatDuration } from '@vexoulz/platform-web'
import { normalizeVod, Timeline, toClock, toSeconds } from '../../index'
import { AdminApiError, type AdminVod, type MergeCandidate, type MergeCandidates, type Splice, type SpliceResult, type SplitPoint } from '../admin/api'
import { admin } from '../admin/session'
import { errorMessage } from '../lib/errors'
import type { Notify } from '../lib/notify'

/** "4m 12s", "1h 02m", "40s", for a gap either way. */
export const gapText = (seconds: number) => formatDuration(Math.abs(seconds))

/** One line of a VOD's merge and split history. */
export function describeSplice(sp: Splice): string {
  if (sp.kind === 'merge') {
    const down = sp.gap == null ? '' : sp.gap < 0 ? ` (overlapped ${gapText(sp.gap)})` : ` (down ${gapText(sp.gap)})`
    return `${sp.otherId} merged into ${sp.vodId} at ${toClock(sp.offset)}${down}`
  }
  return `${sp.vodId} split at ${toClock(sp.offset)}; the rest became ${sp.otherId}`
}

/** Where one part ends and the next starts: the places a split works without cutting an upload. */
export function splitJoins(timeline: Pick<Timeline, 'partSpans'> | null): { at: number; label: string }[] {
  const spans = timeline?.partSpans() ?? []
  return spans.slice(0, -1).map((s, i) => ({ at: Math.round(s.end), label: `after P${i + 1}` }))
}

/** Whether a gap typed for a merge isn't one: not empty, and not 0 or more seconds (or H:MM:SS). */
export function badGap(draft: string): boolean {
  const s = toSeconds(draft)
  return draft.trim() !== '' && !(Number.isFinite(s) && s >= 0)
}

export interface SpliceOptions {
  /** The VOD changed (reload it). */
  changed: () => void
  /** A job started (the descriptions' update). */
  job: (jobId: number) => void
  notify: Notify
}

/** The merge and split panel's logic for `props.vod`. */
export function useSplice(props: { vod: AdminVod }, options: SpliceOptions) {
  const { notify } = options
  const mergedInto = computed(() => props.vod.merged_into ?? null)
  const splices = computed(() => [...(props.vod.splices ?? [])].reverse())

  // ---- after a merge or split: the YouTube descriptions still list the old parts ----
  const touched = ref<string[]>([])
  /** A merge's warnings (the other upload type plays a few seconds off), kept until dismissed. */
  const warnings = ref<string[]>([])
  const describing = ref(false)
  const uploadTypes = computed(() => [...new Set((props.vod.youtube ?? []).map((u) => u.type))])
  async function describe() {
    describing.value = true
    try {
      for (const id of touched.value)
        for (const type of uploadTypes.value.length ? uploadTypes.value : (['vod'] as const)) {
          const res = await admin.updateDescriptions(id, type)
          if (res.jobId != null) options.job(res.jobId)
        }
      notify(`Updating the descriptions of ${touched.value.join(' and ')}`, { duration: 3500 })
      touched.value = []
    } catch (e) {
      notify(errorMessage(e), { kind: 'error', duration: 6000 })
    } finally {
      describing.value = false
    }
  }

  const busy = ref<string | null>(null)
  /** An undo refused over edits made since; confirming retries it with force. */
  const forceAsk = ref<{ edited: string[]; retry: () => Promise<SpliceResult> } | null>(null)

  async function run(name: string, action: (force: boolean) => Promise<SpliceResult>, ids: (res: SpliceResult) => string[], force = false) {
    busy.value = name
    try {
      const res = await action(force)
      notify(res.msg, { duration: 4000 })
      warnings.value = res.warnings ?? []
      touched.value = [...new Set(ids(res))]
      splitErr.value = null
      options.changed()
      void loadCandidates()
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 409 && e.edited.length && !force) {
        forceAsk.value = { edited: e.edited, retry: () => action(true) }
        return
      }
      if (e instanceof AdminApiError && name === 'split' && e.validPoints.length) {
        splitErr.value = { msg: e.message, points: e.validPoints }
        return
      }
      notify(errorMessage(e), { kind: 'error', duration: 8000 })
    } finally {
      busy.value = null
    }
  }
  function forceUndo() {
    const ask = forceAsk.value
    forceAsk.value = null
    if (ask) void run('force', () => ask.retry(), (r) => [r.splice.vodId, r.splice.otherId], true)
  }

  // ---- merge ----
  const cands = ref<MergeCandidates | null>(null)
  const candsError = ref<string | null>(null)
  async function loadCandidates() {
    if (mergedInto.value) return
    candsError.value = null
    try {
      cands.value = await admin.mergeCandidates(props.vod.id)
    } catch (e) {
      candsError.value = errorMessage(e)
    }
  }
  watch(() => props.vod.id, () => ((cands.value = null), loadCandidates()), { immediate: true })

  const mergeOf = ref<MergeCandidate | null>(null)
  const gapDraft = ref('')
  const gapBad = computed(() => badGap(gapDraft.value))
  function askMerge(c: MergeCandidate) {
    mergeOf.value = c
    gapDraft.value = c.overlaps ? '0' : ''
  }
  function merge() {
    const c = mergeOf.value
    if (!c) return
    mergeOf.value = null
    const gap = gapDraft.value.trim() ? toSeconds(gapDraft.value) : undefined
    void run(`merge-${c.id}`, () => admin.merge(props.vod.id, c.id, gap), (r) => [r.splice.vodId])
  }

  // ---- split ----
  const timeline = computed(() => {
    try {
      return new Timeline(normalizeVod(props.vod))
    } catch {
      return null
    }
  })
  const joins = computed(() => splitJoins(timeline.value))
  const duration = computed(() => props.vod.duration_seconds ?? toSeconds(props.vod.duration ?? ''))
  const atDraft = ref('')
  const at = computed(() => (atDraft.value.trim() ? toSeconds(atDraft.value) : NaN))
  const atBad = computed(() => atDraft.value.trim() !== '' && !(Number.isFinite(at.value) && at.value > 0 && at.value < duration.value))
  const splitErr = ref<{ msg: string; points: SplitPoint[] } | null>(null)
  const splitOpen = ref(false)
  watch(atDraft, () => (splitErr.value = null))
  function split() {
    splitOpen.value = false
    const t = at.value
    void run('split', () => admin.split(props.vod.id, t), (r) => (r.newVodId ? [r.splice.vodId, r.newVodId] : [r.splice.vodId]))
  }
  /** The split point is inside a merge's gap chapter: splitting there undoes that merge. */
  const inGap = computed(() => timeline.value?.chapters.some((c) => c.kind === 'gap' && at.value >= c.start && at.value <= c.end) ?? false)

  // ---- history ----
  function undo(sp: Splice) {
    void run(
      `undo-${sp.id}`,
      (force) => (sp.kind === 'merge' ? admin.unmerge(sp.vodId, sp.otherId, force) : admin.unsplit(sp.vodId, sp.otherId, force)),
      () => [sp.vodId, sp.otherId].filter((id) => id !== sp.otherId || sp.kind === 'merge'),
    )
  }
  function unmergeHere() {
    const m = mergedInto.value
    if (m) void run('unmerge', (force) => admin.unmerge(m.id, props.vod.id, force), () => [m.id, props.vod.id])
  }

  return {
    span: gapText,
    describeSplice,
    mergedInto,
    splices,
    touched,
    warnings,
    describing,
    describe,
    busy,
    forceAsk,
    forceUndo,
    cands,
    candsError,
    loadCandidates,
    mergeOf,
    gapDraft,
    gapBad,
    askMerge,
    merge,
    joins,
    atDraft,
    at,
    atBad,
    splitErr,
    splitOpen,
    split,
    inGap,
    undo,
    unmergeHere,
  }
}
