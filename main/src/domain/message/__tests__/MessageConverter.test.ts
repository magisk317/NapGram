import type { UnifiedMessage } from '../converter'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageConverter } from '../converter'

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}))

const envMock = vi.hoisted(() => ({
  DATA_DIR: '/data',
  INTERNAL_WEB_ENDPOINT: 'http://internal',
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const fileTypeMock = vi.hoisted(() => ({
  fileTypeFromBuffer: vi.fn(),
}))

const imageJsMocks = vi.hoisted(() => ({
  decode: vi.fn(),
  encode: vi.fn(),
}))

const convertMocks = vi.hoisted(() => ({
  tgs2gif: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: { existsSync: fsMocks.existsSync },
  existsSync: fsMocks.existsSync,
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: fsMocks.mkdir,
    writeFile: fsMocks.writeFile,
    readFile: fsMocks.readFile,
  },
  mkdir: fsMocks.mkdir,
  writeFile: fsMocks.writeFile,
  readFile: fsMocks.readFile,
}))

vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeMock.fileTypeFromBuffer,
}))

vi.mock('image-js', () => ({
  decode: imageJsMocks.decode,
  encode: imageJsMocks.encode,
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../../../shared/utils/convert', () => ({
  default: convertMocks,
}))

vi.mock('../../models/env', () => ({
  default: envMock,
}))

