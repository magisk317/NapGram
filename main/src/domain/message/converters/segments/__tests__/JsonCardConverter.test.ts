import { describe, expect, it } from 'vitest'
import { JsonCardConverter } from '../JsonCardConverter'

describe('JsonCardConverter', () => {
  const converter = new JsonCardConverter()

  it('returns null for invalid json', () => {
    expect(converter.convertJsonCard({ data: '{' })).toBeNull()
    expect(converter.convertJsonCard({ data: 123 })).toBeNull()
    expect(converter.convertJsonCard({})).toBeNull()
  })

  it('converts location cards and preview', () => {
    const payload = {
      meta: {
        'Location.Search': {
          lat: '30',
          lng: '120',
          name: 'Place',
          address: 'Addr',
        },
        detail_1: {
          title: 'Title',
          desc: 'Desc',
          url: 'm.q.qq.com/abc',
          preview: '//img.example.com/a.jpg',
        },
      },
    }
    const result = converter.convertJsonCard({ data: JSON.stringify(payload) })

    expect(result).toHaveLength(2)
    expect(result?.[0]).toEqual({
      type: 'location',
      data: {
        latitude: 30,
        longitude: 120,
        title: 'Place',
        address: 'Addr',
      },
    })
    expect(result?.[1]).toEqual({
      type: 'image',
      data: { url: 'https://img.example.com/a.jpg' },
    })
  })

  it('converts miniapp cards to text and image', () => {
    const payload = {
      meta: {
        miniapp: {
          title: 'App',
          source: 'Src',
          desc: 'Desc',
          jumpUrl: 'https://example.com',
          preview: 'qq.ugcimg.cn/abc.png',
        },
      },
    }
    const result = converter.convertJsonCard({ data: JSON.stringify(payload) })

    expect(result).toHaveLength(2)
    expect(result?.[0].type).toBe('text')
    expect(result?.[0].data.text).toContain('[QQ小程序] App')
    expect(result?.[0].data.text).toContain('来源：Src')
    expect(result?.[0].data.text).toContain('https://example.com')
    expect(result?.[1]).toEqual({
      type: 'image',
      data: { url: 'https://qq.ugcimg.cn/abc.png' },
    })
  })
})
