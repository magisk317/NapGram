import { beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../db'
import Instance from '../Instance'

// Mocks
const { mockInstance } = vi.hoisted(() => ({
  mockInstance: {
    id: 1,
    owner: 0,
    isSetup: false,
    workMode: 'personal',
    flags: 0,
    botSessionId: 0,
    qqBot: { wsUrl: 'ws://fake' },
  },
}))

vi.mock('../db', () => ({
  default: {
    instance: {
      update: vi.fn().mockResolvedValue(mockInstance),
      findFirst: vi.fn().mockResolvedValue(mockInstance),
      create: vi.fn().mockResolvedValue(mockInstance),
    },
    forwardPair: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    pluginConfig: {
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('../env', () => ({
  default: {
    TG_BOT_TOKEN: 'fake-token',
    NAPCAT_WS_URL: 'ws://fake',
    LOG_FILE: '/tmp/test.log',
    DATA_DIR: '/tmp/data', // Added
    CACHE_DIR: '/tmp/cache', // Added
  },
}))
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  })),
}))
vi.mock('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: {
    connect: vi.fn(),
    create: vi.fn().mockResolvedValue({
      sessionId: 123,
      me: { id: 123, username: 'test_bot' },
    }),
  },
}))
vi.mock('../../../infrastructure/clients/qq', () => ({
  qqClientFactory: {
    create: vi.fn().mockResolvedValue({
      login: vi.fn(),
      on: vi.fn(),
    }),
  },
}))

describe('instance Branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Hack to access private constructor or we use static method
  // Instance.start calls new Instance(id)

  it('should handle property setters', async () => {
    const instance = await Instance.createNew('token') as Instance

    // Setters trigger db update
    instance.owner = 123
    expect(db.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { owner: 123 },
    }))

    instance.isSetup = true
    expect(db.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { isSetup: true },
    }))

    instance.workMode = 'group'
    expect(db.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { workMode: 'group' },
    }))

    instance.botSessionId = 999
    expect(db.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { botSessionId: 999 },
    }))

    instance.flags = 1
    expect(db.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { flags: 1 },
    }))

    // qqBotId setter
    instance.qqBotId = 111
    expect(db.instance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { qqBotId: 111 },
    }))
  })

  it('should not re-initialize on subsequent init calls', async () => {
    const instance = await Instance.createNew('token') as any

    await instance.init('t2')

    const { telegramClientFactory } = await import('../../../infrastructure/clients/telegram')
    expect(telegramClientFactory.create).toHaveBeenCalledTimes(1)
  })
})
