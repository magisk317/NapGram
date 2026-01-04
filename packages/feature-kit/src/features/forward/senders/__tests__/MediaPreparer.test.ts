import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { silk } from '../../../../shared-types'
import { ForwardMediaPreparer } from '../MediaPreparer'

vi.mock('@napgram/media-kit', () => ({
  silk: {
    encode: vi.fn(),
    decode: vi.fn(),
  },
}))

vi.mock('@napgram/infra-kit', () => ({
  db: {
    message: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    forwardPair: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    forwardMultiple: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    qqRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn()
  },
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080'
  },
  hashing: { md5Hex: vi.fn((value: string) => value) },
  temp: { TEMP_PATH: '/tmp', createTempFile: vi.fn(() => ({ path: '/tmp/test', cleanup: vi.fn() })) },
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  })),
  configureInfraKit: vi.fn(),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
}))

describe('forwardMediaPreparer', () => {
  const mockInstance = {
    tgBot: {
      downloadMedia: vi.fn(),
      downloadMediaToTempFile: vi.fn(),
    },
  } as any
  const mockMediaFeature = {
    downloadMedia: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('dummy'))
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 100 } as any)
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  it('prepareMediaForQQ skip sticker', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'image', data: { isSticker: true, file: 'sticker' } }],
    }
    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].data.file).toBe('sticker')
  })

  it('prepareMediaForQQ handles image/video', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [
        { type: 'image', data: { file: 'img.jpg' } },
        { type: 'video', data: { file: 'vid.mp4' } },
      ],
    }
    vi.spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue('path/to/file')
    vi.spyOn(preparer, 'ensureFilePath').mockResolvedValue('http://example.com/file')

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].data.file).toBe('http://example.com/file')
  })

  it('prepareMediaForQQ handles audio with silk encoding', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'audio', data: { file: 'aud.ogg' } }],
    }
    vi.spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue('path/to/aud.ogg')
    vi.spyOn(preparer, 'ensureFilePath')
      .mockResolvedValueOnce('path/to/aud.ogg') // first call inside audio block
      .mockResolvedValueOnce('http://example.com/aud.silk') // second call after encode

    vi.mocked(silk.encode).mockResolvedValueOnce(Buffer.from('silk-data'))

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].data.file).toBe('http://example.com/aud.silk')
  })

  it('prepareMediaForQQ falls back to file when silk encode fails', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'audio', data: { file: 'aud.ogg' } }],
    }
    vi.spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue('path/to/aud.ogg')
    vi.spyOn(preparer, 'ensureFilePath').mockResolvedValue('path/to/aud.ogg')
    vi.mocked(silk.encode).mockRejectedValueOnce(new Error('fail'))

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].type).toBe('file')
    expect(msg.content[0].data.file).toBe('path/to/aud.ogg')
    expect(msg.content[0].data.filename).toBe(path.basename('path/to/aud.ogg'))
  })

  it('ensureBufferOrPath handles different cases', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)

    // Case 1: Already buffer
    const buf = Buffer.from('data')
    expect(await preparer.ensureBufferOrPath({ data: { file: buf } } as any)).toBe(buf)

    // Case 2: Local file
    expect(await preparer.ensureBufferOrPath({ data: { file: '/local/path' } } as any)).toBe('/local/path')

    // Case 3: URL
    mockMediaFeature.downloadMedia.mockResolvedValueOnce(Buffer.from('downloaded'))
    expect(await preparer.ensureBufferOrPath({ data: { file: 'http://example.com/img' } } as any)).toEqual(Buffer.from('downloaded'))

    // Case 4: TG object
    mockInstance.tgBot.downloadMedia.mockResolvedValueOnce(Buffer.from('tg-data'))
    expect(await preparer.ensureBufferOrPath({ data: { file: { fileId: '123' } } } as any)).toEqual(Buffer.from('tg-data'))
  })

  it('prepareMediaForQQ converts failing media to text', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const msg: any = {
      content: [{ type: 'image', data: { file: 'img.jpg' } }],
    }
    vi.spyOn(preparer, 'ensureBufferOrPath').mockRejectedValueOnce(new Error('boom'))

    await preparer.prepareMediaForQQ(msg)
    expect(msg.content[0].type).toBe('text')
    expect(msg.content[0].data.text).toBe('')
  })

  it('ensureBufferOrPath downloads when local file missing', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    vi.spyOn(fs.promises, 'access').mockRejectedValueOnce(new Error('missing'))
    mockMediaFeature.downloadMedia.mockResolvedValueOnce(Buffer.from('fallback'))

    const result = await preparer.ensureBufferOrPath({ data: { file: '/missing/path' } } as any)
    expect(mockMediaFeature.downloadMedia).toHaveBeenCalledWith('/missing/path')
    expect(result).toEqual(Buffer.from('fallback'))
  })

  it('waitFileStable should check file size stability', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    vi.spyOn(fs.promises, 'stat')
      .mockResolvedValueOnce({ size: 10 } as any)
      .mockResolvedValueOnce({ size: 10 } as any)

    const result = await (preparer as any).waitFileStable('/some/file', 2, 1)
    expect(result).toBe(true)
  })

  it('prepareAudioSource uses wav sibling when stable', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    vi.spyOn(preparer as any, 'waitFileStable').mockResolvedValue(true)
    const audioContent: any = { type: 'audio', data: { file: '/tmp/voice.amr' } }

    const result = await preparer.prepareAudioSource(audioContent)
    expect(result).toBe('/tmp/voice.amr.wav')
  })

  it('convertAudioToOgg detects SILK header in buffer', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const silkBuf = Buffer.from('#!SILK_V3')

    await preparer.convertAudioToOgg(silkBuf)
    expect(silk.decode).toHaveBeenCalled()
  })

  it('ensureFilePath returns web endpoint url or local path', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    const buf = Buffer.from('data')

    const url = await preparer.ensureFilePath(buf, '.txt')
    expect(url).toContain(env.WEB_ENDPOINT)

    const local = await preparer.ensureFilePath(buf, '.txt', true)
    expect(String(local)).toContain(path.join(env.DATA_DIR, 'temp'))
  })

  it('ensureBufferOrPath supports TG download to temp file when prefer path', async () => {
    const preparer = new ForwardMediaPreparer(mockInstance, mockMediaFeature)
    mockInstance.tgBot.downloadMediaToTempFile.mockResolvedValueOnce('/tmp/file.png')

    const result = await preparer.ensureBufferOrPath(
      { data: { file: { fileId: '123' } } } as any,
      { prefer: 'path', prefix: 'tg-image', ext: '.png' },
    )

    expect(result).toBe('/tmp/file.png')
    expect(mockInstance.tgBot.downloadMediaToTempFile).toHaveBeenCalled()
  })
})
