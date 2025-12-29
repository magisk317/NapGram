import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForwardMapper } from '../MessageMapper'

// Mock the database
vi.mock('../../../../../../../main/src/domain/models/db', () => ({
  default: {
    message: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

describe('forwardMapper', () => {
  let mapper: ForwardMapper

  beforeEach(() => {
    mapper = new ForwardMapper()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('saveTgToQqMapping', () => {
    it('skips persistence by default in tests', async () => {
      const unified: any = { content: [] }
      const tgMsg: any = { id: 100 }
      const receipt: any = { messageId: 200 }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      expect(db.message.create).not.toHaveBeenCalled()
    })

    it('saves mapping when stubbed env bypasses skip', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      const unified: any = { content: [{ type: 'text', data: { text: 'Hello' } }] }
      const tgMsg: any = { id: 100, sender: { id: 123 } }
      const receipt: any = { messageId: 200 }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      expect(db.message.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          seq: 200,
          tgMsgId: 100,
        }),
      }))
    })

    it('handles database error in saveTgToQqMapping', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      db.message.create.mockRejectedValue(new Error('DB Error'))

      const unified: any = { content: [] }
      const tgMsg: any = { id: 100 }
      const receipt: any = { messageId: 200 }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)
      // Should not throw
    })
  })

  describe('saveMessage', () => {
    it('saves message mapping when bypass enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      const qqMsg: any = {
        timestamp: Date.now(),
        sender: { id: '12345' },
        metadata: { raw: { message_id: 1 } },
        content: [{ type: 'text', data: { text: 'Hello' } }],
      }
      const tgMsg: any = { id: 500, sender: { id: '67890' } }

      await mapper.saveMessage(qqMsg, tgMsg, 1, BigInt(1000), BigInt(2000))
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      expect(db.message.create).toHaveBeenCalled()
    })

    it('handles missing metadata in saveMessage', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      const qqMsg: any = { content: [], timestamp: Date.now() }
      const tgMsg: any = { id: 500 }

      await mapper.saveMessage(qqMsg, tgMsg, 1, BigInt(1000), BigInt(2000))
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      expect(db.message.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ seq: 0 }),
      }))
    })
  })

  describe('findTgMsgId', () => {
    it('returns found msgId by seq', async () => {
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      db.message.findFirst.mockResolvedValue({ tgMsgId: 999 })

      const result = await mapper.findTgMsgId(1, BigInt(1000), '123')
      expect(result).toBe(999)
      expect(db.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ seq: 123 }),
      }))
    })

    it('returns found msgId by sender when bypass enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      db.message.findFirst
        .mockResolvedValueOnce(null) // No match by seq
        .mockResolvedValueOnce({ tgMsgId: 888 }) // Match by sender

      const result = await mapper.findTgMsgId(1, BigInt(1000), '456')
      expect(result).toBe(888)
      expect(db.message.findFirst).toHaveBeenCalledTimes(2)
    })
  })

  describe('findQqSource', () => {
    it('finds QQ source mapping when bypass enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      const db = (await import('../../../../../../../main/src/domain/models/db')).default
      const mockResult = { seq: 123 }
      db.message.findFirst.mockResolvedValue(mockResult)

      const result = await mapper.findQqSource(1, 2000, 100)
      expect(result).toEqual(mockResult)
    })
  })
})
