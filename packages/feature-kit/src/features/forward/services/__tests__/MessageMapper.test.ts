import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env, schema } from '@napgram/infra-kit'
import { ForwardMapper } from '../MessageMapper'

// Mock the database
vi.mock('@napgram/infra-kit', () => ({
  db: {
    query: {
      message: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      })),
    })),
  },
  schema: {
    message: { id: 'id' },
  },
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080'
  },
  temp: { TEMP_PATH: '/tmp', createTempFile: vi.fn(() => ({ path: '/tmp/test', cleanup: vi.fn() })) },
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  })),
  configureInfraKit: vi.fn(),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
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

      expect(vi.mocked(db.insert)).not.toHaveBeenCalled()
    })

    it('saves mapping when stubbed env bypasses skip', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      const unified: any = { content: [{ type: 'text', data: { text: 'Hello' } }] }
      const tgMsg: any = { id: 100, sender: { id: 123 } }
      const receipt: any = { messageId: 200 }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)

      expect(vi.mocked(db.insert)).toHaveBeenCalled()
    })

    it('handles database error in saveTgToQqMapping', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(new Error('DB Error')),
        })),
      } as any)

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

      expect(vi.mocked(db.insert)).toHaveBeenCalled()
    })

    it('handles missing metadata in saveMessage', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      const qqMsg: any = { content: [], timestamp: Date.now() }
      const tgMsg: any = { id: 500 }

      await mapper.saveMessage(qqMsg, tgMsg, 1, BigInt(1000), BigInt(2000))

      expect(vi.mocked(db.insert)).toHaveBeenCalled()
    })
  })

  describe('findTgMsgId', () => {
    it('returns found msgId by seq', async () => {

      vi.mocked(db.query.message.findFirst).mockResolvedValue({ tgMsgId: 999 } as any)

      const result = await mapper.findTgMsgId(1, BigInt(1000), '123')
      expect(result).toBe(999)
      expect(vi.mocked(db.query.message.findFirst)).toHaveBeenCalled()
    })

    it('returns found msgId by sender when bypass enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      vi.mocked(db.query.message.findFirst)
        .mockResolvedValueOnce(undefined) // No match by seq
        .mockResolvedValueOnce({ tgMsgId: 888 } as any) // Match by sender

      const result = await mapper.findTgMsgId(1, BigInt(1000), '456')
      expect(result).toBe(888)
      expect(vi.mocked(db.query.message.findFirst)).toHaveBeenCalledTimes(2)
    })
  })

  describe('findQqSource', () => {
    it('finds QQ source mapping when bypass enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')

      const mockResult = { seq: 123 }
      vi.mocked(db.query.message.findFirst).mockResolvedValue(mockResult as any)

      const result = await mapper.findQqSource(1, 2000, 100)
      expect(result).toEqual(mockResult)
    })
  })
})
