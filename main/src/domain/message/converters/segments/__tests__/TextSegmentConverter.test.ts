import { describe, expect, it } from 'vitest'
import { TextSegmentConverter } from '../TextSegmentConverter'

describe('textSegmentConverter', () => {
  const converter = new TextSegmentConverter()

  describe('convertText', () => {
    it('should convert simple text', () => {
      const data = { text: 'Hello World' }
      const result = converter.convertText(data)
      expect(result).toEqual({
        type: 'text',
        data: { text: 'Hello World' },
      })
    })
  })

  describe('convertShare', () => {
    it('should use data.url if present', () => {
      const data = { url: 'http://example.com' }
      const result = converter.convertShare(data)
      expect(result.data.text).toBe('http://example.com')
    })

    it('should fallback to data.file if url missing', () => {
      const data = { file: 'file_url' }
      const result = converter.convertShare(data)
      expect(result.data.text).toBe('file_url')
    })

    it('should fallback to rawMessage if url/file missing', () => {
      const data = {}
      const rawMessage = 'raw_content'
      const result = converter.convertShare(data, rawMessage)
      expect(result.data.text).toBe('raw_content')
    })

    it('should fallback to default [分享] if nothing present', () => {
      const data = {}
      const result = converter.convertShare(data)
      expect(result.data.text).toBe('[分享]')
    })
  })

  describe('convertPoke', () => {
    it('should include name if present', () => {
      const data = { name: 'Alice' }
      const result = converter.convertPoke(data)
      expect(result.data.text).toBe('[戳一戳] Alice')
    })

    it('should handle missing name', () => {
      const data = {}
      const result = converter.convertPoke(data)
      expect(result.data.text).toBe('[戳一戳]')
    })
  })

  describe('convertMarkdown', () => {
    it('should use data.text if present', () => {
      const data = { text: '# MD Content' }
      const segment = { data: {} }
      const result = converter.convertMarkdown(data, segment)
      expect(result.data.text).toBe('# MD Content')
    })

    it('should fallback to data.content if text missing', () => {
      const data = { content: '# Content' }
      const segment = { data: {} }
      const result = converter.convertMarkdown(data, segment)
      expect(result.data.text).toBe('# Content')
    })

    it('should fallback to JSON.stringify(segment.data) if text/content missing', () => {
      const data = {}
      const segment = { data: { key: 'value' } }
      const result = converter.convertMarkdown(data, segment)
      expect(result.data.text).toBe('{"key":"value"}')
    })
  })
})
