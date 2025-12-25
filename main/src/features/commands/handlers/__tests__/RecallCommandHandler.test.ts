import type { UnifiedMessage } from '../../../../domain/message'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../../../../domain/models/db'
import { RecallCommandHandler } from '../RecallCommandHandler'

vi.mock('../../../../domain/models/db', () => ({
  default: {
    message: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

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
    vi.mocked(db.message.findFirst).mockResolvedValueOnce({
      tgSenderId: '111111',
    } as any)

    const msg = createMessage('telegram', { replyToMessage: { id: 42 } })
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('无权限撤回'),
    )
  })
})
