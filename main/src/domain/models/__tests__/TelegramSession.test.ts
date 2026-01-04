import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TelegramSession from '../TelegramSession'

const envMock = vi.hoisted(() => ({
  TG_INITIAL_DCID: 9,
  TG_INITIAL_SERVER: '203.0.113.10',
}))

const dbMocks = vi.hoisted(() => ({
  query: {
    instance: {
      findFirst: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoUpdate: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  })),
}))

const schemaMocks = vi.hoisted(() => ({
  instance: {
    id: 'id',
    owner: 'owner',
    isSetup: 'isSetup',
    workMode: 'workMode',
    botSessionId: 'botSessionId',
    qqBotId: 'qqBotId',
    flags: 'flags',
  },
  session: {
    id: 'id',
    dcId: 'dcId',
    serverAddress: 'serverAddress',
    authKey: 'authKey',
  },
}))

const eqMock = vi.hoisted(() => vi.fn((left, right) => ({ left, right })))

const loggerMocks = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@napgram/infra-kit', () => ({
  env: envMock,
  db: dbMocks,
  schema: schemaMocks,
  eq: eqMock,
  getLogger: vi.fn(() => loggerMocks),
  hashing: { md5Hex: vi.fn((s) => 'hashed-' + s) },
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  sentry: { captureException: vi.fn() },
  ForwardMap: { load: vi.fn().mockResolvedValue({ map: true }) },
  qface: { 14: '/微笑' },
}))

describe('telegramSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new session entry when dbId is missing', async () => {
    const returningMock = vi.fn().mockResolvedValue([{ id: 42 }])
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession()

    await session.load()

    expect(dbMocks.insert).toHaveBeenCalledWith(schemaMocks.session)
    expect(valuesMock).toHaveBeenCalledWith({
      dcId: envMock.TG_INITIAL_DCID,
      serverAddress: envMock.TG_INITIAL_SERVER,
    })
    expect(returningMock).toHaveBeenCalledWith({ id: schemaMocks.session.id })
    expect(session.dbId).toBe(42)
    expect(session.sessionString).toBeUndefined()
  })

  it('loads session string when authKey looks valid', async () => {
    dbMocks.query.session.findFirst.mockResolvedValue({
      authKey: Buffer.from('abc123', 'utf-8'),
    })
    const session = new TelegramSession(7)

    await session.load()

    expect(eqMock).toHaveBeenCalledWith(schemaMocks.session.id, 7)
    expect(dbMocks.query.session.findFirst).toHaveBeenCalledWith({
      where: { left: schemaMocks.session.id, right: 7 },
    })
    expect(session.sessionString).toBe('abc123')
  })

  it('ignores authKey that does not look like a session string', async () => {
    dbMocks.query.session.findFirst.mockResolvedValue({
      authKey: Buffer.from([0, 1, 2]),
    })
    const session = new TelegramSession(8)

    await session.load()

    expect(session.sessionString).toBeUndefined()
    expect(loggerMocks.warn).toHaveBeenCalled()
  })

  it('upserts session string when dbId is set', async () => {
    const onConflictMock = vi.fn()
    const valuesMock = vi.fn().mockReturnValue({
      onConflictDoUpdate: onConflictMock,
    })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession(9)

    await session.save('session-value')

    const expectedAuthKey = Buffer.from('session-value', 'utf-8')
    expect(dbMocks.insert).toHaveBeenCalledWith(schemaMocks.session)
    expect(valuesMock).toHaveBeenCalledWith({
      id: 9,
      dcId: envMock.TG_INITIAL_DCID,
      serverAddress: envMock.TG_INITIAL_SERVER,
      authKey: expectedAuthKey,
    })
    expect(onConflictMock).toHaveBeenCalledWith({
      target: schemaMocks.session.id,
      set: { authKey: expectedAuthKey },
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

    const returningMock = vi.fn().mockResolvedValue([{ id: 50 }])
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession()
    await session.load()

    expect(valuesMock).toHaveBeenCalledWith({
      dcId: 2,
      serverAddress: '149.154.167.50',
    })

    // Restore
    envMock.TG_INITIAL_DCID = originalDcid
    envMock.TG_INITIAL_SERVER = originalServer
  })

  it('does not save session if dbId is missing', async () => {
    const session = new TelegramSession()
    // dbId is undefined since we didn't call load()
    await session.save('s')
    expect(dbMocks.insert).not.toHaveBeenCalled()
  })

  it('handles existing dbEntry but missing/null authKey', async () => {
    dbMocks.query.session.findFirst.mockResolvedValue({
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

    const valuesMock = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn(),
    })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession(11)
    await session.save('s')

    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      dcId: 2,
      serverAddress: '149.154.167.50',
    }))

    // Restore
    envMock.TG_INITIAL_DCID = originalDcid
    envMock.TG_INITIAL_SERVER = originalServer
  })
})
