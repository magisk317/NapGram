import type { UnifiedMessage } from '@napgram/message-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { ReplyResolver } from '../ReplyResolver'

// Mock logger
const { debugMock } = vi.hoisted(() => ({ debugMock: vi.fn() }))

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

function createMessage(): UnifiedMessage {
  return {
    id: '1',
    platform: 'qq',
    sender: { id: '123', name: 'Tester' },
    chat: { id: '456', type: 'group' },
    content: [{ type: 'text', data: { text: 'hello' } }],
    timestamp: Date.now(),
  }
}

describe('replyResolver', () => {
  beforeEach(() => {
    debugMock.mockClear()
  })

  it('returns undefined when QQ message has no reply content', async () => {
    const mapper = {
      findTgMsgId: vi.fn(),
    }
    const resolver = new ReplyResolver(mapper as any)

    const result = await resolver.resolveQQReply(createMessage(), 1, BigInt(456))

    expect(result).toBeUndefined()
    expect(mapper.findTgMsgId).not.toHaveBeenCalled()
  })

  it('resolves QQ reply via mapper', async () => {
    const mapper = {
      findTgMsgId: vi.fn().mockResolvedValue(99),
    }
    const resolver = new ReplyResolver(mapper as any)

    const msg = createMessage()
    msg.content.push({
      type: 'reply',
      data: { messageId: '88' },
    } as any)

    const result = await resolver.resolveQQReply(msg, 1, BigInt(456))

    expect(mapper.findTgMsgId).toHaveBeenCalledWith(1, BigInt(456), '88')
    expect(mapper.findTgMsgId).toHaveBeenCalledWith(1, BigInt(456), '88')
    expect(result).toBe(99)
  })

  it('handle QQ reply when TG message ID not found', async () => {
    const mapper = {
      findTgMsgId: vi.fn().mockResolvedValue(undefined),
    }
    const resolver = new ReplyResolver(mapper as any)

    const msg = createMessage()
    msg.content.push({
      type: 'reply',
      data: { messageId: '77' },
    } as any)

    const result = await resolver.resolveQQReply(msg, 1, BigInt(456))

    expect(mapper.findTgMsgId).toHaveBeenCalledWith(1, BigInt(456), '77')
    expect(result).toBeUndefined()
    expect(debugMock).not.toHaveBeenCalled()
  })

  it('returns undefined when TG message has no replyToMessage', async () => {
    const mapper = {
      findQqSource: vi.fn(),
    }
    const resolver = new ReplyResolver(mapper as any)

    const result = await resolver.resolveTGReply({}, 1, 222)

    expect(result).toBeUndefined()
    expect(mapper.findQqSource).not.toHaveBeenCalled()
  })

  it('resolves TG reply via mapper', async () => {
    const mapper = {
      findQqSource: vi.fn().mockResolvedValue({
        seq: 7,
        qqRoomId: BigInt(111),
        qqSenderId: BigInt(222),
        time: 123,
      }),
    }
    const resolver = new ReplyResolver(mapper as any)

    const result = await resolver.resolveTGReply(
      { replyToMessage: { id: 555 } },
      1,
      222,
    )

    expect(mapper.findQqSource).toHaveBeenCalledWith(1, 222, 555)
    expect(result).toEqual({
      seq: 7,
      qqRoomId: BigInt(111),
      senderUin: '222',
      time: 123,
    })
  })

  it('returns undefined when findQqSource returns null', async () => {
    const mapper = {
      findQqSource: vi.fn().mockResolvedValue(null),
    }
    const resolver = new ReplyResolver(mapper as any)

    const result = await resolver.resolveTGReply(
      { replyToMessage: { id: 555 } },
      1,
      222,
    )

    expect(mapper.findQqSource).toHaveBeenCalledWith(1, 222, 555)
    expect(result).toBeUndefined()
  })
})
