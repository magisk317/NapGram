import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstanceAPI, InstanceAPIImpl } from '../instance'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@napgram/infra-kit', () => ({
  getLogger: vi.fn(() => loggerMocks),
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  hashing: { md5Hex: vi.fn((value: string) => value) },
}))

describe('instanceAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when resolver is missing', async () => {
    const api = createInstanceAPI()

    await expect(api.list()).rejects.toThrow('Instances resolver not configured')
    await expect(api.get(1)).rejects.toThrow('Instances resolver not configured')
    await expect(api.getStatus(1)).rejects.toThrow('Instances resolver not configured')
  })

  it('lists instances with mapped info', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    const api = createInstanceAPI(() => [
      {
        id: 1,
        name: 'A',
        qqClient: { uin: 123 },
        tgBot: { username: 'tg' },
      },
      {
        id: 2,
        name: 'B',
        createdAt: new Date('2020-01-02T00:00:00Z'),
      },
    ])

    const result = await api.list()

    expect(result).toEqual([
      {
        id: 1,
        name: 'A',
        qqAccount: '123',
        tgAccount: 'tg',
        createdAt: new Date('2020-01-01T00:00:00Z'),
      },
      {
        id: 2,
        name: 'B',
        qqAccount: undefined,
        tgAccount: undefined,
        createdAt: new Date('2020-01-02T00:00:00Z'),
      },
    ])
    vi.useRealTimers()
  })

  it('gets instance or returns null', async () => {
    const api = createInstanceAPI(() => [{ id: 1, name: 'A' }])

    const found = await api.get(1)
    const missing = await api.get(2)

    expect(found?.id).toBe(1)
    expect(missing).toBeNull()
  })

  it('returns instance status', async () => {
    const api = createInstanceAPI(() => [
      {
        id: 1,
        qqClient: { isConnected: true },
        tgBot: { isRunning: true },
      },
      {
        id: 2,
        stopped: true,
      },
      {
        id: 3,
      },
    ])

    await expect(api.getStatus(1)).resolves.toBe('running')
    await expect(api.getStatus(2)).resolves.toBe('stopped')
    await expect(api.getStatus(3)).resolves.toBe('error')
  })

  it('throws when instance not found', async () => {
    const api = createInstanceAPI(() => [])

    await expect(api.getStatus(9)).rejects.toThrow('Instance 9 not found')
  })

  it('returns InstanceAPIImpl instance', () => {
    const api = createInstanceAPI(() => [])
    expect(api).toBeInstanceOf(InstanceAPIImpl)
  })
})
