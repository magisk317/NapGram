import type { UnifiedMessage } from '@napgram/message-kit'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env, schema } from '@napgram/infra-kit'
import { getEventPublisher } from '../../../shared-types'
import { ForwardFeature } from '../ForwardFeature'
import { MessageUtils } from '../utils/MessageUtils'

vi.mock('@napgram/infra-kit', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
    })),
  },
  schema: {
    forwardPair: { id: 'id' },
  },
  eq: vi.fn(),
  and: vi.fn(),
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080'
  },
  hashing: { md5Hex: vi.fn((value: string) => value) },
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

vi.mock('../../../shared-types', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getEventPublisher: vi.fn(),
  }
})

function createForwardMap() {
  return {
    findByQQ: vi.fn(),
    findByTG: vi.fn(),
  }
}

function createTgBot() {
  const chat = {
    sendMessage: vi.fn().mockResolvedValue({ id: 101 }),
  }
  return {
    addNewMessageEventHandler: vi.fn(),
    getChat: vi.fn().mockResolvedValue(chat),
    me: { id: 999 },
    chat,
  }
}

function createQQClient() {
  const client = new EventEmitter() as any
  client.uin = 123456
  client.nickname = 'Bot'
  client.sendMessage = vi.fn().mockResolvedValue({ success: true, messageId: 'qq-1' })
  client.recallMessage = vi.fn().mockResolvedValue(undefined)
  client.getGroupMemberInfo = vi.fn().mockResolvedValue({ card: 'Op', nickname: 'OpNick' })
  return client
}

function createMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'msg-1',
    platform: 'qq',
    sender: { id: '123', name: 'Sender' },
    chat: { id: '2001', type: 'group' },
    content: [],
    timestamp: Date.now(),
    metadata: {},
    ...overrides,
  }
}

function createPair(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    qqRoomId: '2001',
    tgChatId: BigInt(1001),
    tgThreadId: undefined,
    instanceId: 1,
    forwardMode: '11',
    nicknameMode: '11',
    ...overrides,
  }
}

function createFeature() {
  const forwardMap = createForwardMap()
  const tgBot = createTgBot()
  const qqClient = createQQClient()
  const instance = {
    id: 1,
    forwardPairs: forwardMap,
    tgBot,
    eventPublisher: { publishMessageCreated: vi.fn().mockResolvedValue(undefined) },
    owner: '999',
  }

  const feature = new ForwardFeature(instance as any, tgBot as any, qqClient as any);
  (feature as any).telegramSender = { sendToTelegram: vi.fn().mockResolvedValue({ id: 321 }) };
  (feature as any).mapper = { saveMessage: vi.fn().mockResolvedValue(undefined) };
  (feature as any).replyResolver = { resolveQQReply: vi.fn().mockResolvedValue(undefined) }

  return { feature, forwardMap, tgBot, qqClient, instance }
}

let publishMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  publishMessage = vi.fn()
  vi.mocked(getEventPublisher).mockReturnValue({ publishMessage } as any)
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue({
        id: 1,
        forwardMode: '11',
        nicknameMode: '11',
      }),
    })),
  } as any)
})

