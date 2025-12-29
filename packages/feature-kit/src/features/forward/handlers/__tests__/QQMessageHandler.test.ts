import type { UnifiedMessage } from '../../../../../../../main/src/domain/message'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as eventPublisher from '../../../../../../../main/src/plugins/core/event-publisher'

const publishMessageMock = vi.fn()

let QQMessageHandler: typeof import('../QQMessageHandler').QQMessageHandler

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

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(eventPublisher, 'getEventPublisher').mockReturnValue({
      publishMessage: publishMessageMock,
    } as any)
    if (!QQMessageHandler) {
      ({ QQMessageHandler } = await import('../QQMessageHandler'))
    }
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

  it('publishes QQ message events and supports reply/send/recall', async () => {
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
    instance.qqClient.sendMessage.mockResolvedValue({ messageId: 'm1' })

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    await handler.handle(createMessage())

    expect(publishMessageMock).toHaveBeenCalledTimes(1)
    const event = publishMessageMock.mock.calls[0][0]

    await event.reply([{ type: 'text', data: { text: 'reply' } }])
    await event.send([{ type: 'text', data: { text: 'send' } }])
    await event.recall()

    expect(instance.qqClient.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('publishes private channel events with trimmed text', async () => {
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
    instance.qqClient.sendMessage.mockResolvedValue({ messageId: 'm1' })

    const handler = new QQMessageHandler(
      instance as any,
      forwardMap as any,
      modeService as any,
      mapper as any,
      replyResolver as any,
      telegramSender as any,
    )

    const msg: UnifiedMessage = {
      id: '123',
      platform: 'qq',
      sender: { id: '111', name: 'Tester' },
      chat: { id: '222', type: 'private' },
      content: [
        { type: 'text', data: { text: 'hello' } },
        { type: 'image', data: { url: 'img' } },
        { type: 'text', data: { text: 'world' } },
      ],
      timestamp: Date.now(),
    }

    await handler.handle(msg)

    const event = publishMessageMock.mock.calls[0][0]
    expect(event.channelType).toBe('private')
    expect(event.message.text).toBe('hello world')

    await event.reply('ok')
    await event.send({ custom: true })

    expect(instance.qqClient.sendMessage).toHaveBeenCalledTimes(2)
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

  it('handles missing QQ client when publishing events', async () => {
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

    const originalClient = instance.qqClient
    instance.qqClient = undefined as any

    try {
      const handler = new QQMessageHandler(
        instance as any,
        forwardMap as any,
        modeService as any,
        mapper as any,
        replyResolver as any,
        telegramSender as any,
      )

      await handler.handle(createMessage())
    }
    finally {
      instance.qqClient = originalClient
    }

    expect(publishMessageMock).not.toHaveBeenCalled()
  })
})
