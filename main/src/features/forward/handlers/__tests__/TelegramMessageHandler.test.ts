import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramMessageHandler } from '../TelegramMessageHandler'
import { messageConverter } from '../../../../domain/message'
import Instance from '../../../../domain/models/Instance'
import db from '../../../../domain/models/db'

const publishMessage = vi.fn()

vi.mock('../../../../plugins/core/event-publisher', () => ({
  getEventPublisher: () => ({ publishMessage }),
}))

vi.mock('../../../../domain/message', () => ({
  messageConverter: {
    fromTelegram: vi.fn(),
    toNapCat: vi.fn(),
  },
}))

vi.mock('../../../../domain/models/Instance', () => ({
  default: {
    instances: [],
  },
}))

vi.mock('../../../../domain/models/db', () => ({
  default: {
    message: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe('telegramMessageHandler', () => {
  const qqClient = {
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'qq-123' }),
    sendGroupForwardMsg: vi.fn().mockResolvedValue({ success: true, messageId: 'qq-456' }),
    uin: '123456',
  }
  const mediaGroupHandler = {
    handleMediaGroup: vi.fn().mockResolvedValue(false),
  }
  const replyResolver = {
    resolveTGReply: vi.fn().mockResolvedValue(null),
  }
  const prepareMediaForQQ = vi.fn().mockResolvedValue(undefined)
  const renderContent = vi.fn().mockReturnValue('rendered')
  const getNicknameMode = vi.fn().mockReturnValue('00')

  let handler: TelegramMessageHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new TelegramMessageHandler(
      qqClient as any,
      mediaGroupHandler as any,
      replyResolver as any,
      prepareMediaForQQ,
      renderContent,
      getNicknameMode,
    )
  })

  it('skips forwarding command messages and handles plugin interaction', async () => {
    const tgMsg: any = {
      id: 1,
      text: '/help',
      date: new Date(),
      chat: { id: 100 },
      sender: { id: 10, displayName: 'Alice' },
      raw: { replyTo: { replyToTopId: 789 } }
    }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }

    // Setup instance for plugin reply/send
    const mockInstance = {
      id: 1,
      tgBot: {
        getChat: vi.fn().mockResolvedValue({
          sendMessage: vi.fn().mockResolvedValue({ id: 999 }),
          deleteMessages: vi.fn().mockResolvedValue(undefined),
        })
      }
    }
      ; (Instance.instances as any).push(mockInstance)

    await handler.handleTGMessage(tgMsg, pair)

    expect(publishMessage).toHaveBeenCalled()
    const event = publishMessage.mock.calls[0][0]
    expect(event.instanceId).toBe(1)
    expect(event.message.text).toBe('/help')

    // Test reply/send/recall functions in the event
    await event.reply('hello')
    expect(mockInstance.tgBot.getChat).toHaveBeenCalledWith(100)

    await event.send('world')
    await event.recall()

    // Cleanup singleton mock
    Instance.instances.length = 0
  })

  it('handles media group messages by skipping further processing', async () => {
    mediaGroupHandler.handleMediaGroup.mockResolvedValueOnce(true)
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date() }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }

    await handler.handleTGMessage(tgMsg, pair)

    expect(mediaGroupHandler.handleMediaGroup).toHaveBeenCalled()
    expect(messageConverter.fromTelegram).not.toHaveBeenCalled()
  })

  it('handles normal text messages with nickname mode 00', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Hello' } }],
      chat: { id: '888' },
      timestamp: Date.now()
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    expect(sentMsg.content).toContainEqual({ type: 'text', data: { text: '' } }) // Header is empty for mode 00
    expect(db.message.create).toHaveBeenCalled()
  })

  it('handles messages with nickname mode 01 (show nickname)', async () => {
    getNicknameMode.mockReturnValueOnce('01')
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Hello' } }],
      chat: { id: '888' },
      timestamp: Date.now()
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    await handler.handleTGMessage(tgMsg, pair)

    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    expect(sentMsg.content).toContainEqual({ type: 'text', data: { text: 'Alice:\n' } })
  })

  it('handles video/file as forward message nodes', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'video', data: { file: 'vid' } }],
      chat: { id: '888' },
      timestamp: Date.now()
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendGroupForwardMsg).toHaveBeenCalled()
    const nodes = qqClient.sendGroupForwardMsg.mock.calls[0][1]
    expect(nodes[0].data.content).toContainEqual({ type: 'video', data: { file: 'vid' } })
  })

  it('handles audio/image with split send', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'image', data: { file: 'img' } }, { type: 'text', data: { text: 'caption' } }],
      chat: { id: '888' },
      timestamp: Date.now()
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'image', data: { file: 'img' } }, { type: 'text', data: { text: 'caption' } }])

    await handler.handleTGMessage(tgMsg, pair)

    // Should call sendMessage twice: once for text/header, once for media
    expect(qqClient.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('handles reply resolution', async () => {
    const tgMsg: any = { id: 1, text: 'Reply', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    replyResolver.resolveTGReply.mockResolvedValueOnce({
      seq: 555,
      time: 12345,
      senderUin: '999',
      qqRoomId: '888'
    })
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Reply' } }],
      chat: { id: '888' },
      timestamp: Date.now()
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Reply' } }])

    await handler.handleTGMessage(tgMsg, pair)

    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    expect(sentMsg.content.some((c: any) => c.type === 'reply')).toBe(true)
  })
})
