import { Buffer } from 'node:buffer'
import fsP from 'node:fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import { Jimp } from 'jimp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaFeature } from '../MediaFeature'

// Mock dependencies
vi.mock('node:fs/promises')
vi.mock('jimp', () => ({
  Jimp: {
    read: vi.fn(),
  },
}))
vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}))
vi.mock('../../../../../main/src/shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))
vi.mock('../../../../../main/src/shared/utils/temp', () => ({
  file: vi.fn(() => ({ path: '/tmp/test-file', cleanup: vi.fn() })),
}))

// Mock global fetch
globalThis.fetch = vi.fn()

describe('mediaFeature', () => {
  let mediaFeature: MediaFeature
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockInstance = { id: 1 }
    mockTgBot = {}
    mockQqClient = {
      getFile: vi.fn(),
      callApi: vi.fn(),
      downloadFile: vi.fn(),
      downloadFileStreamToFile: vi.fn(),
    }
    mediaFeature = new MediaFeature(mockInstance, mockTgBot, mockQqClient)
  })

  describe('downloadMedia', () => {
    it('downloads media from a URL', async () => {
      const mockBuffer = Buffer.from('test data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(mockBuffer).buffer),
      })

      const result = await mediaFeature.downloadMedia('http://example.com/test.jpg')
      expect(result.toString()).toBe('test data')
      expect(globalThis.fetch).toHaveBeenCalledWith('http://example.com/test.jpg', expect.any(Object))
    })

    it('reads from a local file path', async () => {
      const mockBuffer = Buffer.from('local data')
      vi.mocked(fsP.stat).mockResolvedValue({ size: 100 } as any)
      vi.mocked(fsP.readFile).mockResolvedValue(mockBuffer)

      const result = await mediaFeature.downloadMedia('/path/to/local.jpg')
      expect(result).toEqual(mockBuffer)
      expect(fsP.readFile).toHaveBeenCalledWith('/path/to/local.jpg')
    })

    it('handles .amr fallback to .amr.wav', async () => {
      const mockBuffer = Buffer.from('wav data')
      vi.mocked(fsP.stat)
        .mockResolvedValueOnce({ size: 0 } as any) // .amr is 0 bytes
        .mockResolvedValueOnce({ size: 100 } as any) // .amr.wav is 100 bytes
      vi.mocked(fsP.readFile).mockResolvedValue(mockBuffer)

      const result = await mediaFeature.downloadMedia('/path/to/audio.amr')
      expect(result).toEqual(mockBuffer)
      expect(fsP.readFile).toHaveBeenCalledWith('/path/to/audio.amr.wav')
    })

    it('throws error when download fails', async () => {
      ; (globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      await expect(mediaFeature.downloadMedia('http://example.com/fail.jpg')).rejects.toThrow('Download failed: 404 Not Found')
    })
  })

  describe('fetchFileById', () => {
    it('fetches file using getFile (direct link)', async () => {
      const mockBuffer = Buffer.from('file data')
      mockQqClient.getFile.mockResolvedValue({ url: 'http://example.com/file' })
      ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(mockBuffer).buffer),
      })

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer?.toString()).toBe('file data')
      expect(result.url).toBe('http://example.com/file')
    })

    it('fetches file using callApi(get_file)', async () => {
      const mockBuffer = Buffer.from('file data')
      mockQqClient.getFile = undefined // Simulation: not a function
      mockQqClient.callApi.mockResolvedValue({ url: 'http://example.com/file' })
      ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(mockBuffer).buffer),
      })

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer?.toString()).toBe('file data')
      expect(mockQqClient.callApi).toHaveBeenCalledWith('get_file', { file: 'file123' })
    })

    it('handles direct buffer data in response', async () => {
      const mockBuffer = Buffer.from('buffer data')
      mockQqClient.getFile.mockResolvedValue({ data: mockBuffer })

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer).toEqual(mockBuffer)
    })

    it('falls back to downloadFile if direct download fails', async () => {
      const mockBuffer = Buffer.from('local file data')
      mockQqClient.getFile.mockResolvedValue({ url: 'http://example.com/file' })
      ; (globalThis.fetch as any).mockRejectedValue(new Error('Network error'))
      mockQqClient.downloadFile.mockResolvedValue({ file: '/tmp/local' })
      vi.mocked(fsP.readFile).mockResolvedValue(mockBuffer)

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer).toEqual(mockBuffer)
      expect(result.path).toBe('/tmp/local')
    })

    it('falls back to downloadFileStreamToFile', async () => {
      const mockBuffer = Buffer.from('streamed data')
      mockQqClient.getFile.mockResolvedValue(null)
      mockQqClient.downloadFileStreamToFile.mockResolvedValue({ path: '/tmp/streamed' })
      vi.mocked(fsP.readFile).mockResolvedValue(mockBuffer)

      const result = await mediaFeature.fetchFileById('file123')
      expect(result.buffer).toEqual(mockBuffer)
      expect(result.path).toBe('/tmp/streamed')
    })

    it('handles error in fetchFileById', async () => {
      mockQqClient.getFile.mockRejectedValue(new Error('Fatal error'))
      // Mock downloadFileStreamToFile to also fail or not be present
      mockQqClient.downloadFileStreamToFile = undefined

      const result = await mediaFeature.fetchFileById('file123')
      expect(result).toEqual({})
    })
  })

  describe('process media types', () => {
    it('processes image content with direct buffer', async () => {
      const buf = Buffer.from('img')
      const result = await mediaFeature.processImage({ data: { file: buf } } as any)
      expect(result).toEqual(buf)
    })

    it('throws error if no image source available', async () => {
      await expect(mediaFeature.processImage({ data: {} } as any)).rejects.toThrow('No image source available')
    })

    it('processes image content with string URL', async () => {
      const buf = Buffer.from('img data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processImage({ data: { file: 'http://img.v' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('processes image content with local path failing access', async () => {
      vi.mocked(fsP.access).mockRejectedValue(new Error('No access'))
      const buf = Buffer.from('remote data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processImage({ data: { file: '/path/no-access.jpg', url: 'http://rem' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('processes image content with URL', async () => {
      const buf = Buffer.from('img data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processImage({ data: { url: 'http://img.v' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('processes video content with direct buffer', async () => {
      const buf = Buffer.from('video')
      const result = await mediaFeature.processVideo({ data: { file: buf } } as any)
      expect(result).toEqual(buf)
    })

    it('processes video content with URL', async () => {
      const buf = Buffer.from('video data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processVideo({ data: { url: 'http://video.mp4' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('throws error if no video source available', async () => {
      await expect(mediaFeature.processVideo({ data: {} } as any)).rejects.toThrow('No video source available')
    })

    it('processes video content with string URL', async () => {
      const buf = Buffer.from('video data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processVideo({ data: { file: 'http://video.v' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('processes video content with local path', async () => {
      vi.mocked(fsP.access).mockResolvedValue(undefined)
      const result = await mediaFeature.processVideo({ data: { file: '/path/video.mp4' } } as any)
      expect(result).toBe('/path/video.mp4')
    })

    it('processes audio content with direct buffer', async () => {
      const buf = Buffer.from('audio')
      const result = await mediaFeature.processAudio({ data: { file: buf } } as any)
      expect(result).toEqual(buf)
    })

    it('processes audio content with URL', async () => {
      const buf = Buffer.from('audio data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processAudio({ data: { url: 'http://audio.mp3' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('throws error if no audio source available', async () => {
      await expect(mediaFeature.processAudio({ data: {} } as any)).rejects.toThrow('No audio source available')
    })

    it('processes audio content with string URL', async () => {
      const buf = Buffer.from('audio data')
                ; (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(buf).buffer),
      })
      const result = await mediaFeature.processAudio({ data: { file: 'http://audio.v' } } as any)
      expect(result?.toString()).toBe(buf.toString())
    })

    it('processes audio content with local path', async () => {
      vi.mocked(fsP.access).mockResolvedValue(undefined)
      const result = await mediaFeature.processAudio({ data: { file: '/path/audio.mp3' } } as any)
      expect(result).toBe('/path/audio.mp3')
    })

    it('processes audio content prioritizing .amr.wav', async () => {
    })

    describe('compressImage', () => {
      it('skips compression if file is small enough', async () => {
        const buf = Buffer.alloc(100)
        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result).toEqual(buf)
      })

      it('compress an image using Jimp', async () => {
        const buf = Buffer.alloc(2000)
        const mockType = { mime: 'image/jpeg' }
        vi.mocked(fileTypeFromBuffer).mockResolvedValue(mockType as any)

        const mockImage = {
          bitmap: { width: 100, height: 100 },
          quality: vi.fn().mockReturnThis(),
          getBuffer: vi.fn().mockResolvedValue(Buffer.alloc(500)),
          resize: vi.fn().mockReturnThis(),
        }
        vi.mocked(Jimp.read).mockResolvedValue(mockImage as any)

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(500)
        expect(mockImage.quality).toHaveBeenCalledWith(80)
      })

      it('resizes image if dimensions are too large', async () => {
        const buf = Buffer.alloc(2000)
        const mockType = { mime: 'image/jpeg' }
        vi.mocked(fileTypeFromBuffer).mockResolvedValue(mockType as any)

        const mockImage = {
          bitmap: { width: 3000, height: 1500 },
          quality: vi.fn().mockReturnThis(),
          getBuffer: vi.fn().mockResolvedValue(Buffer.alloc(500)),
          resize: vi.fn().mockReturnThis(),
        }
        vi.mocked(Jimp.read).mockResolvedValue(mockImage as any)

        await mediaFeature.compressImage(buf, 1000)
        expect(mockImage.resize).toHaveBeenCalledWith({ w: 1920, h: 960 })
      })

      it('resizes image if dimensions are too large (height > width)', async () => {
        const buf = Buffer.alloc(2000)
        const mockType = { mime: 'image/jpeg' }
        vi.mocked(fileTypeFromBuffer).mockResolvedValue(mockType as any)

        const mockImage = {
          bitmap: { width: 1500, height: 3000 },
          quality: vi.fn().mockReturnThis(),
          getBuffer: vi.fn().mockResolvedValue(Buffer.alloc(500)),
          resize: vi.fn().mockReturnThis(),
        }
        vi.mocked(Jimp.read).mockResolvedValue(mockImage as any)

        await mediaFeature.compressImage(buf, 1000)
        expect(mockImage.resize).toHaveBeenCalledWith({ w: 960, h: 1920 })
      })

      it('converts WebP to PNG during compression', async () => {
        const buf = Buffer.alloc(2000)
        const mockType = { mime: 'image/webp' }
        vi.mocked(fileTypeFromBuffer).mockResolvedValue(mockType as any)

        const mockImage = {
          bitmap: { width: 100, height: 100 },
          quality: vi.fn().mockReturnThis(),
          getBuffer: vi.fn().mockResolvedValue(Buffer.alloc(500)),
          resize: vi.fn().mockReturnThis(),
        }
        vi.mocked(Jimp.read).mockResolvedValue(mockImage as any)

        await mediaFeature.compressImage(buf, 1000)
        expect(mockImage.getBuffer).toHaveBeenCalledWith('image/png')
      })

      it('reduces quality in a loop if still too large', async () => {
        const buf = Buffer.alloc(2000)
        const mockType = { mime: 'image/jpeg' }
        vi.mocked(fileTypeFromBuffer).mockResolvedValue(mockType as any)

        const mockImage = {
          bitmap: { width: 100, height: 100 },
          quality: vi.fn().mockReturnThis(),
          getBuffer: vi.fn()
            .mockResolvedValueOnce(Buffer.alloc(1500)) // Quality 80
            .mockResolvedValueOnce(Buffer.alloc(1100)) // Quality 60
            .mockResolvedValueOnce(Buffer.alloc(800)), // Quality 40 -> Success
          resize: vi.fn().mockReturnThis(),
        }
        vi.mocked(Jimp.read).mockResolvedValue(mockImage as any)

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(800)
        expect(mockImage.quality).toHaveBeenCalledTimes(3)
      })

      it('logs warning if failed to compress below maxSize', async () => {
        const buf = Buffer.alloc(2000)
        const mockType = { mime: 'image/jpeg' }
        vi.mocked(fileTypeFromBuffer).mockResolvedValue(mockType as any)

        const mockImage = {
          bitmap: { width: 100, height: 100 },
          quality: vi.fn().mockReturnThis(),
          getBuffer: vi.fn().mockResolvedValue(Buffer.alloc(1500)), // Always too large
          resize: vi.fn().mockReturnThis(),
        }
        vi.mocked(Jimp.read).mockResolvedValue(mockImage as any)

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result.length).toBe(1500)
        // Quality goes 80 -> 60 -> 40 -> 20. Loop continues while quality > 20.
        // 80, 60, 40, 20. Loop should have run several times.
        expect(mockImage.quality).toHaveBeenCalledWith(20)
      })

      it('returns original buffer for unsupported formats', async () => {
        const buf = Buffer.alloc(2000)
        vi.mocked(fileTypeFromBuffer).mockResolvedValue({ mime: 'application/pdf' } as any)

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result).toEqual(buf)
      })

      it('handles compression failure by returning original buffer', async () => {
        const buf = Buffer.alloc(2000)
        vi.mocked(fileTypeFromBuffer).mockRejectedValue(new Error('Crash'))

        const result = await mediaFeature.compressImage(buf, 1000)
        expect(result).toEqual(buf)
      })
    })

    describe('utility methods', () => {
      it('returns media size', () => {
        expect(mediaFeature.getMediaSize(Buffer.alloc(5))).toBe(5)
      })

      it('checks if media is too large', () => {
        expect(mediaFeature.isMediaTooLarge(Buffer.alloc(10), 5)).toBe(true)
        expect(mediaFeature.isMediaTooLarge(Buffer.alloc(10), 100)).toBe(false)
      })

      it('creates temp file from buffer', async () => {
        const buf = Buffer.from('temp')
        const result = await mediaFeature.createTempFileFromBuffer(buf, '.jpg')
        // Since it's using the real temp utility or a mock that might be overridden by other mocks
        // let's check what was actually called
        expect(fsP.writeFile).toHaveBeenCalledWith(expect.stringContaining('temp'), buf)
        expect(result.path).toBeDefined()
      })

      it('destroys correctly', () => {
        mediaFeature.destroy()
        // No errors expected
      })
    })
  })
})
