import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BindCommandHandler } from '../BindCommandHandler'

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
    stateManager: {
      setBindingState: vi.fn(),
    } as any,
    instance: {
      id: 1,
      owner: '123456',
      forwardPairs: {
        findByTG: vi.fn().mockReturnValue(null),
        findByQQ: vi.fn(),
        find: vi.fn(),
        add: vi.fn().mockImplementation(async (qqRoomId: string, tgChatId: string) => ({
          qqRoomId,
          tgChatId,
        })),
        remove: vi.fn(),
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

describe('bindCommandHandler', () => {
  let handler: BindCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new BindCommandHandler(mockContext)
  })

  describe('interactive Binding Flow', () => {
    it('should enter interactive mode when no arguments provided', async () => {
      const msg = createMessage('/bind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.stateManager.setBindingState).toHaveBeenCalledWith(
        '777777',
        '999999',
        undefined,
      )

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('请输入要绑定的 QQ 群号'),
        undefined,
      )
    })

    it('should show usage hint in interactive mode', async () => {
      const msg = createMessage('/bind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('/bind 123456'),
        undefined,
      )
    })
  })

  describe('direct Binding', () => {
    it('should successfully bind QQ group to TG chat', async () => {
      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        '888888',
        '777777',
        undefined,
      )

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('绑定成功'),
        undefined,
      )
    })

    it('should bind with thread ID when provided', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(12345)

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        '888888',
        '777777',
        12345,
      )

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('话题 12345'),
        12345,
      )
    })

    it('should accept negative QQ group IDs', async () => {
      const msg = createMessage('/bind -888888', '999999', '777777')
      await handler.execute(msg, ['-888888'])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        '-888888',
        '777777',
        undefined,
      )

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('绑定成功'),
        undefined,
      )
    })
  })

  describe('input Validation', () => {
    it('should reject non-numeric QQ group ID', async () => {
      const msg = createMessage('/bind abc123', '999999', '777777')
      await handler.execute(msg, ['abc123'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('必须是数字'),
        undefined,
      )
    })

    it('should reject QQ group ID with special characters', async () => {
      const msg = createMessage('/bind 888-888', '999999', '777777')
      await handler.execute(msg, ['888-888'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('必须是数字'),
        undefined,
      )
    })

    it('should reject empty QQ group ID', async () => {
      const msg = createMessage('/bind ', '999999', '777777')
      await handler.execute(msg, [''])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
    })
  })

  describe('conflict Detection', () => {
    it('should reject binding when TG thread is already bound to different QQ group', async () => {
      // Mock existing binding
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue({
        qqRoomId: '999999',
        tgChatId: '777777',
        tgThreadId: undefined,
      })

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已绑定到其他 QQ 群'),
        undefined,
      )
    })

    it('should allow rebinding to same QQ group', async () => {
      // Mock existing binding to same QQ group
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue({
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      })

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        '888888',
        '777777',
        undefined,
      )

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('绑定成功'),
        undefined,
      )
    })

    it('should handle conflict during add operation', async () => {
      // Mock add returning a different QQ group (conflict)
      mockContext.instance.forwardPairs.add = vi.fn().mockResolvedValue({
        qqRoomId: '999999', // Different from requested 888888
        tgChatId: '777777',
      })

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('绑定失败：检测到冲突'),
        undefined,
      )
    })
  })

  describe('platform Filtering', () => {
    it('should ignore commands from QQ platform', async () => {
      const msg: UnifiedMessage = {
        id: '12345',
        platform: 'qq',
        sender: {
          id: '999999',
          name: 'TestUser',
        },
        chat: {
          id: '888888',
          type: 'group',
        },
        content: [
          {
            type: 'text',
            data: { text: '/bind 888888' },
          },
        ],
        timestamp: Date.now(),
        metadata: {},
      }

      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('thread Support', () => {
    it('should handle thread binding correctly', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(54321)

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        '888888',
        '777777',
        54321,
      )
    })

    it('should set binding state with correct thread ID in interactive mode', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(99999)

      const msg = createMessage('/bind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.stateManager.setBindingState).toHaveBeenCalledWith(
        '777777',
        '999999',
        99999,
      )
    })
  })

  describe('edge Cases', () => {
    it('should handle add operation returning null', async () => {
      mockContext.instance.forwardPairs.add = vi.fn().mockResolvedValue(null)

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      // Should complete without error, but not show success
      expect(mockContext.replyTG).not.toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('绑定成功'),
        undefined,
      )
    })

    it('should handle very large QQ group IDs', async () => {
      const largeGroupId = '9999999999999999'
      const msg = createMessage(`/bind ${largeGroupId}`, '999999', '777777')
      await handler.execute(msg, [largeGroupId])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        largeGroupId,
        '777777',
        undefined,
      )
    })

    it('should handle QQ group ID with leading zeros', async () => {
      const msg = createMessage('/bind 00888888', '999999', '777777')
      await handler.execute(msg, ['00888888'])

      expect(mockContext.instance.forwardPairs.add).toHaveBeenCalledWith(
        '00888888',
        '777777',
        undefined,
      )
    })
  })
})
