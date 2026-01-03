import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env, schema } from '@napgram/infra-kit'

import { ForwardControlCommandHandler } from '../ForwardControlCommandHandler'

// Mock database
vi.mock('@napgram/infra-kit', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
    })),
  },
  schema: {
    forwardPair: { id: 'id' },
  },
  eq: vi.fn(),
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080'
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
}))

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn(),
    recallMessage: vi.fn(),
    getMessage: vi.fn(),
    getFriendList: vi.fn(),
    getGroupList: vi.fn(),
    getGroupMemberList: vi.fn(),
    getGroupMemberInfo: vi.fn(),
    getFriendInfo: vi.fn(),
    getGroupInfo: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    destroy: vi.fn(),
  } as any
}

// Mock Telegram Bot
function createMockTgBot() {
  return {
    sendMessage: vi.fn().mockResolvedValue({}),
  } as any
}

// Mock Command Context
function createMockContext(qqClient: IQQClient, tgBot: any): CommandContext {
  return {
    qqClient,
    tgBot,
    registry: {} as any,
    permissionChecker: {} as any,
    stateManager: {} as any,
    instance: {
      id: 1,
      owner: '123456',
      forwardPairs: {
        findByTG: vi.fn().mockReturnValue(null),
        findByQQ: vi.fn(),
        find: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
      },
    } as any,
    replyTG: vi.fn().mockResolvedValue(undefined),
    extractThreadId: vi.fn().mockReturnValue(undefined),
  } as any
}

// Helper to create UnifiedMessage
function createMessage(text: string, senderId: string = '999999', chatId: string = '777777', platform: 'telegram' | 'qq' = 'telegram'): UnifiedMessage {
  return {
    id: '12345',
    platform,
    sender: {
      id: senderId,
      name: 'TestUser',
    },
    chat: {
      id: chatId,
      type: 'group',
    },
    content: [
      {
        type: 'text',
        data: { text },
      },
    ],
    timestamp: Date.now(),
    metadata: {},
  }
}

describe('forwardControlCommandHandler', () => {
  let handler: ForwardControlCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext
  let mockPair: any

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new ForwardControlCommandHandler(mockContext)

    // Reset mock pair
    mockPair = {
      id: 1,
      qqRoomId: '888888',
      tgChatId: '777777',
      forwardMode: null,
    }

    mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)
    vi.mocked(db.update).mockClear()
  })

  describe('platform Filtering', () => {
    it('should only process commands from Telegram platform', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777', 'qq')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })
  })

  describe('no Binding Scenario', () => {
    it('should show error when chat is not bound', async () => {
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未绑定任何 QQ 群'),
        undefined,
      )
      expect(db.update).not.toHaveBeenCalled()
    })
  })

  describe('/forwardoff command', () => {
    it('should set forward mode to off', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should update pair in memory', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockPair.forwardMode).toBe('off')
    })

    it('should send success message', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已暂停双向转发'),
        undefined,
      )
    })
  })

  describe('/forwardon command', () => {
    it('should set forward mode to null (normal)', async () => {
      mockPair.forwardMode = 'off'

      const msg = createMessage('/forwardon', '999999', '777777')
      await handler.execute(msg, [], 'forwardon')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/forwardon', '999999', '777777')
      await handler.execute(msg, [], 'forwardon')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已恢复双向转发'),
        undefined,
      )
    })
  })

  describe('/disable_qq_forward command', () => {
    it('should set forward mode to tg_only', async () => {
      const msg = createMessage('/disable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_qq_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/disable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_qq_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已停止 QQ → TG 的转发'),
        undefined,
      )
    })
  })

  describe('/enable_qq_forward command', () => {
    it('should set forward mode to null (normal)', async () => {
      mockPair.forwardMode = 'tg_only'

      const msg = createMessage('/enable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_qq_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/enable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_qq_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已恢复 QQ → TG 的转发'),
        undefined,
      )
    })
  })

  describe('/disable_tg_forward command', () => {
    it('should set forward mode to qq_only', async () => {
      const msg = createMessage('/disable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_tg_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/disable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_tg_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已停止 TG → QQ 的转发'),
        undefined,
      )
    })
  })

  describe('/enable_tg_forward command', () => {
    it('should set forward mode to null (normal)', async () => {
      mockPair.forwardMode = 'qq_only'

      const msg = createMessage('/enable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_tg_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/enable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_tg_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已恢复 TG → QQ 的转发'),
        undefined,
      )
    })
  })

  describe('unknown Command', () => {
    it('should reject unknown command', async () => {
      const msg = createMessage('/unknown', '999999', '777777')
      await handler.execute(msg, [], 'unknown')

      expect(db.update).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未知命令'),
        undefined,
      )
    })
  })

  describe('binding Information Display', () => {
    it('should include binding info in success message', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('QQ 888888'),
        undefined,
      )
    })

    it('should include thread ID in binding info when present', async () => {
      mockPair.tgThreadId = 12345
      vi.mocked(mockContext.extractThreadId).mockReturnValue(12345)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('话题 12345'),
        12345,
      )
    })
  })

  describe('error Handling', () => {
    it('should handle database update failure', async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(new Error('DB Error')),
        })),
      } as any)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('更新转发模式失败'),
        undefined,
      )
    })

    it('should not update memory on database failure', async () => {
      const originalMode = mockPair.forwardMode
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(new Error('DB Error')),
        })),
      } as any)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      // Memory should not be updated if DB update fails
      expect(mockPair.forwardMode).toBe(originalMode)
    })
  })

  describe('thread Support', () => {
    it('should use extracted thread ID', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(99999)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        99999,
        true,
      )
    })

    it('should reply to correct thread', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(54321)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        54321,
      )
    })
  })
})
