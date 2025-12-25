import type { UnifiedMessage } from '../../../../domain/message'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../../../../domain/models/db'
import { FlagsCommandHandler } from '../FlagsCommandHandler'

vi.mock('../../../../domain/models/db', () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}))

function createMockContext(): CommandContext {
  return {
    qqClient: {} as any,
    tgBot: {} as any,
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

function createMessage(platform: 'telegram' | 'qq' = 'telegram'): UnifiedMessage {
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
        data: { text: '/flags' },
      },
    ],
    timestamp: Date.now(),
    metadata: {},
  }
}

describe('flagsCommandHandler', () => {
  let handler: FlagsCommandHandler
  let mockContext: CommandContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = createMockContext()
    handler = new FlagsCommandHandler(mockContext)
  })

  it('ignores non-telegram messages', async () => {
    const msg = createMessage('qq')
    await handler.execute(msg, [])

    expect(mockContext.replyTG).not.toHaveBeenCalled()
  })

  it('requires admin permission', async () => {
    const msg = createMessage('telegram')
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('管理员权限'),
      undefined,
    )
  })

  it('lists empty flags when no args', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([])
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, [])

    expect(db.$queryRaw).toHaveBeenCalled()
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('当前没有启用任何实验性功能'),
      undefined,
    )
  })

  it('shows usage when enabling without flag name', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['enable'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('用法: /flags enable'),
      undefined,
    )
  })

  it('enables flag and stores it in memory', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['enable', 'debug_mode'])

    expect(FlagsCommandHandler.isEnabled(mockContext.instance as any, 'debug_mode')).toBe(true)
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已启用'),
      undefined,
    )
  })
})
