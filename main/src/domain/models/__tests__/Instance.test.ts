import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
}))

const eventPublisherMocks = vi.hoisted(() => ({
  publishFriendRequest: vi.fn(),
  publishGroupRequest: vi.fn(),
  publishNotice: vi.fn(),
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

const notificationMocks = vi.hoisted(() => ({
  notifyDisconnection: vi.fn(),
  notifyReconnection: vi.fn(),
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

vi.mock('../posthog', () => ({
  default: posthogMocks,
}))

vi.mock('../../../plugins/core/event-publisher', () => ({
  getEventPublisher: vi.fn(() => eventPublisherMocks),
}))

vi.mock('../ForwardMap', () => ({
  default: {
    load: forwardMapMocks.load,
  },
}))

vi.mock('../../../features', () => ({
  FeatureManager: vi.fn(function FeatureManagerMock() {
    return {
      initialize: featureManagerMocks.initialize,
    }
  }),
}))

vi.mock('../../../infrastructure/clients/qq', () => ({
  qqClientFactory: qqMocks.factory,
}))

vi.mock('../../../infrastructure/clients/telegram/client', () => ({
  default: {
    connect: telegramMocks.connect,
    create: telegramMocks.create,
  },
}))

vi.mock('../../../shared/services/NotificationService', () => ({
  NotificationService: vi.fn(function NotificationServiceMock() {
    return notificationMocks
  }),
}))

describe('Instance', () => {
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
    notificationMocks.notifyDisconnection.mockResolvedValue(undefined)
    notificationMocks.notifyReconnection.mockResolvedValue(undefined)
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

    expect(telegramMocks.connect).toHaveBeenCalledWith(55, 'NapGram', 'token')
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
    expect(notificationMocks.notifyDisconnection).toHaveBeenCalledWith(
      qqMocks.client,
      instance.tgBot,
      envMock.ADMIN_QQ,
      envMock.ADMIN_TG,
    )

    const restoreHandler = qqMocks.handlers.get('connection:restored')
    await restoreHandler({ reason: 'back' })
    expect(instance.isSetup).toBe(true)
    expect(notificationMocks.notifyReconnection).toHaveBeenCalledWith(
      qqMocks.client,
      instance.tgBot,
      envMock.ADMIN_QQ,
      envMock.ADMIN_TG,
    )
  })

  it('reports init failure when bot token missing', async () => {
    envMock.TG_BOT_TOKEN = ''
    const instance = new (Instance as any)(2)

    await expect((instance as any).init()).rejects.toThrow('botToken 未指定')
    await Promise.resolve()

    expect(posthogMocks.capture).toHaveBeenCalledWith('初始化失败', expect.any(Object))
  })

  it('updates instance fields via setters', () => {
    const instance = new (Instance as any)(3)
    ;(instance as any)._qq = {}

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
})
