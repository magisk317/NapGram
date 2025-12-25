import type { UnifiedMessage } from '../../../../domain/message'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QQMessageHandler } from '../QQMessageHandler'

function createMessage(): UnifiedMessage {
  return {
    id: '123',
    platform: 'qq',
    sender: { id: '111', name: 'Tester' },
    chat: { id: '222', type: 'group' },
    content: [{ type: 'text', data: { text: 'hello' } }],
    timestamp: Date.now(),
  }
}

describe('qqMessageHandler', () => {
  const instance = {
    tgBot: { getChat: vi.fn() },
    qqClient: { uin: 123, nickname: 'Bot', sendMessage: vi.fn() },
  }
  const forwardMap = {
    findByQQ: vi.fn(),
  }
  const modeService = {
    isQQToTGEnabled: vi.fn(),
    nicknameMode: '00',
  }
  const mapper = {
    saveMessage: vi.fn(),
  }
  const replyResolver = {
    resolveQQReply: vi.fn(),
  }
  const telegramSender = {
    sendToTelegram: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early when QQ->TG forwarding is disabled', async () => {
    modeService.isQQToTGEnabled.mockReturnValue(false)

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    await handler.handle(createMessage())

    expect(forwardMap.findByQQ).not.toHaveBeenCalled()
    expect(telegramSender.sendToTelegram).not.toHaveBeenCalled()
  })

  it('returns when no forward pair is found', async () => {
    modeService.isQQToTGEnabled.mockReturnValue(true)
    forwardMap.findByQQ.mockReturnValue(null)

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    await handler.handle(createMessage())

    expect(forwardMap.findByQQ).toHaveBeenCalled()
    expect(telegramSender.sendToTelegram).not.toHaveBeenCalled()
  })

  it('successfully forwards message and saves mapping', async () => {
    modeService.isQQToTGEnabled.mockReturnValue(true)
    forwardMap.findByQQ.mockReturnValue({
      instanceId: 1,
      qqRoomId: '222',
      tgChatId: '333',
      tgThreadId: null,
    })
    instance.tgBot.getChat.mockResolvedValue({ id: 333 })
    replyResolver.resolveQQReply.mockResolvedValue(undefined)
    telegramSender.sendToTelegram.mockResolvedValue({ id: 999 })

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    await handler.handle(createMessage())

    expect(telegramSender.sendToTelegram).toHaveBeenCalled()
    expect(mapper.saveMessage).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 999 },
      1,
      '222',
      333n,
    )
  })

  it('handles error during forwarding gracefully', async () => {
    modeService.isQQToTGEnabled.mockReturnValue(true)
    forwardMap.findByQQ.mockReturnValue({
      instanceId: 1,
      qqRoomId: '222',
      tgChatId: '333',
    })
    instance.tgBot.getChat.mockRejectedValue(new Error('Chat not found'))

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    // Should not throw
    await handler.handle(createMessage())

    expect(mapper.saveMessage).not.toHaveBeenCalled()
  })

  it('handles null sentMsg (send failure)', async () => {
    modeService.isQQToTGEnabled.mockReturnValue(true)
    forwardMap.findByQQ.mockReturnValue({
      instanceId: 1,
      qqRoomId: '222',
      tgChatId: '333',
    })
    instance.tgBot.getChat.mockResolvedValue({ id: 333 })
    replyResolver.resolveQQReply.mockResolvedValue(undefined)
    telegramSender.sendToTelegram.mockResolvedValue(null)

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    await handler.handle(createMessage())

    expect(mapper.saveMessage).not.toHaveBeenCalled()
  })
})
