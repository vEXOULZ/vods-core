import { EmoteSet, tokenize, type EmoteToken } from '../../src/index'
import { describe, expect, it } from 'vitest'
import { emoteMenuRows } from '../../src/app/lib/emoteMenu'

const set = new EmoteSet()
  .add('7tv', [
    { id: 'pc', code: 'POGCRAZY', flags: 0 },
    { id: 'pp', code: 'PETPET', flags: 1 },
  ])
  .add('ffz', [
    { id: 1, code: 'PagMan' },
    { id: 2, code: 'ffzX' },
  ])
  .add('bttv', [{ id: 'bw', code: 'w!' }])
const all = { '7tv': true, bttv: true, ffz: true }
const token = (text: string) => tokenize([{ text }], set)[0] as EmoteToken
const show = (text: string, enabled = all) => emoteMenuRows(token(text), enabled).map((r) => [r.code, r.provider, r.href, r.effect])

describe('emote menu', () => {
  it('lists the emote, the zero-width emotes over it and each one\'s modifiers, in order, with their pages', () => {
    expect(show('w! PagMan ffzX PETPET')).toEqual([
      ['PagMan', 'FFZ', 'https://www.frankerfacez.com/emoticon/1', undefined],
      ['w!', 'BTTV', 'https://betterttv.com/emotes/bw', 'wide'],
      ['ffzX', 'FFZ', 'https://www.frankerfacez.com/emoticon/2', 'flipX'],
      ['PETPET', '7TV', 'https://7tv.app/emotes/pp', undefined],
    ])
  })

  it('leaves out what a turned-off provider shows as text', () => {
    expect(show('w! PagMan ffzX PETPET', { '7tv': true, bttv: false, ffz: false })).toEqual([['PETPET', '7TV', 'https://7tv.app/emotes/pp', undefined]])
  })

  it('has no link for Twitch emotes', () => {
    const t = tokenize([{ text: 'vexoulNod', emote: { emoteID: 'emotesv2_x' } }, { text: ' PETPET' }], set)[0] as EmoteToken
    expect(emoteMenuRows(t, all).map((r) => [r.code, r.provider, r.href])).toEqual([
      ['vexoulNod', 'Twitch', null],
      ['PETPET', '7TV', 'https://7tv.app/emotes/pp'],
    ])
  })
})
