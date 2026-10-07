import { describe, expect, it } from 'vitest'
import { answerOf, forget, recall, remember, shouldCheck } from '../../src/app/admin/quiet'

/** An in-memory Storage. */
function store(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

describe('the quiet admin check', () => {
  it('reads the answer off the query', () => {
    expect(answerOf({ admin: '1' })).toBe('yes')
    expect(answerOf({ admin: '0' })).toBe('no')
    expect(answerOf({ admin: 'x' })).toBeNull()
    expect(answerOf({})).toBeNull()
  })

  it('remembers per Twitch account and forgets on sign-out', () => {
    const local = store()
    expect(recall('42', local)).toBeNull()
    remember('42', 'no', local)
    remember('7', 'yes', local)
    expect([recall('42', local), recall('7', local)]).toEqual(['no', 'yes'])
    expect(local.getItem('vods-admin:42')).toBe('no')
    forget('42', local)
    expect(recall('42', local)).toBeNull()
  })

  it('never checks a known viewer, and at most once a minute per tab', () => {
    const local = store()
    const tab = store()
    expect(shouldCheck('42', 1_000_000, local, tab)).toBe(true)
    expect(shouldCheck('42', 1_030_000, local, tab)).toBe(false)
    expect(shouldCheck('42', 1_061_000, local, tab)).toBe(true)
    remember('42', 'no', local)
    expect(shouldCheck('42', 2_000_000, local, tab)).toBe(false)
  })

  it('does nothing without storage', () => {
    expect(shouldCheck('42', 1, null, store())).toBe(false)
    expect(shouldCheck('42', 1, store(), null)).toBe(false)
    expect(recall('42', null)).toBeNull()
  })
})
