import { describe, expect, it } from 'vitest'
import { TelegramConverter } from '../TelegramConverter'

function createEntity(type: 'mention' | 'text_mention', offset: number, length: number, params?: any) {
  return {
    offset,
    length,
    params: params || {},
    is: (query: string) => query === type,
  }
}

describe('telegramConverter', () => {
  it('converts reply and mention entities', () => {
    const converter = new TelegramConverter()
    const tgMsg: any = {
      id: 10,
      text: 'hi @bob',
      entities: [createEntity('mention', 3, 4)],
      replyToMessage: {
        id: 9,
        sender: { id: 42, displayName: 'Alice' },
        text: 'quoted',
      },
      sender: { id: 7, displayName: 'Me' },
      chat: { id: 100, type: 'private' },
      date: new Date(1700000000000),
    }

    const result = converter.fromTelegram(tgMsg)

    expect(result.sender).toEqual({ id: '7', name: 'Me' })
    expect(result.chat).toEqual({ id: '100', type: 'private' })
    expect(result.content).toEqual([
      {
        type: 'reply',
        data: {
          messageId: '9',
          senderId: '42',
          senderName: 'Alice',
          text: 'quoted',
        },
      },
      { type: 'text', data: { text: 'hi ' } },
      { type: 'at', data: { userId: 'bob', userName: 'bob' } },
    ])
  })

  it('converts text_mention entities and appends tail text', () => {
    const converter = new TelegramConverter()
    const tgMsg: any = {
      id: 11,
      text: '@ann hello',
      entities: [createEntity('text_mention', 0, 4, { userId: 55 })],
      sender: { id: 7, displayName: 'Me' },
      chat: { id: 200, type: 'group' },
      date: new Date(1700000000001),
    }

    const result = converter.fromTelegram(tgMsg)

    expect(result.chat).toEqual({ id: '200', type: 'group' })
    expect(result.content).toEqual([
      { type: 'at', data: { userId: '55', userName: '@ann' } },
      { type: 'text', data: { text: ' hello' } },
    ])
  })

  it('converts media types', () => {
    const converter = new TelegramConverter()
    const photoMsg: any = {
      id: 1,
      text: '',
      media: { type: 'photo' },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'group' },
      date: new Date(1700000000002),
    }
    const docGifMsg: any = {
      id: 2,
      text: '',
      media: { type: 'document', mimeType: 'image/gif' },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'group' },
      date: new Date(1700000000003),
    }
    const docFileMsg: any = {
      id: 3,
      text: '',
      media: { type: 'document', fileName: 'a.txt', fileSize: 12 },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'group' },
      date: new Date(1700000000004),
    }
    const stickerMsg: any = {
      id: 4,
      text: '',
      media: { type: 'sticker' },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'group' },
      date: new Date(1700000000005),
    }

    expect(converter.fromTelegram(photoMsg).content[0].type).toBe('image')
    expect(converter.fromTelegram(docGifMsg).content[0]).toEqual({
      type: 'image',
      data: { file: docGifMsg.media, isSpoiler: false },
    })
    expect(converter.fromTelegram(docFileMsg).content[0]).toEqual({
      type: 'file',
      data: { file: docFileMsg.media, filename: 'a.txt', size: 12 },
    })
    expect(converter.fromTelegram(stickerMsg).content[0].type).toBe('image')
  })

  it('converts video, voice, and audio media types', () => {
    // Wait, the test uses TelegramConverter. New test should use it too.
    const tc = new TelegramConverter()

    const videoMsg: any = {
      id: 5,
      media: { type: 'video', duration: 10 },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'private' },
      date: new Date(1700000000000),
    }

    const voiceMsg: any = {
      id: 6,
      media: { type: 'voice', duration: 5 },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'private' },
      date: new Date(1700000000000),
    }

    const audioMsg: any = {
      id: 7,
      media: { type: 'audio', duration: 100 },
      sender: { id: 1, displayName: 'User' },
      chat: { id: 1, type: 'private' },
      date: new Date(1700000000000),
    }

    const videoRes = tc.fromTelegram(videoMsg)
    expect(videoRes.content[0]).toEqual({
      type: 'video',
      data: { file: videoMsg.media, duration: 10 },
    })

    const voiceRes = tc.fromTelegram(voiceMsg)
    expect(voiceRes.content[0]).toEqual({
      type: 'audio',
      data: { file: voiceMsg.media, duration: 5 },
    })

    const audioRes = tc.fromTelegram(audioMsg)
    expect(audioRes.content[0]).toEqual({
      type: 'audio',
      data: { file: audioMsg.media, duration: 100 },
    })
  })

  it('handles empty text and unknown sender in reply', () => {
    const converter = new TelegramConverter()
    const msg: any = {
      id: 8,
      text: undefined, // empty text
      replyToMessage: {
        id: 7,
        // sender missing
        text: 'hello',
      },
      sender: undefined, // unknown sender
      chat: { id: 1, type: 'group' },
      date: new Date(1700000000000),
    }

    const res = converter.fromTelegram(msg)

    expect(res.sender.id).toBe('unknown')
    expect(res.content[0]).toEqual({
      type: 'reply',
      data: {
        messageId: '7',
        senderId: '', // should default to empty string
        senderName: 'Unknown',
        text: 'hello',
      },
    })
    // Should not have text content
    expect(res.content.length).toBe(1)
  })

  it('handles complex text entity overlapping/cursors', () => {
    const converter = new TelegramConverter()
    // Text: "Hello @user world"
    // Entities: [6, 5] -> @user (mention)
    const msg: any = {
      id: 9,
      text: 'Hello @user world',
      entities: [createEntity('mention', 6, 5)],
      chat: { id: 1 },
      date: new Date(1700000000000),
    }

    const res = converter.fromTelegram(msg)
    expect(res.content).toEqual([
      { type: 'text', data: { text: 'Hello ' } },
      { type: 'at', data: { userId: 'user', userName: 'user' } },
      { type: 'text', data: { text: ' world' } },
    ])

    // Edge case: Entity at start
    const msgStart: any = {
      id: 10,
      text: '@user hi',
      entities: [createEntity('mention', 0, 5)],
      chat: { id: 1 },
      date: new Date(1700000000000),
    }
    const resStart = converter.fromTelegram(msgStart)
    expect(resStart.content).toEqual([
      { type: 'at', data: { userId: 'user', userName: 'user' } },
      { type: 'text', data: { text: ' hi' } },
    ])
  })
  it('converts plain text without entities', () => {
    const converter = new TelegramConverter()
    const msg: any = {
      id: 11,
      text: 'Just plain text',
      // entities undefined or empty
      sender: { id: 1 },
      chat: { id: 1 },
      date: new Date(),
    }
    const res = converter.fromTelegram(msg)
    expect(res.content).toEqual([{ type: 'text', data: { text: 'Just plain text' } }])
  })

  it('sorts entities by offset', () => {
    const converter = new TelegramConverter()
    const msg: any = {
      id: 12,
      text: 'A B C',
      entities: [
        createEntity('mention', 4, 1), // "C"
        createEntity('mention', 0, 1), // "A"
      ],
      chat: { id: 1 },
      date: new Date(),
    }
    const res = converter.fromTelegram(msg)
    expect(res.content[0].data.userId).toBe('A')
    expect(res.content[2].data.userId).toBe('C')
  })
})
