import { describe, expect, it } from 'vitest'
import { defineVodsConfig } from '../src/config'
import { toQueryString, vodListQuery } from '../src/api/query'
import { parseTimestamp, toClock, toHMS, toSeconds } from '../src/time'

describe('time', () => {
  it('parses HH:MM:SS', () => {
    expect(toSeconds('06:56:40')).toBe(25000)
    expect(toSeconds('2:05')).toBe(125)
    expect(toSeconds('nope')).toBeNaN()
  })

  it('formats ?t= and clocks', () => {
    expect(toHMS(3725)).toBe('1h2m5s')
    expect(toClock(3725)).toBe('1:02:05')
    expect(toClock(125)).toBe('2:05')
  })

  it('reads every ?t= form the old site and Twitch produce', () => {
    expect(parseTimestamp('1h2m5s')).toBe(3725)
    expect(parseTimestamp('1H2M5S')).toBe(3725)
    expect(parseTimestamp('45m')).toBe(2700)
    expect(parseTimestamp('90s')).toBe(90)
    expect(parseTimestamp('3725')).toBe(3725)
    expect(parseTimestamp('1:02:05')).toBe(3725)
    expect(parseTimestamp('garbage')).toBe(0)
    expect(parseTimestamp('')).toBe(0)
    expect(parseTimestamp(null)).toBe(0)
  })
})

describe('config', () => {
  it('parses numbers from env strings, so delay math adds instead of concatenating', () => {
    const c = defineVodsConfig({ channel: 'vEXOULZ', twitchId: 38656648, apiBase: 'https://api.example/', startDate: '2024-09-16', defaultPartDuration: '10800' })
    expect(c.defaultPartDuration).toBe(10800)
    expect(c.defaultPartDuration + 1).toBe(10801)
    expect(c.apiBase).toBe('https://api.example')
    expect(c.twitchId).toBe('38656648')
    expect(c.startDate.toISOString()).toBe('2024-09-16T00:00:00.000Z')
  })

  it('defaults the part length and rejects bad values', () => {
    expect(defineVodsConfig({ channel: 'x', twitchId: '1', apiBase: 'a', startDate: '2024-01-01' }).defaultPartDuration).toBe(10800)
    expect(() => defineVodsConfig({ channel: 'x', twitchId: 'abc', apiBase: 'a', startDate: '2024-01-01' })).toThrow(/twitchId/)
    expect(() => defineVodsConfig({ channel: 'x', twitchId: '1', apiBase: 'a', startDate: 'nope' })).toThrow(/startDate/)
    expect(() => defineVodsConfig({ channel: 'x', twitchId: '1', apiBase: 'a', startDate: '2024-01-01', defaultPartDuration: 'x' })).toThrow(/defaultPartDuration/)
  })
})

describe('Feathers query strings', () => {
  it('serializes like the old rest-client did', () => {
    expect(toQueryString({ $limit: 20, $skip: 0, $sort: { createdAt: -1 } })).toBe('?$limit=20&$skip=0&$sort[createdAt]=-1')
    expect(toQueryString({})).toBe('')
  })

  it('builds the default list query', () => {
    expect(toQueryString(vodListQuery({ page: 3, perPage: 10 }))).toBe('?$limit=10&$skip=20&$sort[createdAt]=-1')
  })

  it('builds each filter, and combines them', () => {
    const from = new Date('2025-01-01T00:00:00Z')
    const to = new Date('2025-02-01T00:00:00Z')
    expect(toQueryString(vodListQuery({ title: ' doom ' }))).toBe('?title[$iLike]=%25doom%25&$limit=20&$skip=0&$sort[createdAt]=-1')
    expect(toQueryString(vodListQuery({ game: 'Risk of Rain 2' }))).toBe('?chapters[name]=Risk%20of%20Rain%202&$limit=20&$skip=0&$sort[createdAt]=-1')
    expect(toQueryString(vodListQuery({ from, to }))).toBe(
      '?createdAt[$gte]=2025-01-01T00%3A00%3A00.000Z&createdAt[$lte]=2025-02-01T00%3A00%3A00.000Z&$limit=20&$skip=0&$sort[createdAt]=-1',
    )
    expect(toQueryString(vodListQuery({ title: 'a', game: 'b' }))).toBe('?title[$iLike]=%25a%25&chapters[name]=b&$limit=20&$skip=0&$sort[createdAt]=-1')
  })

  it('escapes LIKE wildcards in title searches', () => {
    expect(vodListQuery({ title: '100%_done' }).title).toEqual({ $iLike: '%100\\%\\_done%' })
  })

  it('encodes values that could break the query string', () => {
    expect(toQueryString({ title: 'a&b=c#d' })).toBe('?title=a%26b%3Dc%23d')
  })
})
