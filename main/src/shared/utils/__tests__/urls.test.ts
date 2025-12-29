import { describe, expect, it, vi } from 'vitest'
import { fetchFile, getAvatar, getAvatarUrl, getBigFaceUrl, getImageUrlByMd5, hasSupportedImageExt, isContainsUrl, isValidQQ, isValidRoomId, isValidUrl } from '../urls'

// Mock global fetch
const fetchMock = vi.fn()
globalThis.fetch = fetchMock

describe('urls utility', () => {
  it('should get avatar url', () => {
    // Number
    expect(getAvatarUrl(123)).toContain('nk=123')
    expect(getAvatarUrl(123n)).toContain('nk=123')

    // Negative
    expect(getAvatarUrl(-456)).toContain('/456/456/')

    // Friend object
    expect(getAvatarUrl({ uin: 789, userId: '789', nick: 'n', remark: 'r' } as any)).toContain('nk=789')

    // Group object
    expect(getAvatarUrl({ gid: 101, groupCode: 101, groupName: 'g' } as any)).toContain('/101/101/')

    // Empty
    expect(getAvatarUrl(0)).toBe('')
  })

  it('should get other urls', () => {
    expect(getImageUrlByMd5('abc')).toContain('ABC')
    expect(getBigFaceUrl('12345678901234567890123456789012')).toContain('/12/12345678901234567890123456789012')
  })

  it('should check url strings', () => {
    expect(isContainsUrl('hello http://test.com')).toBe(true)
    expect(isContainsUrl('hello')).toBe(false)

    expect(isValidUrl('http://google.com')).toBe(true)
    expect(isValidUrl('not url')).toBe(false)
  })

  it('should validate IDs', () => {
    expect(isValidQQ('12345')).toBe(true)
    expect(isValidQQ('abc')).toBe(false)
    expect(isValidRoomId('-100123')).toBe(true)
  })

  it('should check extensions', () => {
    expect(hasSupportedImageExt('image.jpg')).toBe(true)
    expect(hasSupportedImageExt('file.txt')).toBe(false)
  })

  it('should fetch file', async () => {
    // Success
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    const buf = await fetchFile('http://url')
    expect(buf).toBeTruthy()

    // Facade for avatar
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    await getAvatar(123)
    expect(fetchMock).toHaveBeenCalled()

    // Error
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })
    await expect(fetchFile('http://bad')).rejects.toThrow('Fetch failed: 404')
  })
})
