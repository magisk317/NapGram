import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEventPublisher } from '../../../plugins/core/event-publisher'
import Instance from '../Instance'

const envMock = vi.hoisted(() => ({
  DATA_DIR: '/tmp/napgram',
  CACHE_DIR: '/tmp/napgram/cache',
  TG_BOT_TOKEN: 'token',
  NAPCAT_WS_URL: 'ws://napcat',
  ENABLE_OFFLINE_NOTIFICATION: false,
  OFFLINE_NOTIFICATION_COOLDOWN: 60,
  ADMIN_QQ: 123,
  ADMIN_TG: 456,
}))

const dbMocks = vi.hoisted(() => ({
  instance: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const loggerMocks = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
}))

const eventPublisherMocks = vi.hoisted(() => ({
  publishFriendRequest: vi.fn(),
  publishGroupRequest: vi.fn(),
  publishNotice: vi.fn(),
  publishInstanceStatus: vi.fn(),
}))

const forwardMapMocks = vi.hoisted(() => ({
  load: vi.fn(),
}))

const featureManagerMocks = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
}))

const telegramMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  create: vi.fn(),
}))

const qqMocks = vi.hoisted(() => {
  const handlers = new Map<string, any>()
  const client = {
    login: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: any) => {
      handlers.set(event, handler)
    }),
    handleFriendRequest: vi.fn().mockResolvedValue(undefined),
    handleGroupRequest: vi.fn().mockResolvedValue(undefined),
    uin: '123456',
  }
  const factory = {
    create: vi.fn().mockResolvedValue(client),
  }
  return { handlers, client, factory }
})

vi.mock('../env', () => ({
  default: envMock,
}))

vi.mock('../db', () => ({
  default: dbMocks,
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../sentry', () => ({
  default: sentryMocks,
}))

vi.mock('../../../plugins/core/event-publisher', () => ({
  getEventPublisher: vi.fn(() => eventPublisherMocks),
}))

vi.mock('../ForwardMap', () => ({
  default: {
    load: forwardMapMocks.load,
  },
}))

vi.mock('../../../features/FeatureManager', () => ({
  FeatureManager: class {
    initialize = featureManagerMocks.initialize
  },
}))

vi.mock('../../../infrastructure/clients/qq', () => ({
  qqClientFactory: qqMocks.factory,
}))

vi.mock('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: {
    connect: telegramMocks.connect,
    create: telegramMocks.create,
  },
}))

