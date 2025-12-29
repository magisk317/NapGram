import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventPublisher, getEventPublisher } from '../event-publisher'
import { getGlobalRuntime } from '../plugin-runtime'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../plugin-runtime', () => ({
  getGlobalRuntime: vi.fn(),
}))

describe('eventPublisher', () => {
  const publishSync = vi.fn()
  const eventBus = { publishSync }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes qq private message events', () => {
    const publisher = new EventPublisher(eventBus as any)
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)

    publisher.publishMessage({
      instanceId: 1,
      platform: 'qq',
      channelId: '42',
      channelType: 'private',
      sender: {
        userId: '100',
        userName: 'User',
      },
      message: {
        id: 'm1',
        text: 'hello',
        segments: [],
        timestamp: 123,
        quote: {
          id: 'q1',
          userId: '200',
          text: 'quoted',
        },
      },
      raw: { source: 'raw' },
      reply: vi.fn(),
      send: vi.fn(),
      recall: vi.fn(),
    })

    expect(publishSync).toHaveBeenCalledWith('message', expect.objectContaining({
      channelRef: 'qq:private:42',
      message: expect.objectContaining({
        ref: 'qq:m1',
        text: 'hello',
      }),
    }))
    expect(loggerMocks.debug).toHaveBeenCalledWith({
      instanceId: 1,
      platform: 'qq',
      channelId: '42',
      messageId: 'm1',
    }, 'Publishing message event')
  })

  it('publishes qq group message events', () => {
    const publisher = new EventPublisher(eventBus as any)

    publisher.publishMessage({
      instanceId: 1,
      platform: 'qq',
      channelId: '88',
      channelType: 'group',
      sender: { userId: '1', userName: 'User', role: 'member' },
      message: { id: 'm2', text: 'hi', segments: [], timestamp: 123 },
      raw: {},
      reply: vi.fn(),
      send: vi.fn(),
      recall: vi.fn(),
    })

    expect(publishSync).toHaveBeenCalledWith('message', expect.objectContaining({
      channelRef: 'qq:group:88',
      message: expect.objectContaining({
        ref: 'qq:m2',
      }),
      sender: expect.objectContaining({
        role: 'member',
      }),
    }))
  })

  it('publishes tg message events with thread id', () => {
    const publisher = new EventPublisher(eventBus as any)

    publisher.publishMessage({
      instanceId: 2,
      platform: 'tg',
      channelId: '99',
      channelType: 'channel',
      threadId: 7,
      sender: {
        userId: '300',
        userName: 'Alice',
      },
      message: {
        id: 'm2',
        text: '',
        segments: [{ type: 'text', data: { text: 'hi' } }],
        timestamp: 456,
      },
      raw: { source: 'tg' },
      reply: vi.fn(),
      send: vi.fn(),
      recall: vi.fn(),
    })

    expect(publishSync).toHaveBeenCalledWith('message', expect.objectContaining({
      channelRef: 'tg:99',
      message: expect.objectContaining({
        ref: 'tg:99:m2',
      }),
      threadId: 7,
    }))
  })

  it('publishes friend request events', () => {
    const publisher = new EventPublisher(eventBus as any)
    vi.spyOn(Date, 'now').mockReturnValue(1700000000001)

    publisher.publishFriendRequest({
      instanceId: 3,
      platform: 'qq',
      requestId: 'req1',
      userId: 'u1',
      userName: 'Nick',
      comment: 'hi',
      timestamp: 1000,
      approve: vi.fn(),
      reject: vi.fn(),
    })

    expect(publishSync).toHaveBeenCalledWith('friend-request', expect.objectContaining({
      eventId: 'friend-request-3-req1-1700000000001',
      userName: 'Nick',
    }))
  })

  it('publishes group request events', () => {
    const publisher = new EventPublisher(eventBus as any)

    publisher.publishGroupRequest({
      instanceId: 4,
      platform: 'tg',
      requestId: 'req2',
      groupId: 'g1',
      userId: 'u2',
      userName: 'Bob',
      subType: 'invite',
      timestamp: 2000,
      approve: vi.fn(),
      reject: vi.fn(),
    })

    expect(publishSync).toHaveBeenCalledWith('group-request', expect.objectContaining({
      groupId: 'g1',
      userId: 'u2',
      subType: 'invite',
    }))
  })

  it('publishes notice events', () => {
    const publisher = new EventPublisher(eventBus as any)

    publisher.publishNotice({
      instanceId: 5,
      platform: 'qq',
      noticeType: 'group-member-increase',
      groupId: 'g2',
      userId: 'u3',
      operatorId: 'op1',
      duration: 12,
      timestamp: 3000,
      raw: { notice: true },
    })

    expect(publishSync).toHaveBeenCalledWith('notice', expect.objectContaining({
      noticeType: 'group-member-increase',
      duration: 12,
    }))
  })

  it('publishes instance status events', () => {
    const publisher = new EventPublisher(eventBus as any)
    vi.spyOn(Date, 'now').mockReturnValue(1700000000002)

    publisher.publishInstanceStatus({
      instanceId: 6,
      status: 'running',
    })

    expect(publishSync).toHaveBeenCalledWith('instance-status', {
      instanceId: 6,
      status: 'running',
      error: undefined,
      timestamp: 1700000000002,
    })
  })

  it('creates a publisher from the global runtime', () => {
    vi.mocked(getGlobalRuntime).mockReturnValue({
      getEventBus: () => eventBus,
    } as any)

    const publisher = getEventPublisher()
    publisher.publishInstanceStatus({
      instanceId: 7,
      status: 'starting',
    })

    expect(publishSync).toHaveBeenCalledWith('instance-status', expect.objectContaining({
      instanceId: 7,
      status: 'starting',
    }))
  })
})
