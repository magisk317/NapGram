import { describe, expect, it } from 'vitest'
import { MediaSegmentConverter } from '../MediaSegmentConverter'

describe('mediaSegmentConverter', () => {
  const converter = new MediaSegmentConverter()

  describe('convertImage', () => {
    it('should handle standard image with http url', () => {
      const data = { url: 'http://example.com/image.jpg' }
      const result = converter.convertImage(data)
      expect(result).toEqual({
        type: 'image',
        data: {
          url: 'http://example.com/image.jpg',
          file: 'http://example.com/image.jpg',
          isSpoiler: undefined,
        },
      })
    })

    it('should handle image with file as http url', () => {
      const data = { file: 'https://example.com/image.png' }
      const result = converter.convertImage(data)
      expect(result).toEqual({
        type: 'image',
        data: {
          url: 'https://example.com/image.png',
          file: 'https://example.com/image.png',
          isSpoiler: undefined,
        },
      })
    })

    it('should fallback to non-http file/url', () => {
      const data = { file: '/local/path/image.jpg' }
      const result = converter.convertImage(data)
      expect(result).toEqual({
        type: 'image',
        data: {
          url: '/local/path/image.jpg',
          file: '/local/path/image.jpg',
          isSpoiler: undefined,
        },
      })
    })

    it('should handle sub_type for spoiler', () => {
      const data = { url: 'http://test.com', sub_type: '1' }
      const result = converter.convertImage(data)
      expect(result.data.isSpoiler).toBe(true)
    })
  })

  describe('convertVideo', () => {
    it('should valid http url', () => {
      const data = { url: 'http://video.com/1.mp4' }
      const result = converter.convertVideo(data)
      expect(result).toEqual({
        type: 'video',
        data: {
          url: 'http://video.com/1.mp4',
          file: 'http://video.com/1.mp4',
        },
      })
    })

    it('should extract real url from rawMessage', () => {
      const data = { url: 'http://thumb.com', file: 'thumb' }
      const raw = '[CQ:video,url=http://real.com/video.mp4]'
      const result = converter.convertVideo(data, raw)
      expect(result.data.url).toBe('http://real.com/video.mp4')
    })

    it('should extract and decode url from rawMessage', () => {
      const data = { url: 'thumb' }
      const raw = '[CQ:video,url=http://real.com/video.mp4?a=1&amp;b=2]'
      const result = converter.convertVideo(data, raw)
      expect(result.data.url).toBe('http://real.com/video.mp4?a=1&b=2')
    })

    it('should handle video url fallback priority', () => {
      // Line 22: data.url || data.file
      // Test when url is missing but file is present
      const data = { file: 'video.mp4' }
      const result = converter.convertVideo(data)
      expect(result.data.url).toBe('video.mp4')
    })

    it('should fallback to data.file when url is missing in line 32', () => {
      // Line 31-32 logic:
      // 1. url = undefined (lines 22)
      // 2. test(url || '') -> test('') -> false
      // 3. url = data.url || data.file
      const data = { file: 'file.mp4' }
      // rawMessage is undefined, so skips 24
      // url is 'file.mp4' from line 22
      // regex test 'file.mp4' -> false (no http)
      // line 32: url = undefined || 'file.mp4'
      const result = converter.convertVideo(data)
      expect(result.data.url).toBe('file.mp4')

      // Ensure data.url priority
      const data2 = { url: 'u', file: 'f' }
      const result2 = converter.convertVideo(data2)
      expect(result2.data.url).toBe('u')
    })

    it('should handle regex match failure in rawMessage', () => {
      // Line 26: if (m && m[1]) -> m is null
      const data = { url: 'data' }
      const raw = '[CQ:video,invalid]'
      const result = converter.convertVideo(data, raw)
      expect(result.data.url).toBe('data')
    })

    it('should handle empty extracted url from rawMessage', () => {
      // If regex matches but group capture is empty?
      // Regex /url=([^,\]]+)/ guarantees at least one char if matched.
      // But what if rawMessage is just '[CQ:video]'? No match.
      const data = { url: 'data' }
      const result = converter.convertVideo(data, '[CQ:video]')
      expect(result.data.url).toBe('data')
    })

    it('should fallback if extracted url is not http', () => {
      const data = { url: 'http://fallback.com' }
      const raw = '[CQ:video,url=invalid]'
      const result = converter.convertVideo(data, raw)
      // raw extracted 'invalid', check regex failed, fall back to data.url
      expect(result.data.url).toBe('http://fallback.com')
    })
    it('should handle completely empty data', () => {
      // Line 22: url undefined
      // Line 31: test(undefined || '') -> test('')
      // Line 32: url = undefined
      const result = converter.convertVideo({})
      expect(result.data.url).toBeUndefined()
    })

    it('should handle empty string url', () => {
      const result = converter.convertVideo({ url: '' })
      expect(result.data.url).toBeUndefined() // or '' if data.url is ''?
      // data.url is '', data.file undefined. line 22 url is ''.
      // line 31 test(''), true? no. false. enter block.
      // line 32 url = '' || undefined -> undefined? NO. '' || undefined is undefined?
      // '' || undefined is undefined.
      // So result.data.url should be undefined.
    })
  })

  describe('convertAudio', () => {
    it('should convert audio data', () => {
      const data = { url: 'http://audio.com/1.mp3' }
      const result = converter.convertAudio(data)
      expect(result).toEqual({
        type: 'audio',
        data: {
          url: 'http://audio.com/1.mp3',
          file: undefined,
        },
      })
    })

    it('should fallback to file if url missing', () => {
      const data = { file: 'audio.mp3' }
      const result = converter.convertAudio(data)
      expect(result.data.url).toBe('audio.mp3')
    })
  })

  describe('convertFlash', () => {
    it('should convert flash to spoilered image', () => {
      const data = { file: 'flash.jpg' }
      const result = converter.convertFlash(data)
      expect(result).toEqual({
        type: 'image',
        data: {
          url: 'flash.jpg',
          file: 'flash.jpg',
          isSpoiler: true,
        },
      })
    })
  })

  describe('convertSticker', () => {
    it('should convert sticker', () => {
      const data = { url: 'http://sticker.com' }
      const result = converter.convertSticker(data)
      expect(result).toEqual({
        type: 'sticker',
        data: {
          url: 'http://sticker.com',
          isAnimated: true,
        },
      })
    })
  })

  describe('convertFile', () => {
    it('should extract raw url if present', () => {
      const data = { file: 'local' }
      const raw = '[CQ:file,url=http://real.com/file.zip]'
      const result = converter.convertFile(data, raw)
      expect(result.data.url).toBe('http://real.com/file.zip')
    })

    it('should handle regex match failure in rawMessage for file', () => {
      // Line 69 branch coverage
      const data = { url: 'default' }
      const raw = '[CQ:file,invalid]'
      const result = converter.convertFile(data, raw)
      expect(result.data.url).toBe('default')
    })

    it('should decode entities in raw url', () => {
      const data = { file: 'local' }
      const raw = '[CQ:file,url=http://real.com/file.zip?a=1&amp;b=2]'
      const result = converter.convertFile(data, raw)
      expect(result.data.url).toBe('http://real.com/file.zip?a=1&b=2')
    })

    it('should fallback to data.url if no rawUrl', () => {
      const data = { url: 'http://data.com/file.zip' }
      const result = converter.convertFile(data)
      expect(result.data.url).toBe('http://data.com/file.zip')
    })

    it('should parse filename from url', () => {
      const data = { url: 'http://example.com/path/test%20file.zip' }
      const result = converter.convertFile(data)
      expect(result.data.filename).toBe('test file.zip')
    })

    it('should handle filename parse error', () => {
      // Malformed URI component
      const data = { url: 'http://example.com/%E0%A4%A' }
      const result = converter.convertFile(data)
      // Should treat parsing error gracefully and maybe leave filename undefined or fallback
      // In code: try catch blocks set filename to valid info or leave as is
      expect(result.data.filename).toBeUndefined()
    })

    it('should use data.name as filename', () => {
      const data = { url: 'http://a.com/f.zip', name: 'custom.zip' }
      const result = converter.convertFile(data)
      expect(result.data.filename).toBe('custom.zip')
    })

    it('should format fileId', () => {
      const data = { file_id: '/12345', url: 'http://a.com' }
      const result = converter.convertFile(data)
      expect(result.data.fileId).toBe('12345')
    })

    it('should parse size', () => {
      const data = { file_size: '1024', url: 'http://a.com' }
      const result = converter.convertFile(data)
      expect(result.data.size).toBe(1024)
    })

    // Branch coverage tests
    it('should handle filename parsing when parts are empty', () => {
      // url ending with / results in empty last part?
      const data = { url: 'http://example.com/folder/' }
      const result = converter.convertFile(data)
      expect(result.data.filename).toBeUndefined()
    })

    it('should handle fallback priority correctly (line 75)', () => {
      // All inputs empty/undefined
      // rawUrl undefined, data.url undefined, data.file undefined
      // "undefined" string test in regex?
      // The code: [rawUrl, data.url, data.file].find(...)
      const data = {}
      const result = converter.convertFile(data)
      expect(result.data.url).toBeUndefined()
    })
  })
})
