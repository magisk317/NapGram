import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForwardMap } from '../ForwardMap'

const dbMocks = vi.hoisted(() => ({
  forwardPair: {
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
}))

vi.mock('../db', () => ({
  default: dbMocks,
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

function makePair(overrides: Partial<any> = {}) {
  return {
    id: 1,
    qqRoomId: BigInt(100),
    tgChatId: BigInt(200),
    tgThreadId: null,
    flags: 0,
    instanceId: 1,
    apiKey: 'key',
    ignoreRegex: null,
    ignoreSenders: null,
    forwardMode: null,
    nicknameMode: null,
    commandReplyMode: null,
    commandReplyFilter: null,
    commandReplyList: null,
    ...overrides,
  }
}

describe('forwardMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads mappings and supports find helpers', async () => {
    const pair1 = makePair()
    const pair2 = makePair({ id: 2, qqRoomId: BigInt(101), tgChatId: BigInt(201), tgThreadId: 9 })
    dbMocks.forwardPair.findMany.mockResolvedValueOnce([pair1, pair2])

    const map = await ForwardMap.load(1)

    expect(map.findByQQ(100)).toEqual(pair1)
    expect(map.findByTG(201, 9)).toEqual(pair2)
    expect(map.find({ uin: '100' })).toEqual(pair1)
    expect(map.find({ gid: 101 })).toEqual(pair2)
    expect(map.find({ id: 200 })).toEqual(pair1)
    expect(map.findByTG(200, 5)).toEqual(pair1)
    expect(map.findByTG(200, 5, false)).toBeUndefined()
    expect(loggerMocks.debug).toHaveBeenCalled()
    expect(map.find(null)).toBeNull()
  })

  it('reloads mappings in place', async () => {
    const pair1 = makePair()
    const pair2 = makePair({ id: 2, qqRoomId: BigInt(300), tgChatId: BigInt(400), tgThreadId: 2 })
    dbMocks.forwardPair.findMany.mockResolvedValueOnce([pair1])
    const map = await ForwardMap.load(1)

    dbMocks.forwardPair.findMany.mockResolvedValueOnce([pair2])
    await map.reload()

    expect(map.findByQQ(100)).toBeUndefined()
    expect(map.findByQQ(300)).toEqual(pair2)
    expect(map.findByTG(400, 2)).toEqual(pair2)
  })

  it('returns existing mapping when tg target is already taken', async () => {
    const pair1 = makePair()
    dbMocks.forwardPair.findMany.mockResolvedValueOnce([pair1])
    const map = await ForwardMap.load(1)

    const result = await map.add(999, 200)

    expect(result).toEqual(pair1)
    expect(dbMocks.forwardPair.update).not.toHaveBeenCalled()
    expect(dbMocks.forwardPair.create).not.toHaveBeenCalled()
  })

  it('updates existing qq mapping to new target', async () => {
    const pair1 = makePair()
    const updated = makePair({ tgChatId: BigInt(300), tgThreadId: 7 })
    dbMocks.forwardPair.findMany.mockResolvedValueOnce([pair1])
    dbMocks.forwardPair.update.mockResolvedValueOnce(updated)
    const map = await ForwardMap.load(1)

    const same = await map.add(100, 200)
    expect(same).toEqual(pair1)
    expect(dbMocks.forwardPair.update).not.toHaveBeenCalled()

    const result = await map.add(100, 300, 7)

    expect(result).toEqual(updated)
    expect(dbMocks.forwardPair.update).toHaveBeenCalledWith({
      where: { id: pair1.id },
      data: {
        tgChatId: BigInt(300),
        tgThreadId: 7,
      },
      select: expect.any(Object),
    })
    expect(map.findByQQ(100)).toEqual(updated)
    expect(map.findByTG(200)).toBeUndefined()
    expect(map.findByTG(300, 7)).toEqual(updated)
  })

  it('creates and removes mappings', async () => {
    const created = makePair({ id: 10, qqRoomId: BigInt(10), tgChatId: BigInt(20) })
    dbMocks.forwardPair.findMany.mockResolvedValueOnce([])
    dbMocks.forwardPair.create.mockResolvedValueOnce(created)
    const map = await ForwardMap.load(1)

    const result = await map.add(10, 20)

    expect(result).toEqual(created)
    expect(dbMocks.forwardPair.create).toHaveBeenCalled()
    expect(map.findByQQ(10)).toEqual(created)

    dbMocks.forwardPair.delete.mockResolvedValueOnce(created)
    const removed = await map.remove(10)
    expect(removed).toBe(true)
    expect(map.findByQQ(10)).toBeUndefined()
    const missing = await map.remove(999)
    expect(missing).toBe(false)
  })

  it('returns all mappings', async () => {
    const pair1 = makePair()
    const pair2 = makePair({ id: 2, qqRoomId: BigInt(101), tgChatId: BigInt(201) })
    dbMocks.forwardPair.findMany.mockResolvedValueOnce([pair1, pair2])

    const map = await ForwardMap.load(1)

    expect(map.getAll()).toEqual([pair1, pair2])
  })
})
