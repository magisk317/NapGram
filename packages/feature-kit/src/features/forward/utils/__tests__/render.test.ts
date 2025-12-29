import { describe, expect, it } from 'vitest'
import { renderContent } from '../render'

describe('renderContent', () => {
  it('renders text content with newline conversion', () => {
    const content = { type: 'text', data: { text: 'Hello\\nWorld\\nTest' } }

    const result = renderContent(content as any)

    expect(result).toBe('Hello\nWorld\nTest')
  })

  it('renders text content without data', () => {
    const content = { type: 'text', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('')
  })

  it('renders image as placeholder', () => {
    const content = { type: 'image', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[图片]')
  })

  it('renders video as placeholder', () => {
    const content = { type: 'video', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[视频]')
  })

  it('renders audio as placeholder', () => {
    const content = { type: 'audio', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[语音]')
  })

  it('renders file with filename', () => {
    const content = { type: 'file', data: { filename: 'document.pdf' } }

    const result = renderContent(content as any)

    expect(result).toBe('[文件:document.pdf]')
  })

  it('renders file without filename', () => {
    const content = { type: 'file', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[文件:文件]')
  })

  it('renders at mention with userName', () => {
    const content = { type: 'at', data: { userName: 'Alice', userId: '12345' } }

    const result = renderContent(content as any)

    expect(result).toBe('@Alice')
  })

  it('renders at mention with userId when userName is empty', () => {
    const content = { type: 'at', data: { userName: '  ', userId: '12345' } }

    const result = renderContent(content as any)

    expect(result).toBe('@12345')
  })

  it('renders at mention with only userId', () => {
    const content = { type: 'at', data: { userId: '67890' } }

    const result = renderContent(content as any)

    expect(result).toBe('@67890')
  })

  it('renders face with text', () => {
    const content = { type: 'face', data: { text: '😊', id: 1 } }

    const result = renderContent(content as any)

    expect(result).toBe('😊')
  })

  it('renders face with id but no text', () => {
    const content = { type: 'face', data: { id: 5 } }

    const result = renderContent(content as any)

    expect(result).toBe('[QQ表情5]')
  })

  it('renders face without text or id', () => {
    const content = { type: 'face', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[表情]')
  })

  it('renders reply with text', () => {
    const content = { type: 'reply', data: { messageId: '123', text: 'Original message' } }

    const result = renderContent(content as any)

    expect(result).toBe('(回复 123:Original message)')
  })

  it('renders reply without text', () => {
    const content = { type: 'reply', data: { messageId: '456' } }

    const result = renderContent(content as any)

    expect(result).toBe('(回复 456)')
  })

  it('renders forward with message count', () => {
    const content = { type: 'forward', data: { messages: [1, 2, 3] } }

    const result = renderContent(content as any)

    expect(result).toBe('[转发消息x3]')
  })

  it('renders forward without messages', () => {
    const content = { type: 'forward', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[转发消息x0]')
  })

  it('renders location with full details', () => {
    const content = {
      type: 'location',
      data: {
        title: 'Coffee Shop',
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Main St',
      },
    }

    const result = renderContent(content as any)

    expect(result).toBe('[位置:Coffee Shop 40.7128,-74.006 123 Main St]')
  })

  it('renders location without title and address', () => {
    const content = {
      type: 'location',
      data: {
        latitude: 51.5074,
        longitude: -0.1278,
      },
    }

    const result = renderContent(content as any)

    expect(result).toBe('[位置: 51.5074,-0.1278]')
  })

  it('renders dice with emoji and value', () => {
    const content = { type: 'dice', data: { emoji: '🎲', value: 6 } }

    const result = renderContent(content as any)

    expect(result).toBe('🎲 6')
  })

  it('renders dice with default emoji', () => {
    const content = { type: 'dice', data: { value: 3 } }

    const result = renderContent(content as any)

    expect(result).toBe('🎲 3')
  })

  it('renders dice without value', () => {
    const content = { type: 'dice', data: { emoji: '🎯' } }

    const result = renderContent(content as any)

    expect(result).toBe('🎯')
  })

  it('renders unknown content type', () => {
    const content = { type: 'unknown-type', data: {} }

    const result = renderContent(content as any)

    expect(result).toBe('[unknown-type]')
  })
})
