import type { UnifiedMessage } from '../../../../domain/message'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { messageConverter } from '../../../../domain/message'
import { MediaGroupHandler } from '../MediaGroupHandler'

vi.mock('../../../../domain/message', () => ({
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
})
