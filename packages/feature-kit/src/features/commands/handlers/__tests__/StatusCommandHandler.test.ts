import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusCommandHandler } from '../StatusCommandHandler'

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456789,
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
      forwardPairs: {} as any,
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

describe('statusCommandHandler', () => {
  let handler: StatusCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new StatusCommandHandler(mockContext)
  })

  describe('status Display', () => {
    it('should display online status when QQ client is online', async () => {
      vi.mocked(mockQQClient.isOnline).mockResolvedValue(true)

      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockQQClient.isOnline).toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('在线'),
      )
    })

    it('should display offline status when QQ client is offline', async () => {
      vi.mocked(mockQQClient.isOnline).mockResolvedValue(false)

      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockQQClient.isOnline).toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('离线'),
      )
    })

    it('should include QQ UIN in status message', async () => {
      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('123456789'),
      )
    })

    it('should include bot nickname in status message', async () => {
      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('TestBot'),
      )
    })

    it('should include client type in status message', async () => {
      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('napcat'),
      )
    })

    it('should display all information together', async () => {
      vi.mocked(mockQQClient.isOnline).mockResolvedValue(true)

      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      const callArg = vi.mocked(mockContext.replyTG).mock.calls[0][1]
      expect(callArg).toContain('机器人状态')
      expect(callArg).toContain('在线')
      expect(callArg).toContain('123456789')
      expect(callArg).toContain('TestBot')
      expect(callArg).toContain('napcat')
    })
  })

  describe('different Client Types', () => {
    it('should handle different client types correctly', async () => {
      (mockQQClient as any).clientType = 'chronocat'

      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('chronocat'),
      )
    })

    it('should handle unknown client type', async () => {
      (mockQQClient as any).clientType = 'unknown'

      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('unknown'),
      )
    })
  })

  describe('platform Support', () => {
    it('should work from any platform', async () => {
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
            data: { text: '/status' },
          },
        ],
        timestamp: Date.now(),
        metadata: {},
      }

      await handler.execute(msg, [])

      expect(mockQQClient.isOnline).toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalled()
    })
  })

  describe('error Handling', () => {
    it('should handle isOnline check failure gracefully', async () => {
      vi.mocked(mockQQClient.isOnline).mockRejectedValue(new Error('Network error'))

      const msg = createMessage('/status', '999999', '777777')

      // Should throw or handle the error
      await expect(handler.execute(msg, [])).rejects.toThrow()
    })
  })

  describe('arguments Handling', () => {
    it('should work with no arguments', async () => {
      const msg = createMessage('/status', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalled()
    })

    it('should ignore extra arguments', async () => {
      const msg = createMessage('/status extra args', '999999', '777777')
      await handler.execute(msg, ['extra', 'args'])

      expect(mockContext.replyTG).toHaveBeenCalled()
    })
  })
})
