// Batch actions on ticked VODs (/manage/vods): queue them to archive, refetch chapters, chat or emotes, hide or show
// them, add or take off a tag. The worker takes one VOD per request (archiving takes the lot in one), so each VOD the
// action applies to gets its own, a few at a time; the page then shows `message` its own way.
import { errorText } from '@vex/platform-web'
import { ref } from 'vue'
import type { VodListRow } from './api'
import { admin } from './session'

const CONCURRENCY = 4

export type VodBatchAction = 'archive' | 'chapters' | 'chat' | 'emotes' | 'hide' | 'show' | 'tag' | 'untag'

/** What a batch action needs of a row of the VOD list. */
export type BatchVod = Pick<VodListRow, 'id' | 'hidden' | 'tags' | 'synthetic' | 'uploaded' | 'merged_into' | 'active_jobs'>

/** The buttons, in order; `tag` and `untag` also take the tag. */
export const VOD_BATCH: readonly { action: VodBatchAction; label: string; title: string }[] = [
  { action: 'archive', label: 'Archive', title: 'Queue the ones not on YouTube to archive, paused before they download: resume them on Jobs' },
  { action: 'chapters', label: 'Chapters', title: 'Fetch their chapters from Twitch again (chapters edited by hand stay)' },
  { action: 'chat', label: 'Chat', title: 'Save their chat from Twitch again' },
  { action: 'emotes', label: 'Emotes', title: 'Fill in their missing emote sets' },
  { action: 'hide', label: 'Hide', title: 'Take the public ones off the site' },
  { action: 'show', label: 'Show', title: 'Put the hidden ones back on the site' },
]

/** A synthetic VOD plays parts of others and a merged one is part of another: neither has Twitch data of its own. */
const own = (v: BatchVod) => !v.synthetic && !v.merged_into

/** The VODs among `vods` that `action` applies to (with `tag` for tag and untag); the rest are left alone. */
export function vodBatchTargets<V extends BatchVod>(vods: readonly V[], action: VodBatchAction, tag = ''): V[] {
  const name = tag.trim()
  const test: Record<VodBatchAction, (v: V) => boolean> = {
    archive: (v) => own(v) && !v.uploaded && !v.active_jobs.some((j) => j.kind === 'archive'),
    chapters: own,
    chat: own,
    emotes: own,
    hide: (v) => !v.hidden,
    show: (v) => v.hidden,
    tag: (v) => !!name && !v.merged_into && !v.tags.includes(name),
    untag: (v) => !!name && !v.merged_into && v.tags.includes(name),
  }
  return vods.filter(test[action])
}

export interface VodBatchResult {
  ok: string[]
  failed: { id: string; error: string }[]
  /** One line for a toast: how many went, and the first failure. */
  message: string
  error: boolean
}

const DONE: Record<VodBatchAction, (tag: string) => string> = {
  archive: () => 'Queued',
  chapters: () => 'Refetching chapters for',
  chat: () => 'Saving chat for',
  emotes: () => 'Capturing emotes for',
  hide: () => 'Hid',
  show: () => 'Showed',
  tag: (t) => `Tagged "${t}":`,
  untag: (t) => `Took "${t}" off`,
}

const plural = (k: number) => `${k} VOD${k === 1 ? '' : 's'}`

/** Runs batch actions one at a time; `done` hears each result (to refresh the list and untick what went). */
export function useVodBatch(done?: (result: VodBatchResult) => void) {
  /** The action in flight, or null. */
  const busy = ref<VodBatchAction | null>(null)

  const call = (action: VodBatchAction, v: BatchVod, tag: string): Promise<unknown> => {
    if (action === 'chapters') return admin.refetchChapters(v.id)
    if (action === 'chat') return admin.saveChat(v.id)
    if (action === 'emotes') return admin.captureEmotes(v.id)
    if (action === 'hide' || action === 'show') return admin.patchVod(v.id, { hidden: action === 'hide' })
    const tags = action === 'tag' ? [...v.tags, tag] : v.tags.filter((t) => t !== tag)
    return admin.patchVod(v.id, { tags })
  }

  /** Sends `action` for each of `vods` it applies to; null when another is running or none apply. */
  async function run(action: VodBatchAction, vods: readonly BatchVod[], tag = ''): Promise<VodBatchResult | null> {
    const name = tag.trim()
    const targets = vodBatchTargets(vods, action, name)
    if (busy.value || !targets.length) return null
    busy.value = action
    let result: VodBatchResult
    try {
      result = action === 'archive' ? await archive(targets.map((v) => v.id)) : await each(action, targets, name)
    } finally {
      busy.value = null
    }
    done?.(result)
    return result
  }

  async function archive(ids: string[]): Promise<VodBatchResult> {
    try {
      const res = await admin.importFromTwitch(ids, true)
      const skipped = new Set(res.skipped.map((s) => s.vodId))
      const failed = res.skipped.map((s) => ({ id: s.vodId, error: s.reason }))
      const detail = failed.map((f) => `${f.id}: ${f.error}`).join('; ')
      return { ok: ids.filter((id) => !skipped.has(id)), failed, message: detail ? `${res.msg}. ${detail}` : res.msg, error: !res.added.length }
    } catch (e) {
      const error = errorText(e)
      return { ok: [], failed: ids.map((id) => ({ id, error })), message: `Couldn't queue ${plural(ids.length)}: ${error}`, error: true }
    }
  }

  async function each(action: VodBatchAction, targets: BatchVod[], tag: string): Promise<VodBatchResult> {
    const ok: string[] = []
    const failed: VodBatchResult['failed'] = []
    let next = 0
    const worker = async () => {
      while (next < targets.length) {
        const v = targets[next++]!
        try {
          await call(action, v, tag)
          ok.push(v.id)
        } catch (e) {
          failed.push({ id: v.id, error: errorText(e) })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))
    const first = failed[0]
    const verb = DONE[action](tag)
    const message = first
      ? `${verb} ${ok.length} of ${plural(targets.length)}. ${first.id}: ${first.error}${failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''}`
      : `${verb} ${plural(targets.length)}`
    return { ok, failed, message, error: !!first }
  }

  return { busy, run }
}
