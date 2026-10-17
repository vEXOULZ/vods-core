import { ProblemError } from '@vex/platform-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type BatchVod, useVodBatch, vodBatchTargets } from '../../src/app/kit'
import { admin } from '../../src/app/admin/session'

const vod = (id: string, over: Partial<BatchVod> = {}): BatchVod => ({
  id, hidden: false, tags: [], synthetic: null, uploaded: false, merged_into: null, active_jobs: [], ...over,
})
const ids = (vods: BatchVod[]) => vods.map((v) => v.id)

afterEach(() => vi.restoreAllMocks())

describe('vodBatchTargets', () => {
  const vods = [
    vod('plain'),
    vod('done', { uploaded: true, hidden: true, tags: ['complete'] }),
    vod('queued', { active_jobs: [{ id: 1, kind: 'archive', state: 'paused', step: null }] }),
    vod('chatting', { active_jobs: [{ id: 2, kind: 'chat', state: 'running', step: null }] }),
    vod('synth', { synthetic: {}, tags: ['compilation'] }),
    vod('merged', { merged_into: { id: 'plain', offset: 60 }, tags: ['complete'] }),
  ]

  it('archives what is not uploaded and has no archive job, nor a synthetic or merged VOD', () => {
    expect(ids(vodBatchTargets(vods, 'archive'))).toEqual(['plain', 'chatting'])
  })

  it('refetches only VODs with Twitch data of their own', () => {
    for (const a of ['chapters', 'chat', 'emotes'] as const) expect(ids(vodBatchTargets(vods, a))).toEqual(['plain', 'done', 'queued', 'chatting'])
  })

  it('hides the public ones and shows the hidden ones', () => {
    expect(ids(vodBatchTargets(vods, 'show'))).toEqual(['done'])
    expect(ids(vodBatchTargets(vods, 'hide'))).toHaveLength(5)
  })

  it('tags the ones without the tag and untags the ones with it, never a merged VOD', () => {
    expect(ids(vodBatchTargets(vods, 'tag', ' complete '))).toEqual(['plain', 'queued', 'chatting', 'synth'])
    expect(ids(vodBatchTargets(vods, 'untag', 'complete'))).toEqual(['done'])
    expect(vodBatchTargets(vods, 'tag', '  ')).toEqual([])
  })
})

describe('useVodBatch', () => {
  it('patches each VOD the action applies to, and says how many', async () => {
    const patch = vi.spyOn(admin, 'patchVod').mockResolvedValue({} as never)
    const done = vi.fn()
    const batch = useVodBatch(done)
    const res = await batch.run('tag', [vod('a', { tags: ['x'] }), vod('b'), vod('c', { tags: ['complete'] })], 'complete')
    expect(patch.mock.calls).toEqual([['a', { tags: ['x', 'complete'] }], ['b', { tags: ['complete'] }]])
    expect(res).toMatchObject({ ok: ['a', 'b'], failed: [], message: 'Tagged "complete": 2 VODs', error: false })
    expect(done).toHaveBeenCalledWith(res)
    expect(batch.busy.value).toBeNull()
  })

  it('names the first failure and counts the rest', async () => {
    vi.spyOn(admin, 'refetchChapters').mockImplementation(async (id) => {
      if (id !== 'a') throw new ProblemError(409, { msg: `${id} is busy` })
      return { error: false, msg: 'ok' }
    })
    const res = await useVodBatch().run('chapters', [vod('a'), vod('b'), vod('c')])
    expect(res?.ok).toEqual(['a'])
    expect(res?.error).toBe(true)
    expect(res?.message).toMatch(/^Refetching chapters for 1 of 3 VODs\. b: .*b is busy.* \(and 1 more\)$/)
  })

  it('queues archives in one request and reports the skipped ones', async () => {
    const imp = vi.spyOn(admin, 'importFromTwitch').mockResolvedValue({
      error: false, msg: 'Added 1 paused', added: [{ vodId: 'a', jobId: 9 }], skipped: [{ vodId: 'b', reason: 'not on Twitch' }],
    })
    const res = await useVodBatch().run('archive', [vod('a'), vod('b'), vod('up', { uploaded: true })])
    expect(imp).toHaveBeenCalledWith(['a', 'b'], true)
    expect(res).toMatchObject({ ok: ['a'], failed: [{ id: 'b', error: 'not on Twitch' }], message: 'Added 1 paused. b: not on Twitch', error: false })
  })

  it('does nothing when nothing applies', async () => {
    const patch = vi.spyOn(admin, 'patchVod')
    expect(await useVodBatch().run('show', [vod('a')])).toBeNull()
    expect(patch).not.toHaveBeenCalled()
  })
})
