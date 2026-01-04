import type { UnifiedMessage } from '@napgram/message-kit'

import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { GroupManagementCommandHandler } from '../GroupManagementCommandHandler'

vi.mock('@napgram/infra-kit', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    db: {
      message: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
      forwardPair: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
      forwardMultiple: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
      qqRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(), create: vi.fn() },
      $queryRaw: vi.fn()
    },
    env: {
      ENABLE_AUTO_RECALL: true,
      TG_MEDIA_TTL_SECONDS: undefined,
      DATA_DIR: '/tmp',
      CACHE_DIR: '/tmp/cache',
      WEB_ENDPOINT: 'http://napgram-dev:8080'
    },
    hashing: { md5Hex: vi.fn((value: string) => value) },
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

type MockQQClient = IQQClient
  & Required<Pick<IQQClient, 'banUser' | 'unbanUser' | 'kickUser' | 'setGroupCard'>>

// Mock QQ Client
function createMockQQClient(): MockQQClient {
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
    banUser: vi.fn().mockResolvedValue(undefined),
    unbanUser: vi.fn().mockResolvedValue(undefined),
    kickUser: vi.fn().mockResolvedValue(undefined),
    setGroupCard: vi.fn().mockResolvedValue(undefined),
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
        findByTG: vi.fn().mockReturnValue({ qqRoomId: '888888' }),
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
function createMessage(text: string, senderId: string = '999999', chatId: string = '888888', replyTo?: { senderId: string }): UnifiedMessage {
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
      ...(replyTo
        ? [
            {
              type: 'reply' as const,
              data: {
                messageId: '54321',
                senderId: replyTo.senderId,
              },
            },
          ]
        : []),
    ],
    timestamp: Date.now(),
    metadata: {},
  }
}

