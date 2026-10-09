// Manage's chapter editor without its look: the draft rows of a VOD's chapters (game, start / end, restricted), what
// they leave uncovered, where each sits on a strip against the VOD's length, splitting and sorting rows, and saving
// with the lock that keeps the automatic chapters step from overwriting the edit. ChaptersEditor.vue draws it; a site
// with its own UI binds the same refs.
import { computed, ref } from 'vue'
import { NO_CATEGORY } from '../../index'
import type { AdminVod } from '../admin/api'
import { chapterDrafts, chapterEdits, chapterErrors, chapterGaps, newChapter, type ChapterDraft, type GameValue } from '../admin/edits'
import { admin } from '../admin/session'
import { useDraftEditor } from '../admin/useDraftEditor'
import type { Notify } from '../lib/notify'
import { clamp } from '../lib/place'

/** A chapter split in the middle (e.g. to insert a game switch Twitch missed): `r` ends there, the copy starts there. */
export function splitChapter(r: ChapterDraft): ChapterDraft {
  const mid = Math.round((r.start + r.end) / 2)
  const copy = { ...newChapter([], 0), name: r.name, gameId: r.gameId, imageTemplate: r.imageTemplate, start: mid, end: r.end, restricted: r.restricted, kind: r.kind }
  r.end = mid
  return copy
}

/** The chapter editor's logic for `props.vod`, `props.duration` seconds long. */
export function useChaptersDraft(props: { vod: AdminVod; duration: number }, options: { saved: (vod: AdminVod) => void; notify: Notify }) {
  const locked = ref(false)
  const editor = useDraftEditor<ChapterDraft>({
    source: () => [props.vod.id, props.vod.chapters, props.vod.chaptersLocked],
    drafts: () => chapterDrafts(props.vod.chapters),
    onReset: () => (locked.value = props.vod.chaptersLocked),
    edits: (rows) => ({ c: chapterEdits(rows), l: locked.value }),
    validate: (rows) => chapterErrors(rows, props.duration),
    async save(rows) {
      const vod = await admin.saveChapters(props.vod.id, chapterEdits(rows), locked.value)
      options.notify(locked.value ? 'Chapters saved and locked' : 'Chapters saved', { duration: 3000 })
      options.saved(vod)
    },
  })
  const { rows } = editor
  /** Stretches of the VOD no chapter covers. */
  const gaps = computed(() => chapterGaps(rows.value, props.duration))
  const sorted = computed(() => rows.value.every((r, i) => i === 0 || rows.value[i - 1]!.start <= r.start))

  /** A row's game name, or NO_CATEGORY. */
  const label = (r: ChapterDraft) => r.name ?? NO_CATEGORY
  /** What the strip covers: the VOD, or further if a chapter runs past it. */
  const total = computed(() => Math.max(props.duration, ...rows.value.map((r) => (Number.isFinite(r.end) ? r.end : 0)), 1))
  /** Where time `s` sits on the strip, as a CSS percentage. */
  const pct = (s: number) => `${(clamp(s, 0, total.value) / total.value) * 100}%`

  function game(r: ChapterDraft): GameValue {
    return { name: r.name, gameId: r.gameId, imageTemplate: r.imageTemplate }
  }
  function setGame(r: ChapterDraft, g: GameValue) {
    r.name = g.name
    r.gameId = g.gameId
    r.imageTemplate = g.imageTemplate
  }
  function add() {
    rows.value.push(newChapter(rows.value, props.duration))
  }
  /** Split a chapter in the middle. */
  function split(r: ChapterDraft) {
    rows.value.splice(rows.value.indexOf(r) + 1, 0, splitChapter(r))
  }
  function sortRows() {
    rows.value = [...rows.value].sort((a, b) => a.start - b.start)
  }

  return { ...editor, locked, gaps, sorted, label, total, pct, game, setGame, add, split, sortRows }
}
