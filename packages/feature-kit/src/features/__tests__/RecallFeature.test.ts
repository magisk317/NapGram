import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env, schema } from '@napgram/infra-kit'
import { RecallFeature } from '../RecallFeature'

// Mock dependencies
vi.mock('@napgram/infra-kit', () => {
  const mockDb = {
    query: {
      message: { findFirst: vi.fn(), findMany: vi.fn() },
      forwardPair: { findFirst: vi.fn(), findMany: vi.fn() },
      forwardMultiple: { findFirst: vi.fn(), findMany: vi.fn() },
      qqRequest: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn().mockResolvedValue([]),
        })),
        groupBy: vi.fn().mockResolvedValue([]),
      })),
    })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }

  return {
    db: mockDb,
    schema: {
      message: { id: 'id', tgChatId: 'tgChatId', tgMsgId: 'tgMsgId', qqRoomId: 'qqRoomId', seq: 'seq', instanceId: 'instanceId' },
      forwardPair: { id: 'id' },
      qqRequest: { id: 'id' },
    },
    eq: vi.fn(),
    and: vi.fn(),
    lt: vi.fn(),
    desc: vi.fn(),
    gte: vi.fn(),
    sql: vi.fn(),
    count: vi.fn(),
    env: {
      ENABLE_AUTO_RECALL: true,
      TG_MEDIA_TTL_SECONDS: undefined,
      DATA_DIR: '/tmp',
      CACHE_DIR: '/tmp/cache',
      WEB_ENDPOINT: 'http://napgram-dev:8080',
    },
    temp: { TEMP_PATH: '/tmp', createTempFile: vi.fn(() => ({ path: '/tmp/test', cleanup: vi.fn() })) },
    getLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    })),
    configureInfraKit: vi.fn(),
    performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
  }
})





describe('recallFeature', () => {
  let recallFeature: RecallFeature
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any

  beforeEach(async () => {
    vi.clearAllMocks()
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

      env.ENABLE_AUTO_RECALL = false

      // Get the handleQQRecall listener
      const handleQQRecall = mockQqClient.on.mock.calls.find((call: any) => call[0] === 'recall')[1]
      await handleQQRecall({ messageId: (123 as any), chatId: '456' })

      expect(vi.mocked(db.query.message.findFirst)).not.toHaveBeenCalled()

      env.ENABLE_AUTO_RECALL = true // Reset
    })

    it('deletes TG message and updates DB on QQ recall', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find((call: any) => call[0] === 'recall')[1]

      vi.mocked(db.query.message.findFirst).mockResolvedValue({
        id: 1,
        tgChatId: BigInt(789),
        tgMsgId: 101,
      } as any)

      const mockChat = { deleteMessages: vi.fn() }
      mockTgBot.getChat.mockResolvedValue(mockChat)

      await handleQQRecall({ messageId: (123 as any), chatId: '456' })

      expect(mockTgBot.getChat).toHaveBeenCalledWith(789)
      expect(mockChat.deleteMessages).toHaveBeenCalledWith([101])
      expect(vi.mocked(db.update)).toHaveBeenCalledWith(schema.message)
    })

    it('handles error in TG message deletion', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find((call: any) => call[0] === 'recall')[1]
      vi.mocked(db.query.message.findFirst).mockResolvedValue({ id: 1, tgChatId: BigInt(789), tgMsgId: 101 } as any)
      mockTgBot.getChat.mockResolvedValue({ deleteMessages: vi.fn().mockRejectedValue(new Error('TG Error')) })

      await handleQQRecall({ messageId: (123 as any), chatId: '456' })
      // Should log error but still update DB
      expect(vi.mocked(db.update)).toHaveBeenCalled()
    })

    it('handles general error in handleQQRecall', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find((call: any) => call[0] === 'recall')[1]
      vi.mocked(db.query.message.findFirst).mockRejectedValue(new Error('DB Error'))

      await handleQQRecall({ messageId: (123 as any), chatId: '456' })
      // Should not crash
    })

    it('handles missing DB entry', async () => {
      const handleQQRecall = mockQqClient.on.mock.calls.find((call: any) => call[0] === 'recall')[1]
      vi.mocked(db.query.message.findFirst).mockResolvedValue(undefined)

      await handleQQRecall({ messageId: (123 as any), chatId: '456' })

      expect(mockTgBot.getChat).not.toHaveBeenCalled()
    })
  })

  describe('handleTGDelete', () => {
    it('handles invalid delete update', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      await handleTGDelete({ channelId: BigInt(456), messages: null })
      expect(db.query.message.findFirst).not.toHaveBeenCalled()
    })

    it('handles multiple messages and some missing mappings', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      vi.mocked(db.query.message.findFirst)
        .mockResolvedValueOnce({ seq: 123 } as any)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ seq: 125 } as any)

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

      vi.mocked(db.query.message.findFirst).mockResolvedValue({
        seq: 123,
      } as any)

      await handleTGDelete({
        channelId: BigInt(456),
        messages: [101],
      })

      expect(db.query.message.findFirst).toHaveBeenCalled()
      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('123')
    })

    it('handles missing sequence in DB entry', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      vi.mocked(db.query.message.findFirst).mockResolvedValue({ seq: null } as any)

      await handleTGDelete({
        channelId: BigInt(456),
        messages: [101],
      })

      expect(mockQqClient.recallMessage).not.toHaveBeenCalled()
    })

    it('handles error in QQ recall', async () => {
      const handleTGDelete = mockTgBot.addDeletedMessageEventHandler.mock.calls[0][0]
      vi.mocked(db.query.message.findFirst).mockResolvedValue({ seq: 123 } as any)
      mockQqClient.recallMessage.mockRejectedValue(new Error('QQ Error'))

      await handleTGDelete({ channelId: BigInt(456), messages: [101] })
      // Should log warning and continue
    })
  })

  describe('handleTGRecall', () => {
    it('handles missing mapping in handleTGRecall', async () => {
      vi.mocked(db.query.message.findFirst).mockResolvedValue(undefined)
      await recallFeature.handleTGRecall(456, 101)
      expect(mockQqClient.recallMessage).not.toHaveBeenCalled()
    })

    it('manually triggers TG recall to QQ', async () => {
      vi.mocked(db.query.message.findFirst).mockResolvedValue({
        id: 1,
        seq: 123,
      } as any)

      await recallFeature.handleTGRecall(456, 101)

      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('123')
      expect(vi.mocked(db.update)).toHaveBeenCalledWith(schema.message)
    })

    it('handles error in QQ recall during manual trigger', async () => {
      vi.mocked(db.query.message.findFirst).mockResolvedValue({ id: 1, seq: 123 } as any)
      mockQqClient.recallMessage.mockRejectedValue(new Error('QQ Error'))

      await recallFeature.handleTGRecall(456, 101)
      // Should still update DB
      expect(vi.mocked(db.update)).toHaveBeenCalled()
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
