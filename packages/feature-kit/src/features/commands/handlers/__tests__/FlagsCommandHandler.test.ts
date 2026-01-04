import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { FlagsCommandHandler } from '../FlagsCommandHandler'

vi.mock('@napgram/infra-kit', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  sql: vi.fn(),
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
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as any)
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, [])

    expect(db.execute).toHaveBeenCalled()
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('当前没有启用任何实验性功能'),
      undefined,
    )
  })

  it('falls back to empty flags when query fails', async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('db error'))
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, [])

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

  it('shows usage when disabling without flag name', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['disable'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('用法: /flags disable'),
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

  it('disables flag and stores it in memory', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['disable', 'debug_mode'])

    expect(FlagsCommandHandler.isEnabled(mockContext.instance as any, 'debug_mode')).toBe(false)
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已禁用'),
      undefined,
    )
  })

  it('reuses existing flag store when enabling', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)
    const store = new Map<string, boolean>([['debug_mode', false]])
      ; (mockContext.instance as any)._flagsStore = store

    const msg = createMessage('telegram')
    await handler.execute(msg, ['enable', 'debug_mode'])

    expect((mockContext.instance as any)._flagsStore).toBe(store)
    expect(store.get('debug_mode')).toBe(true)
  })

  it('lists flags when using list command', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        { key: 'flag_a', value: true },
        { key: 'flag_b', value: false },
      ]
    } as any)
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['list'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('flag_a'),
      undefined,
    )
  })

  it('shows help for unknown action', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['unknown'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('实验性功能标志管理'),
      undefined,
    )
  })

  it('handles list flags reply failure', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as any)
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)
    vi.mocked(mockContext.replyTG)
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(undefined)

    const msg = createMessage('telegram')
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('获取功能标志失败'),
      undefined,
    )
  })

  it('handles setFlag reply failure', async () => {
    vi.mocked(mockContext.permissionChecker.isAdmin).mockReturnValue(true)
    vi.mocked(mockContext.replyTG)
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(undefined)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['enable', 'debug_mode'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('设置功能标志失败'),
      undefined,
    )
  })

  it('returns false when flag store is missing', () => {
    expect(FlagsCommandHandler.isEnabled({} as any, 'debug_mode')).toBe(false)
  })
})
