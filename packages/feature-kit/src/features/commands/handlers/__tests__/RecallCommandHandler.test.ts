import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { RecallCommandHandler } from '../RecallCommandHandler'

vi.mock('@napgram/infra-kit', () => {
  const mockDb = {
    query: {
      message: { findFirst: vi.fn(), findMany: vi.fn() },
      forwardPair: { findFirst: vi.fn(), findMany: vi.fn() },
      forwardMultiple: { findFirst: vi.fn(), findMany: vi.fn() },
      qqRequest: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn().mockResolvedValue([]),
        })),
        groupBy: vi.fn().mockResolvedValue([]),
      })),
    })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }

  return {
    db: mockDb,
    schema: {
      message: { id: 'id', tgChatId: 'tgChatId', tgMsgId: 'tgMsgId', qqRoomId: 'qqRoomId', seq: 'seq', instanceId: 'instanceId' },
      forwardPair: { id: 'id' },
      qqRequest: { id: 'id' },
    },
    eq: vi.fn(),
    and: vi.fn(),
    lt: vi.fn(),
    desc: vi.fn(),
    gte: vi.fn(),
    sql: vi.fn(),
    count: vi.fn(),
    env: {
      ENABLE_AUTO_RECALL: true,
      TG_MEDIA_TTL_SECONDS: undefined,
      DATA_DIR: '/tmp',
      CACHE_DIR: '/tmp/cache',
      WEB_ENDPOINT: 'http://napgram-dev:8080',
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
  }
})

function createMockContext(): CommandContext {
  return {
    qqClient: {
      recallMessage: vi.fn().mockResolvedValue(undefined),
    } as any,
    tgBot: {
      getChat: vi.fn().mockResolvedValue({
        deleteMessages: vi.fn().mockResolvedValue(undefined),
      }),
      client: {
        call: vi.fn().mockResolvedValue([{ id: 1 }]),
      },
    } as any,
    registry: {} as any,
    permissionChecker: {
      isAdmin: vi.fn().mockReturnValue(false),
    } as any,
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

function createMessage(platform: 'telegram' | 'qq' = 'telegram', raw?: any): UnifiedMessage {
  return {
    id: '12345',
    platform,
    sender: {
      id: '999999',
      name: 'TestUser',
    },
    chat: {
      id: '777777',
      type: 'group',
    },
    content: [
      {
        type: 'text',
        data: { text: '/rm' },
      },
    ],
    timestamp: Date.now(),
    metadata: raw ? { raw } : {},
  }
}

describe('recallCommandHandler', () => {
  let handler: RecallCommandHandler
  let mockContext: CommandContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = createMockContext()
    handler = new RecallCommandHandler(mockContext)
  })

  it('rejects batch recall on non-telegram platform', async () => {
    const msg = createMessage('qq')
    await handler.execute(msg, ['5'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('仅支持 Telegram'),
    )
  })

  it('requires admin for batch recall', async () => {
    const msg = createMessage('telegram')
    await handler.execute(msg, ['5'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('需要管理员权限'),
    )
  })

  it('limits batch recall count', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['101'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('最多支持 100'),
    )
  })

  it('prompts when no reply target is provided', async () => {
    const msg = createMessage('telegram')
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('请回复要撤回的消息'),
    )
  })

  it('denies recall when sender lacks permission', async () => {
    vi.mocked(db.query.message.findFirst).mockResolvedValueOnce({
      tgSenderId: '111111',
    } as any)

    const msg = createMessage('telegram', { replyToMessage: { id: 42 } })
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('无权限撤回'),
    )
  })

  it('recalls a telegram message when authorized', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)
    vi.mocked(db.query.message.findFirst).mockResolvedValueOnce({
      tgSenderId: '999999',
      tgMsgId: 42,
      tgChatId: '777777',
      seq: 777,
    } as any)

    const chat = { deleteMessages: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(mockContext.tgBot.getChat).mockResolvedValue(chat as any)

    const msg = createMessage('telegram', { replyTo: { replyToMsgId: 42 } })
    await handler.execute(msg, [])

    expect(chat.deleteMessages).toHaveBeenCalledWith([42])
    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('777')
  })

  it('handles batch recall success path', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)
    vi.mocked(db.query.message.findMany).mockResolvedValueOnce([
      { tgMsgId: 40, seq: '111', tgChatId: '777777' },
      { tgMsgId: 39, seq: '222', tgChatId: '777777' },
    ] as any)

    const chat = { deleteMessages: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(mockContext.tgBot.getChat).mockResolvedValue(chat as any)

    const msg = createMessage('telegram', { id: 50 })
    await handler.execute(msg, ['2'])

    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('111')
    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('222')
    expect(chat.deleteMessages).toHaveBeenCalledWith([40])
    expect(chat.deleteMessages).toHaveBeenCalledWith([39])
  })

  it('recalls from QQ platform and removes TG mapping', async () => {
    vi.mocked(db.query.message.findFirst).mockResolvedValueOnce({
      tgSenderId: '999999',
      tgMsgId: 88,
      tgChatId: '777777',
      seq: 55,
    } as any)

    const chat = { deleteMessages: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(mockContext.tgBot.getChat).mockResolvedValue(chat as any)

    const msg = createMessage('qq')
    msg.content.push({ type: 'reply', data: { messageId: '55' } } as any)

    await handler.execute(msg, [])

    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('55')
    expect(chat.deleteMessages).toHaveBeenCalledWith([88])
  })
})
