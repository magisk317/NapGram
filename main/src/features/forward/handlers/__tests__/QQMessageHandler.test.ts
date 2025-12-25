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
})
