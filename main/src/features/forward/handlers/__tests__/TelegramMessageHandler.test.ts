import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramMessageHandler } from '../TelegramMessageHandler'

const publishMessage = vi.fn()

vi.mock('../../../../plugins/core/event-publisher', () => ({
  getEventPublisher: () => ({ publishMessage }),
}))

describe('telegramMessageHandler', () => {
  const qqClient = {
    sendMessage: vi.fn(),
    sendGroupForwardMsg: vi.fn(),
    uin: 123,
  }
  const mediaGroupHandler = {
    handleMediaGroup: vi.fn(),
  }
  const replyResolver = {
    resolveTGReply: vi.fn(),
  }
  const prepareMediaForQQ = vi.fn()
  const renderContent = vi.fn().mockReturnValue('')
  const getNicknameMode = vi.fn().mockReturnValue('00')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips forwarding command messages', async () => {
    const handler = new TelegramMessageHandler(
      qqClient as any,
      mediaGroupHandler as any,
      replyResolver as any,
      prepareMediaForQQ,
      renderContent,
      getNicknameMode,
    )

    const tgMsg: any = {
      id: 1,
      text: '/help',
      date: new Date(),
      chat: { id: 100 },
      sender: { id: 10, displayName: 'Alice' },
    }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }

    await handler.handleTGMessage(tgMsg, pair)

    expect(publishMessage).toHaveBeenCalled()
    expect(mediaGroupHandler.handleMediaGroup).not.toHaveBeenCalled()
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
    expect(prepareMediaForQQ).not.toHaveBeenCalled()
  })
})
