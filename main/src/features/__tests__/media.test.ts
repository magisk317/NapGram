import type { AudioContent, ImageContent, VideoContent } from '../../domain/message'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaFeature } from '../MediaFeature'

// Mock global fetch
globalThis.fetch = vi.fn()

vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

const createMockInstance = () => ({} as any)
const createMockTgBot = () => ({} as any)
const createMockQQClient = () => ({} as any)

vi.mock('jimp', () => ({
  Jimp: {
    read: vi.fn().mockResolvedValue({
      resize: vi.fn().mockReturnThis(),
      quality: vi.fn().mockReturnThis(),
      getBuffer: vi.fn().mockResolvedValue(Buffer.from('compressed')),
      bitmap: { width: 100, height: 100 },
    }),
  },
}))

describe('mediaFeature', () => {
  let mediaFeature: MediaFeature

  beforeEach(() => {
    vi.clearAllMocks()
    mediaFeature = new MediaFeature(
      createMockInstance(),
      createMockTgBot(),
      createMockQQClient(),
    )
  })

  describe('downloadMedia', () => {
    it('should download media from URL', async () => {
      const mockData = Buffer.from('test image data');
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockData.buffer,
      })

      const result = await mediaFeature.downloadMedia('https://example.com/image.jpg')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      )
      expect(result).toBeInstanceOf(Buffer)
    })

    it('should handle download errors', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      await expect(
        mediaFeature.downloadMedia('https://example.com/image.jpg'),
      ).rejects.toThrow('Download failed: 404 Not Found')
    })
  })

  describe('processImage', () => {
    it('should return buffer if file is provided', async () => {
      const buffer = Buffer.from('image data')
      const content: ImageContent = {
        type: 'image',
        data: {
          file: buffer,
        },
      }

      const result = await mediaFeature.processImage(content)

      expect(result).toBe(buffer)
    })

    it('should download image if URL is provided', async () => {
      const mockData = Buffer.from('downloaded image');
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockData.buffer,
      })

      const content: ImageContent = {
        type: 'image',
        data: {
          url: 'https://example.com/image.jpg',
        },
      }

      const result = await mediaFeature.processImage(content)

      expect(result).toBeInstanceOf(Buffer)
    })

    it('should throw error if no source available', async () => {
      const content: ImageContent = {
        type: 'image',
        data: {},
      }

      await expect(
        mediaFeature.processImage(content),
      ).rejects.toThrow('No image source available')
    })
  })

  describe('processVideo', () => {
    it('should return buffer if file is provided', async () => {
      const buffer = Buffer.from('video data')
      const content: VideoContent = {
        type: 'video',
        data: {
          file: buffer,
        },
      }

      const result = await mediaFeature.processVideo(content)

      expect(result).toBe(buffer)
    })

    it('should download video if URL is provided', async () => {
      const mockData = Buffer.from('downloaded video');
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockData.buffer,
      })

      const content: VideoContent = {
        type: 'video',
        data: {
          url: 'https://example.com/video.mp4',
        },
      }

      const result = await mediaFeature.processVideo(content)

      expect(result).toBeInstanceOf(Buffer)
    })
  })

  describe('processAudio', () => {
    it('should return buffer if file is provided', async () => {
      const buffer = Buffer.from('audio data')
      const content: AudioContent = {
        type: 'audio',
        data: {
          file: buffer,
        },
      }

      const result = await mediaFeature.processAudio(content)

      expect(result).toBe(buffer)
    })

    it('should download audio if URL is provided', async () => {
      const mockData = Buffer.from('downloaded audio');
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockData.buffer,
      })

      const content: AudioContent = {
        type: 'audio',
        data: {
          url: 'https://example.com/audio.mp3',
        },
      }

      const result = await mediaFeature.processAudio(content)

      expect(result).toBeInstanceOf(Buffer)
    })
  })

  describe('media size checks', () => {
    it('should get media size', () => {
      const buffer = Buffer.from('test data')
      const size = mediaFeature.getMediaSize(buffer)

      expect(size).toBe(buffer.length)
    })

    it('should check if media is too large', () => {
      const smallBuffer = Buffer.alloc(1024) // 1KB
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024) // 25MB

      expect(mediaFeature.isMediaTooLarge(smallBuffer)).toBe(false)
      expect(mediaFeature.isMediaTooLarge(largeBuffer)).toBe(true)
    })

    it('should check with custom max size', () => {
      const buffer = Buffer.alloc(3 * 1024 * 1024) // 3MB

      expect(mediaFeature.isMediaTooLarge(buffer, 5 * 1024 * 1024)).toBe(false)
      expect(mediaFeature.isMediaTooLarge(buffer, 2 * 1024 * 1024)).toBe(true)
    })
  })

  describe('image compression', () => {
    it('should return original buffer if size is acceptable', async () => {
      const buffer = Buffer.alloc(1024) // 1KB

      const result = await mediaFeature.compressImage(buffer)

      expect(result).toBe(buffer)
    })

    it('should handle large images', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024) // 10MB

      const result = await mediaFeature.compressImage(largeBuffer)

      expect(result).toBeInstanceOf(Buffer)
      expect(result).not.toBe(largeBuffer)
      expect(result.length).toBeLessThan(largeBuffer.length)
      expect(result.length).toBeLessThanOrEqual(5 * 1024 * 1024)
    })
  })
})