describe('groupManagementCommandHandler', () => {
  let handler: GroupManagementCommandHandler
  let mockQQClient: MockQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new GroupManagementCommandHandler(mockContext)
  })

  describe('/ban command', () => {
    it('should ban user with QQ number and default duration', async () => {
      // Setup: bot is admin
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 1800)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('已禁言'),
        undefined,
      )
    })

    it('should ban user with custom duration', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 111111 1h', '999999', '888888')
      await handler.execute(msg, ['111111', '1h'], 'ban')

      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 3600)
    })

    it('should ban user by replying to message', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 30m', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, ['30m'], 'ban')

      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 1800)
    })

    it('should reject ban if operator is not admin', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotMember',
          role: 'member',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：需要管理员或群主权限'),
        undefined,
      )
    })

    it('should reject ban if target is admin', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Admin2',
          role: 'admin',
        } as any)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：无法管理群主或其他管理员'),
        undefined,
      )
    })

    it('should reject ban with invalid duration format', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 111111 invalid', '999999', '888888')
      await handler.execute(msg, ['111111', 'invalid'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无效的时长格式'),
        undefined,
      )
    })

    it('should handle missing target user', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/ban', '999999', '888888')
      await handler.execute(msg, [], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })
  })

  describe('/unban command', () => {
    it('should unban user with QQ number', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/unban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'unban')

      expect(mockQQClient.unbanUser).toHaveBeenCalledWith('888888', '111111')
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('已解除'),
        undefined,
      )
    })

    it('should unban user by replying to message', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/unban', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, [], 'unban')

      expect(mockQQClient.unbanUser).toHaveBeenCalledWith('888888', '111111')
    })

    it('should reject unban if operator lacks permission', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotMember',
          role: 'member',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/unban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'unban')

      expect(mockQQClient.unbanUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：需要管理员或群主权限'),
        undefined,
      )
    })

    it('should reject unban when target is missing', async () => {
      const msg = createMessage('/unban', '999999', '888888')
      await handler.execute(msg, [], 'unban')

      expect(mockQQClient.unbanUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })

    it('should handle unban errors', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      vi.mocked(mockQQClient.unbanUser).mockRejectedValue(new Error('Unban error'))

      const msg = createMessage('/unban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'unban')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('操作失败'),
        undefined,
      )
    })
  })

  describe('/kick command', () => {
    it('should kick user with QQ number', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/kick 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'kick')

      expect(mockQQClient.kickUser).toHaveBeenCalledWith('888888', '111111', false)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('移出群聊'),
        undefined,
      )
    })

    it('should kick user by replying to message', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/kick', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, [], 'kick')

      expect(mockQQClient.kickUser).toHaveBeenCalledWith('888888', '111111', false)
    })

    it('should reject kick if target is admin', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Admin2',
          role: 'admin',
        } as any)

      const msg = createMessage('/kick 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'kick')

      expect(mockQQClient.kickUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：无法管理群主或其他管理员'),
        undefined,
      )
    })

    it('should reject kick when target is missing', async () => {
      const msg = createMessage('/kick', '999999', '888888')
      await handler.execute(msg, [], 'kick')

      expect(mockQQClient.kickUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })

    it('should handle kick errors', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      vi.mocked(mockQQClient.kickUser).mockRejectedValue(new Error('Kick error'))

      const msg = createMessage('/kick 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'kick')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('操作失败'),
        undefined,
      )
    })
  })

  describe('/card command', () => {
    it('should set group card with QQ number', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/card 111111 NewCard', '999999', '888888')
      await handler.execute(msg, ['111111', 'NewCard'], 'card')

      expect(mockQQClient.setGroupCard).toHaveBeenCalledWith(
        '888888',
        '111111',
        'NewCard',
      )
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('群名片设置为'),
        undefined,
      )
    })

    it('should set group card by replying to message', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/card NewCard', '999999', '888888', {
        senderId: '111111',
      })
      await handler.execute(msg, ['NewCard'], 'card')

      expect(mockQQClient.setGroupCard).toHaveBeenCalledWith(
        '888888',
        '111111',
        'NewCard',
      )
    })

    it('should handle multi-word card names', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/card 111111 New Card Name', '999999', '888888')
      await handler.execute(msg, ['111111', 'New', 'Card', 'Name'], 'card')

      expect(mockQQClient.setGroupCard).toHaveBeenCalledWith(
        '888888',
        '111111',
        'New Card Name',
      )
    })

    it('should reject if card name is missing', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/card 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'card')

      expect(mockQQClient.setGroupCard).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('请输入新的群名片'),
        undefined,
      )
    })

    it('should reject card when target is missing', async () => {
      const msg = createMessage('/card NewCard', '999999', '888888')
      await handler.execute(msg, ['NewCard'], 'card')

      expect(mockQQClient.setGroupCard).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })

    it('should handle card errors', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      vi.mocked(mockQQClient.setGroupCard).mockRejectedValue(new Error('Card error'))

      const msg = createMessage('/card 111111 NewCard', '999999', '888888')
      await handler.execute(msg, ['111111', 'NewCard'], 'card')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('操作失败'),
        undefined,
      )
    })
  })

  describe('error Handling', () => {
    it('should handle API errors gracefully', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      vi.mocked(mockQQClient.banUser).mockRejectedValue(new Error('API Error'))

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('操作失败'),
        undefined,
      )
    })

    it('should handle permission check errors', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockRejectedValue(
        new Error('Network error'),
      )

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
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
            data: { text: '/ban 111111' },
          },
        ],
        timestamp: Date.now(),
        metadata: {},
      }

      await handler.execute(msg, ['111111'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('forward Pair Validation', () => {
    it('should reject if no forward pair is bound', async () => {
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('未绑定任何 QQ 群'),
        undefined,
      )
    })
  })

  describe('qQ Client Feature Support', () => {
    it('should reject ban if QQ client does not support banUser', async () => {
      const mockQQClientWithoutBan = createMockQQClient();
      (mockQQClientWithoutBan as any).banUser = undefined
      const contextWithoutBan = createMockContext(mockQQClientWithoutBan, mockTgBot)
      const handlerWithoutBan = new GroupManagementCommandHandler(contextWithoutBan)

      vi.mocked(mockQQClientWithoutBan.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handlerWithoutBan.execute(msg, ['111111'], 'ban')

      expect(contextWithoutBan.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持禁言功能'),
        undefined,
      )
    })

    it('should reject unban if QQ client does not support unbanUser', async () => {
      const mockQQClientWithoutUnban = createMockQQClient();
      (mockQQClientWithoutUnban as any).unbanUser = undefined
      const contextWithoutUnban = createMockContext(mockQQClientWithoutUnban, mockTgBot)
      const handlerWithoutUnban = new GroupManagementCommandHandler(contextWithoutUnban)

      vi.mocked(mockQQClientWithoutUnban.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/unban 111111', '999999', '888888')
      await handlerWithoutUnban.execute(msg, ['111111'], 'unban')

      expect(contextWithoutUnban.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持解禁功能'),
        undefined,
      )
    })

    it('should reject kick if QQ client does not support kickUser', async () => {
      const mockQQClientWithoutKick = createMockQQClient();
      (mockQQClientWithoutKick as any).kickUser = undefined
      const contextWithoutKick = createMockContext(mockQQClientWithoutKick, mockTgBot)
      const handlerWithoutKick = new GroupManagementCommandHandler(contextWithoutKick)

      vi.mocked(mockQQClientWithoutKick.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/kick 111111', '999999', '888888')
      await handlerWithoutKick.execute(msg, ['111111'], 'kick')

      expect(contextWithoutKick.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持踢人功能'),
        undefined,
      )
    })

    it('should reject card if QQ client does not support setGroupCard', async () => {
      const mockQQClientWithoutCard = createMockQQClient();
      (mockQQClientWithoutCard as any).setGroupCard = undefined
      const contextWithoutCard = createMockContext(mockQQClientWithoutCard, mockTgBot)
      const handlerWithoutCard = new GroupManagementCommandHandler(contextWithoutCard)

      vi.mocked(mockQQClientWithoutCard.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/card 111111 NewCard', '999999', '888888')
      await handlerWithoutCard.execute(msg, ['111111', 'NewCard'], 'card')

      expect(contextWithoutCard.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持设置群名片功能'),
        undefined,
      )
    })
  })

  describe('/ban command - Advanced Duration Tests', () => {
    it('should reject ban duration exceeding maximum (30 days)', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/ban 111111 31d', '999999', '888888')
      await handler.execute(msg, ['111111', '31d'], 'ban')

      expect(mockQQClient.banUser).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不能超过30天'),
        undefined,
      )
    })

    it('should handle various duration formats correctly', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockImplementation(
        async (_groupId: string, userId: string) => {
          if (userId === '123456') {
            return {
              uin: '123456',
              nickname: 'BotAdmin',
              role: 'admin',
            } as any
          }

          if (userId === '111111') {
            return {
              uin: '111111',
              nickname: 'Target',
              role: 'member',
            } as any
          }

          return null as any
        },
      )

      // Test minutes format
      const msg1 = createMessage('/ban 111111 5m', '999999', '888888')
      await handler.execute(msg1, ['111111', '5m'], 'ban')
      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 300)

      // Test hours format
      const msg2 = createMessage('/ban 111111 2h', '999999', '888888')
      await handler.execute(msg2, ['111111', '2h'], 'ban')
      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 7200)

      // Test days format
      const msg3 = createMessage('/ban 111111 1d', '999999', '888888')
      await handler.execute(msg3, ['111111', '1d'], 'ban')
      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 86400)
    })
  })

  describe('/card command - Advanced Tests', () => {
    it('should handle empty card name after trimming', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/card 111111    ', '999999', '888888')
      await handler.execute(msg, ['111111', '   '], 'card')

      expect(mockQQClient.setGroupCard).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('请输入新的群名片'),
        undefined,
      )
    })

    it('should set card by reply without additional arguments', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/card', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, [], 'card')

      expect(mockQQClient.setGroupCard).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('请输入新的群名片'),
        undefined,
      )
    })

    it('should reject card if operator is not admin', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotMember',
        role: 'member',
      } as any)

      const msg = createMessage('/card 111111 NewCard', '999999', '888888')
      await handler.execute(msg, ['111111', 'NewCard'], 'card')

      expect(mockQQClient.setGroupCard).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足'),
        undefined,
      )
    })
  })

  describe('reply Message Detection', () => {
    it('should extract target from reply in metadata.raw.replyToMessage', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg: UnifiedMessage = {
        id: '12345',
        platform: 'telegram',
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
            data: { text: '/ban' },
          },
        ],
        timestamp: Date.now(),
        metadata: {
          raw: {
            replyToMessage: {
              senderId: '111111',
            },
          },
        },
      }

      await handler.execute(msg, [], 'ban')

      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 1800)
    })

    it('should extract target from reply in metadata.raw.replyTo', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg: UnifiedMessage = {
        id: '12345',
        platform: 'telegram',
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
            data: { text: '/ban' },
          },
        ],
        timestamp: Date.now(),
        metadata: {
          raw: {
            replyTo: {
              senderId: '111111',
            },
          },
        },
      }

      await handler.execute(msg, [], 'ban')

      expect(mockQQClient.banUser).toHaveBeenCalledWith('888888', '111111', 1800)
    })
  })

  describe('reply Helper', () => {
    it('should detect reply via raw.replyToMessage', () => {
      const msg: UnifiedMessage = {
        id: '1',
        platform: 'telegram',
        sender: { id: '1', name: 'User' },
        chat: { id: '888888', type: 'group' },
        content: [{ type: 'text', data: { text: '/ban' } }],
        timestamp: Date.now(),
        metadata: { raw: { replyToMessage: { senderId: '111111' } } },
      }

      expect((handler as any).hasReplyMessage(msg)).toBe(true)
    })

    it('should detect reply via reply content', () => {
      const msg: UnifiedMessage = {
        id: '1',
        platform: 'telegram',
        sender: { id: '1', name: 'User' },
        chat: { id: '888888', type: 'group' },
        content: [
          { type: 'text', data: { text: '/ban' } },
          { type: 'reply', data: { senderId: '111111' } },
        ],
        timestamp: Date.now(),
        metadata: {},
      }

      expect((handler as any).hasReplyMessage(msg)).toBe(true)
    })

    it('should return false when no reply data is present', () => {
      const msg: UnifiedMessage = {
        id: '1',
        platform: 'telegram',
        sender: { id: '1', name: 'User' },
        chat: { id: '888888', type: 'group' },
        content: [{ type: 'text', data: { text: '/ban' } }],
        timestamp: Date.now(),
        metadata: {},
      }

      expect((handler as any).hasReplyMessage(msg)).toBe(false)
    })
  })

  describe('member Info Fallback', () => {
    it('should use nickname if card is not available', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'TargetNick',
          card: null,
        } as any)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('TargetNick'),
        undefined,
      )
    })

    it('should use UIN if neither card nor nickname is available', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotAdmin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: null,
          card: null,
        } as any)

      const msg = createMessage('/ban 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'ban')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('111111'),
        undefined,
      )
    })
  })
})
