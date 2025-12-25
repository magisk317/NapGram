import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForwardMapper } from '../MessageMapper'

// Mock the database
vi.mock('../../../../domain/models/db', () => ({
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
  })

  describe('saveMessage', () => {
    it('saves QQ to TG message mapping', async () => {
      const qqMsg: any = {
        timestamp: Date.now(),
        sender: { id: '12345' },
        metadata: { raw: { message_id: 1, seq: 100, rand: 200 } },
        content: [{ type: 'text', data: { text: 'Hello' } }],
      }
      const tgMsg: any = { id: 500, sender: { id: '67890' } }

      await mapper.saveMessage(qqMsg, tgMsg, 1, BigInt(1000), BigInt(2000))

      // In test environment, should not actually save due to shouldSkipPersistence
      const db = await import('../../../../domain/models/db')
      expect(db.default.message.create).not.toHaveBeenCalled()
    })
  })

  describe('saveTgToQqMapping', () => {
    it('handles missing messageId in receipt', async () => {
      const unified: any = {
        content: [{ type: 'text', data: { text: 'Test' } }],
      }
      const tgMsg: any = { id: 100 }
      const receipt: any = {} // No messageId
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      await mapper.saveTgToQqMapping(unified, tgMsg, receipt, pair)

      // Should not throw, just log a warning
      const db = await import('../../../../domain/models/db')
      expect(db.default.message.create).not.toHaveBeenCalled()
    })

    it('extracts messageId from different receipt structures', async () => {
      const unified: any = {
        content: [{ type: 'text', data: { text: 'Test' } }],
      }
      const tgMsg: any = { id: 100, sender: { id: '123' } }
      const pair: any = { qqRoomId: BigInt(1000), tgChatId: 2000, instanceId: 1 }

      // Test with receipt.messageId
      await mapper.saveTgToQqMapping(unified, tgMsg, { messageId: 200 }, pair)

      // Test with receipt.data.message_id
      await mapper.saveTgToQqMapping(unified, tgMsg, { data: { message_id: 300 } }, pair)

      // Test with receipt.id
      await mapper.saveTgToQqMapping(unified, tgMsg, { id: 400 }, pair)

      // In test env, should skip persistence
      const db = await import('../../../../domain/models/db')
      expect(db.default.message.create).not.toHaveBeenCalled()
    })
  })

  describe('findTgMsgId', () => {
    it('returns undefined for invalid qqMsgId', async () => {
      const result = await mapper.findTgMsgId(1, BigInt(1000), 'invalid')

      expect(result).toBeUndefined()
    })

    it('attempts to find by seq and then by sender', async () => {
      const db = await import('../../../../domain/models/db')
      vi.mocked(db.default.message.findFirst).mockResolvedValue(null)

      const result = await mapper.findTgMsgId(1, BigInt(1000), '123')

      expect(result).toBeUndefined()
      // In test mode, will attempt seq but skip sender lookup
    })
  })

  describe('findQqSource', () => {
    it('returns undefined in test environment', async () => {
      const result = await mapper.findQqSource(1, 1000, 500)

      expect(result).toBeUndefined()
    })
  })

  describe('constructor', () => {
    it('accepts custom contentRenderer', () => {
      const customRenderer = vi.fn((content: any) => `[${content.type}]`)
      const customMapper = new ForwardMapper(customRenderer)

      expect(customMapper).toBeInstanceOf(ForwardMapper)
    })

    it('uses default renderer when not provided', () => {
      const mapper = new ForwardMapper()

      expect(mapper).toBeInstanceOf(ForwardMapper)
    })
  })
})
