import { describe, expect, it } from 'vitest'
import { relativeDay } from '../../src/app/lib/dates'

const now = new Date(2026, 8, 26, 15, 0)

describe('relativeDay', () => {
  it('counts calendar days, not 24-hour spans', () => {
    expect(relativeDay(new Date(2026, 8, 26, 1, 0), now)).toBe('today')
    expect(relativeDay(new Date(2026, 8, 25, 23, 59), now)).toBe('yesterday')
    expect(relativeDay(new Date(2026, 8, 21), now)).toBe('5 days ago')
    expect(relativeDay(new Date(2026, 8, 5), now)).toBe('3 weeks ago')
  })
  it('gives the date for anything older than about two months', () => {
    expect(relativeDay(new Date(2026, 5, 1), now)).not.toMatch(/ago/)
  })
})
