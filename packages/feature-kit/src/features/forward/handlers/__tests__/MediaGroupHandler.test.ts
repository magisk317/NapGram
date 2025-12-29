import type { UnifiedMessage } from '../../../../../../../main/src/domain/message'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { messageConverter } from '../../../../../../../main/src/domain/message'
import { MediaGroupHandler } from '../MediaGroupHandler'

vi.mock('../../../../../../../main/src/domain/message', () => ({
  messageConverter: {
    fromTelegram: vi.fn(),
    toNapCat: vi.fn(),
  },
}))

describe('mediaGroupHandler', () => {
  const prepareMediaForQQ = vi.fn().mockResolvedValue(undefined)
  const getNicknameMode = vi.fn().mockReturnValue('01')
  const qqClient = {
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: '123' }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false when message has no media group', async () => {
    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)
    const tgMsg: any = { id: 1, text: 'hi', date: new Date(), sender: { id: 1, displayName: 'A' }, chat: { id: 100 } }

    const handled = await handler.handleMediaGroup(tgMsg, { qqRoomId: '888' })

    expect(handled).toBe(false)
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

  it('buffers and flushes a media group', async () => {
    vi.mocked(messageConverter.fromTelegram).mockImplementation((msg: any) => ({
      id: String(msg.id),
      platform: 'telegram',
      sender: { id: '1', name: msg.sender?.displayName || 'Alice' },
      chat: { id: String(msg.chat.id), type: 'group' },
      content: [{ type: 'image', data: { url: `img-${msg.id}` } }],
      timestamp: 1,
    }) as UnifiedMessage)
    vi.mocked(messageConverter.toNapCat).mockImplementation(async (msg: any) => {
      return msg.content.map((c: any) => ({ type: c.type, data: c.data }))
    })

    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)
    const pair = { qqRoomId: '888' }

    const msg1: any = {
      id: 10,
      text: '',
      date: new Date('2025-01-01T00:00:00Z'),
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 100 },
      mediaGroupId: 'g1',
    }
    const msg2: any = {
      id: 11,
      text: 'caption here',
      date: new Date('2025-01-01T00:00:01Z'),
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 100 },
      mediaGroupId: 'g1',
    }

    await handler.handleMediaGroup(msg1, pair)
    await handler.handleMediaGroup(msg2, pair)

    await vi.runAllTimersAsync()

    expect(prepareMediaForQQ).toHaveBeenCalledTimes(2)
    expect(qqClient.sendMessage).toHaveBeenCalledTimes(1)

    const sentMsg = vi.mocked(qqClient.sendMessage).mock.calls[0][1] as any
    const texts = (sentMsg.content as any[])
      .filter(seg => seg.type === 'text')
      .map(seg => seg.data.text)

    expect(texts.some(text => text.includes('Alice'))).toBe(true)
    expect(texts.some(text => text.includes('caption here'))).toBe(true)
  })

  it('flushes without nickname header when disabled', async () => {
    const nicknameModeOff = vi.fn().mockReturnValue('00')
    vi.mocked(messageConverter.fromTelegram).mockImplementation((msg: any) => ({
      id: String(msg.id),
      platform: 'telegram',
      sender: { id: '1', name: msg.sender?.displayName || 'Alice' },
      chat: { id: String(msg.chat.id), type: 'group' },
      content: [{ type: 'image', data: { url: `img-${msg.id}` } }],
      timestamp: 1,
    }) as UnifiedMessage)
    vi.mocked(messageConverter.toNapCat).mockImplementation(async (msg: any) => {
      return msg.content.map((c: any) => ({ type: c.type, data: c.data }))
    })

    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, nicknameModeOff)
    const pair = { qqRoomId: '888' }

    const msg1: any = {
      id: 10,
      text: '',
      date: new Date('2025-01-01T00:00:00Z'),
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 100 },
      mediaGroupId: 'g1',
    }
    const msg2: any = {
      id: 11,
      text: '',
      date: new Date('2025-01-01T00:00:01Z'),
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 100 },
      mediaGroupId: 'g1',
    }

    await handler.handleMediaGroup(msg1, pair)
    await handler.handleMediaGroup(msg2, pair)

    await vi.runAllTimersAsync()

    const sentMsg = vi.mocked(qqClient.sendMessage).mock.calls[0][1] as any
    const texts = (sentMsg.content as any[])
      .filter(seg => seg.type === 'text')
      .map(seg => seg.data.text)

    expect(texts).toHaveLength(0)
  })

  it('handles flush error gracefully', async () => {
    vi.mocked(messageConverter.fromTelegram).mockReturnValue({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'Alice' },
      chat: { id: '100', type: 'group' },
      content: [{ type: 'image', data: { url: 'img' } }],
      timestamp: 1,
    } as UnifiedMessage)
    vi.mocked(messageConverter.toNapCat).mockResolvedValue([{ type: 'image', data: { url: 'img' } }])

    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)
    const msg: any = {
      id: 10,
      text: '',
      date: new Date(),
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 100 },
      mediaGroupId: 'g2',
    }

    await handler.handleMediaGroup(msg, { qqRoomId: '888' })

    // Mock sendMessage to fail
    vi.mocked(qqClient.sendMessage).mockRejectedValueOnce(new Error('Send failed'))

    await vi.runAllTimersAsync()

    // Should not throw, error is logged
    expect(qqClient.sendMessage).toHaveBeenCalled()
  })

  it('uses raw.groupedId when mediaGroupId is missing', async () => {
    vi.mocked(messageConverter.fromTelegram).mockReturnValue({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'Alice' },
      chat: { id: '100', type: 'group' },
      content: [{ type: 'image', data: { url: 'img' } }],
      timestamp: 1,
    } as UnifiedMessage)
    vi.mocked(messageConverter.toNapCat).mockResolvedValue([{ type: 'image', data: { url: 'img' } }])

    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)
    const msg: any = {
      id: 10,
      text: '',
      date: new Date(),
      sender: { id: 1, displayName: 'Alice' },
      chat: { id: 100 },
      raw: { groupedId: 'g3' }, // Test raw.groupedId path
    }

    const result = await handler.handleMediaGroup(msg, { qqRoomId: '888' })
    expect(result).toBe(true)
  })

  it('destroys handler and clears timers', async () => {
    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)

    const msg1: any = {
      id: 10,
      date: new Date(),
      sender: { id: 1 },
      chat: { id: 100 },
      mediaGroupId: 'g4',
    }
    const msg2: any = {
      id: 11,
      date: new Date(),
      sender: { id: 1 },
      chat: { id: 100 },
      mediaGroupId: 'g5',
    }

    await handler.handleMediaGroup(msg1, { qqRoomId: '888' })
    await handler.handleMediaGroup(msg2, { qqRoomId: '888' })

    // Destroy should clear all timers
    handler.destroy()

    // Advance timers - nothing should flush
    await vi.runAllTimersAsync()
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

  it('catches errors in setTimeout flush callback', async () => {
    vi.mocked(messageConverter.fromTelegram).mockImplementation(() => {
      throw new Error('Converter error')
    })

    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)
    const msg: any = {
      id: 10,
      date: new Date(),
      sender: { id: 1 },
      chat: { id: 100 },
      mediaGroupId: 'g6',
    }

    await handler.handleMediaGroup(msg, { qqRoomId: '888' })

    // Flush will fail due to converter error, should be caught in setTimeout callback
    await vi.runAllTimersAsync()

    // Should not throw, error is logged in catch block
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

  it('catches errors in setTimeout flush callback for subsequent messages', async () => {
    vi.mocked(messageConverter.fromTelegram).mockReturnValue({
      id: '1',
      platform: 'telegram',
      sender: { id: '1', name: 'Alice' },
      chat: { id: '100', type: 'group' },
      content: [{ type: 'image', data: { url: 'img' } }],
      timestamp: 1,
    } as UnifiedMessage)
    vi.mocked(messageConverter.toNapCat).mockResolvedValue([{ type: 'image', data: { url: 'img' } }])

    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)

    const msg1: any = {
      id: 10,
      date: new Date(),
      sender: { id: 1 },
      chat: { id: 100 },
      mediaGroupId: 'g7',
    }
    const msg2: any = {
      id: 11,
      date: new Date(),
      sender: { id: 1 },
      chat: { id: 100 },
      mediaGroupId: 'g7',
    }

    await handler.handleMediaGroup(msg1, { qqRoomId: '888' })

    // Mock toNapCat to fail for subsequent flush
    vi.mocked(messageConverter.toNapCat).mockRejectedValue(new Error('ToNapCat error'))

    await handler.handleMediaGroup(msg2, { qqRoomId: '888' })

    // Flush will fail, should be caught in setTimeout callback (line 62)
    await vi.runAllTimersAsync()

    // Should not throw
  })

  it('handles missing buffer in flushMediaGroup', async () => {
    const handler = new MediaGroupHandler(qqClient as any, prepareMediaForQQ, getNicknameMode)

    // Directly call flushMediaGroup with non-existent groupId
    // This tests line 77: if (!buffer) return
    await (handler as any).flushMediaGroup('non-existent-group')

    // Should not throw or call sendMessage
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })
})
