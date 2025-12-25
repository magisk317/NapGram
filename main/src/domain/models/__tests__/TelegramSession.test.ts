import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Buffer } from 'node:buffer'
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

describe('TelegramSession', () => {
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
})
