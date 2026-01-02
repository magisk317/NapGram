import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QQInteractionCommandHandler } from '../QQInteractionCommandHandler'

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: vi.fn().mockResolvedValue(true),
    callApi: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn(),
    recallMessage: vi.fn(),
    getMessage: vi.fn(),
    getFriendList: vi.fn(),
    getGroupList: vi.fn(),
    getGroupMemberList: vi.fn(),
    getGroupMemberInfo: vi.fn().mockResolvedValue({
      uin: '123456',
      nickname: 'TestBot',
      card: 'BotCard',
    }),
    setGroupCard: vi.fn().mockResolvedValue(undefined),
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
        findByTG: vi.fn().mockReturnValue({
          qqRoomId: '888888',
          tgChatId: '777777',
        }),
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

describe('qQInteractionCommandHandler', () => {
  let handler: QQInteractionCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new QQInteractionCommandHandler(mockContext)
  })

  describe('platform Filtering', () => {
    it('should only process commands from Telegram platform', async () => {
      const msg = createMessage('/poke', '999999', '777777', 'qq')
      await handler.execute(msg, [], 'poke')

      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('no Binding Scenario', () => {
    it('should show error when chat is not bound', async () => {
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

      const msg = createMessage('/poke', '999999', '777777')
      await handler.execute(msg, [], 'poke')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未绑定任何 QQ 群'),
        undefined,
      )
    })
  })

  describe('/poke command', () => {
    it('should show usage when target cannot be resolved', async () => {
      const msg = createMessage('/poke', '999999', '777777')
      await handler.execute(msg, [], 'poke')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('无法识别目标用户'),
        undefined,
      )
    })

    it('should send group poke when target UIN provided', async () => {
      const msg = createMessage('/poke 123456', '999999', '777777')
      await handler.execute(msg, ['123456'], 'poke')

      expect(mockQQClient.callApi).toHaveBeenCalledWith('send_group_poke', {
        group_id: 888888,
        user_id: 123456,
      })
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已戳一戳 123456'),
        undefined,
      )
    })
  })

  describe('/nick command', () => {
    it('should display current nick when no arguments provided', async () => {
      const msg = createMessage('/nick', '999999', '777777')
      await handler.execute(msg, [], 'nick')

      expect(mockQQClient.getGroupMemberInfo).toHaveBeenCalledWith('888888', '123456')
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('当前群名片'),
        undefined,
      )
    })

    it('should show card if available', async () => {
      const msg = createMessage('/nick', '999999', '777777')
      await handler.execute(msg, [], 'nick')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('BotCard'),
        undefined,
      )
    })

    it('should fallback to nickname if card is not set', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValue({
        uin: '123456',
        nickname: 'TestBot',
        card: null,
      } as any)

      const msg = createMessage('/nick', '999999', '777777')
      await handler.execute(msg, [], 'nick')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('TestBot'),
        undefined,
      )
    })

    it('should show "未设置" if neither card nor nickname available', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValue({
        uin: '123456',
        nickname: null,
        card: null,
      } as any)

      const msg = createMessage('/nick', '999999', '777777')
      await handler.execute(msg, [], 'nick')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未设置'),
        undefined,
      )
    })

    it('should set group card when arguments provided', async () => {
      const msg = createMessage('/nick NewNick', '999999', '777777')
      await handler.execute(msg, ['NewNick'], 'nick')

      expect(mockQQClient.setGroupCard).toHaveBeenCalledWith('888888', '123456', 'NewNick')
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已修改群名片'),
        undefined,
      )
    })

    it('should handle multi-word nicknames', async () => {
      const msg = createMessage('/nick New Bot Nick', '999999', '777777')
      await handler.execute(msg, ['New', 'Bot', 'Nick'], 'nick')

      expect(mockQQClient.setGroupCard).toHaveBeenCalledWith('888888', '123456', 'New Bot Nick')
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已修改群名片'),
        undefined,
      )
    })

    it('should handle error when getting member info fails', async () => {
      vi.mocked(mockQQClient.getGroupMemberInfo).mockRejectedValue(
        new Error('Network error'),
      )

      const msg = createMessage('/nick', '999999', '777777')
      await handler.execute(msg, [], 'nick')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('失败'),
        undefined,
      )
    })
  })

  describe('thread Support', () => {
    it('should use extracted thread ID', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(12345)

      const msg = createMessage('/poke', '999999', '777777')
      await handler.execute(msg, [], 'poke')

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        12345,
        true,
      )
    })

    it('should reply to correct thread', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(54321)

      const msg = createMessage('/poke', '999999', '777777')
      await handler.execute(msg, [], 'poke')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        54321,
      )
    })
  })

  describe('/poke command extras', () => {
    it('prefers sendGroupPoke when available', async () => {
      const qqClient = mockQQClient as any
      qqClient.sendGroupPoke = vi.fn().mockResolvedValue(undefined)

      const msg = createMessage('/poke 123456', '999999', '777777')
      await handler.execute(msg, ['123456'], 'poke')

      expect(qqClient.sendGroupPoke).toHaveBeenCalledWith('888888', '123456')
      expect(mockQQClient.callApi).not.toHaveBeenCalled()
    })

    it('reports unsupported poke when no API is available', async () => {
      const qqClient = mockQQClient as any
      qqClient.callApi = undefined

      const msg = createMessage('/poke 123456', '999999', '777777')
      await handler.execute(msg, ['123456'], 'poke')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('不支持戳一戳'),
        undefined,
      )
    })
  })

  describe('/like command', () => {
    it('reports unsupported like', async () => {
      const qqClient = mockQQClient as any
      qqClient.sendLike = undefined

      const msg = createMessage('/like 123456', '999999', '777777')
      await handler.execute(msg, ['123456'], 'like')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('不支持点赞'),
        undefined,
      )
    })

    it('parses target and times in any order', async () => {
      const qqClient = mockQQClient as any
      qqClient.sendLike = vi.fn().mockResolvedValue(undefined)

      const msg = createMessage('/like 3 123456', '999999', '777777')
      await handler.execute(msg, ['3', '123456'], 'like')

      expect(qqClient.sendLike).toHaveBeenCalledWith('123456', 3)
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('点赞 x3'),
        undefined,
      )
    })

    it('parses times from reply message', async () => {
      const qqClient = mockQQClient as any
      qqClient.sendLike = vi.fn().mockResolvedValue(undefined)

      const msg = createMessage('/like 2', '999999', '777777')
      msg.content.push({
        type: 'reply',
        data: { senderId: '424242' },
      })

      await handler.execute(msg, ['2'], 'like')

      expect(qqClient.sendLike).toHaveBeenCalledWith('424242', 2)
    })
  })

  describe('/honor command', () => {
    it('rejects invalid honor type', async () => {
      const msg = createMessage('/honor nope', '999999', '777777')
      await handler.execute(msg, ['nope'], 'honor')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('无效的类型'),
        undefined,
      )
    })

    it('reports unsupported honor API', async () => {
      const qqClient = mockQQClient as any
      qqClient.getGroupHonorInfo = undefined

      const msg = createMessage('/honor', '999999', '777777')
      await handler.execute(msg, [], 'honor')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('不支持群荣誉'),
        undefined,
      )
    })

    it('formats honor list for all types', async () => {
      const qqClient = mockQQClient as any
      qqClient.getGroupHonorInfo = vi.fn().mockResolvedValue({
        talkative_list: [{ desc: 'TopUser', user_id: '10001' }],
        performer_list: [],
        legend_list: [],
        strong_newbie_list: [],
        emotion_list: [],
      })

      const msg = createMessage('/honor all', '999999', '777777')
      await handler.execute(msg, ['all'], 'honor')

      const replyText = vi.mocked(mockContext.replyTG).mock.calls.at(-1)?.[1]
      expect(replyText).toContain('群荣誉榜单')
      expect(replyText).toContain('龙王')
      expect(replyText).toContain('TopUser')
    })
  })
})
