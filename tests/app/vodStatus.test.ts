import { describe, expect, it } from 'vitest'
import { jobStatus, uploadStatus } from '../../src/app/kit'

describe('VOD status chips', () => {
  it('says what the archive has of a VOD', () => {
    expect([uploadStatus(true), uploadStatus(false), uploadStatus(false, false)].map((s) => [s.text, s.tone])).toEqual([
      ['archived', 'ok'],
      ['details only', 'warn'],
      ['not in the archive', 'default'],
    ])
  })

  it('names an active job by kind and state', () => {
    expect(jobStatus({ id: 7, kind: 'archive', state: 'paused', step: 'capture' })).toEqual({ tone: 'warn', text: 'archive paused', title: 'Job 7, at capture' })
    expect(jobStatus({ id: 8, kind: 'upload', state: 'running', step: null }).tone).toBe('accent')
  })
})
