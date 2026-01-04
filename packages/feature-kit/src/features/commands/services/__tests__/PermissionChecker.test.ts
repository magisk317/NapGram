import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'

import { PermissionChecker } from '../PermissionChecker'

// Mock the env module
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

describe('permissionChecker', () => {
  
  beforeEach(() => {

    // Reset env
    env.ADMIN_QQ = undefined
    env.ADMIN_TG = undefined
  })

  describe('isAdmin', () => {
    it('returns true for instance owner', () => {
      const mockInstance = { owner: '1234567890' }
      const checker = new PermissionChecker(mockInstance as any)
      expect(checker.isAdmin('1234567890')).toBe(true)
    })

    it('returns false for non-owner user with no env', () => {
      const mockInstance = { owner: '1234567890' }
      const checker = new PermissionChecker(mockInstance as any)
      // Env is undefined by default in beforeEach
      expect(checker.isAdmin('9999999999')).toBe(false)
    })

    it('returns true when userId matches ADMIN_QQ', () => {
      const mockInstance = { owner: '123' }
      const checker = new PermissionChecker(mockInstance as any)
      env.ADMIN_QQ = 999
      // checker logic: String(env) -> "999"
      expect(checker.isAdmin('999')).toBe(true)
    })

    it('returns true when userId matches ADMIN_TG', () => {
      const mockInstance = { owner: '123' }
      const checker = new PermissionChecker(mockInstance as any)
      env.ADMIN_TG = 888
      expect(checker.isAdmin('888')).toBe(true)
    })

    it('returns true when userId matches instance owner as number', () => {
      const mockInstance = { owner: 123456 }
      const checker = new PermissionChecker(mockInstance as any)
      expect(checker.isAdmin('123456')).toBe(true)
    })

    it('handles different userId formats', () => {
      const mockInstance = { owner: '999' }
      const checker = new PermissionChecker(mockInstance as any)
      expect(checker.isAdmin('999')).toBe(true)
      expect(checker.isAdmin('123')).toBe(false)
    })
  })
})