describe('instance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Instance.instances.length = 0
    qqMocks.handlers.clear()
    qqMocks.client.on.mockImplementation((event: string, handler: any) => {
      qqMocks.handlers.set(event, handler)
    })
    envMock.TG_BOT_TOKEN = 'token'
    envMock.NAPCAT_WS_URL = 'ws://napcat'
    envMock.ENABLE_OFFLINE_NOTIFICATION = false
    envMock.OFFLINE_NOTIFICATION_COOLDOWN = 60
    envMock.ADMIN_QQ = 123
    envMock.ADMIN_TG = 456
    telegramMocks.connect.mockResolvedValue({ sessionId: 10, me: { id: 1 } })
    telegramMocks.create.mockResolvedValue({ sessionId: 20, me: { id: 2 } })
    forwardMapMocks.load.mockResolvedValue({ map: true })
    dbMocks.instance.create.mockResolvedValue({ id: 0 })
    dbMocks.instance.update.mockResolvedValue({})
  })

  it('creates instance zero record when missing', async () => {
    dbMocks.instance.findFirst.mockResolvedValue(null)
    const instance = new (Instance as any)(0)

    await (instance as any).load()

    expect(dbMocks.instance.create).toHaveBeenCalledWith({ data: { id: 0 } })
  })

  it('throws when instance record is missing', async () => {
    dbMocks.instance.findFirst.mockResolvedValue(null)
    const instance = new (Instance as any)(1)

    await expect((instance as any).load()).rejects.toThrow('Instance not found')
  })

  it('starts instance and bridges qq events', async () => {
    envMock.ENABLE_OFFLINE_NOTIFICATION = true
    dbMocks.instance.findFirst.mockResolvedValue({
      owner: 100,
      qqBot: { wsUrl: 'ws://db', id: 5 },
      botSessionId: 55,
      isSetup: false,
      workMode: 'group',
      flags: 2,
    })

    const instance = await Instance.start(1, 'token')

    expect(telegramMocks.connect).toHaveBeenCalledWith({
      type: 'mtcute',
      sessionId: 55,
      botToken: 'token',
      appName: 'NapGram',
    })
    expect(telegramMocks.create).not.toHaveBeenCalled()
    expect(qqMocks.factory.create).toHaveBeenCalledWith({
      type: 'napcat',
      wsUrl: 'ws://db',
      reconnect: true,
    })
    expect(qqMocks.client.login).toHaveBeenCalled()
    expect(instance.forwardPairs).toEqual({ map: true })
    expect(instance.isInit).toBe(true)
    expect(instance.isSetup).toBe(true)
    expect(Instance.instances).toHaveLength(1)

    const friendHandler = qqMocks.handlers.get('request.friend')
    await friendHandler({ flag: 'req1', userId: '42', userName: 'Alice', comment: 'hi', timestamp: 100 })
    const friendArgs = eventPublisherMocks.publishFriendRequest.mock.calls[0][0]
    await friendArgs.approve()
    await friendArgs.reject('nope')
    expect(friendArgs.userId).toBe('42')
    expect(qqMocks.client.handleFriendRequest).toHaveBeenCalledWith('req1', true)
    expect(qqMocks.client.handleFriendRequest).toHaveBeenCalledWith('req1', false, 'nope')

    const groupHandler = qqMocks.handlers.get('request.group')
    await groupHandler({ flag: 'g1', groupId: '100', userId: '200', userName: 'Bob', subType: 'invite' })
    const groupArgs = eventPublisherMocks.publishGroupRequest.mock.calls[0][0]
    await groupArgs.approve()
    await groupArgs.reject('deny')
    expect(groupArgs.groupId).toBe('100')
    expect(qqMocks.client.handleGroupRequest).toHaveBeenCalledWith('g1', 'invite', true)
    expect(qqMocks.client.handleGroupRequest).toHaveBeenCalledWith('g1', 'invite', false, 'deny')

    const recallHandler = qqMocks.handlers.get('recall')
    await recallHandler({ chatId: '11', operatorId: '22', timestamp: 1 })
    await recallHandler({ chatId: '33', operatorId: '33' })
    const noticeCalls = eventPublisherMocks.publishNotice.mock.calls.map(call => call[0])
    expect(noticeCalls.find(call => call.noticeType === 'group-recall'))
      .toEqual(expect.objectContaining({ groupId: '11', operatorId: '22' }))
    expect(noticeCalls.find(call => call.noticeType === 'friend-recall'))
      .toEqual(expect.objectContaining({ userId: '33' }))

    const pokeHandler = qqMocks.handlers.get('poke')
    await pokeHandler('100', '200', '300')
    const noticeCallsAfterPoke = eventPublisherMocks.publishNotice.mock.calls.map(call => call[0])
    expect(noticeCallsAfterPoke.find(call => call.noticeType === 'other'))
      .toEqual(expect.objectContaining({ groupId: '100', userId: '300', operatorId: '200' }))

    const lostHandler = qqMocks.handlers.get('connection:lost')
    await lostHandler({ reason: 'offline' })
    expect(instance.isSetup).toBe(false)
    const lostNotice = eventPublisherMocks.publishNotice.mock.calls
      .map(call => call[0])
      .find(call => call.noticeType === 'connection-lost')
    expect(lostNotice).toEqual(expect.objectContaining({ noticeType: 'connection-lost' }))

    const restoreHandler = qqMocks.handlers.get('connection:restored')
    await restoreHandler({ reason: 'back' })
    expect(instance.isSetup).toBe(true)
    const restoreNotice = eventPublisherMocks.publishNotice.mock.calls
      .map(call => call[0])
      .find(call => call.noticeType === 'connection-restored')
    expect(restoreNotice).toEqual(expect.objectContaining({ noticeType: 'connection-restored' }))
  })

  it('reports init failure when bot token missing', async () => {
    envMock.TG_BOT_TOKEN = ''
    const instance = new (Instance as any)(2)

    await expect((instance as any).init()).rejects.toThrow('botToken 未指定')
    await Promise.resolve()

    expect(sentryMocks.captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      stage: 'instance-init',
    }))
  })

  it('updates instance fields via setters', () => {
    const instance = new (Instance as any)(3)
      ; (instance as any)._qq = {}

    instance.owner = 10
    instance.isSetup = true
    instance.workMode = 'public'
    instance.botSessionId = 77
    instance.qqBotId = 88
    instance.flags = 5

    expect(dbMocks.instance.update).toHaveBeenCalledWith({ data: { owner: 10 }, where: { id: 3 } })
    expect(dbMocks.instance.update).toHaveBeenCalledWith({ data: { isSetup: true }, where: { id: 3 } })
    expect(dbMocks.instance.update).toHaveBeenCalledWith({ data: { workMode: 'public' }, where: { id: 3 } })
    expect(dbMocks.instance.update).toHaveBeenCalledWith({ data: { botSessionId: 77 }, where: { id: 3 } })
    expect(dbMocks.instance.update).toHaveBeenCalledWith({ data: { qqBotId: 88 }, where: { id: 3 } })
    expect(dbMocks.instance.update).toHaveBeenCalledWith({ data: { flags: 5 }, where: { id: 3 } })
    expect((instance as any)._qq.id).toBe(88)
  })

  it('validates getters', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({
      owner: 99,
      qqBot: { id: 10, wsUrl: 'ws://' },
      botSessionId: 88,
      isSetup: true,
      workMode: 'personal',
      flags: 1,
    })
    const instance = await Instance.start(4, 'token')
    // Mock qqClient.uin getter
    Object.defineProperty(qqMocks.client, 'uin', { value: '123456' })

    expect(instance.owner).toBe(99)
    expect(instance.qq).toEqual({ id: 10, wsUrl: 'ws://' })
    expect(instance.qqUin).toBe('123456')
    expect(instance.isSetup).toBe(true)
    expect(instance.workMode).toBe('personal')
    expect(instance.botMe).toEqual({ id: 1 }) // from mocks
    expect(instance.ownerChat).toBeUndefined()
    expect(instance.botSessionId).toBe(88)
    expect(instance.flags).toBe(1)
    expect(instance.qqBotId).toBe(10)
  })

  it('handles group and friend increase/decrease events', async () => {
    // Setup instance to register handlers
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(5, 'token')

    const groupIncrease = qqMocks.handlers.get('group.increase')
    const groupDecrease = qqMocks.handlers.get('group.decrease')
    const friendIncrease = qqMocks.handlers.get('friend.increase')

    await groupIncrease('100', { id: '200' })
    await groupDecrease('100', '200')
    await friendIncrease({ id: '300' })

    const calls = eventPublisherMocks.publishNotice.mock.calls.map(c => c[0])

    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ noticeType: 'group-member-increase', groupId: '100', userId: '200' }),
      expect.objectContaining({ noticeType: 'group-member-decrease', groupId: '100', userId: '200' }),
      expect.objectContaining({ noticeType: 'friend-add', userId: '300' }),
    ]))
  })

  it('creates new instance via createNew', async () => {
    dbMocks.instance.create.mockResolvedValue({ id: 999 })
    dbMocks.instance.findFirst.mockResolvedValue({})

    const instance = await Instance.createNew('newtoken')

    expect(dbMocks.instance.create).toHaveBeenCalled()
    expect(telegramMocks.create).toHaveBeenCalledWith({
      type: 'mtcute',
      botToken: 'newtoken',
      appName: 'NapGram',
    })
    expect(instance.id).toBe(999)
  })

  it('ignores invalid request events', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(6, 'token')

    const friendHandler = qqMocks.handlers.get('request.friend')
    const groupHandler = qqMocks.handlers.get('request.group')

    // Empty events should return early
    await friendHandler({})
    await groupHandler({})

    expect(eventPublisherMocks.publishFriendRequest).not.toHaveBeenCalled()
    expect(eventPublisherMocks.publishGroupRequest).not.toHaveBeenCalled()
  })

  it('handles group request add subType', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(7, 'token')
    const groupHandler = qqMocks.handlers.get('request.group')

    await groupHandler({ flag: 'g2', subType: 'add', groupId: '1' })

    const args = eventPublisherMocks.publishGroupRequest.mock.calls[0][0]
    expect(args.requestId).toBe('g2')
    // Verification of approve calls
    await args.approve()
    expect(qqMocks.client.handleGroupRequest).toHaveBeenCalledWith('g2', 'add', true)
  })

  it('handles missing handleFriendRequest/handleGroupRequest methods', async () => {
    // Remove the mocked methods from client
    await qqMocks.factory.create({})
    // Wait, factory returns the hoisted `client` object. I modify it.
    const originalFriend = qqMocks.client.handleFriendRequest
    const originalGroup = qqMocks.client.handleGroupRequest

      // Set to undefined
      ; (qqMocks.client as any).handleFriendRequest = undefined
      ; (qqMocks.client as any).handleGroupRequest = undefined

    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(8, 'token')

    const friendHandler = qqMocks.handlers.get('request.friend')
    await friendHandler({ flag: 'f1', userId: 'u1' })
    const friendArgs = eventPublisherMocks.publishFriendRequest.mock.calls[0][0]

    await expect(friendArgs.approve()).rejects.toThrow(TypeError)
    await expect(friendArgs.reject()).rejects.toThrow(TypeError)

    const groupHandler = qqMocks.handlers.get('request.group')
    await groupHandler({ flag: 'g1', groupId: 'g1' })
    const groupArgs = eventPublisherMocks.publishGroupRequest.mock.calls[0][0]

    await expect(groupArgs.approve()).rejects.toThrow(TypeError)
    await expect(groupArgs.reject()).rejects.toThrow(TypeError)

    // Restore
    qqMocks.client.handleFriendRequest = originalFriend
    qqMocks.client.handleGroupRequest = originalGroup
  })

  it('handles plugin bridge init failure', async () => {
    const error = new Error('Bus Init Failed')
    // Mock getEventPublisher to throw ONCE
    vi.mocked(getEventPublisher).mockImplementationOnce(() => {
      throw error
    })

    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(9, 'token')

    // Should warn but not fail instance start
    expect(loggerMocks.warn).toHaveBeenCalledWith('Plugin event bridge init failed:', error)
    expect(Instance.instances).toHaveLength(1)
  })

  it('reuses existing init promise', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({ botSessionId: 123 })
    const instance = new (Instance as any)(11)
    await (instance as any).load()

    const p1 = (instance as any).init('token')
    const p2 = (instance as any).init('token')

    await Promise.all([p1, p2])
    // Verify side effects happened only once
    expect(telegramMocks.connect).toHaveBeenCalledTimes(1)
  })

  it('throws if WS URL is missing', async () => {
    envMock.NAPCAT_WS_URL = ''
    dbMocks.instance.findFirst.mockResolvedValue({ qqBot: null })
    const instance = new (Instance as any)(12)
    await (instance as any).load()

    await expect((instance as any).init('token')).rejects.toThrow('NapCat WebSocket 地址未配置')
    // Reset env
    envMock.NAPCAT_WS_URL = 'ws://napcat'
  })
  it('handles instance status publish failure', async () => {
    // Mock publishInstanceStatus to throw ONCE (for the 'running' status)
    const error = new Error('Status Pub Failed')
    eventPublisherMocks.publishInstanceStatus
      .mockReturnValueOnce(Promise.resolve()) // starting
      .mockImplementationOnce(() => { throw error }) // running

    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(13, 'token')

    expect(loggerMocks.warn).toHaveBeenCalledWith('Failed to publish instance running status:', error)
  })

  it('handles connection lost/restored events and errors', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    const instance = await Instance.start(14, 'token')

    // Reset mocks to track specific calls
    loggerMocks.warn.mockClear()

    const lostHandler = qqMocks.handlers.get('connection:lost')
    const restoreHandler = qqMocks.handlers.get('connection:restored')

    // Test connection lost success
    await lostHandler({})
    expect(instance.isSetup).toBe(false)

    // Test connection lost failure
    eventPublisherMocks.publishNotice.mockImplementationOnce(() => {
      throw new Error('Notice Failed')
    })
    await lostHandler({})
    expect(loggerMocks.warn).toHaveBeenCalledWith('Failed to publish connection-lost notice:', expect.any(Error))

    // Test connection restored success
    await restoreHandler({})
    expect(instance.isSetup).toBe(true)

    // Test connection restored failure
    eventPublisherMocks.publishNotice.mockImplementationOnce(() => {
      throw new Error('Notice Failed 2')
    })
    await restoreHandler({})
    expect(loggerMocks.warn).toHaveBeenCalledWith('Failed to publish connection-restored notice:', expect.any(Error))
  })

  it('handles events with missing fields', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(15, 'token')

    const friendHandler = qqMocks.handlers.get('request.friend')
    // Missing userId, should fallback to empty string and then Unknown for name
    await friendHandler({ flag: 'f_empty' })
    const friendCalls = eventPublisherMocks.publishFriendRequest.mock.calls
    const lastFriendCall = friendCalls[friendCalls.length - 1][0]
    expect(lastFriendCall.userId).toBe('')
    expect(lastFriendCall.userName).toBe('')

    const groupHandler = qqMocks.handlers.get('request.group')
    // Missing groupId, should fallback
    await groupHandler({ flag: 'g_empty', userId: 'u1' })
    const groupCalls = eventPublisherMocks.publishGroupRequest.mock.calls
    const lastGroupCall = groupCalls[groupCalls.length - 1][0]
    expect(lastGroupCall.groupId).toBe('')
    expect(lastGroupCall.userName).toBe('u1')

    const groupIncrease = qqMocks.handlers.get('group.increase')
    await groupIncrease(undefined, {}) // undefined group, empty member
    const noticeCalls = eventPublisherMocks.publishNotice.mock.calls
    const lastNotice = noticeCalls[noticeCalls.length - 1][0]
    expect(lastNotice.groupId).toBe('undefined') // String(undefined) -> 'undefined'
    expect(lastNotice.userId).toBe('')

    const recallHandler = qqMocks.handlers.get('recall')
    await recallHandler({}) // Missing chatId/operatorId
    // noticeType logic: '' === '' is true -> 'friend-recall'
    const recallCalls = eventPublisherMocks.publishNotice.mock.calls
    const lastRecall = recallCalls[recallCalls.length - 1][0]
    expect(lastRecall.noticeType).toBe('group-recall')
  })

  it('handles FeatureManager initialization failure', async () => {
    const error = new Error('Feature Init Failed')
    featureManagerMocks.initialize.mockRejectedValueOnce(error)

    dbMocks.instance.findFirst.mockResolvedValue({})
    // Should pass but maybe log error? 
    // In Instance.ts: await this.featureManager.initialize() is NOT wrapped in try/catch inside init()
    // except the whole init IIFE... wait.
    // The IIFE catches errors at the end.

    // Instance.start calls init(), which returns initPromise.
    // Init promise catch block logs '初始化失败'
    // But initPromise itself rejects, so start() throws

    await expect(Instance.start(16, 'token')).rejects.toThrow('Feature Init Failed')

    // Check that the internal catch block also logged the error
    expect(loggerMocks.error).toHaveBeenCalledWith('初始化失败', error)
  })

  it('handles connection listeners and feature manager correctly', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    const instance = await Instance.start(17, 'token')

    // Verify FeatureManager init
    expect(featureManagerMocks.initialize).toHaveBeenCalled()

    // Test connection:lost
    const lostHandler = qqMocks.handlers.get('connection:lost')
    expect(lostHandler).toBeDefined()
    await lostHandler({ timestamp: 123456 })

    expect(loggerMocks.warn).toHaveBeenCalledWith('NapCat connection lost:', expect.anything())
    expect(instance.isSetup).toBe(false)
    expect(eventPublisherMocks.publishNotice).toHaveBeenCalledWith(expect.objectContaining({
      noticeType: 'connection-lost',
      timestamp: 123456
    }))

    // Test connection:restored
    const restoreHandler = qqMocks.handlers.get('connection:restored')
    expect(restoreHandler).toBeDefined()
    await restoreHandler({ timestamp: 654321 })

    expect(loggerMocks.info).toHaveBeenCalledWith('NapCat connection restored:', expect.anything())
    expect(instance.isSetup).toBe(true)
    expect(eventPublisherMocks.publishNotice).toHaveBeenCalledWith(expect.objectContaining({
      noticeType: 'connection-restored',
      timestamp: 654321
    }))
  })

  it('updates setters and logs trace (floating promises)', async () => {
    // Mock qqBot structure to ensure _qq property is set during load()
    dbMocks.instance.findFirst.mockResolvedValue({ qqBot: { id: 0 } })
    const instance = await Instance.start(18, 'token')

    // Helper to wait for floating promises
    const flushPromises = () => new Promise(resolve => setImmediate(resolve))

    // owner
    instance.owner = 999
    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { owner: 999 },
      where: { id: 18 }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith(999)

    // isSetup
    loggerMocks.trace.mockClear()
    instance.isSetup = false
    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { isSetup: false }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith(false)

    // workMode
    loggerMocks.trace.mockClear()
    instance.workMode = 'b' as any
    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { workMode: 'b' }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith('b')

    // botSessionId
    loggerMocks.trace.mockClear()
    instance.botSessionId = 555
    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { botSessionId: 555 }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith(555)

    // qqBotId
    loggerMocks.trace.mockClear()
    instance.qqBotId = 777
    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { qqBotId: 777 }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith(777)
    expect(instance.qqBotId).toBe(777)

    // flags
    loggerMocks.trace.mockClear()
    instance.flags = 888
    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { flags: 888 }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith(888)
    expect(instance.flags).toBe(888)
  })

  it('handles group request defaults', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(19, 'token')
    const groupHandler = qqMocks.handlers.get('request.group')

    // Missing subType (should default to 'add') and comment (undefined)
    await groupHandler({
      flag: 'g_def',
      groupId: 'g1',
      userId: 'u1'
      // subType missing, comment missing
    })

    const calls = eventPublisherMocks.publishGroupRequest.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.subType).toBe('add')
    expect(lastCall.comment).toBeUndefined()
  })

  it('handles friend increase missing id', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(20, 'token')
    const handler = qqMocks.handlers.get('friend.increase')
    await handler({}) // missing id
    const calls = eventPublisherMocks.publishNotice.mock.calls
    const last = calls[calls.length - 1][0]
    expect(last.userId).toBe('')
  })

  it('handles explicit fields and fallbacks in requests', async () => {
    dbMocks.instance.findFirst.mockResolvedValue({})
    await Instance.start(21, 'token')

    // request.friend with explicit fields
    const friendHandler = qqMocks.handlers.get('request.friend')
    await friendHandler({
      flag: 'f_exp',
      userId: 'u_exp',
      comment: 'friend comment',
      timestamp: 1001
    })
    const fCalls = eventPublisherMocks.publishFriendRequest.mock.calls
    const lastF = fCalls[fCalls.length - 1][0]
    expect(lastF.comment).toBe('friend comment')
    expect(lastF.timestamp).toBe(1001)

    // request.friend fallback logic: userName missing -> takes userId
    await friendHandler({
      flag: 'f_fb',
      userId: 'u_fb'
      // no userName
    })
    const lastF2 = fCalls[fCalls.length - 1][0]
    expect(lastF2.userName).toBe('u_fb')

    // request.group with explicit fields including invite subType
    const groupHandler = qqMocks.handlers.get('request.group')
    await groupHandler({
      flag: 'g_exp',
      groupId: 'g_1',
      userId: 'u_g_exp',
      subType: 'invite',
      comment: 'group comment',
      timestamp: 2002
    })
    const gCalls = eventPublisherMocks.publishGroupRequest.mock.calls
    const lastG = gCalls[gCalls.length - 1][0]
    expect(lastG.subType).toBe('invite')
    expect(lastG.comment).toBe('group comment')
    expect(lastG.timestamp).toBe(2002)

    // request.group fallback: userName missing -> takes userId
    await groupHandler({
      flag: 'g_fb',
      groupId: 'g_2',
      userId: 'u_g_fb'
    })
    const lastG2 = gCalls[gCalls.length - 1][0]
    expect(lastG2.userName).toBe('u_g_fb')
  })

  it('handles setter when qq property is missing (Line 407)', async () => {
    // Return empty object so this._qq is undefined
    dbMocks.instance.findFirst.mockResolvedValue({})
    const instance = await Instance.start(22, 'token')

    const flushPromises = () => new Promise(resolve => setImmediate(resolve))

    // Set qqBotId - should skip internal _qq update but still do DB update
    loggerMocks.trace.mockClear()
    instance.qqBotId = 111

    expect(dbMocks.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { qqBotId: 111 }
    }))
    await flushPromises()
    expect(loggerMocks.trace).toHaveBeenCalledWith(111)
    // instance.qqBotId getter checks this._qq?.id, so it should be undefined
    expect(instance.qqBotId).toBeUndefined()
  })
})
