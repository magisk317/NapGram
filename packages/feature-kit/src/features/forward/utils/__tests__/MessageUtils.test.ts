import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { MessageUtils } from '../MessageUtils'

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

describe('messageUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('populateAtDisplayNames', () => {
    it('skips processing for non-group chats', async () => {
      const msg: any = {
        chat: { type: 'private', id: '123' },
        content: [{ type: 'at', data: { userId: '111' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn(),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('skips non-at content types', async () => {
      const msg: any = {
        chat: { type: 'group', id: '456' },
        content: [
          { type: 'text', data: { text: 'hello' } },
          { type: 'image', data: {} },
        ],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn(),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('skips at-all mentions', async () => {
      const msg: any = {
        chat: { type: 'group', id: '456' },
        content: [{ type: 'at', data: { userId: 'all' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn(),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('skips at mentions with missing userId', async () => {
      const msg: any = {
        chat: { type: 'group', id: '456' },
        content: [{ type: 'at', data: {} }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn(),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('uses cached names for repeated mentions', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [
          { type: 'at', data: { userId: '111', userName: 'Alice' } },
          { type: 'at', data: { userId: '111' } },
        ],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn(),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(msg.content[0].data.userName).toBe('Alice')
      expect(msg.content[1].data.userName).toBe('Alice')
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('uses provided userName when available', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [{ type: 'at', data: { userId: '222', userName: 'Bob' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn(),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(msg.content[0].data.userName).toBe('Bob')
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('fetches member info when userName is missing', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [{ type: 'at', data: { userId: '333' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({
          card: 'Charlie Card',
          nickname: 'Charlie Nick',
        }),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(qqClient.getGroupMemberInfo).toHaveBeenCalledWith('789', '333')
      expect(msg.content[0].data.userName).toBe('Charlie Card')
    })

    it('uses nickname when card is empty', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [{ type: 'at', data: { userId: '444' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({
          card: '',
          nickname: 'David',
        }),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(msg.content[0].data.userName).toBe('David')
    })

    it('falls back to userId when member info is unavailable', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [{ type: 'at', data: { userId: '555' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({
          card: '',
          nickname: '',
        }),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(msg.content[0].data.userName).toBe('555')
    })

    it('handles error when fetching member info', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [{ type: 'at', data: { userId: '666', userName: '666' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn().mockRejectedValue(new Error('Network error')),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(msg.content[0].data.userName).toBe('666')
    })

    it('falls back to userId when error occurs and userName is empty', async () => {
      const msg: any = {
        chat: { type: 'group', id: '789' },
        content: [{ type: 'at', data: { userId: '777', userName: '   ' } }],
      }
      const qqClient: any = {
        getGroupMemberInfo: vi.fn().mockRejectedValue(new Error('Network error')),
      }

      await MessageUtils.populateAtDisplayNames(msg, qqClient)

      expect(msg.content[0].data.userName).toBe('777')
    })
  })

  describe('isAdmin', () => {
    const mockInstance: any = { owner: '1234567890' }

    it('returns true for instance owner', () => {
      const result = MessageUtils.isAdmin('1234567890', mockInstance)
      expect(result).toBe(true)
    })

    it('returns true if matches ADMIN_QQ', () => {
      (env as any).ADMIN_QQ = '1111'
      const result = MessageUtils.isAdmin('1111', mockInstance)
      expect(result).toBe(true)
        ; (env as any).ADMIN_QQ = null
    })

    it('returns true if matches ADMIN_TG', () => {
      (env as any).ADMIN_TG = '2222'
      const result = MessageUtils.isAdmin('2222', mockInstance)
      expect(result).toBe(true)
        ; (env as any).ADMIN_TG = null
    })

    it('returns false for non-admin user', () => {
      const result = MessageUtils.isAdmin('9999999999', mockInstance)
      expect(result).toBeFalsy()
    })
  })

  describe('replyTG', () => {
    it('sends message to Telegram chat', async () => {
      const mockChat = {
        sendMessage: vi.fn().mockResolvedValue({}),
      }
      const mockTgBot: any = {
        getChat: vi.fn().mockResolvedValue(mockChat),
      }

      await MessageUtils.replyTG(mockTgBot, '123456', 'Test message')

      expect(mockTgBot.getChat).toHaveBeenCalledWith(123456)
      expect(mockChat.sendMessage).toHaveBeenCalledWith('Test message', {
        linkPreview: { disable: true },
      })
    })

    it('converts string chat ID to number', async () => {
      const mockChat = {
        sendMessage: vi.fn().mockResolvedValue({}),
      }
      const mockTgBot: any = {
        getChat: vi.fn().mockResolvedValue(mockChat),
      }

      await MessageUtils.replyTG(mockTgBot, '-100123456789', 'Message')

      expect(mockTgBot.getChat).toHaveBeenCalledWith(-100123456789)
    })

    it('sends message with replyTo parameter', async () => {
      const mockChat = {
        sendMessage: vi.fn().mockResolvedValue({}),
      }
      const mockTgBot: any = {
        getChat: vi.fn().mockResolvedValue(mockChat),
      }

      await MessageUtils.replyTG(mockTgBot, 123456, 'Reply message', 789)

      expect(mockChat.sendMessage).toHaveBeenCalledWith('Reply message', {
        linkPreview: { disable: true },
        replyTo: 789,
        messageThreadId: 789,
      })
    })

    it('handles error when sending message', async () => {
      const mockTgBot: any = {
        getChat: vi.fn().mockRejectedValue(new Error('Chat not found')),
      }

      await expect(
        MessageUtils.replyTG(mockTgBot, 'invalid-chat', 'Message'),
      ).resolves.toBeUndefined()
    })

    it('keeps non-numeric string chatId as-is', async () => {
      const mockChat = {
        sendMessage: vi.fn().mockResolvedValue({}),
      }
      const mockTgBot: any = {
        getChat: vi.fn().mockResolvedValue(mockChat),
      }

      await MessageUtils.replyTG(mockTgBot, '@username', 'Message to username')

      expect(mockTgBot.getChat).toHaveBeenCalledWith('@username')
    })
  })
})
