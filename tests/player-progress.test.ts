import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WatchPlayer, YT_STATE, type PlayerLike } from '../src/player'
import { isResumable, LocalProgressStore, type KeyValueStorage } from '../src/progress'
import { Timeline } from '../src/timeline'
import { fixtureVod } from './helpers'

function fakePlayer() {
  const state = { id: '', t: 0, s: YT_STATE.UNSTARTED as number }
  const player: PlayerLike & { state: typeof state } = {
    state,
    loadVideoById: vi.fn((id: string, start = 0) => Object.assign(state, { id, t: start, s: YT_STATE.PLAYING })),
    cueVideoById: vi.fn((id: string, start = 0) => Object.assign(state, { id, t: start, s: YT_STATE.CUED })),
    seekTo: vi.fn((t: number) => (state.t = t)),
    playVideo: vi.fn(() => (state.s = YT_STATE.PLAYING)),
    pauseVideo: vi.fn(() => (state.s = YT_STATE.PAUSED)),
    getCurrentTime: () => state.t,
    getPlayerState: () => state.s,
    mute: vi.fn(),
    unMute: vi.fn(),
    isMuted: () => false,
    destroy: vi.fn(),
  }
  return player
}

describe('WatchPlayer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const vod = fixtureVod('vod-one-cut')
  const ids = vod.uploads.map((u) => u.id)

  it('loads the part for a VOD time and reports VOD time', () => {
    const w = new WatchPlayer(new Timeline(vod))
    const p = fakePlayer()
    const parts: number[] = []
    w.on('part', (i) => parts.push(i))
    w.attach(p, w.timeline.locate(80000))
    expect(p.loadVideoById).toHaveBeenCalledWith(ids[6], 80000 - 73091)
    expect(parts).toEqual([6])
    expect(w.currentTime()).toBe(80000)
  })

  it('seeks within a part without reloading, and across parts by loading', () => {
    const w = new WatchPlayer(new Timeline(vod))
    const p = fakePlayer()
    w.attach(p)
    w.seek(5000)
    expect(p.seekTo).toHaveBeenCalledWith(5000, true)
    expect(p.loadVideoById).toHaveBeenCalledTimes(1)
    w.seek(60000) // inside the cut → start of the part after it
    expect(p.loadVideoById).toHaveBeenLastCalledWith(ids[6], 0)
  })

  it('moves on to the next part when one ends, then reports the end', () => {
    const w = new WatchPlayer(new Timeline(vod))
    const p = fakePlayer()
    const ended = vi.fn()
    w.on('ended', ended)
    w.attach(p, { index: 6, offset: 0 })
    w.handleState(YT_STATE.ENDED)
    expect(p.loadVideoById).toHaveBeenLastCalledWith(ids[7], 0)
    w.handleState(YT_STATE.ENDED)
    expect(ended).toHaveBeenCalledOnce()
  })

  it('marks a failing part and skips to the next playable one', () => {
    const w = new WatchPlayer(new Timeline(vod))
    const p = fakePlayer()
    const errors: [number, string][] = []
    w.on('partError', (i, s) => errors.push([i, s]))
    w.attach(p, { index: 2, offset: 0 })
    w.handleError(150)
    expect(errors).toEqual([[2, 'blocked']])
    expect(w.status[2]).toBe('blocked')
    expect(p.loadVideoById).toHaveBeenLastCalledWith(ids[3], 0)
  })

  it('ticks VOD time while playing and stops when paused', () => {
    const w = new WatchPlayer(new Timeline(vod), { tickMs: 250 })
    const p = fakePlayer()
    const times: number[] = []
    w.attach(p)
    w.on('time', (t) => times.push(t))
    w.handleState(YT_STATE.PLAYING)
    p.state.t = 10
    vi.advanceTimersByTime(250)
    w.handleState(YT_STATE.PAUSED)
    p.state.t = 20
    vi.advanceTimersByTime(1000)
    expect(times).toEqual([0, 10])
  })
})

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

describe('LocalProgressStore', () => {
  it('saves, lists newest first, and caps the number of entries', async () => {
    const store = new LocalProgressStore({ storage: memoryStorage(), max: 2 })
    await store.set({ vodId: 'a', t: 100, duration: 1000, updatedAt: 1 })
    await store.set({ vodId: 'b', t: 200, duration: 1000, updatedAt: 2 })
    await store.set({ vodId: 'c', t: 300, duration: 1000, updatedAt: 3 })
    expect((await store.list()).map((p) => p.vodId)).toEqual(['c', 'b'])
    expect(await store.get('a')).toBeNull()
  })

  it('forgets finished VODs and restarts', async () => {
    const store = new LocalProgressStore({ storage: memoryStorage() })
    await store.set({ vodId: 'a', t: 500, duration: 1000 })
    await store.set({ vodId: 'a', t: 990, duration: 1000 })
    expect(await store.get('a')).toBeNull()
    await store.set({ vodId: 'b', t: 500, duration: 1000 })
    await store.set({ vodId: 'b', t: 5, duration: 1000 })
    expect(await store.get('b')).toBeNull()
    await store.set({ vodId: 'c', t: 5, duration: 1000 })
    expect(await store.get('c')).toBeNull()
  })

  it('survives broken or throwing storage', async () => {
    const broken = memoryStorage()
    broken.data.set('vods.progress.v1', '{not json')
    expect(await new LocalProgressStore({ storage: broken }).list()).toEqual([])
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    }
    const store = new LocalProgressStore({ storage: throwing })
    await expect(store.set({ vodId: 'a', t: 100, duration: 1000 })).resolves.toBeUndefined()
    expect(await store.get('a')).toBeNull()
  })

  it('says what is worth resuming', () => {
    expect(isResumable({ vodId: 'a', t: 10, duration: 1000, updatedAt: 0 })).toBe(false)
    expect(isResumable({ vodId: 'a', t: 500, duration: 1000, updatedAt: 0 })).toBe(true)
    expect(isResumable({ vodId: 'a', t: 980, duration: 1000, updatedAt: 0 })).toBe(false)
  })
})
