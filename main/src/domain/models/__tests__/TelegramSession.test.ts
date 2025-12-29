import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TelegramSession from '../TelegramSession'

const envMock = vi.hoisted(() => ({
  TG_INITIAL_DCID: 9,
  TG_INITIAL_SERVER: '203.0.113.10',
}))

const dbMocks = vi.hoisted(() => ({
  session: {
    create: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
}))

const loggerMocks = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('../env', () => ({
  default: envMock,
}))

vi.mock('../db', () => ({
  default: dbMocks,
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

describe('telegramSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new session entry when dbId is missing', async () => {
    dbMocks.session.create.mockResolvedValue({ id: 42 })
    const session = new TelegramSession()

    await session.load()

    expect(dbMocks.session.create).toHaveBeenCalledWith({
      data: {
        dcId: envMock.TG_INITIAL_DCID,
        serverAddress: envMock.TG_INITIAL_SERVER,
      },
    })
    expect(session.dbId).toBe(42)
    expect(session.sessionString).toBeUndefined()
  })

  it('loads session string when authKey looks valid', async () => {
    dbMocks.session.findFirst.mockResolvedValue({
      authKey: Buffer.from('abc123', 'utf-8'),
    })
    const session = new TelegramSession(7)

    await session.load()

    expect(dbMocks.session.findFirst).toHaveBeenCalledWith({ where: { id: 7 } })
    expect(session.sessionString).toBe('abc123')
  })

  it('ignores authKey that does not look like a session string', async () => {
    dbMocks.session.findFirst.mockResolvedValue({
      authKey: Buffer.from([0, 1, 2]),
    })
    const session = new TelegramSession(8)

    await session.load()

    expect(session.sessionString).toBeUndefined()
    expect(loggerMocks.warn).toHaveBeenCalled()
  })

  it('upserts session string when dbId is set', async () => {
    const session = new TelegramSession(9)

    await session.save('session-value')

    expect(dbMocks.session.upsert).toHaveBeenCalledWith({
      where: { id: 9 },
      update: {
        authKey: Buffer.from('session-value', 'utf-8'),
      },
      create: {
        id: 9,
        dcId: envMock.TG_INITIAL_DCID,
        serverAddress: envMock.TG_INITIAL_SERVER,
        authKey: Buffer.from('session-value', 'utf-8'),
      },
    })
    expect(session.sessionString).toBe('session-value')
  })

  it('uses default DC ID and server address when env vars are missing', async () => {
    // Temporarily mock env values to undefined
    const originalDcid = envMock.TG_INITIAL_DCID
    const originalServer = envMock.TG_INITIAL_SERVER
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_DCID = undefined
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_SERVER = undefined

    dbMocks.session.create.mockResolvedValue({ id: 50 })
    const session = new TelegramSession()
    await session.load()

    expect(dbMocks.session.create).toHaveBeenCalledWith({
      data: {
        dcId: 2,
        serverAddress: '149.154.167.50',
      },
    })

    // Restore
    envMock.TG_INITIAL_DCID = originalDcid
    envMock.TG_INITIAL_SERVER = originalServer
  })

  it('does not save session if dbId is missing', async () => {
    const session = new TelegramSession()
    // dbId is undefined since we didn't call load()
    await session.save('s')
    expect(dbMocks.session.upsert).not.toHaveBeenCalled()
  })

  it('handles existing dbEntry but missing/null authKey', async () => {
    dbMocks.session.findFirst.mockResolvedValue({
      id: 10,
      authKey: null, // null authKey
    })
    const session = new TelegramSession(10)
    await session.load()
    expect(session.sessionString).toBeUndefined()
  })

  it('uses default values in save upsert when env vars are missing', async () => {
    const originalDcid = envMock.TG_INITIAL_DCID
    const originalServer = envMock.TG_INITIAL_SERVER
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_DCID = undefined
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_SERVER = undefined

    const session = new TelegramSession(11)
    await session.save('s')

    expect(dbMocks.session.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        dcId: 2,
        serverAddress: '149.154.167.50',
      }),
    }))

    // Restore
    envMock.TG_INITIAL_DCID = originalDcid
    envMock.TG_INITIAL_SERVER = originalServer
  })
})
