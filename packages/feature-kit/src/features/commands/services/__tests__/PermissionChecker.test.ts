import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as envModule from '../../../../../../../main/src/domain/models/env'
import { PermissionChecker } from '../PermissionChecker'

// Mock the env module
vi.mock('../../../../../../../main/src/domain/models/env', () => ({
  __esModule: true,
  default: {
    ADMIN_QQ: undefined,
    ADMIN_TG: undefined,
  },
}))

describe('permissionChecker', () => {
  let env: any
  beforeEach(() => {
    env = (envModule as any).default || envModule
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
