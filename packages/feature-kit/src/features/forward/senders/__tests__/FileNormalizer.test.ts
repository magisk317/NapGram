import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { fileTypeFromBuffer } from 'file-type'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileNormalizer } from '../FileNormalizer'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    default: {
      ...actual.default,
      promises: {
        readFile: vi.fn(),
        access: vi.fn(),
      },
    },
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    readdir: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
  }
})

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}))

describe('fileNormalizer', () => {
  let normalizer: FileNormalizer
  const mediaFeature = {
    downloadMedia: vi.fn(),
    processImage: vi.fn(),
    processVideo: vi.fn(),
    processAudio: vi.fn(),
    fetchFileById: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    normalizer = new FileNormalizer(mediaFeature as any)
    vi.mocked(fileTypeFromBuffer).mockResolvedValue({ ext: 'jpg', mime: 'image/jpeg' } as any)
  })

  describe('normalizeInputFile', () => {
    it('should return undefined for empty src', async () => {
      expect(await normalizer.normalizeInputFile(null, 't.jpg')).toBeUndefined()
    })

    it('should handle Object with data and fileName', async () => {
      const buf = Buffer.from('data')
      const src = { data: buf, fileName: 'test.png' }
      const result = await normalizer.normalizeInputFile(src, 'f.jpg')
      expect(result).toMatchObject({ fileName: 'test.jpg' })
    })

    it('should handle Stream in Object', async () => {
      const stream = Readable.from(['chunk'])
      const src = { data: stream, fileName: 's.bin' }
      const result = await normalizer.normalizeInputFile(src, 'f.jpg')
      expect(result?.data.toString()).toBe('chunk')
    })

    it('should handle URL download failure', async () => {
      mediaFeature.downloadMedia.mockRejectedValue(new Error('fail'))
      const result = await normalizer.normalizeInputFile('http://e.com/1.jpg', 'f.jpg')
      expect(result).toBeUndefined()
    })

    it('should handle file type detection failure', async () => {
      vi.mocked(fileTypeFromBuffer).mockRejectedValue(new Error('type fail'))
      const buf = Buffer.from('data')
      const result = await normalizer.normalizeInputFile(buf, 'test.txt')
      expect(result).toMatchObject({ fileName: 'test.txt', data: buf })
    })
  })

  describe('handleLocalOrMtcuteMedia', () => {
    it('should handle local read failure', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('no read'))
      const result = await normalizer.handleLocalOrMtcuteMedia('/local/missing.jpg', 'jpg')
      expect(result).toBe('/local/missing.jpg')
    })

    it('should handle mtcute downloader not provided', async () => {
      const mediaObj = { type: 'photo', id: '1' }
      const result = await normalizer.handleLocalOrMtcuteMedia(mediaObj, 'jpg')
      expect(result).toBeUndefined()
    })

    it('should handle mtcute empty buffer', async () => {
      const mediaObj = { type: 'photo', id: '1' }
      const downloader = vi.fn().mockResolvedValue(Buffer.alloc(0))
      const result = await normalizer.handleLocalOrMtcuteMedia(mediaObj, 'jpg', downloader)
      expect(result).toBeUndefined()
    })

    it('should handle mtcute download failure', async () => {
      const mediaObj = { type: 'photo', id: '1' }
      const downloader = vi.fn().mockRejectedValue(new Error('crash'))
      const result = await normalizer.handleLocalOrMtcuteMedia(mediaObj, 'jpg', downloader)
      expect(result).toBeUndefined()
    })

    it('should handle image type detection during wrap', async () => {
      const buf = Buffer.from('img')
      vi.mocked(fileTypeFromBuffer).mockResolvedValue({ ext: 'png', mime: 'image/png' } as any)
      const result = await normalizer.handleLocalOrMtcuteMedia(buf, 'jpg')
      expect(result).toEqual({ fileName: 'media.png', data: buf })
    })
  })

  describe('resolveMediaInput', () => {
    it('should handle video and audio', async () => {
      mediaFeature.processVideo.mockResolvedValue(Buffer.from('vid'))
      const resVid = await normalizer.resolveMediaInput({ type: 'video', data: {} } as any)
      expect(resVid).toMatchObject({ fileName: 'media.mp4' })

      mediaFeature.processAudio.mockResolvedValue(Buffer.from('aud'))
      const resAud = await normalizer.resolveMediaInput({ type: 'audio', data: {} } as any)
      expect(resAud).toMatchObject({ fileName: 'media.amr' })
    })

    it('should handle file resolution fallbacks', async () => {
      const content = { type: 'file', data: { file: '/p.zip', url: 'http://e.com/z.zip', fileId: 'fid' } } as any

      // Case 1: Local access fail, URL download success
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('no local'))
      mediaFeature.downloadMedia.mockResolvedValue(Buffer.from('zip from url'))
      const res1 = await normalizer.resolveMediaInput(content)
      expect(res1.toString()).toBe('zip from url')

      // Case 2: URL download fail, fetchFileById success
      mediaFeature.downloadMedia.mockRejectedValue(new Error('no url'))
      mediaFeature.fetchFileById.mockResolvedValue({ buffer: Buffer.from('zip from id') })
      const res2 = await normalizer.resolveMediaInput(content)
      expect(res2.toString()).toBe('zip from id')

      // Case 3: Both fail, return path
      mediaFeature.fetchFileById.mockResolvedValue(null)
      const res3 = await normalizer.resolveMediaInput(content)
      expect(res3).toBe('/p.zip')
    })

    it('should handle local file missing and fetchFileById retry', async () => {
      const content = { type: 'file', data: { file: '/missing.zip', fileId: 'fid' } } as any
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('no'))
      mediaFeature.fetchFileById.mockResolvedValue({ buffer: Buffer.from('fetched') })
      const result = await normalizer.resolveMediaInput(content)
      expect(result.toString()).toBe('fetched')
    })

    it('should work without media feature', async () => {
      const normNoMedia = new FileNormalizer()
      const content = { type: 'image', data: { url: 'http://e.com/i.jpg' } } as any
      expect(await normNoMedia.resolveMediaInput(content)).toBe('http://e.com/i.jpg')
    })
  })

  describe('isGifMedia', () => {
    it('should detect gif by mime or extension', () => {
      expect(normalizer.isGifMedia({ fileName: 'a.gif', data: Buffer.alloc(0) })).toBe(true)
      expect(normalizer.isGifMedia({ fileName: 'a.jpg', data: Buffer.alloc(0), fileMime: 'image/gif' })).toBe(true)
      expect(normalizer.isGifMedia({ fileName: 'a.jpg', data: Buffer.alloc(0) })).toBe(false)
    })
  })

  describe('tryReadLocalWithFallback', () => {
    it('should try sequence including fuzzy matching', async () => {
      const primary = '/dir/original.jpg'

      // Fail direct read
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(new Error('fail 1'))

      // Mock readdir
      vi.mocked(readdir).mockResolvedValue(['original_matched.jpg'] as any)

      // Second read succeeds
      vi.mocked(fs.promises.readFile).mockImplementation(async (p: any) => {
        if (p === '/dir/original_matched.jpg')
          return Buffer.from('found')
        throw new Error('fail')
      })

      const result = await normalizer.normalizeInputFile(primary, 'f.jpg')
      expect(result?.data.toString()).toBe('found')
    })

    it('should return undefined if all attempts fail including fuzzy', async () => {
      const primary = '/dir/none.jpg'
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('no'))
      vi.mocked(readdir).mockResolvedValue(['something_else.txt'] as any)

      const result = await normalizer.normalizeInputFile(primary, 'f.jpg')
      expect(result).toBeUndefined()
    })

    it('should handle readdir failure', async () => {
      const primary = '/dir/none.jpg'
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('no'))
      vi.mocked(readdir).mockRejectedValue(new Error('readdir crash'))

      const result = await normalizer.normalizeInputFile(primary, 'f.jpg')
      expect(result).toBeUndefined()
    })
  })
})