describe('forwardFeature', () => {
  it('throws when forward map is missing', () => {
    const tgBot = createTgBot()
    const qqClient = createQQClient()
    const instance = { forwardPairs: null }

    expect(() => new ForwardFeature(instance as any, tgBot as any, qqClient as any)).toThrow(
      'Forward map is not initialized',
    )
  })

  it('renders message content types', () => {
    const { feature } = createFeature()

    const textOutput = (feature as any).renderContent({ type: 'text', data: { text: 'a\\nb' } })
    expect(textOutput).toBe('a\nb')

    const imageOutput = (feature as any).renderContent({ type: 'image', data: {} })
    expect(imageOutput.startsWith('[')).toBe(true)
    expect(imageOutput.endsWith(']')).toBe(true)

    const videoOutput = (feature as any).renderContent({ type: 'video', data: {} })
    expect(videoOutput.startsWith('[')).toBe(true)

    const audioOutput = (feature as any).renderContent({ type: 'audio', data: {} })
    expect(audioOutput.startsWith('[')).toBe(true)

    const fileOutput = (feature as any).renderContent({ type: 'file', data: { filename: 'doc.txt' } })
    expect(fileOutput).toContain('doc.txt')

    const atOutput = (feature as any).renderContent({ type: 'at', data: { userId: '1', userName: 'Bob' } })
    expect(atOutput).toBe('@Bob')

    const faceOutput = (feature as any).renderContent({ type: 'face', data: { text: '/smile' } })
    expect(faceOutput).toBe('/smile')

    const replyOutput = (feature as any).renderContent({ type: 'reply', data: { messageId: '7', text: 'ok' } })
    expect(replyOutput).toContain('7')
    expect(replyOutput).toContain('ok')

    const forwardOutput = (feature as any).renderContent({ type: 'forward', data: { messages: [1, 2] } })
    expect(forwardOutput).toContain('2')

    const locationOutput = (feature as any).renderContent({ type: 'location', data: { title: 'Here', latitude: 1, longitude: 2 } })
    expect(locationOutput).toContain('Here')
    expect(locationOutput).toContain('1,2')

    const unknownOutput = (feature as any).renderContent({ type: 'unknown', data: {} })
    expect(unknownOutput).toBe('[unknown]')
  })

  it('rejects mode updates from non-admin users', async () => {
    const { feature } = createFeature()
    const isAdminSpy = vi.spyOn(MessageUtils, 'isAdmin').mockReturnValue(false)
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)

    const msg = createMessage({
      platform: 'telegram',
      chat: { id: '1001', type: 'group' },
    })

    await (feature as any).handleModeCommand(msg, ['nickname', '10'])

    expect(replySpy).toHaveBeenCalled()

    isAdminSpy.mockRestore()
    replySpy.mockRestore()
  })

  it('validates mode command arguments', async () => {
    const { feature } = createFeature()
    const isAdminSpy = vi.spyOn(MessageUtils, 'isAdmin').mockReturnValue(true)
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)

    const msg = createMessage({
      platform: 'telegram',
      chat: { id: '1001', type: 'group' },
    })

    await (feature as any).handleModeCommand(msg, [])

    expect(replySpy).toHaveBeenCalled()

    isAdminSpy.mockRestore()
    replySpy.mockRestore()
  })

  it('reports missing forward pair for mode changes', async () => {
    const { feature, forwardMap } = createFeature()
    const isAdminSpy = vi.spyOn(MessageUtils, 'isAdmin').mockReturnValue(true)
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)
    forwardMap.findByTG.mockReturnValue(null)

    const msg = createMessage({
      platform: 'telegram',
      chat: { id: '1001', type: 'group' },
    })

    await (feature as any).handleModeCommand(msg, ['nickname', '10'])

    expect(replySpy).toHaveBeenCalled()

    isAdminSpy.mockRestore()
    replySpy.mockRestore()
  })

  it('updates nickname mode successfully', async () => {
    const { feature, forwardMap } = createFeature()
    const isAdminSpy = vi.spyOn(MessageUtils, 'isAdmin').mockReturnValue(true)
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)
    const pair = createPair({ nicknameMode: '00' })
    forwardMap.findByTG.mockReturnValue(pair)

    const msg = createMessage({
      platform: 'telegram',
      chat: { id: '1001', type: 'group' },
    })

    await (feature as any).handleModeCommand(msg, ['nickname', '10'])

    expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    expect(pair.nicknameMode).toBe('10')
    expect(replySpy).toHaveBeenCalled()

    isAdminSpy.mockRestore()
    replySpy.mockRestore()
  })

  it('handles mode update failures', async () => {
    const { feature, forwardMap } = createFeature()
    const isAdminSpy = vi.spyOn(MessageUtils, 'isAdmin').mockReturnValue(true)
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)
    forwardMap.findByTG.mockReturnValue(createPair())
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockRejectedValue(new Error('fail')),
      })),
    } as any)

    const msg = createMessage({
      platform: 'telegram',
      chat: { id: '1001', type: 'group' },
    })

    await (feature as any).handleModeCommand(msg, ['forward', '10'])

    expect(replySpy).toHaveBeenCalled()

    isAdminSpy.mockRestore()
    replySpy.mockRestore()
  })

  it('skips poke forwarding when QQ->TG is disabled', async () => {
    const { feature, forwardMap } = createFeature()
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)
    forwardMap.findByQQ.mockReturnValue(createPair({ forwardMode: '00' }))

    await (feature as any).handlePokeEvent('2001', '111', '222')

    expect(replySpy).not.toHaveBeenCalled()

    replySpy.mockRestore()
  })

  it('forwards poke events with resolved names', async () => {
    const { feature, forwardMap, qqClient } = createFeature()
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)
    forwardMap.findByQQ.mockReturnValue(createPair({ tgThreadId: 9 }))
    qqClient.getGroupMemberInfo
      .mockResolvedValueOnce({ card: 'OpCard' })
      .mockResolvedValueOnce({ nickname: 'TargetNick' })

    await (feature as any).handlePokeEvent('2001', '111', '222')

    const replyText = replySpy.mock.calls[0]?.[2] as string
    expect(replyText).toContain('OpCard')
    expect(replyText).toContain('TargetNick')

    replySpy.mockRestore()
  })

  it('handles self poke events without lookups', async () => {
    const { feature, forwardMap, qqClient, tgBot } = createFeature()
    const replySpy = vi.spyOn(MessageUtils, 'replyTG').mockResolvedValue(undefined)
    forwardMap.findByQQ.mockReturnValue(createPair())

    await (feature as any).handlePokeEvent('2001', '111', '111')

    expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    expect(replySpy).toHaveBeenCalledWith(
      tgBot,
      1001,
      'User 111 poked themselves',
      undefined,
    )

    replySpy.mockRestore()
  })

  it('publishes plugin events for QQ messages and supports reply/send/recall', async () => {
    const { feature, forwardMap, qqClient } = createFeature()
    forwardMap.findByQQ.mockReturnValue(null)

    const forwardMsg: UnifiedMessage = {
      id: 'fwd-1',
      platform: 'qq',
      sender: { id: '42', name: 'ForwardUser' },
      chat: { id: '2001', type: 'group' },
      content: [{ type: 'text', data: { text: 'nested' } }],
      timestamp: Date.now(),
    }

    const msg = createMessage({
      content: [
        { type: 'text', data: { text: 'hello' } },
        { type: 'at', data: { userId: '2', userName: 'Bob' } },
        { type: 'reply', data: { messageId: '7' } },
        { type: 'image', data: { url: 'http://img' } },
        { type: 'video', data: { file: 'video.mp4' } },
        { type: 'audio', data: { file: 'audio.mp3' } },
        { type: 'file', data: { file: 'file.bin', filename: 'file.bin' } },
        { type: 'forward', data: { messages: [forwardMsg] } },
        { type: 'mystery', data: { value: 1 } } as any,
      ],
    })

    await (feature as any).handleQQMessage(msg)

    expect(publishMessage).toHaveBeenCalled()
    const payload = publishMessage.mock.calls[0][0]
    expect(payload.message.text).toBe('hello')
    const segments = payload.message.segments as any[]
    const getSeg = (type: string) => segments.find(seg => seg.type === type)

    expect(getSeg('text')?.data?.text).toBe('hello')
    expect(getSeg('at')?.data?.userName).toBe('Bob')
    expect(getSeg('reply')?.data?.messageId).toBe('7')
    expect(getSeg('image')?.data?.url).toBe('http://img')
    expect(getSeg('video')?.data?.file).toBe('video.mp4')
    expect(getSeg('audio')?.data?.file).toBe('audio.mp3')
    expect(getSeg('file')?.data?.name).toBe('file.bin')

    const forwardSeg = getSeg('forward')
    expect(forwardSeg?.data?.messages?.[0]?.userId).toBe('42')
    expect(forwardSeg?.data?.messages?.[0]?.segments?.[0]?.data?.text).toBe('nested')
    expect(segments.some(seg => seg.type === 'raw')).toBe(true)

    await payload.reply([
      { type: 'text', data: { text: 'ok' } },
      { type: 'at', data: { userName: 'Bob' } },
    ])
    await payload.send('plain')
    await payload.recall()

    expect(qqClient.sendMessage).toHaveBeenCalledTimes(2)
    expect(qqClient.recallMessage).toHaveBeenCalledWith('msg-1')
  })

  it('skips forwarding for command messages', async () => {
    const { feature, forwardMap, instance } = createFeature()
    forwardMap.findByQQ.mockReturnValue(createPair())

    const msg = createMessage({
      content: [{ type: 'text', data: { text: '/ping' } }],
    })

    await (feature as any).handleQQMessage(msg)

    expect(publishMessage).toHaveBeenCalled()
    expect(instance.eventPublisher.publishMessageCreated).not.toHaveBeenCalled()
    expect((feature as any).telegramSender.sendToTelegram).not.toHaveBeenCalled()
  })

  it('skips forwarding when sender is blocked', async () => {
    const { feature, forwardMap } = createFeature()
    forwardMap.findByQQ.mockReturnValue(createPair({ ignoreSenders: '123,456' }))

    const msg = createMessage({
      sender: { id: '123', name: 'Blocked' },
      content: [{ type: 'text', data: { text: 'hello' } }],
    })

    await (feature as any).handleQQMessage(msg)

    expect((feature as any).telegramSender.sendToTelegram).not.toHaveBeenCalled()
  })

  it('skips forwarding when message matches ignore regex', async () => {
    const { feature, forwardMap } = createFeature()
    forwardMap.findByQQ.mockReturnValue(createPair({ ignoreRegex: 'hello' }))

    const msg = createMessage({
      content: [{ type: 'text', data: { text: 'hello' } }],
    })

    await (feature as any).handleQQMessage(msg)

    expect((feature as any).telegramSender.sendToTelegram).not.toHaveBeenCalled()
  })

  it('continues forwarding when ignore regex is invalid', async () => {
    const { feature, forwardMap, instance } = createFeature()
    const pair = createPair({ ignoreRegex: '[' })
    forwardMap.findByQQ.mockReturnValue(pair)

    const msg = createMessage({
      content: [{ type: 'text', data: { text: 'hello' } }],
    })

    await (feature as any).handleQQMessage(msg)

    expect(instance.eventPublisher.publishMessageCreated).toHaveBeenCalled()
    expect((feature as any).telegramSender.sendToTelegram).toHaveBeenCalled()
    expect((feature as any).mapper.saveMessage).toHaveBeenCalled()
  })

  it('does not forward when QQ->TG mode is disabled', async () => {
    const { feature, forwardMap } = createFeature()
    forwardMap.findByQQ.mockReturnValue(createPair({ forwardMode: '01' }))

    const msg = createMessage({
      content: [{ type: 'text', data: { text: 'hello' } }],
    })

    await (feature as any).handleQQMessage(msg)

    expect((feature as any).telegramSender.sendToTelegram).not.toHaveBeenCalled()
  })
  it('deduplicates identical messages within time window', async () => {
    const { feature, forwardMap } = createFeature()
    forwardMap.findByQQ.mockReturnValue(createPair())

    const msg = createMessage({
      id: 'dup-1',
      content: [{ type: 'text', data: { text: 'hello' } }],
    })

    // First call
    await (feature as any).handleQQMessage(msg)
    // Second call with same message ID
    await (feature as any).handleQQMessage(msg)

    // Should only forward once
    expect((feature as any).telegramSender.sendToTelegram).toHaveBeenCalledTimes(1)
  })
})
