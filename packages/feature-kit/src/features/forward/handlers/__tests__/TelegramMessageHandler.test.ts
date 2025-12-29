import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messageConverter } from '../../../../../../../main/src/domain/message'
import db from '../../../../../../../main/src/domain/models/db'
import { TelegramMessageHandler } from '../TelegramMessageHandler'

vi.mock('../../../../../../../main/src/domain/message', () => ({
  messageConverter: {
    fromTelegram: vi.fn(),
    toNapCat: vi.fn(),
  },
}))


vi.mock('../../../../../../../main/src/domain/models/db', () => ({
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      qqRoomId: '888',
    })
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Reply' } }],
      chat: { id: '888' },
      timestamp: Date.now(),
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Reply' } }])

    await handler.handleTGMessage(tgMsg, pair)

    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    expect(sentMsg.content.some((c: any) => c.type === 'reply')).toBe(true)
  })

  it('handles receipt with error', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Hello' } }],
      chat: { id: '888' },
      timestamp: Date.now(),
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    // Mock failure
    qqClient.sendMessage.mockResolvedValueOnce({ success: false, error: 'Send failed' })

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(db.message.create).not.toHaveBeenCalled()
  })

  it('handles receipt without messageId', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Hello' } }],
      chat: { id: '888' },
      timestamp: Date.now(),
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    // Mock success but no ID
    qqClient.sendMessage.mockResolvedValueOnce({ success: true })

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(db.message.create).not.toHaveBeenCalled()
  })

  it('handles db save failure gracefully', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'text', data: { text: 'Hello' } }],
      chat: { id: '888' },
      timestamp: Date.now(),
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    // Mock DB failure
    db.message.create.mockRejectedValueOnce(new Error('DB Error'))

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(db.message.create).toHaveBeenCalled()
    // Should catch error and log it, not throw
  })

  it('handles hint message sending failure gracefully', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      id: '1',
      sender: { name: 'Alice' },
      content: [{ type: 'video', data: { file: 'vid' } }],
      chat: { id: '888' },
      timestamp: Date.now(),
    }
    messageConverter.fromTelegram.mockReturnValueOnce(unified)
    messageConverter.toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    // Enable nickname mode to trigger hint
    getNicknameMode.mockReturnValueOnce('01')

    // First call (hint) fails
    qqClient.sendMessage.mockRejectedValueOnce(new Error('Hint failed'))

    await handler.handleTGMessage(tgMsg, pair)

    // Should proceed to send forward message
    expect(qqClient.sendGroupForwardMsg).toHaveBeenCalled()
  })

  it('handles general error in handleTGMessage', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }

    // Mock converter throwing error
    messageConverter.fromTelegram.mockImplementationOnce(() => {
      throw new Error('Converter Logic Error')
    })

    await handler.handleTGMessage(tgMsg, pair)

    // Should catch and log error
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

})
