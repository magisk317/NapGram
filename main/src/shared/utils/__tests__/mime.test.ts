import { describe, expect, it } from 'vitest'
import { getMimeType } from '../mime'

describe('mime utility', () => {
  it('should resolve types', () => {
    expect(getMimeType('file.html')).toBe('text/html')
    expect(getMimeType('image.png')).toBe('image/png')
    expect(getMimeType('VIDEO.MP4')).toBe('video/mp4') // Case insensitive? map key is lower case, ext is toLowerCase
  })

  it('should fallback', () => {
    expect(getMimeType('file.unknown')).toBe('application/octet-stream')
    expect(getMimeType('noext')).toBe('application/octet-stream')
  })
})
