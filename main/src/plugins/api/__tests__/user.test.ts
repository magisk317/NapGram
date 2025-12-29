import { describe, expect, it, vi } from 'vitest'
import { createUserAPI, UserAPIImpl } from '../user'

describe('userAPI', () => {
  describe('userAPIImpl', () => {
    it('throws error when instance resolver not configured', async () => {
      const api = new UserAPIImpl()

      await expect(
        api.getInfo({ instanceId: 1, userId: 'qq:u:123456' }),
      ).rejects.toThrow('Instance resolver not configured')
    })

    it('throws error when instance not found', async () => {
      const resolver = vi.fn().mockReturnValue(null)
      const api = new UserAPIImpl(resolver)

      await expect(
        api.getInfo({ instanceId: 1, userId: 'qq:u:123456' }),
      ).rejects.toThrow('Instance 1 not found')
    })

    it('throws error for invalid userId format', async () => {
      const resolver = vi.fn().mockReturnValue({})
      const api = new UserAPIImpl(resolver)

      await expect(
        api.getInfo({ instanceId: 1, userId: 'invalid' }),
      ).rejects.toThrow('Invalid userId format')
    })

    it('throws error for unknown platform', async () => {
      const resolver = vi.fn().mockReturnValue({})
      const api = new UserAPIImpl(resolver)

      await expect(
        api.getInfo({ instanceId: 1, userId: 'unknown:u:123' }),
      ).rejects.toThrow('Unknown platform: unknown')
    })

    it('handles QQ user info request', async () => {
      const resolver = vi.fn().mockReturnValue({})
      const api = new UserAPIImpl(resolver)

      const result = await api.getInfo({ instanceId: 1, userId: 'qq:u:123456' })

      expect(result).toBeNull() // Phase 4 not implemented yet
    })

    it('handles TG user info request', async () => {
      const resolver = vi.fn().mockReturnValue({})
      const api = new UserAPIImpl(resolver)

      const result = await api.getInfo({ instanceId: 1, userId: 'tg:u:123456' })

      expect(result).toBeNull() // Phase 4 not implemented yet
    })

    it('parses userId with colon in id part', async () => {
      const resolver = vi.fn().mockReturnValue({})
      const api = new UserAPIImpl(resolver)

      // userId with multiple colons
      await api.getInfo({ instanceId: 1, userId: 'qq:u:123:456:789' })

      // Should not throw, parsing should handle it
      expect(resolver).toHaveBeenCalled()
    })

    it('handles success log when userInfo found', async () => {
      const resolver = vi.fn().mockReturnValue({})
      const api = new UserAPIImpl(resolver)
      // Mock internal getQQUserInfo
      api.getQQUserInfo = vi.fn().mockResolvedValue({ id: '1', nickname: 'Test' })
      await api.getInfo({ instanceId: 1, userId: 'qq:u:1' })
      // Should log debug (lines 62-63)
    })

    describe('isFriend', () => {
      it('throws error when instance resolver not configured', async () => {
        const api = new UserAPIImpl()

        await expect(
          api.isFriend({ instanceId: 1, userId: 'qq:u:123456' }),
        ).rejects.toThrow('Instance resolver not configured')
      })

      it('throws error when instance not found', async () => {
        const resolver = vi.fn().mockReturnValue(null)
        const api = new UserAPIImpl(resolver)

        await expect(
          api.isFriend({ instanceId: 1, userId: 'qq:u:123456' }),
        ).rejects.toThrow('Instance 1 not found')
      })

      it('returns false for QQ platform (Phase 4 not implemented)', async () => {
        const resolver = vi.fn().mockReturnValue({})
        const api = new UserAPIImpl(resolver)

        const result = await api.isFriend({ instanceId: 1, userId: 'qq:u:123456' })

        expect(result).toBe(false)
      })

      it('returns false for TG platform (no friend concept)', async () => {
        const resolver = vi.fn().mockReturnValue({})
        const api = new UserAPIImpl(resolver)

        const result = await api.isFriend({ instanceId: 1, userId: 'tg:u:123456' })

        expect(result).toBe(false)
      })

      it('returns false for unknown platform', async () => {
        const resolver = vi.fn().mockReturnValue({})
        const api = new UserAPIImpl(resolver)

        // parseUserId allows any string as platform, validation only checks parts length
        const result = await api.isFriend({ instanceId: 1, userId: 'wx:u:123456' })

        expect(result).toBe(false)
      })
    })

    describe('createUserAPI', () => {
      it('creates user API instance', () => {
        const api = createUserAPI()

        expect(api).toBeInstanceOf(UserAPIImpl)
      })

      it('creates user API with resolver', () => {
        const resolver = vi.fn()
        const api = createUserAPI(resolver)

        expect(api).toBeInstanceOf(UserAPIImpl)
      })
    })
  })
})
