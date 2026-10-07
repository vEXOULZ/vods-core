import { describe, expect, it } from 'vitest'
import { chatName } from '@vexoulz/platform-web/chat'
import { chatSourceFor, readSaved, WIDTH_DEFAULT } from '../../src/app/composables/useChatSettings'

describe('chatSourceFor', () => {
  it('asks for the choice as is until the VOD says which chats it has', () => {
    expect(chatSourceFor('bot', null)).toBe('bot')
    expect(chatSourceFor('auto', { replay: 0, bot: 5 })).toBe('auto')
  })

  it('falls back to the other chat only when the choice has none and the other has some', () => {
    expect(chatSourceFor('bot', { replay: 10, bot: 0 })).toBe('replay')
    expect(chatSourceFor('replay', { replay: 0, bot: 3 })).toBe('bot')
    expect(chatSourceFor('bot', { replay: 0, bot: 0 })).toBe('bot')
    expect(chatSourceFor('replay', { replay: 4, bot: 9 })).toBe('replay')
  })
})

// The site's name setting relies on the library's rule; checked here because the setting is the site's.
describe('chatName', () => {
  it('shows the display name, the username, or both', () => {
    expect(chatName('Chat_Er', 'chat_er', 'display')).toEqual({ name: 'Chat_Er', login: null })
    expect(chatName('Chat_Er', 'chat_er', 'login')).toEqual({ name: 'chat_er', login: null })
    expect(chatName('チャット', 'chatter', 'both')).toEqual({ name: 'チャット', login: 'chatter' })
  })

  it('leaves the username out of "both" when unknown or only differing in case', () => {
    expect(chatName('Vexoulz', 'vexoulz', 'both')).toEqual({ name: 'Vexoulz', login: null })
    expect(chatName('チャット', null, 'both')).toEqual({ name: 'チャット', login: null })
    expect(chatName('チャット', null, 'login')).toEqual({ name: 'チャット', login: null })
  })
})

describe('readSaved', () => {
  const from = (store: Record<string, unknown>) => (key: string) => (key in store ? JSON.stringify(store[key]) : null)

  it('starts on the live recording at the default pixel width', () => {
    const s = readSaved(from({}))
    expect(s.source).toBe('bot')
    expect(s.width).toBe(WIDTH_DEFAULT)
  })

  it("keeps older saves' choices but not their percentage width", () => {
    const s = readSaved(from({ 'vods.chat.v2': { width: 30, source: 'replay', names: 'both', timestamps: true } }))
    expect(s).toMatchObject({ width: WIDTH_DEFAULT, source: 'replay', names: 'both', timestamps: true })
    expect(readSaved(from({ 'vods.chat.v2': { source: 'auto' } })).source).toBe('bot')
  })

  it('keeps and clamps a pixel width', () => {
    expect(readSaved(from({ 'vods.chat.v3': { width: 500 } })).width).toBe(500)
    expect(readSaved(from({ 'vods.chat.v3': { width: 5000 } })).width).toBe(720)
  })
})
