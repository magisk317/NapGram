import { describe, expect, it } from 'vitest'
import { NapCatConverter } from '../NapCatConverter'

describe('napCatConverter', () => {
  it('converts napcat segments and uses sender card', () => {
    const converter = new NapCatConverter()
    const longJson = 'x'.repeat(510)
    const napCatMsg = {
      message_id: 1,
      message_type: 'group',
      time: 123,
      group_id: 111,
      group_name: 'Group',
      raw_message: 'video,url=https://cdn.example.com/v.mp4&amp;token=1',
      sender: {
        user_id: 2,
        card: ' Card ',
        nickname: 'Nick',
        avatar: 'avatar',
      },
      message: [
        { type: 'text', data: { text: 'hi' } },
        { type: 'share', data: { url: 'https://share.example.com' } },
        { type: 'poke', data: { name: 'Bob' } },
        { type: 'markdown', data: { content: 'md' } },
        { type: 'image', data: { url: 'https://img.example.com', file: 'img', sub_type: '1' } },
        { type: 'video', data: { url: 'thumb', file: 'thumb' } },
        { type: 'record', data: { url: 'https://audio.example.com', file: 'audio' } },
        { type: 'flash', data: { url: 'https://flash.example.com', file: 'flash' } },
        { type: 'file', data: { url: 'https://file.example.com', file: '/tmp/file', file_id: '/fid', file_size: '7' } },
        { type: 'mface', data: { url: 'https://sticker.example.com' } },
        { type: 'at', data: { qq: '123', name: 'User' } },
        { type: 'face', data: { id: 14 } },
        { type: 'location', data: { lat: 1, lng: 2, title: 'T', address: 'A' } },
        { type: 'dice', data: { result: '6' } },
        { type: 'rps', data: { result: '2' } },
        { type: 'reply', data: { id: '99' } },
        { type: 'json', data: { data: longJson } },
        { type: 'forward', data: { id: 'resid' } },
        { type: 'unknown', data: {} },
      ],
    }

    const result = converter.fromNapCat(napCatMsg)

    expect(result.sender.name).toBe('Card')
    expect(result.chat).toEqual({ id: '111', type: 'group', name: 'Group' })
    expect(result.timestamp).toBe(123000)

    const types = result.content.map(item => item.type)
    expect(types).toEqual(expect.arrayContaining([
      'text',
      'image',
      'video',
      'audio',
      'file',
      'sticker',
      'at',
      'face',
      'location',
      'dice',
      'reply',
      'forward',
    ]))

    const video = result.content.find(item => item.type === 'video')
    expect(video?.data.url).toBe('https://cdn.example.com/v.mp4&token=1')

    const forward = result.content.find(item => item.type === 'forward')
    expect(forward).toEqual({
      type: 'forward',
      data: { id: 'resid', messages: [] },
    })

    const longText = result.content.find(item => item.type === 'text' && item.data.text.length === 500)
    expect(longText?.data.text.endsWith('...')).toBe(true)
  })

  it('falls back to sender nickname and private chat id', () => {
    const converter = new NapCatConverter()
    const napCatMsg = {
      message_id: 2,
      message_type: 'private',
      time: 5,
      user_id: 999,
      sender: {
        user_id: 999,
        card: '   ',
        nickname: 'Nick',
      },
      message: [],
    }

    const result = converter.fromNapCat(napCatMsg)

    expect(result.sender.name).toBe('Nick')
    expect(result.chat).toEqual({ id: '999', type: 'private', name: undefined })
  })

  it('handles empty text for truncation', () => {
    const converter = new NapCatConverter()
    // Mock access to private method via any
    const truncated = (converter as any).truncateText(null)
    expect(truncated).toBe('')
  })

  it('handles short text for truncation', () => {
    const converter = new NapCatConverter()
    const text = 'short'
    // length <= maxLength
    const truncated = (converter as any).truncateText(text, 100)
    expect(truncated).toBe('short')
  })

  it('handles JSON segment returning object', () => {
    const converter = new NapCatConverter()
    // Mock jsonCardConverter attached to instance
    const mockJsonConverter = {
      convertJsonCard: () => ({ type: 'json_card', data: {} }),
    };
    (converter as any).jsonCardConverter = mockJsonConverter

    const napCatMsg = {
      message_id: 3,
      time: 123,
      user_id: 1,
      message: [{ type: 'json', data: { data: '{}' } }],
    }
    const result = converter.fromNapCat(napCatMsg)
    // Should return the converted object directly (line 128)
    expect(result.content[0].type).toBe('json_card')
  })

  it('handles segment converter returning array', () => {
    const converter = new NapCatConverter()
    // Mock textConverter to return array
    const mockTextConverter = {
      convertText: () => [{ type: 'text', data: { text: 'a' } }, { type: 'text', data: { text: 'b' } }],
    };
    (converter as any).textConverter = mockTextConverter

    const napCatMsg = {
      message_id: 4,
      time: 123,
      user_id: 1,
      message: [{ type: 'text', data: { text: 'split' } }],
    }
    const result = converter.fromNapCat(napCatMsg)
    // Should flatten the array (line 30)
    expect(result.content).toHaveLength(2)
    expect(result.content[0].data.text).toBe('a')
    expect(result.content[1].data.text).toBe('b')
  })
})
