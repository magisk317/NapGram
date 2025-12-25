import type { UnifiedMessage } from '../../../../domain/message'
import type { CommandContext } from '../CommandContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../../../../domain/models/db'
import { RequestManagementCommandHandler } from '../RequestManagementCommandHandler'

vi.mock('../../../../domain/models/db', () => ({
  default: {
    qQRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

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
    vi.mocked(db.qQRequest.findMany).mockResolvedValueOnce([])

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
    vi.mocked(db.qQRequest.findMany).mockResolvedValueOnce([
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

  it('requires flag for approve', async () => {
    const msg = createMessage()
    await handler.execute(msg, [], 'approve')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('请指定请求flag'),
      undefined,
    )
  })

  it('approves a friend request', async () => {
    vi.mocked(db.qQRequest.findUnique).mockResolvedValueOnce({
      id: 10,
      flag: 'flag-friend',
      instanceId: 1,
      status: 'pending',
      type: 'friend',
      userId: '20001',
    } as any)
    vi.mocked(db.qQRequest.update).mockResolvedValueOnce({} as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-friend'], 'approve')

    expect(mockContext.qqClient.handleFriendRequest).toHaveBeenCalledWith('flag-friend', true)
    expect(db.qQRequest.update).toHaveBeenCalled()
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已同意好友申请'),
      undefined,
    )
  })

  it('rejects a group request with reason', async () => {
    vi.mocked(db.qQRequest.findUnique).mockResolvedValueOnce({
      id: 11,
      flag: 'flag-group',
      instanceId: 1,
      status: 'pending',
      type: 'group',
      subType: 'invite',
      userId: '30001',
    } as any)
    vi.mocked(db.qQRequest.update).mockResolvedValueOnce({} as any)

    const msg = createMessage()
    await handler.execute(msg, ['flag-group', 'no', 'thanks'], 'reject')

    expect(mockContext.qqClient.handleGroupRequest).toHaveBeenCalledWith(
      'flag-group',
      'invite',
      false,
      'no thanks',
    )
    expect(db.qQRequest.update).toHaveBeenCalled()
    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('已拒绝加群申请'),
      undefined,
    )
  })

  it('shows empty request stats', async () => {
    vi.mocked(db.qQRequest.groupBy).mockResolvedValueOnce([] as any)

    const msg = createMessage()
    await handler.execute(msg, [], 'reqstats')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('暂无请求数据'),
      undefined,
    )
  })

  it('handles approveall when no requests', async () => {
    vi.mocked(db.qQRequest.findMany).mockResolvedValueOnce([])

    const msg = createMessage()
    await handler.execute(msg, [], 'approveall')

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('没有待处理的请求'),
      undefined,
    )
  })
})
