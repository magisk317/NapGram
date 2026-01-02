import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@napgram/infra-kit'
import { silk } from '../../../../shared-types'
import { ForwardMediaPreparer } from '../MediaPreparer'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('@napgram/media-kit', () => ({
  silk: {
    encode: vi.fn(),
    decode: vi.fn(),
  },
}))

describe('forwardMediaPreparer audio', () => {
  const instance = {
    tgBot: {
      downloadMedia: vi.fn(),
      downloadMediaToTempFile: vi.fn(),
    },
  }
  const media = {
    downloadMedia: vi.fn(),
  }

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
  })

  it('encodes audio to silk and updates content', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    const ensureBufferSpy = vi.spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue(Buffer.from('ogg'))
    const ensureFileSpy = vi
      .spyOn(preparer, 'ensureFilePath')
      .mockResolvedValueOnce('/tmp/audio.ogg')
      .mockResolvedValueOnce('http://example.com/audio.silk')

    silkMock.encode.mockResolvedValueOnce(Buffer.from('silk-data'))

    const msg: any = {
      id: '1',
      platform: 'telegram',
      sender: { id: 'u1', name: 'User' },
      chat: { id: 'c1', type: 'group' },
      content: [{ type: 'audio', data: { file: 'x' } }],
      timestamp: Date.now(),
    }

    await preparer.prepareMediaForQQ(msg)

    expect(ensureBufferSpy).toHaveBeenCalled()
    expect(ensureFileSpy).toHaveBeenCalledTimes(2)
    expect(silkMock.encode).toHaveBeenCalledWith('/tmp/audio.ogg')
    expect(msg.content[0].data.file).toBe('http://example.com/audio.silk')
  })

  it('falls back to file when silk encode fails', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    vi.spyOn(preparer, 'ensureBufferOrPath').mockResolvedValue(Buffer.from('ogg'))
    vi.spyOn(preparer, 'ensureFilePath').mockResolvedValueOnce('/tmp/audio.ogg')

    silkMock.encode.mockRejectedValueOnce(new Error('encode failed'))

    const msg: any = {
      id: '2',
      platform: 'telegram',
      sender: { id: 'u1', name: 'User' },
      chat: { id: 'c1', type: 'group' },
      content: [{ type: 'audio', data: { file: 'x' } }],
      timestamp: Date.now(),
    }

    await preparer.prepareMediaForQQ(msg)

    expect(msg.content[0].type).toBe('file')
    expect(msg.content[0].data.file).toBe('/tmp/audio.ogg')
    expect(msg.content[0].data.filename).toBe('audio.ogg')
  })

  it('uses silk decode when buffer has SILK header', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    const buffer = Buffer.from('#!SILK_V3xx')

    const result = await preparer.convertAudioToOgg(buffer)

    expect(silkMock.decode).toHaveBeenCalled()
    expect(execFileMock).not.toHaveBeenCalled()
    expect(result.voicePath).toContain('.ogg')
  })

  it('returns fallback path when ffmpeg and silk decode fail', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    execFileMock.mockImplementation((...args) => {
      const callback = args[args.length - 1] as ((err: Error | null, stdout: string, stderr: string) => void) | undefined
      if (typeof callback === 'function') {
        callback(new Error('ffmpeg failed'), '', '')
      }
      return {} as any
    })
    silkMock.decode.mockRejectedValueOnce(new Error('silk failed'))

    const result = await preparer.convertAudioToOgg(Buffer.from('no-silk-data'))

    expect(result.voicePath).toBeUndefined()
    expect(result.fallbackPath).toBeTruthy()

    if (result.fallbackPath) {
      const expectedDir = path.join(env.DATA_DIR, 'temp')
      expect(result.fallbackPath.startsWith(expectedDir)).toBe(true)
      await fs.unlink(result.fallbackPath)
    }
  })
})
