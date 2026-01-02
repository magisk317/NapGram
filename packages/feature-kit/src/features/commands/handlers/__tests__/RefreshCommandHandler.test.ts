import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RefreshCommandHandler } from '../RefreshCommandHandler'

// Mock TG Chat
function createMockTgChat() {
  return {
    editTitle: vi.fn().mockResolvedValue({}),
    setProfilePhoto: vi.fn().mockResolvedValue({}),
    editAbout: vi.fn().mockResolvedValue({}),
  }
}

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
    getGroupInfo: vi.fn().mockResolvedValue({
      groupId: '888888',
      name: 'Test QQ Group',
    }),
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
    getChat: vi.fn(),
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
        findByTG: vi.fn().mockReturnValue({
          qqRoomId: '888888',
          tgChatId: '777777',
        }),
        findByQQ: vi.fn(),
        find: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        getAll: vi.fn().mockReturnValue([]),
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

describe('refreshCommandHandler', () => {
  let handler: RefreshCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockTgChat: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockTgChat = createMockTgChat()
    mockTgBot.getChat.mockResolvedValue(mockTgChat)
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new RefreshCommandHandler(mockContext)
  })

  describe('platform Filtering', () => {
    it('should only process commands from Telegram platform', async () => {
      const msg = createMessage('/refresh', '999999', '777777', 'qq')
      await handler.execute(msg, [], 'refresh')

      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('/refresh command', () => {
    describe('success Scenarios', () => {
      it('should refresh group information', async () => {
        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockQQClient.getGroupInfo).toHaveBeenCalledWith('888888')
        expect(mockTgBot.getChat).toHaveBeenCalledWith(777777)
      })

      it('should update TG chat title with QQ group name', async () => {
        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockTgChat.editTitle).toHaveBeenCalledWith('Test QQ Group')
      })

      it('should send progress and success messages', async () => {
        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('正在刷新'),
          undefined,
        )
        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('已刷新群组信息'),
          undefined,
        )
      })

      it('should include group name in success message', async () => {
        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('Test QQ Group'),
          undefined,
        )
      })

      it('should include success indicator in success message', async () => {
        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('✅'),
          undefined,
        )
      })

      it('should update TG chat description from QQ notice', async () => {
        (mockQQClient as any).getGroupNotice = vi.fn().mockResolvedValue({
          data: {
            notices: [{ text: 'Group description from notice' }],
          },
        })

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockTgChat.editAbout).toHaveBeenCalledWith('Group description from notice')
      })

      it('should skip description update when notice is empty', async () => {
        (mockQQClient as any).getGroupNotice = vi.fn().mockResolvedValue(null)

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockTgChat.editAbout).not.toHaveBeenCalled()
      })
    })

    describe('error Scenarios', () => {
      it('should show error when chat is not bound', async () => {
        mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockQQClient.getGroupInfo).not.toHaveBeenCalled()
        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('未绑定任何 QQ 群'),
          undefined,
        )
      })

      it('should handle QQ group info fetch failure', async () => {
        vi.mocked(mockQQClient.getGroupInfo).mockResolvedValue(null)

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('获取 QQ 群信息失败'),
          undefined,
        )
      })

      it('should handle TG chat title update failure gracefully', async () => {
        mockTgChat.editTitle.mockRejectedValue(new Error('Permission denied'))

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        // Should still complete and send success message
        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('已刷新群组信息'),
          undefined,
        )
      })

      it('should handle avatar fetch failure gracefully', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          arrayBuffer: vi.fn(),
        }) as any

        try {
          const msg = createMessage('/refresh', '999999', '777777')
          await handler.execute(msg, [], 'refresh')
        }
        finally {
          globalThis.fetch = originalFetch
        }

        expect(mockTgChat.setProfilePhoto).not.toHaveBeenCalled()
      })

      it('should handle description update failure gracefully', async () => {
        (mockQQClient as any).getGroupNotice = vi.fn().mockResolvedValue({
          notices: [{ content: 'Notice description' }],
        })
        mockTgChat.editAbout.mockRejectedValue(new Error('Edit failed'))

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('已刷新群组信息'),
          undefined,
        )
      })

      it('should handle general errors', async () => {
        vi.mocked(mockQQClient.getGroupInfo).mockRejectedValue(
          new Error('Network error'),
        )

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.replyTG).toHaveBeenCalledWith(
          '777777',
          expect.stringContaining('刷新失败'),
          undefined,
        )
      })
    })

    describe('thread Support', () => {
      it('should use extracted thread ID', async () => {
        vi.mocked(mockContext.extractThreadId).mockReturnValue(12345)

        const msg = createMessage('/refresh', '999999', '777777')
        await handler.execute(msg, [], 'refresh')

        expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
          '777777',
          12345,
          true,
        )
      })
    })
  })

  describe('/refresh_all command', () => {
    beforeEach(() => {
      mockContext.instance.forwardPairs.getAll = vi.fn().mockReturnValue([
        { id: 1, qqRoomId: '888888', tgChatId: '777777' },
        { id: 2, qqRoomId: '999999', tgChatId: '666666' },
        { id: 3, qqRoomId: '111111', tgChatId: '555555' },
      ])
    })

    it('should refresh all bound groups', async () => {
      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      expect(mockQQClient.getGroupInfo).toHaveBeenCalledTimes(3)
      expect(mockTgBot.getChat).toHaveBeenCalledTimes(3)
    })

    it('should send progress message at start', async () => {
      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('正在刷新所有绑定群组信息'),
        undefined,
      )
    })

    it('should send summary with success and fail counts', async () => {
      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      const lastCall
        = (mockContext.replyTG as any).mock.calls[(mockContext.replyTG as any).mock.calls.length - 1]
      expect(lastCall[1]).toContain('成功')
      expect(lastCall[1]).toContain('失败')
      expect(lastCall[1]).toContain('总计: 3')
    })

    it('should count successful refreshes correctly', async () => {
      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      const lastCall
        = (mockContext.replyTG as any).mock.calls[(mockContext.replyTG as any).mock.calls.length - 1]
      expect(lastCall[1]).toContain('成功: 3')
      expect(lastCall[1]).toContain('失败: 0')
    })

    it('should count failed refreshes correctly', async () => {
      vi.mocked(mockQQClient.getGroupInfo)
        .mockResolvedValueOnce({ name: 'Group 1' } as any)
        .mockResolvedValueOnce(null) // Second one fails
        .mockResolvedValueOnce({ name: 'Group 3' } as any)

      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      const lastCall
        = (mockContext.replyTG as any).mock.calls[(mockContext.replyTG as any).mock.calls.length - 1]
      expect(lastCall[1]).toContain('成功: 2')
      expect(lastCall[1]).toContain('失败: 1')
    })

    it('should continue on individual failures', async () => {
      vi.mocked(mockQQClient.getGroupInfo)
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ name: 'Group 2' } as any)
        .mockResolvedValueOnce({ name: 'Group 3' } as any)

      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      expect(mockQQClient.getGroupInfo).toHaveBeenCalledTimes(3)
    })

    it('should handle empty pairs list', async () => {
      mockContext.instance.forwardPairs.getAll = vi.fn().mockReturnValue([])

      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('总计: 0'),
        undefined,
      )
    })

    it('should handle general error during refresh_all', async () => {
      mockContext.instance.forwardPairs.getAll = vi
        .fn()
        .mockImplementation(() => {
          throw new Error('Database error')
        })

      const msg = createMessage('/refresh_all', '999999', '777777')
      await handler.execute(msg, [], 'refresh_all')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('批量刷新失败'),
        undefined,
      )
    })
  })
})
