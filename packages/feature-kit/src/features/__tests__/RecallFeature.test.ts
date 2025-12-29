import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecallFeature } from '../RecallFeature'

// Mock dependencies
vi.mock('../../../../../main/src/domain/models/db', () => ({
  default: {
    message: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('../../../../../main/src/domain/models/env', () => ({
  default: {
    ENABLE_AUTO_RECALL: true,
  },
}))

vi.mock('../../../../../main/src/shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

describe('recallFeature', () => {
  let recallFeature: RecallFeature
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any
  let db: any

  beforeEach(async () => {
    vi.clearAllMocks()
    db = (await import('../../../../../main/src/domain/models/db')).default
    mockInstance = { id: 1 }
    mockTgBot = {
      addDeletedMessageEventHandler: vi.fn(),
      removeDeletedMessageEventHandler: vi.fn(),
      getChat: vi.fn(),
    }
    mockQqClient = {
      on: vi.fn(),
      off: vi.fn(),
      recallMessage: vi.fn(),
    }
    recallFeature = new RecallFeature(mockInstance, mockTgBot, mockQqClient)
  })

  it('sets up listeners on initialization', () => {
    expect(mockQqClient.on).toHaveBeenCalledWith('recall', expect.any(Function))
    expect(mockTgBot.addDeletedMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('handleQQRecall', () => {
    it('skips recall if auto-recall is disabled', async () => {
      const env = (await import('../../../../../main/src/domain/models/env')).default
      env.ENABLE_AUTO_RECALL = false

      // Get the handleQQRecall listener
      const handleQQRecall = mockQqClient.on.mock.calls.find(call => call[0] === 'recall')[1]
      await handleQQRecall({ messageId: '123', chatId: '456' })

      expect(db.message.findFirst).not.toHaveBeenCalled()

      env.ENABLE_AUTO_RECALL = true // Reset
    })

    it('deletes TG message and updates DB on QQ recall', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find(call => call[0] === 'recall')[1]

      db.message.findFirst.mockResolvedValue({
        id: 1,
        tgChatId: BigInt(789),
        tgMsgId: 101,
      })

      const mockChat = { deleteMessages: vi.fn() }
      mockTgBot.getChat.mockResolvedValue(mockChat)

      await handleQQRecall({ messageId: '123', chatId: '456' })

      expect(mockTgBot.getChat).toHaveBeenCalledWith(789)
      expect(mockChat.deleteMessages).toHaveBeenCalledWith([101])
      expect(db.message.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { ignoreDelete: true },
      })
    })

    it('handles error in TG message deletion', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find(call => call[0] === 'recall')[1]
      db.message.findFirst.mockResolvedValue({ id: 1, tgChatId: BigInt(789), tgMsgId: 101 })
      mockTgBot.getChat.mockResolvedValue({ deleteMessages: vi.fn().mockRejectedValue(new Error('TG Error')) })

      await handleQQRecall({ messageId: '123', chatId: '456' })
      // Should log error but still update DB
      expect(db.message.update).toHaveBeenCalled()
    })

    it('handles general error in handleQQRecall', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find(call => call[0] === 'recall')[1]
      db.message.findFirst.mockRejectedValue(new Error('DB Error'))

      await handleQQRecall({ messageId: '123', chatId: '456' })
      // Should not crash
    })

    it('handles missing DB entry', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find(call => call[0] === 'recall')[1]
      db.message.findFirst.mockResolvedValue(null)

      await handleQQRecall({ messageId: '123', chatId: '456' })

      expect(mockTgBot.getChat).not.toHaveBeenCalled()
    })
  })

  describe('handleTGDelete', () => {
    it('handles invalid delete update', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      await handleTGDelete({ channelId: BigInt(456), messages: null })
      expect(db.message.findFirst).not.toHaveBeenCalled()
    })

    it('handles multiple messages and some missing mappings', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      db.message.findFirst
        .mockResolvedValueOnce({ seq: '123' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ seq: '125' })

      await handleTGDelete({
        channelId: BigInt(456),
        messages: [101, 102, 103],
      })

      expect(mockQqClient.recallMessage).toHaveBeenCalledTimes(2)
      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('123')
      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('125')
    })

    it('recalls QQ message on TG delete', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]

      db.message.findFirst.mockResolvedValue({
        seq: 'qq-seq-123',
      })

      await handleTGDelete({
        channelId: BigInt(456),
        messages: [101],
      })

      expect(db.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          tgMsgId: 101,
        }),
      }))
      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('qq-seq-123')
    })

    it('handles missing sequence in DB entry', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      db.message.findFirst.mockResolvedValue({ seq: null })

      await handleTGDelete({
        channelId: BigInt(456),
        messages: [101],
      })

      expect(mockQqClient.recallMessage).not.toHaveBeenCalled()
    })

    it('handles error in QQ recall', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      db.message.findFirst.mockResolvedValue({ seq: '123' })
      mockQqClient.recallMessage.mockRejectedValue(new Error('QQ Error'))

      await handleTGDelete({ channelId: BigInt(456), messages: [101] })
      // Should log warning and continue
    })
  })

  describe('handleTGRecall', () => {
    it('handles missing mapping in handleTGRecall', async () => {
      db.message.findFirst.mockResolvedValue(null)
      await recallFeature.handleTGRecall(456, 101)
      expect(mockQqClient.recallMessage).not.toHaveBeenCalled()
    })

    it('manually triggers TG recall to QQ', async () => {
      db.message.findFirst.mockResolvedValue({
        id: 1,
        seq: 'seq123',
      })

      await recallFeature.handleTGRecall(456, 101)

      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('seq123')
      expect(db.message.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { ignoreDelete: true },
      })
    })

    it('handles error in QQ recall during manual trigger', async () => {
      db.message.findFirst.mockResolvedValue({ id: 1, seq: '123' })
      mockQqClient.recallMessage.mockRejectedValue(new Error('QQ Error'))

      await recallFeature.handleTGRecall(456, 101)
      // Should still update DB
      expect(db.message.update).toHaveBeenCalled()
    })
  })

  describe('destroy', () => {
    it('removes listeners', () => {
      recallFeature.destroy()
      expect(mockQqClient.off).toHaveBeenCalledWith('recall', expect.any(Function))
      expect(mockTgBot.removeDeletedMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
    })
  })
})
