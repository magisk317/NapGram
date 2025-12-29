import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnifiedConverter } from '../UnifiedConverter'

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

const envMock = vi.hoisted(() => ({
  DATA_DIR: '/data',
  INTERNAL_WEB_ENDPOINT: 'http://internal',
  LOG_LEVEL: 'info',
  LOG_FILE_LEVEL: 'off',
  LOG_FILE: '/tmp/napgram/test.log',
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: fsMocks.existsSync,
    mkdirSync: fsMocks.mkdirSync,
    createWriteStream: fsMocks.createWriteStream,
    default: {
      ...actual,
      existsSync: fsMocks.existsSync,
      mkdirSync: fsMocks.mkdirSync,
      createWriteStream: fsMocks.createWriteStream,
    },
  }
})

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    mkdir: fsMocks.mkdir,
    writeFile: fsMocks.writeFile,
    default: {
      ...actual,
      mkdir: fsMocks.mkdir,
      writeFile: fsMocks.writeFile,
    },
  }
})

vi.mock('../../../models/env', () => ({
  default: envMock,
}))

describe('unifiedConverter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)
  })

  it('converts text, numeric at, and reply segments', async () => {
    const converter = new UnifiedConverter()
    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [
        { type: 'text', data: { text: 'hi' } },
        { type: 'at', data: { userId: '123' } },
        { type: 'reply', data: { id: '9' } },
      ],
      timestamp: 1,
    })

    expect(result).toEqual([
      { type: 'text', data: { text: 'hi' } },
      { type: 'at', data: { qq: '123' } },
      { type: 'reply', data: { id: '9' } },
    ])
  })

  it('converts non-numeric at to text fallback', async () => {
    const converter = new UnifiedConverter()
    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [
        { type: 'at', data: { userId: 'bob', userName: 'Bob' } },
      ],
      timestamp: 1,
    })

    expect(result).toEqual([
      { type: 'text', data: { text: '@Bob' } },
    ])
  })

  it('saves buffer to shared dir when available', async () => {
    fsMocks.existsSync.mockReturnValue(true)
    const expectedName = `image-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`

    const converter = new UnifiedConverter()
    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [
        { type: 'image', data: { file: Buffer.from('img') } },
      ],
      timestamp: 1,
    })

    expect(fsMocks.mkdir).toHaveBeenCalledWith('/app/.config/QQ/temp_napgram_share', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(`/app/.config/QQ/temp_napgram_share/${expectedName}`, expect.any(Buffer))
    expect(result).toEqual([
      {
        type: 'image',
        data: { file: `/app/.config/QQ/temp_napgram_share/${expectedName}`, sub_type: '0' },
      },
    ])
  })

  it('falls back to temp url when shared dir missing', async () => {
    fsMocks.existsSync.mockReturnValue(false)

    const converter = new UnifiedConverter()
    const result = await converter.toNapCat({
      id: '1',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [
        { type: 'file', data: { file: Buffer.from('file'), filename: 'doc.txt' } },
      ],
      timestamp: 1,
    })

    expect(fsMocks.mkdir).toHaveBeenCalledWith('/data/temp', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith('/data/temp/doc.txt', expect.any(Buffer))
    expect(result).toEqual([
      { type: 'file', data: { file: 'http://internal/temp/doc.txt', name: 'doc.txt' } },
    ])
  })

  it('converts to telegram with text and media separation', () => {
    const converter = new UnifiedConverter()
    const result = converter.toTelegram({
      id: '1',
      platform: 'qq',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [
        { type: 'text', data: { text: 'hello' } },
        { type: 'text', data: { text: ' world' } },
        { type: 'image', data: { url: 'https://img' } },
      ],
      timestamp: 1,
    })

    expect(result).toEqual({
      message: 'hello world',
      media: [{ type: 'image', data: { url: 'https://img' } }],
    })
  })
  it('converts additional media types (video, audio, sticker) and handles buffering', async () => {
    fsMocks.existsSync.mockReturnValue(true)
    const converter = new UnifiedConverter()

    // Video with buffer
    const videoRes = await converter.toNapCat({
      id: '2',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [{ type: 'video', data: { file: Buffer.from('vid'), isSpoiler: true } }], // isSpoiler ignored for video?
      timestamp: 1,
    })
    expect(videoRes[0].type).toBe('video')
    // Should call saveBufferToTemp -> mocked to return path
    // We can just check structure
    expect(videoRes[0].data).toHaveProperty('file')

    // Audio with buffer
    const audioRes = await converter.toNapCat({
      id: '3',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [{ type: 'audio', data: { file: Buffer.from('aud') } }],
      timestamp: 1,
    })
    expect(audioRes[0].type).toBe('record')

    // Sticker (url)
    const stickerRes = await converter.toNapCat({
      id: '4',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [{ type: 'sticker', data: { url: 'http://sticker' } }],
      timestamp: 1,
    })
    expect(stickerRes[0]).toEqual({
      type: 'image',
      data: { file: 'http://sticker' },
    })
  })

  it('handles spoiler image', async () => {
    const converter = new UnifiedConverter()
    const result = await converter.toNapCat({
      id: '5',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [{ type: 'image', data: { url: 'http://img', isSpoiler: true } }],
      timestamp: 1,
    })
    expect(result[0].data.sub_type).toBe('7') // 7 = spoiler in NapCat logic? Reference implementation says yes.
  })

  it('handles saveBufferToTemp error and returns undefined? No, it returns undefined implicitly on catch', async () => {
    // If catch block is hit, function returns undefined (void) but type is Promise<string>.
    // This might be a bug in implementation or implied.
    // Let's check implementation: catch(e) { logger.warn... } - no return.
    // So it returns undefined.
    // But verify usage: file = await saveBufferToTemp...; segments.push({ data: { file } })
    // If it returns undefined, file is undefined.

    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.mkdir.mockRejectedValueOnce(new Error('Permission denied'))

    const converter = new UnifiedConverter()
    const result = await converter.toNapCat({
      id: '6',
      platform: 'telegram',
      sender: { id: 'u', name: 'User' },
      chat: { id: 'c', type: 'group' },
      content: [{ type: 'image', data: { file: Buffer.from('fail') } }],
      timestamp: 1,
    })

    // It should recover and use fallback
    expect(result[0].data.file).toEqual(expect.stringContaining('http://internal/temp/'))
  })
})
