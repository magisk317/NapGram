import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@napgram/infra-kit'
import Instance from '../Instance'

// Mocks
const { mockInstance, mockUpdate, mockInsert } = vi.hoisted(() => ({
  mockInstance: {
    id: 1,
    owner: 0,
    isSetup: false,
    workMode: 'personal',
    flags: 0,
    botSessionId: 0,
    qqBot: { wsUrl: 'ws://fake' },
  },
  mockUpdate: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  })),
  mockInsert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    })),
  })),
}))

vi.mock('@napgram/infra-kit', () => ({
  db: {
    query: {
      instance: {
        findFirst: vi.fn().mockResolvedValue(mockInstance),
      },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: { instance: { id: 'id' } },
  eq: vi.fn(),
  env: {
    TG_BOT_TOKEN: 'fake-token',
    NAPCAT_WS_URL: 'ws://fake',
    LOG_FILE: '/tmp/test.log',
    DATA_DIR: '/tmp/data', // Added
    CACHE_DIR: '/tmp/cache', // Added
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  })),
  temp: {
    TEMP_PATH: '/tmp/napgram',
    file: vi.fn(),
    createTempFile: vi.fn(),
  },
  hashing: {
    md5Hex: vi.fn((s) => 'hashed-' + s),
  },
  sentry: {
    captureException: vi.fn(),
  },
  ForwardMap: {
    load: vi.fn().mockResolvedValue({ map: true }),
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
vi.mock('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: {
    connect: vi.fn(),
    create: vi.fn().mockResolvedValue({
      sessionId: 123,
      me: { id: 123, username: 'test_bot' },
    }),
  },
}))


vi.mock('@napgram/runtime-kit', () => ({
  InstanceRegistry: {
    add: vi.fn(),
  },
  setGlobalRuntime: vi.fn(),

}))

vi.mock('@napgram/plugin-kit', () => ({
  getEventPublisher: vi.fn(() => ({
    publishInstanceStatus: vi.fn(),
    publishFriendRequest: vi.fn(),
    publishGroupRequest: vi.fn(),
    publishNotice: vi.fn(),
  })),
}))

describe('instance Branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Hack to access private constructor or we use static method
  // Instance.start calls new Instance(id)

  it('should handle property setters', async () => {
    const instance = await Instance.createNew('token') as Instance
    mockUpdate.mockClear()

    // Setters trigger db update
    instance.owner = 123
    const ownerSetCalls = vi.mocked(mockUpdate).mock.results[0]?.value?.set?.mock?.calls ?? []
    expect(ownerSetCalls[0]?.[0]).toEqual({ owner: BigInt(123) })

    instance.isSetup = true
    const setupSetCalls = vi.mocked(mockUpdate).mock.results[1]?.value?.set?.mock?.calls ?? []
    expect(setupSetCalls[0]?.[0]).toEqual({ isSetup: true })

    instance.workMode = 'group'
    const workModeSetCalls = vi.mocked(mockUpdate).mock.results[2]?.value?.set?.mock?.calls ?? []
    expect(workModeSetCalls[0]?.[0]).toEqual({ workMode: 'group' })

    instance.botSessionId = 999
    const botSessionSetCalls = vi.mocked(mockUpdate).mock.results[3]?.value?.set?.mock?.calls ?? []
    expect(botSessionSetCalls[0]?.[0]).toEqual({ botSessionId: 999 })

    instance.flags = 1
    const flagsSetCalls = vi.mocked(mockUpdate).mock.results[4]?.value?.set?.mock?.calls ?? []
    expect(flagsSetCalls[0]?.[0]).toEqual({ flags: 1 })

    // qqBotId setter
    instance.qqBotId = 111
    const qqBotSetCalls = vi.mocked(mockUpdate).mock.results[5]?.value?.set?.mock?.calls ?? []
    expect(qqBotSetCalls[0]?.[0]).toEqual({ qqBotId: 111 })
  })

  it('should not re-initialize on subsequent init calls', async () => {
    const instance = await Instance.createNew('token') as any

    await instance.init('t2')

    const { telegramClientFactory } = await import('../../../infrastructure/clients/telegram')
    expect(telegramClientFactory.create).toHaveBeenCalledTimes(1)
  })

  it('should throw when createNew returns no db entry', async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })

    await expect(Instance.createNew('token')).rejects.toThrow('Failed to create instance')
  })
})
