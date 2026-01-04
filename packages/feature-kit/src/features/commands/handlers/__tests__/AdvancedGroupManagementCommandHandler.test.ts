import type { UnifiedMessage } from '@napgram/message-kit'

import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { AdvancedGroupManagementCommandHandler } from '../AdvancedGroupManagementCommandHandler'

vi.mock('@napgram/infra-kit', () => ({
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
}))

type MockQQClient = IQQClient
  & Required<Pick<IQQClient, 'setGroupWholeBan' | 'setGroupAdmin' | 'setGroupName' | 'setGroupSpecialTitle'>>

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
    setGroupWholeBan: vi.fn().mockResolvedValue(undefined),
    setGroupAdmin: vi.fn().mockResolvedValue(undefined),
    setGroupName: vi.fn().mockResolvedValue(undefined),
    setGroupSpecialTitle: vi.fn().mockResolvedValue(undefined),
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

describe('advancedGroupManagementCommandHandler', () => {
  let handler: AdvancedGroupManagementCommandHandler
  let mockQQClient: MockQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new AdvancedGroupManagementCommandHandler(mockContext)
  })

  describe('/muteall command', () => {
    it('should enable whole ban when owner executes muteall on', async () => {
      // Setup: bot is owner
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/muteall on', '999999', '888888')
      await handler.execute(msg, ['on'], 'muteall')

      expect(mockQQClient.setGroupWholeBan).toHaveBeenCalledWith('888888', true)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('已开启全员禁言'),
        undefined,
      )
    })

    it('should disable whole ban when owner executes muteall off', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/muteall off', '999999', '888888')
      await handler.execute(msg, ['off'], 'muteall')

      expect(mockQQClient.setGroupWholeBan).toHaveBeenCalledWith('888888', false)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('已关闭全员禁言'),
        undefined,
      )
    })

    it('should support Chinese on/off arguments', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/全员禁言 开', '999999', '888888')
      await handler.execute(msg, ['开'], '全员禁言')

      expect(mockQQClient.setGroupWholeBan).toHaveBeenCalledWith('888888', true)
    })

    it('should reject muteall if operator is not owner', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin', // Not owner
      } as any)

      const msg = createMessage('/muteall on', '999999', '888888')
      await handler.execute(msg, ['on'], 'muteall')

      expect(mockQQClient.setGroupWholeBan).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：此操作仅限群主使用'),
        undefined,
      )
    })

    it('should reject toggle command (not supported)', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/muteall toggle', '999999', '888888')
      await handler.execute(msg, ['toggle'], 'muteall')

      expect(mockQQClient.setGroupWholeBan).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('请明确指定操作'),
        undefined,
      )
    })

    it('should default to disable for unmuteall without args', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/unmuteall', '999999', '888888')
      await handler.execute(msg, [], 'unmuteall')

      expect(mockQQClient.setGroupWholeBan).toHaveBeenCalledWith('888888', false)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('已关闭全员禁言'),
        undefined,
      )
    })
  })

  describe('/admin command', () => {
    it('should set admin when owner executes with QQ number', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/admin 111111 on', '999999', '888888')
      await handler.execute(msg, ['111111', 'on'], 'admin')

      expect(mockQQClient.setGroupAdmin).toHaveBeenCalledWith('888888', '111111', true)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('设置为管理员'),
        undefined,
      )
    })

    it('should remove admin when owner executes with off', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'admin',
        } as any)

      const msg = createMessage('/admin 111111 off', '999999', '888888')
      await handler.execute(msg, ['111111', 'off'], 'admin')

      expect(mockQQClient.setGroupAdmin).toHaveBeenCalledWith('888888', '111111', false)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('取消'),
        undefined,
      )
    })

    it('should set admin by replying to message', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/admin on', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, ['on'], 'admin')

      expect(mockQQClient.setGroupAdmin).toHaveBeenCalledWith('888888', '111111', true)
    })

    it('should reject if operator is not owner', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/admin 111111 on', '999999', '888888')
      await handler.execute(msg, ['111111', 'on'], 'admin')

      expect(mockQQClient.setGroupAdmin).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：此操作仅限群主使用'),
        undefined,
      )
    })

    it('should reject if target user is not specified', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/admin on', '999999', '888888') // No reply, no QQ number
      await handler.execute(msg, ['on'], 'admin')

      expect(mockQQClient.setGroupAdmin).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })

    it('should reject toggle action for admin', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/admin', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, [], 'admin')

      expect(mockQQClient.setGroupAdmin).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('暂不支持状态切换'),
        undefined,
      )
    })

    it('should reject when setGroupAdmin is unsupported', async () => {
      const mockQQClientWithoutAdmin = createMockQQClient()
      ;(mockQQClientWithoutAdmin as any).setGroupAdmin = undefined
      const contextWithoutAdmin = createMockContext(mockQQClientWithoutAdmin, mockTgBot)
      const handlerWithoutAdmin = new AdvancedGroupManagementCommandHandler(contextWithoutAdmin)

      vi.mocked(mockQQClientWithoutAdmin.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/admin 111111 on', '999999', '888888')
      await handlerWithoutAdmin.execute(msg, ['111111', 'on'], 'admin')

      expect(contextWithoutAdmin.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持设置管理员功能'),
        undefined,
      )
    })

    it('should handle admin errors gracefully', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      vi.mocked(mockQQClient.setGroupAdmin).mockRejectedValueOnce(new Error('Admin error'))

      const msg = createMessage('/admin 111111 on', '999999', '888888')
      await handler.execute(msg, ['111111', 'on'], 'admin')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('设置管理员失败'),
        undefined,
      )
    })
  })

  describe('/groupname command', () => {
    it('should change group name when admin executes', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/groupname NapGram测试群', '999999', '888888')
      await handler.execute(msg, ['NapGram测试群'], 'groupname')

      expect(mockQQClient.setGroupName).toHaveBeenCalledWith('888888', 'NapGram测试群')
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('群名称已更新为'),
        undefined,
      )
    })

    it('should work with Chinese command alias', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/改群名 新的群名', '999999', '888888')
      await handler.execute(msg, ['新的群名'], '改群名')

      expect(mockQQClient.setGroupName).toHaveBeenCalledWith('888888', '新的群名')
    })

    it('should handle multi-word group names', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/groupname Test Group Name', '999999', '888888')
      await handler.execute(msg, ['Test', 'Group', 'Name'], 'groupname')

      expect(mockQQClient.setGroupName).toHaveBeenCalledWith('888888', 'Test Group Name')
    })

    it('should reject if operator is not admin', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotMember',
        role: 'member',
      } as any)

      const msg = createMessage('/groupname NewName', '999999', '888888')
      await handler.execute(msg, ['NewName'], 'groupname')

      expect(mockQQClient.setGroupName).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：需要管理员或群主权限'),
        undefined,
      )
    })

    it('should reject if group name is empty', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/groupname', '999999', '888888')
      await handler.execute(msg, [], 'groupname')

      expect(mockQQClient.setGroupName).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('请输入新的群名称'),
        undefined,
      )
    })

    it('should reject when setGroupName is unsupported', async () => {
      const mockQQClientWithoutName = createMockQQClient()
      ;(mockQQClientWithoutName as any).setGroupName = undefined
      const contextWithoutName = createMockContext(mockQQClientWithoutName, mockTgBot)
      const handlerWithoutName = new AdvancedGroupManagementCommandHandler(contextWithoutName)

      vi.mocked(mockQQClientWithoutName.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/groupname NewName', '999999', '888888')
      await handlerWithoutName.execute(msg, ['NewName'], 'groupname')

      expect(contextWithoutName.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持修改群名功能'),
        undefined,
      )
    })

    it('should handle groupname errors gracefully', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      vi.mocked(mockQQClient.setGroupName).mockRejectedValueOnce(new Error('Name error'))

      const msg = createMessage('/groupname NewName', '999999', '888888')
      await handler.execute(msg, ['NewName'], 'groupname')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('修改群名失败'),
        undefined,
      )
    })
  })

  describe('/title command', () => {
    it('should set special title when owner executes with QQ number', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/title 111111 群聊守护者', '999999', '888888')
      await handler.execute(msg, ['111111', '群聊守护者'], 'title')

      expect(mockQQClient.setGroupSpecialTitle).toHaveBeenCalledWith('888888', '111111', '群聊守护者', -1)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('设置专属头衔'),
        undefined,
      )
    })

    it('should set title by replying to message', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/title 技术大佬', '999999', '888888', { senderId: '111111' })
      await handler.execute(msg, ['技术大佬'], 'title')

      expect(mockQQClient.setGroupSpecialTitle).toHaveBeenCalledWith('888888', '111111', '技术大佬', -1)
    })

    it('should work with Chinese command alias', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/头衔 111111 活跃成员', '999999', '888888')
      await handler.execute(msg, ['111111', '活跃成员'], '头衔')

      expect(mockQQClient.setGroupSpecialTitle).toHaveBeenCalledWith('888888', '111111', '活跃成员', -1)
    })

    it('should handle multi-word titles', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/title 111111 Super Cool Member', '999999', '888888')
      await handler.execute(msg, ['111111', 'Super', 'Cool', 'Member'], 'title')

      expect(mockQQClient.setGroupSpecialTitle).toHaveBeenCalledWith('888888', '111111', 'Super Cool Member', -1)
    })

    it('should reject if operator is not owner', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotAdmin',
        role: 'admin',
      } as any)

      const msg = createMessage('/title 111111 Member', '999999', '888888')
      await handler.execute(msg, ['111111', 'Member'], 'title')

      expect(mockQQClient.setGroupSpecialTitle).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('权限不足：此操作仅限群主使用'),
        undefined,
      )
    })

    it('should reject if title is empty', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo)
        .mockResolvedValueOnce({
          uin: '123456',
          nickname: 'BotOwner',
          role: 'owner',
        } as any)
        .mockResolvedValueOnce({
          uin: '111111',
          nickname: 'Target',
          role: 'member',
        } as any)

      const msg = createMessage('/title 111111', '999999', '888888')
      await handler.execute(msg, ['111111'], 'title')

      expect(mockQQClient.setGroupSpecialTitle).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('请输入头衔内容'),
        undefined,
      )
    })

    it('should reject when target user is missing', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/title 头衔内容', '999999', '888888')
      await handler.execute(msg, ['头衔内容'], 'title')

      expect(mockQQClient.setGroupSpecialTitle).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })

    it('should reject when setGroupSpecialTitle is unsupported', async () => {
      const mockQQClientWithoutTitle = createMockQQClient()
      ;(mockQQClientWithoutTitle as any).setGroupSpecialTitle = undefined
      const contextWithoutTitle = createMockContext(mockQQClientWithoutTitle, mockTgBot)
      const handlerWithoutTitle = new AdvancedGroupManagementCommandHandler(contextWithoutTitle)

      vi.mocked(mockQQClientWithoutTitle.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/title 111111 头衔内容', '999999', '888888')
      await handlerWithoutTitle.execute(msg, ['111111', '头衔内容'], 'title')

      expect(contextWithoutTitle.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持设置专属头衔功能'),
        undefined,
      )
    })

    it('should handle title errors gracefully', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      vi.mocked(mockQQClient.setGroupSpecialTitle).mockRejectedValueOnce(new Error('Title error'))

      const msg = createMessage('/title 111111 头衔内容', '999999', '888888')
      await handler.execute(msg, ['111111', '头衔内容'], 'title')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('设置头衔失败'),
        undefined,
      )
    })
  })

  describe('error Handling', () => {
    it('should handle API errors gracefully', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      vi.mocked(mockQQClient.setGroupWholeBan).mockRejectedValue(new Error('API Error'))

      const msg = createMessage('/muteall on', '999999', '888888')
      await handler.execute(msg, ['on'], 'muteall')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('全员禁言操作失败'),
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
            data: { text: '/muteall on' },
          },
        ],
        timestamp: Date.now(),
        metadata: {},
      }

      await handler.execute(msg, ['on'], 'muteall')

      expect(mockQQClient.setGroupWholeBan).not.toHaveBeenCalled()
      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('forward Pair Validation', () => {
    it('should reject if no forward pair is bound', async () => {
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

      const msg = createMessage('/muteall on', '999999', '888888')
      await handler.execute(msg, ['on'], 'muteall')

      expect(mockQQClient.setGroupWholeBan).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('未绑定任何 QQ 群'),
        undefined,
      )
    })
  })

  describe('qQ Client Feature Support', () => {
    it('should reject muteall if QQ client does not support setGroupWholeBan', async () => {
      const mockQQClientWithoutMuteAll = createMockQQClient();
      (mockQQClientWithoutMuteAll as any).setGroupWholeBan = undefined
      const contextWithoutMuteAll = createMockContext(mockQQClientWithoutMuteAll, mockTgBot)
      const handlerWithoutMuteAll = new AdvancedGroupManagementCommandHandler(contextWithoutMuteAll)

      vi.mocked(mockQQClientWithoutMuteAll.getGroupMemberInfo).mockResolvedValueOnce({
        uin: '123456',
        nickname: 'BotOwner',
        role: 'owner',
      } as any)

      const msg = createMessage('/muteall on', '999999', '888888')
      await handlerWithoutMuteAll.execute(msg, ['on'], 'muteall')

      expect(contextWithoutMuteAll.replyTG).toHaveBeenCalledWith(
        '888888',
        expect.stringContaining('不支持全员禁言功能'),
        undefined,
      )
    })
  })

  describe('internal helpers', () => {
    it('should resolve target user from reply metadata', async () => {
      const msg = createMessage('/admin on', '999999', '888888')
      msg.metadata = {
        raw: {
          replyToMessage: { senderId: 555555 },
        },
      } as any

      await expect((handler as any).resolveTargetUser(msg, [], 0)).resolves.toBe('555555')
    })

    it('should resolve target user from reply content', async () => {
      const msg = createMessage('/admin on', '999999', '888888', { senderId: '666666' })

      await expect((handler as any).resolveTargetUser(msg, [], 0)).resolves.toBe('666666')
    })

    it('should resolve target user from args', async () => {
      const msg = createMessage('/admin 777777 on', '999999', '888888')

      await expect((handler as any).resolveTargetUser(msg, ['777777'], 0)).resolves.toBe('777777')
    })

    it('should return null when target user cannot be resolved', async () => {
      const msg = createMessage('/admin on', '999999', '888888')

      await expect((handler as any).resolveTargetUser(msg, ['not-a-number'], 0)).resolves.toBeNull()
    })

    it('should detect reply messages', () => {
      const withRawReply = createMessage('/admin on', '999999', '888888')
      withRawReply.metadata = {
        raw: { replyTo: { id: 1 } },
      } as any

      const withContentReply = createMessage('/admin on', '999999', '888888', { senderId: '123' })
      const withoutReply = createMessage('/admin on', '999999', '888888')

      expect((handler as any).hasReplyMessage(withRawReply)).toBe(true)
      expect((handler as any).hasReplyMessage(withContentReply)).toBe(true)
      expect((handler as any).hasReplyMessage(withoutReply)).toBe(false)
    })
  })
})
