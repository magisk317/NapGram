import { describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { RichHeaderBuilder } from '../RichHeaderBuilder'

vi.mock('@napgram/infra-kit', () => ({
  db: {
    message: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    forwardPair: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    forwardMultiple: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    qqRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn()
  },
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080'
  },
  hashing: { md5Hex: vi.fn((value: string) => value) },
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

describe('richHeaderBuilder', () => {
  const builder = new RichHeaderBuilder()

  describe('generateRichHeaderUrl', () => {
    it('generates URL with hash and version', () => {
      const url = builder.generateRichHeaderUrl('api-key-123', 'user-456', 'Test Header')

      expect(url).toContain('/richHeader/api-key-123/user-456')
      expect(url).toContain('hash=')
      expect(url).toContain('v=2')
    })

    it('generates URL without hash when messageHeader is empty', () => {
      const url = builder.generateRichHeaderUrl('api-key', 'user', '')

      expect(url).toContain('/richHeader/api-key/user')
      expect(url).toContain('v=2')
      expect(url).not.toContain('hash=')
    })
  })

  describe('applyRichHeader', () => {
    it('returns HTML formatted text with rich header URL', () => {
      const result = builder.applyRichHeader('Hello\\nWorld', 'http://example.com/rich')

      expect(result.params.invertMedia).toBe(true)
      expect(result.params.disableWebPreview).toBe(false)
      expect(result.text).toBeTruthy()
    })

    it('returns plain text without rich header URL', () => {
      const result = builder.applyRichHeader('Hello\\nWorld')

      expect(result.text).toBe('Hello\nWorld')
      expect(result.params.disableWebPreview).toBe(true)
      expect(result.params.invertMedia).toBeUndefined()
    })

    it('handles newline escape sequences', () => {
      const result = builder.applyRichHeader('Line1\\nLine2\\nLine3')

      expect(result.text).toContain('Line1\nLine2\nLine3')
    })
  })

  describe('buildReplyTo', () => {
    it('returns replyToMsgId when provided', () => {
      const result = builder.buildReplyTo({ tgThreadId: 100 }, 200)

      expect(result).toBe(200)
    })

    it('returns tgThreadId when replyToMsgId is not provided', () => {
      const result = builder.buildReplyTo({ tgThreadId: 100 })

      expect(result).toBe(100)
    })

    it('returns undefined when no IDs are provided', () => {
      const result = builder.buildReplyTo({})

      expect(result).toBeUndefined()
    })

    it('returns undefined when pair is undefined', () => {
      const result = builder.buildReplyTo(undefined, undefined)

      expect(result).toBeUndefined()
    })
  })

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      const result = builder.escapeHtml('<div class="test">Hello & "Goodbye"</div>')

      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
      expect(result).toContain('&amp;')
      expect(result).toContain('&quot;')
    })

    it('escapes single quotes', () => {
      const result = builder.escapeHtml('It\'s a test')

      expect(result).toContain('&#039;')
    })

    it('returns unchanged text when no special characters', () => {
      const result = builder.escapeHtml('Plain text')

      expect(result).toBe('Plain text')
    })
  })
})
