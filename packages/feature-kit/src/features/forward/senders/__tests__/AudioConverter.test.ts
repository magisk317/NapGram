import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { silk } from '../../../../shared-types'
import { AudioConverter } from '../AudioConverter'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('@napgram/media-kit', () => ({
  silk: {
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

describe('audioConverter', () => {
  const converter = new AudioConverter()
  const execFileMock = vi.mocked(execFile)
  const silkMock = vi.mocked(silk)

  beforeEach(() => {
    vi.clearAllMocks()
    execFileMock.mockImplementation((...args) => {
      const callback = args[args.length - 1] as ((err: Error | null, stdout: string, stderr: string) => void) | undefined
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as any
    })

    // Mock fs.promises
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('converted-ogg'))
    vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)
  })

  it('prepareVoiceMedia should return voice type on success', async () => {
    const file = { fileName: 'test.mp3', data: Buffer.from('dummy') }
    const result = await converter.prepareVoiceMedia(file)
    expect(result.type).toBe('voice')
    expect(result.fileMime).toBe('audio/ogg')
  })

  it('prepareVoiceMedia should fallback to document on failure', async () => {
    vi.spyOn(converter, 'convertAudioToOgg').mockResolvedValueOnce(undefined)
    const file = { fileName: 'test.mp3', data: Buffer.from('dummy'), fileMime: 'audio/mpeg' }
    const result = await converter.prepareVoiceMedia(file)
    expect(result.type).toBe('document')
    expect(result.fileName).toBe('test.mp3')
    expect(result.fileMime).toBe('audio/mpeg')
  })

  it('convertAudioToOgg should return same file if already ogg', async () => {
    const file = { fileName: 'test.ogg', data: Buffer.from('ogg-data'), fileMime: 'audio/ogg' }
    const result = await converter.convertAudioToOgg(file)
    expect(result).toEqual({ ...file, fileName: 'test.ogg', fileMime: 'audio/ogg' })
  })

  it('convertAudioToOgg should detect SILK header', async () => {
    const file = { fileName: 'test.silk', data: Buffer.from('#!SILK_V3') }
    const transcodeSpy = vi.spyOn(converter, 'transcodeToOgg')
    await converter.convertAudioToOgg(file)
    expect(transcodeSpy).toHaveBeenCalledWith(file.data, file.fileName, true)
  })

  it('convertAudioToOgg should return undefined when transcode fails', async () => {
    const file = { fileName: 'test.mp3', data: Buffer.from('data') }
    vi.spyOn(converter, 'transcodeToOgg').mockResolvedValueOnce(undefined)
    const result = await converter.convertAudioToOgg(file)
    expect(result).toBeUndefined()
  })

  it('ensureOggFileName should work correctly', () => {
    expect(converter.ensureOggFileName('test.mp3')).toBe('test.ogg')
    expect(converter.ensureOggFileName('')).toBe('audio.ogg')
  })

  it('transcodeToOgg should use SILK decode if preferred', async () => {
    const data = Buffer.from('silk-data')
    await converter.transcodeToOgg(data, 'test.silk', true)
    expect(silkMock.decode).toHaveBeenCalled()
  })

  it('transcodeToOgg should use ffmpeg if SILK decode fails', async () => {
    silkMock.decode.mockRejectedValueOnce(new Error('silk fail'))
    const data = Buffer.from('silk-data')
    await converter.transcodeToOgg(data, 'test.silk', true)
    expect(execFileMock).toHaveBeenCalledWith('ffmpeg', expect.any(Array), expect.any(Function))
  })

  it('transcodeToOgg should return undefined on error', async () => {
    execFileMock.mockImplementationOnce((...args) => {
      const callback = args[args.length - 1] as any
      callback(new Error('ffmpeg fail'), '', '')
      return {} as any
    })
    const result = await converter.transcodeToOgg(Buffer.from('data'), 'test.mp3')
    expect(result).toBeUndefined()
  })
})
