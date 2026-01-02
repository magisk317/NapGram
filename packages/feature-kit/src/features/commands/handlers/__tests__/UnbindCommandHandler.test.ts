import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnbindCommandHandler } from '../UnbindCommandHandler'

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
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
    getChat: vi.fn().mockResolvedValue({
      sendMessage: vi.fn().mockResolvedValue({}),
    }),
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
        findByQQ: vi.fn().mockReturnValue(null),
        find: vi.fn(),
        add: vi.fn(),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    } as any,
    replyTG: vi.fn().mockResolvedValue(undefined),
    extractThreadId: vi.fn().mockReturnValue(undefined),
  } as any
}

// Helper to create UnifiedMessage
function createMessage(text: string, senderId: string = '999999', chatId: string = '777777'): UnifiedMessage {
  return {
    id: '12345',
    platform: 'telegram',
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

describe('unbindCommandHandler', () => {
  let handler: UnbindCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new UnbindCommandHandler(mockContext)
  })

  describe('platform Filtering', () => {
    it('should ignore non-telegram platforms', async () => {
      const msg: UnifiedMessage = {
        ...createMessage('/unbind', '999999', '777777'),
        platform: 'qq',
      }

      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.findByTG).not.toHaveBeenCalled()
      expect(mockContext.instance.forwardPairs.findByQQ).not.toHaveBeenCalled()
      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('unbind by QQ Group ID', () => {
    it('should successfully unbind when QQ group ID is provided', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.findByQQ).toHaveBeenCalledWith('888888')
      expect(mockContext.instance.forwardPairs.remove).toHaveBeenCalledWith('888888')
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已解绑'),
        undefined,
      )
    })

    it('should handle negative QQ group IDs', async () => {
      const mockBinding = {
        qqRoomId: '-888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind -888888', '999999', '777777')
      await handler.execute(msg, ['-888888'])

      expect(mockContext.instance.forwardPairs.findByQQ).toHaveBeenCalledWith('-888888')
      expect(mockContext.instance.forwardPairs.remove).toHaveBeenCalledWith('-888888')
    })

    it('should include thread info in success message when thread exists', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: 12345,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('话题 12345'),
        12345,
      )
    })
  })

  describe('unbind by TG Chat/Thread', () => {
    it('should unbind current TG chat when no QQ group ID provided', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        undefined,
        true,
      )
      expect(mockContext.instance.forwardPairs.remove).toHaveBeenCalledWith('888888')
    })

    it('should unbind specific thread when thread ID is extracted', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: 54321,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)
      vi.mocked(mockContext.extractThreadId).mockReturnValue(54321)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        54321,
        false,
      )
      expect(mockContext.instance.forwardPairs.remove).toHaveBeenCalledWith('888888')
    })

    it('should use fuzzy match when no thread ID', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      // Third parameter should be true for fuzzy match
      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        undefined,
        true,
      )
    })
  })

  describe('error Handling', () => {
    it('should report error when binding not found by QQ group ID', async () => {
      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(null)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.remove).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未找到绑定关系'),
        undefined,
      )
    })

    it('should report error when binding not found by TG chat', async () => {
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.remove).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未找到绑定关系'),
        undefined,
      )
    })
  })

  describe('input Parsing', () => {
    it('should treat non-numeric argument as TG lookup', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind abc', '999999', '777777')
      await handler.execute(msg, ['abc'])

      // Should use TG lookup, not QQ
      expect(mockContext.instance.forwardPairs.findByQQ).not.toHaveBeenCalled()
      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalled()
    })

    it('should handle numeric strings correctly', async () => {
      const mockBinding = {
        qqRoomId: '123456789',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 123456789', '999999', '777777')
      await handler.execute(msg, ['123456789'])

      expect(mockContext.instance.forwardPairs.findByQQ).toHaveBeenCalledWith('123456789')
    })

    it('should handle QQ ID with spaces by treating as non-numeric', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 888 888', '999999', '777777')
      await handler.execute(msg, ['888', '888'])

      // Should fall back to TG lookup
      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalled()
    })
  })

  describe('reply Message Threading', () => {
    it('should reply to correct thread after unbinding', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: 99999,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      // Should reply to the thread that was unbound
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        99999,
      )
    })

    it('should use extracted thread ID when unbinding from TG', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)
      vi.mocked(mockContext.extractThreadId).mockReturnValue(77777)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        77777,
      )
    })
  })

  describe('edge Cases', () => {
    it('should handle very large QQ group IDs', async () => {
      const largeGroupId = '9999999999999999'
      const mockBinding = {
        qqRoomId: largeGroupId,
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage(`/unbind ${largeGroupId}`, '999999', '777777')
      await handler.execute(msg, [largeGroupId])

      expect(mockContext.instance.forwardPairs.remove).toHaveBeenCalledWith(largeGroupId)
    })

    it('should handle QQ group ID with leading zeros', async () => {
      const groupIdWithZeros = '00888888'
      const mockBinding = {
        qqRoomId: groupIdWithZeros,
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage(`/unbind ${groupIdWithZeros}`, '999999', '777777')
      await handler.execute(msg, [groupIdWithZeros])

      expect(mockContext.instance.forwardPairs.findByQQ).toHaveBeenCalledWith(
        groupIdWithZeros,
      )
    })

    it('should handle empty arguments array gracefully', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalled()
      expect(mockContext.instance.forwardPairs.remove).toHaveBeenCalledWith('888888')
    })
  })
})
