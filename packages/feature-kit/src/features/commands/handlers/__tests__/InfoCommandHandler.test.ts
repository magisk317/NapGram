import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InfoCommandHandler } from '../InfoCommandHandler'

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
function createMessage(text: string, senderId: string = '999999', chatId: string = '777777', platform: 'telegram' | 'qq' = 'telegram', replyTo?: any): UnifiedMessage {
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
    metadata: replyTo ? { raw: { replyTo } } : {},
  }
}

function getReplyText(payload: unknown): string {
  if (typeof payload === 'string')
    return payload
  if (payload && typeof payload === 'object' && 'text' in payload) {
    return String((payload as any).text)
  }
  return ''
}

function expectLastReplyContains(replyTG: any, {
  chatId,
  contains,
  threadId,
}: { chatId: string, contains: string, threadId?: number | undefined }) {
  expect(replyTG).toHaveBeenCalled()
  const [calledChatId, payload, calledThreadId] = replyTG.mock.calls.at(-1)
  expect(calledChatId).toBe(chatId)
  expect(calledThreadId).toBe(threadId)
  expect(getReplyText(payload)).toContain(contains)
}

describe('infoCommandHandler', () => {
  let handler: InfoCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new InfoCommandHandler(mockContext)
  })

  describe('platform Filtering', () => {
    it('should only process commands from Telegram platform', async () => {
      const msg = createMessage('/info', '999999', '888888', 'qq')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })

    it('should process commands from Telegram platform', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777', 'telegram')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalled()
    })
  })

  describe('no Binding Scenario', () => {
    it('should show error message when chat is not bound', async () => {
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '未绑定任何 QQ 群',
        threadId: undefined,
      })
    })
  })

  describe('basic Binding Information', () => {
    it('should display QQ group ID', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '888888',
        threadId: undefined,
      })
    })

    it('should display TG chat ID', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '777777',
        threadId: undefined,
      })
    })

    it('should display thread ID when present', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: 12345,
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '12345',
        threadId: undefined,
      })
    })
  })

  describe('forward Mode Display', () => {
    it('should display normal forward mode status', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '双向正常',
        threadId: undefined,
      })
    })

    it('should display off forward mode status', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'off',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '已暂停',
        threadId: undefined,
      })
    })

    it('should display QQ-only forward mode status', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'qq_only',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '仅 QQ → TG',
        threadId: undefined,
      })
    })

    it('should display TG-only forward mode status', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'tg_only',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '仅 TG → QQ',
        threadId: undefined,
      })
    })
  })

  describe('optional Settings Display', () => {
    it('should display nickname mode when set', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
        nicknameMode: 'auto',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '昵称模式',
        threadId: undefined,
      })
    })

    it('should display ignore regex when set', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
        ignoreRegex: '^\\[CQ:',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '忽略正则',
        threadId: undefined,
      })
    })

    it('should display ignore senders when set', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
        ignoreSenders: '123456,789012',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '忽略发送者',
        threadId: undefined,
      })
    })
  })

  describe('reply Message Information', () => {
    it('should display replied message ID when command is a reply', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage(
        '/info',
        '999999',
        '777777',
        'telegram',
        { replyToMsgId: '54321' },
      )

      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '54321',
        threadId: undefined,
      })
    })

    it('should handle reply object as message ID directly', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777', 'telegram', 98765)

      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '98765',
        threadId: undefined,
      })
    })
  })

  describe('thread Support', () => {
    it('should use extracted thread ID', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: 12345,
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)
      vi.mocked(mockContext.extractThreadId).mockReturnValue(12345)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        12345,
        true,
      )
    })

    it('should reply to correct thread', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: 99999,
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)
      vi.mocked(mockContext.extractThreadId).mockReturnValue(99999)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith('777777', expect.anything(), 99999)
    })
  })

  describe('edge Cases', () => {
    it('should handle missing forwardMode gracefully', async () => {
      const mockPair = {
        qqRoomId: '888888',
        tgChatId: '777777',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      // Should default to normal mode
      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '双向正常',
        threadId: undefined,
      })
    })

    it('should handle very large IDs', async () => {
      const mockPair = {
        qqRoomId: 9999999999999999n,
        tgChatId: 8888888888888888n,
        forwardMode: 'normal',
      }
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(mockPair)

      const msg = createMessage('/info', '999999', '777777')
      await handler.execute(msg, [])

      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '9999999999999999',
        threadId: undefined,
      })
      expectLastReplyContains(mockContext.replyTG, {
        chatId: '777777',
        contains: '8888888888888888',
        threadId: undefined,
      })
    })
  })
})