describe('messageConverter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    fsMocks.existsSync.mockReturnValue(true)
  })

  const buildTelegram = (overrides: Record<string, any> = {}): any => ({
    id: 1,
    text: '',
    sender: { id: 1, displayName: 'User' },
    chat: { id: 2, type: 'group', title: 'Group' },
    date: new Date('2020-01-01T00:00:00+00:00'),
    ...overrides,
  })

  const buildUnified = (content: any[]): UnifiedMessage => ({
    id: '1',
    platform: 'telegram',
    sender: { id: '1', name: 'User' },
    chat: { id: '2', type: 'group' },
    content,
    timestamp: 1,
  })

  it('converts Telegram gif document and reply', () => {
    const converter = new MessageConverter()
    const tgMsg: any = {
      id: 10,
      text: 'hello',
      media: {
        type: 'document',
        mimeType: 'image/gif',
        fileName: 'anim.gif',
        fileSize: 123,
      },
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 2, type: 'group', title: 'Group' },
      date: new Date('2020-01-01T00:00:00Z'),
      replyToMessage: {
        id: 9,
        sender: { id: 3, displayName: 'Bob' },
        chat: { id: 2, title: 'Group' },
        text: 'reply',
      },
    }

    const result = converter.fromTelegram(tgMsg)

    expect(result.content.map(item => item.type)).toEqual(['text', 'image', 'reply'])
    expect(result.content[1].data.file).toBe(tgMsg.media)
    expect(result.content[2].data.messageId).toBe('9')
    expect(result.sender.id).toBe('1')
    expect(result.chat.type).toBe('group')
  })

  it('converts Telegram location media', () => {
    const converter = new MessageConverter()
    const tgMsg: any = {
      id: 11,
      text: '',
      media: {
        type: 'location',
        lat: 22.3,
        lng: 114.1,
        title: 'Harbor',
        address: 'Somewhere',
      },
      sender: { id: 2, displayName: 'User' },
      chat: { id: 3, type: 'private' },
      date: new Date('2020-01-02T00:00:00Z'),
    }

    const result = converter.fromTelegram(tgMsg)

    expect(result.content).toEqual([
      {
        type: 'location',
        data: {
          latitude: 22.3,
          longitude: 114.1,
          title: 'Harbor',
          address: 'Somewhere',
        },
      },
    ])
  })

  it('converts Telegram video media', () => {
    const converter = new MessageConverter()
    const tgMsg: any = {
      id: 12,
      text: '',
      media: {
        type: 'video',
        duration: 42,
      },
      sender: { id: 4, displayName: 'User' },
      chat: { id: 5, type: 'group', title: 'Chat' },
      date: new Date('2020-01-03T00:00:00Z'),
    }

    const result = converter.fromTelegram(tgMsg)

    expect(result.content).toEqual([
      {
        type: 'video',
        data: {
          file: tgMsg.media,
          duration: 42,
        },
      },
    ])
  })

  it.each([
    {
      label: 'photo',
      media: { type: 'photo' },
      assert: (item: any, media: any) => {
        expect(item.type).toBe('image')
        expect(item.data.file).toBe(media)
      },
    },
    {
      label: 'voice',
      media: { type: 'voice', duration: 12 },
      assert: (item: any, media: any) => {
        expect(item.type).toBe('audio')
        expect(item.data.duration).toBe(12)
        expect(item.data.file).toBe(media)
      },
    },
    {
      label: 'audio',
      media: { type: 'audio', duration: 8 },
      assert: (item: any, media: any) => {
        expect(item.type).toBe('audio')
        expect(item.data.duration).toBe(8)
        expect(item.data.file).toBe(media)
      },
    },
    {
      label: 'document',
      media: { type: 'document', mimeType: 'application/pdf', fileSize: 22 },
      assert: (item: any, media: any) => {
        expect(item.type).toBe('file')
        expect(item.data.file).toBe(media)
        expect(item.data.filename).toBe('file')
        expect(item.data.size).toBe(22)
      },
    },
    {
      label: 'sticker',
      media: { type: 'sticker', mimeType: 'image/webp' },
      assert: (item: any, media: any) => {
        expect(item.type).toBe('image')
        expect(item.data.file).toBe(media)
        expect(item.data.mimeType).toBe('image/webp')
        expect(item.data.isSticker).toBe(true)
      },
    },
    {
      label: 'dice',
      media: { type: 'dice', value: 6 },
      assert: (item: any) => {
        expect(item.type).toBe('dice')
        expect(item.data.value).toBe(6)
        expect(item.data.emoji).toBe('🎲')
      },
    },
  ])('converts Telegram $label media', ({ media, assert }) => {
    const converter = new MessageConverter()
    const tgMsg = buildTelegram({ media })

    const result = converter.fromTelegram(tgMsg)

    expect(result.content).toHaveLength(1)
    assert(result.content[0], media)
  })

  it('converts Telegram location payload without media', () => {
    const converter = new MessageConverter()
    const tgMsg = buildTelegram({
      location: {
        latitude: 30,
        longitude: 120,
        title: 'Spot',
        address: 'Addr',
      },
    })

    const result = converter.fromTelegram(tgMsg)

    expect(result.content).toEqual([
      {
        type: 'location',
        data: {
          latitude: 30,
          longitude: 120,
          title: 'Spot',
          address: 'Addr',
        },
      },
    ])
  })

  it('uses replied message override when provided', () => {
    const converter = new MessageConverter()
    const tgMsg = buildTelegram({ text: 'Hi' })
    const replied = {
      id: 9,
      sender: { id: 7, displayName: 'Bob' },
      chat: { id: 2, title: 'Group' },
      text: 'Reply',
    }

    const result = converter.fromTelegram(tgMsg, replied as any)

    expect(result.content.map(item => item.type)).toEqual(['text', 'reply'])
    expect(result.content[1].data.messageId).toBe('9')
    expect(result.content[1].data.senderName).toBe('Bob')
  })

  it('handles replyTo id without reply message', () => {
    const converter = new MessageConverter()
    const tgMsg = buildTelegram({ text: 'Hello', replyTo: 123 })

    const result = converter.fromTelegram(tgMsg)

    expect(result.content).toEqual([{ type: 'text', data: { text: 'Hello' } }])
  })

  it('converts unified message to Telegram payload', () => {
    const converter = new MessageConverter()
    const payload = converter.toTelegram(buildUnified([
      { type: 'text', data: { text: 'Hello' } },
      { type: 'image', data: { url: 'https://example.com/a.jpg' } },
    ]))

    expect(payload.message).toBe('Hello')
    expect(payload.media).toEqual([{ type: 'image', data: { url: 'https://example.com/a.jpg' } }])
  })

  it('adds fallback text when sticker media needs instance', async () => {
    const converter = new MessageConverter()
    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'User' },
      chat: { id: '2', type: 'group' },
      content: [
        {
          type: 'image',
          data: {
            file: { type: 'sticker' },
            isSticker: true,
          },
        },
      ],
      timestamp: 1,
    })

    expect(result).toEqual([
      { type: 'text', data: { text: '[贴纸下载失败:未初始化]' } },
    ])
  })

  it('converts sticker buffer to png and saves to shared dir', async () => {
    const converter = new MessageConverter()
    const pngBuffer = Buffer.from('png')
    fileTypeMock.fileTypeFromBuffer.mockResolvedValue({ ext: 'webp' })
    const dummyImage = { width: 100 }
    imageJsMocks.decode.mockReturnValue(dummyImage)
    imageJsMocks.encode.mockReturnValue(new Uint8Array(pngBuffer)) // encode returns Uint8Array
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'User' },
      chat: { id: '2', type: 'group' },
      content: [
        {
          type: 'image',
          data: {
            file: Buffer.from([0x89, 0x50]),
            isSticker: true,
            mimeType: 'image/webp',
          },
        },
      ],
      timestamp: 1,
    })

    const expectedName = `image-${Date.now()}-${Math.random().toString(16).slice(2)}.png`
    expect(fsMocks.mkdir).toHaveBeenCalledWith('/app/.config/QQ/temp_napgram_share', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(`/app/.config/QQ/temp_napgram_share/${expectedName}`, pngBuffer)
    expect(result).toEqual([
      {
        type: 'image',
        data: { file: `/app/.config/QQ/temp_napgram_share/${expectedName}`, sub_type: '0' },
      },
    ])
  })

  it('falls back to internal url when shared dir missing', async () => {
    const converter = new MessageConverter()
    fsMocks.existsSync.mockReturnValue(false)
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'User' },
      chat: { id: '2', type: 'group' },
      content: [
        {
          type: 'audio',
          data: {
            file: Buffer.from('audio'),
          },
        },
      ],
      timestamp: 1,
    })

    const expectedName = `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`
    expect(fsMocks.mkdir).toHaveBeenCalledWith('/data/temp', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(`/data/temp/${expectedName}`, expect.any(Buffer))
    expect(result).toEqual([
      {
        type: 'record',
        data: { file: `http://internal/temp/${expectedName}` },
      },
    ])
  })

  it('falls back to temp url when shared dir write fails', async () => {
    const converter = new MessageConverter()
    fsMocks.mkdir.mockRejectedValueOnce(new Error('mkdir fail')).mockResolvedValueOnce(undefined)
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.4)

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'audio',
        data: { file: Buffer.from('audio') },
      },
    ]))

    const expectedName = `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`
    expect(fsMocks.writeFile).toHaveBeenCalledWith(`/data/temp/${expectedName}`, expect.any(Buffer))
    expect(result).toEqual([
      {
        type: 'record',
        data: { file: `http://internal/temp/${expectedName}` },
      },
    ])
  })

  it('downloads sticker media when instance is available', async () => {
    const converter = new MessageConverter()
    const downloadMedia = vi.fn().mockResolvedValue(Buffer.from([0x11, 0x22]))
    converter.setInstance({ tgBot: { downloadMedia } } as any)
    fileTypeMock.fileTypeFromBuffer.mockResolvedValue({ ext: 'webp' })
    imageJsMocks.decode.mockReturnValue({})
    imageJsMocks.encode.mockReturnValue(new Uint8Array(Buffer.from('png')))

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: { type: 'sticker' },
          isSticker: true,
        },
      },
    ]))

    expect(downloadMedia).toHaveBeenCalled()
    expect(result[0].type).toBe('image')
  })

  it('handles empty sticker download buffer', async () => {
    const converter = new MessageConverter()
    converter.setInstance({ tgBot: { downloadMedia: vi.fn().mockResolvedValue(Buffer.alloc(0)) } } as any)

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: { type: 'sticker' },
          isSticker: true,
        },
      },
    ]))

    expect(result).toEqual([{ type: 'text', data: { text: '[贴纸下载为空]' } }])
  })

  it('handles sticker download failure', async () => {
    const converter = new MessageConverter()
    converter.setInstance({ tgBot: { downloadMedia: vi.fn().mockRejectedValue(new Error('fail')) } } as any)

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: { type: 'sticker' },
          isSticker: true,
        },
      },
    ]))

    expect(result).toEqual([{ type: 'text', data: { text: '[贴纸下载失败]' } }])
  })

  it('handles fileTypeFromBuffer errors for non-sticker images', async () => {
    const converter = new MessageConverter()
    fileTypeMock.fileTypeFromBuffer.mockRejectedValueOnce(new Error('bad'))
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.2)

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: Buffer.from([0x01, 0x02]),
        },
      },
    ]))

    expect(result[0].data.file.endsWith('.jpg')).toBe(true)
  })

  it.each([
    { mimeType: 'image/webp', ext: '.webp' },
    { mimeType: 'image/png', ext: '.png' },
  ])('uses mimeType extension for %s images', async ({ mimeType, ext }) => {
    const converter = new MessageConverter()
    fileTypeMock.fileTypeFromBuffer.mockResolvedValue({ ext: 'jpg' })

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: Buffer.from([0x01, 0x02]),
          mimeType,
        },
      },
    ]))

    expect(result[0].data.file.endsWith(ext)).toBe(true)
  })

  it('uses detected extension when mimeType is missing', async () => {
    const converter = new MessageConverter()
    fileTypeMock.fileTypeFromBuffer.mockResolvedValue({ ext: 'gif' })

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: Buffer.from([0x01, 0x02]),
        },
      },
    ]))

    expect(result[0].data.file.endsWith('.gif')).toBe(true)
  })

  it('converts TGS sticker buffers to GIF', async () => {
    const converter = new MessageConverter()
    convertMocks.tgs2gif.mockResolvedValue('/tmp/sticker.gif')
    fsMocks.readFile.mockResolvedValue(Buffer.from('gif'))
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.3)

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: Buffer.from([0x1F, 0x8B, 0x08]),
          isSticker: true,
        },
      },
    ]))

    expect(convertMocks.tgs2gif).toHaveBeenCalled()
    expect(fsMocks.readFile).toHaveBeenCalledWith('/tmp/sticker.gif')
    expect(result[0].data.file.endsWith('.gif')).toBe(true)
  })

  it('handles TGS conversion failure', async () => {
    const converter = new MessageConverter()
    convertMocks.tgs2gif.mockRejectedValue(new Error('boom'))

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: Buffer.from([0x1F, 0x8B, 0x08]),
          isSticker: true,
        },
      },
    ]))

    expect(result).toEqual([{ type: 'text', data: { text: '[动画贴纸转换失败]' } }])
  })

  it('falls back to text when sticker conversion fails', async () => {
    const converter = new MessageConverter()
    imageJsMocks.decode.mockImplementation(() => {
      throw new Error('bad')
    })

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'image',
        data: {
          file: Buffer.from([0x01, 0x02]),
          isSticker: true,
        },
      },
    ]))

    expect(result).toEqual([{ type: 'text', data: { text: '[贴纸]' } }])
  })

  it('converts video buffers to napcat segments', async () => {
    const converter = new MessageConverter()

    const result = await converter.toNapCat(buildUnified([
      {
        type: 'video',
        data: {
          file: Buffer.from('video'),
        },
      },
    ]))

    expect(result[0].type).toBe('video')
    expect(result[0].data.file.endsWith('.mp4')).toBe(true)
  })

  it('converts file buffer into napcat file segment', async () => {
    const converter = new MessageConverter()
    const buffer = Buffer.from('payload')

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'User' },
      chat: { id: '2', type: 'group' },
      content: [
        {
          type: 'file',
          data: {
            file: buffer,
            filename: 'note.txt',
          },
        },
      ],
      timestamp: 1,
    })

    expect(fsMocks.mkdir).toHaveBeenCalledWith('/app/.config/QQ/temp_napgram_share', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith('/app/.config/QQ/temp_napgram_share/note.txt', buffer)
    expect(result).toEqual([
      {
        type: 'file',
        data: {
          file: '/app/.config/QQ/temp_napgram_share/note.txt',
          name: 'note.txt',
        },
      },
    ])
  })

  it('converts sticker content into image segment', async () => {
    const converter = new MessageConverter()

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'User' },
      chat: { id: '2', type: 'group' },
      content: [
        {
          type: 'sticker',
          data: {
            url: 'https://example.com/sticker.webp',
          },
        },
      ],
      timestamp: 1,
    })

    expect(result).toEqual([
      {
        type: 'image',
        data: { file: 'https://example.com/sticker.webp' },
      },
    ])
  })

  it('builds location json and dice/at/reply segments', async () => {
    const converter = new MessageConverter()
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '5', name: 'User' },
      chat: { id: '9', type: 'group' },
      content: [
        {
          type: 'location',
          data: {
            latitude: 1,
            longitude: 2,
            title: 'Loc',
            address: 'Addr',
          },
        },
        {
          type: 'dice',
          data: { emoji: '🎲' },
        },
        {
          type: 'at',
          data: { targetId: '123' },
        },
        {
          type: 'reply',
          data: { messageId: '9' },
        },
      ],
      timestamp: 1,
    })

    expect(result[0].type).toBe('json')
    const json = JSON.parse(result[0].data.data)
    expect(json.meta['Location.Search'].lat).toBe('1')
    expect(json.meta['Location.Search'].lng).toBe('2')
    expect(json.meta['Location.Search'].from_account).toBe(5)
    expect(json.meta['Location.Search'].uint64_peer_account).toBe(9)
    expect(result[1]).toEqual({
      type: 'text',
      data: { text: '[位置]Loc\nAddr\nhttps://maps.google.com/?q=1,2' },
    })
    expect(result[2]).toEqual({ type: 'dice', data: { result: 1, emoji: '🎲' } })
    expect(result[3]).toEqual({ type: 'at', data: { qq: '123' } })
    expect(result[4]).toEqual({ type: 'reply', data: { id: '9' } })
  })

  it('falls back to location segment when coords are missing', async () => {
    const converter = new MessageConverter()

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '5', name: 'User' },
      chat: { id: '9', type: 'group' },
      content: [
        {
          type: 'location',
          data: {
            title: 'NoCoords',
            address: 'Addr',
          },
        },
      ],
      timestamp: 1,
    })

    expect(result[0]).toEqual({
      type: 'location',
      data: {
        lat: undefined,
        lng: undefined,
        title: 'NoCoords',
        address: 'Addr',
      },
    })
    expect(result[1]).toEqual({
      type: 'text',
      data: { text: '[位置]NoCoords\nAddr' },
    })
  })

  it('falls back to location segment when json serialization fails', async () => {
    const converter = new MessageConverter()
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new Error('boom')
    })

    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: '5', name: 'User' },
      chat: { id: '9', type: 'group' },
      content: [
        {
          type: 'location',
          data: {
            latitude: 1,
            longitude: 2,
            title: 'Loc',
            address: 'Addr',
          },
        },
      ],
      timestamp: 1,
    })

    expect(result[0].type).toBe('location')
    expect(result[0].data.title).toBe('Loc')
    expect(result[1].type).toBe('text')
    stringifySpy.mockRestore()
  })
})
