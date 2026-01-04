import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env, schema } from '@napgram/infra-kit'
import { RequestManagementCommandHandler } from '../RequestManagementCommandHandler'

vi.mock('@napgram/infra-kit', () => {
  const mockSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue([]),
  }
  const mockUpdate = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue({}),
  }
  const mockDb = {
    query: {
      message: { findFirst: vi.fn(), findMany: vi.fn() },
      forwardPair: { findFirst: vi.fn(), findMany: vi.fn() },
      forwardMultiple: { findFirst: vi.fn(), findMany: vi.fn() },
      qqRequest: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    update: vi.fn(() => mockUpdate),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    select: vi.fn(() => mockSelect),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }

  return {
    db: mockDb,
    schema: {
      message: { id: 'id', tgChatId: 'tgChatId', tgMsgId: 'tgMsgId', qqRoomId: 'qqRoomId', seq: 'seq', instanceId: 'instanceId' },
      forwardPair: { id: 'id' },
      qqRequest: { id: 'id', type: 'type', status: 'status', createdAt: 'createdAt', instanceId: 'instanceId', flag: 'flag' },
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
      handleFriendRequest: vi.fn().mockResolvedValue(undefined),
      handleGroupRequest: vi.fn().mockResolvedValue(undefined),
    } as any,
    tgBot: {} as any,
    registry: {} as any,
    permissionChecker: {} as any,
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

function createMessage(): UnifiedMessage {
  return {
    id: '12345',
    platform: 'telegram',
    sender: {
      id: '123456',
      name: 'Admin',
    },
    chat: {
      id: '777777',
      type: 'group',
    },
    content: [
      {
        type: 'text',
        data: { text: '/pending' },
      },
    ],
    timestamp: Date.now(),
    metadata: {},
  }
}

describe('requestManagementCommandHandler', () => {
  let handler: RequestManagementCommandHandler
  let mockContext: CommandContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = createMockContext()
    handler = new RequestManagementCommandHandler(mockContext)
  })

  it('shows empty pending list', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([])

    const msg = createMessage()
    await handler.execute(msg, [], 'pending')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('没有待处理'),
      undefined,
    )
  })

  it('formats pending requests list', async () => {
    const createdAt = new Date('2025-01-01T00:00:00Z')
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([
      {
        id: 1,
        flag: 'req-1',
        type: 'friend',
        userId: '10001',
        groupId: null,
        subType: null,
        comment: 'hello',
        instanceId: 1,
        status: 'pending',
        createdAt,
      },
    ] as any)

    const msg = createMessage()
    await handler.execute(msg, ['friend'], 'pending')

    const replyText = vi.mocked(mockContext.replyTG).mock.calls[0][1]
    expect(replyText).toContain('待处理的好友申请')
    expect(replyText).toContain('/approve req-1')
    expect(replyText).toContain('/reject req-1')
  })

  it('filters pending group requests', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([
      {
        id: 2,
        flag: 'req-2',
        type: 'group',
        userId: '20002',
        groupId: '1000',
        subType: 'invite',
        comment: null,
        instanceId: 1,
        status: 'pending',
        createdAt: new Date('2025-02-01T00:00:00Z'),
      },
    ] as any)

    const msg = createMessage()
    await handler.execute(msg, ['group'], 'pending')

    const replyText = vi.mocked(mockContext.replyTG).mock.calls.at(-1)?.[1] as string
    expect(replyText).toContain('加群')
    expect(replyText).toContain('req-2')
  })

  it('requires flag for approve', async () => {
    const msg = createMessage()
    await handler.execute(msg, [], 'approve')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('请指定请求flag'),
      undefined,
    )
  })

  it('reports missing request during approve', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([])

    const msg = createMessage()
    await handler.execute(msg, ['missing-flag'], 'approve')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('未找到请求'),
      undefined,
    )
  })

  it('rejects approve for non-pending request', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([{
      id: 12,
      flag: 'flag-done',
      instanceId: 1,
      status: 'approved',
      type: 'friend',
      userId: '20002',
    }] as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-done'], 'approve')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已处理'),
      undefined,
    )
  })

  it('approves a friend request', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([{
      id: 10,
      flag: 'flag-friend',
      instanceId: 1,
      status: 'pending',
      type: 'friend',
      userId: '20001',
    }] as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) } as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-friend'], 'approve')

    expect(mockContext.qqClient.handleFriendRequest).toHaveBeenCalledWith('flag-friend', true)
    expect(db.update).toHaveBeenCalledWith(schema.qqRequest)
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已同意好友申请'),
      undefined,
    )
  })

  it('handles group approve errors', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([{
      id: 13,
      flag: 'flag-group-missing',
      instanceId: 1,
      status: 'pending',
      type: 'group',
      userId: '20003',
      subType: null,
    }] as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-group-missing'], 'approve')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('批准失败'),
      undefined,
    )
  })

  it('rejects a group request with reason', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([{
      id: 11,
      flag: 'flag-group',
      instanceId: 1,
      status: 'pending',
      type: 'group',
      subType: 'invite',
      userId: '30001',
    }] as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) } as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-group', 'no', 'thanks'], 'reject')

    expect(mockContext.qqClient.handleGroupRequest).toHaveBeenCalledWith(
      'flag-group',
      'invite',
      false,
      'no thanks',
    )
    expect(db.update).toHaveBeenCalledWith(schema.qqRequest)
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已拒绝加群申请'),
      undefined,
    )
  })

  it('rejects a friend request with reason', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([{
      id: 14,
      flag: 'flag-friend-reject',
      instanceId: 1,
      status: 'pending',
      type: 'friend',
      userId: '30003',
    }] as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) } as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-friend-reject', 'nope'], 'reject')

    expect(mockContext.qqClient.handleFriendRequest).toHaveBeenCalledWith('flag-friend-reject', false, 'nope')
    expect(db.update).toHaveBeenCalledWith(schema.qqRequest)
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('理由：nope'),
      undefined,
    )
  })

  it('shows empty request stats', async () => {
    const mockSelect = db.select() as any
    vi.mocked(mockSelect.groupBy).mockResolvedValueOnce([] as any)

    const msg = createMessage()
    await handler.execute(msg, [], 'reqstats')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('暂无请求数据'),
      undefined,
    )
  })

  it('shows request stats summary', async () => {
    const mockSelect = db.select() as any
    vi.mocked(mockSelect.groupBy).mockResolvedValueOnce([
      { type: 'friend', status: 'approved', count: 2 },
      { type: 'friend', status: 'pending', count: 1 },
      { type: 'group', status: 'rejected', count: 3 },
    ] as any)

    const msg = createMessage()
    await handler.execute(msg, ['today'], 'reqstats')

    const replyText = vi.mocked(mockContext.replyTG).mock.calls.at(-1)?.[1] as string
    expect(replyText).toContain('好友申请')
    expect(replyText).toContain('加群申请')
  })

  it('handles approveall when no requests', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([])

    const msg = createMessage()
    await handler.execute(msg, [], 'approveall')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('没有待处理的请求'),
      undefined,
    )
  })

  it('approves pending requests in batch with failures', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([
      { id: 20, flag: 'flag-friend', type: 'friend' },
      { id: 21, flag: 'flag-group', type: 'group', subType: null },
    ] as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) } as any)

    const msg = createMessage()
    await handler.execute(msg, [], 'approveall')

    const replyText = vi.mocked(mockContext.replyTG).mock.calls.at(-1)?.[1] as string
    expect(replyText).toContain('成功：1')
    expect(replyText).toContain('失败：1')
  })

  it('rejects pending requests in batch with default reason', async () => {
    vi.mocked(db.query.qqRequest.findMany).mockResolvedValueOnce([
      { id: 30, flag: 'flag-friend', type: 'friend' },
    ] as any)
    vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) } as any)

    const msg = createMessage()
    await handler.execute(msg, [], 'rejectall')

    expect(mockContext.qqClient.handleFriendRequest).toHaveBeenCalledWith('flag-friend', false, '批量拒绝')
    const replyText = vi.mocked(mockContext.replyTG).mock.calls.at(-1)?.[1] as string
    expect(replyText).toContain('理由：批量拒绝')
  })
})
