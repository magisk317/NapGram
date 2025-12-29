import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InteractiveStateManager } from '../InteractiveStateManager'

describe('interactiveStateManager', () => {
  let manager: InteractiveStateManager

  beforeEach(() => {
    manager = new InteractiveStateManager()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('setBindingState', () => {
    it('sets binding state with threadId', () => {
      manager.setBindingState('chat-1', 'user-1', 123)

      const state = manager.getBindingState('chat-1', 'user-1')
      expect(state).toBeTruthy()
      expect(state?.threadId).toBe(123)
      expect(state?.userId).toBe('user-1')
    })

    it('sets binding state without threadId', () => {
      manager.setBindingState('chat-2', 'user-2')

      const state = manager.getBindingState('chat-2', 'user-2')
      expect(state).toBeTruthy()
      expect(state?.threadId).toBeUndefined()
      expect(state?.userId).toBe('user-2')
    })

    it('overwrites existing state', () => {
      manager.setBindingState('chat-1', 'user-1', 100)
      manager.setBindingState('chat-1', 'user-1', 200)

      const state = manager.getBindingState('chat-1', 'user-1')
      expect(state?.threadId).toBe(200)
    })
  })

  describe('getBindingState', () => {
    it('returns undefined for non-existent state', () => {
      const state = manager.getBindingState('chat-x', 'user-x')

      expect(state).toBeUndefined()
    })

    it('returns existing state', () => {
      manager.setBindingState('chat-1', 'user-1', 50)

      const state = manager.getBindingState('chat-1', 'user-1')
      expect(state).toBeTruthy()
      expect(state?.threadId).toBe(50)
    })
  })

  describe('deleteBindingState', () => {
    it('deletes existing state', () => {
      manager.setBindingState('chat-1', 'user-1', 100)
      manager.deleteBindingState('chat-1', 'user-1')

      const state = manager.getBindingState('chat-1', 'user-1')
      expect(state).toBeUndefined()
    })

    it('handles deleting non-existent state', () => {
      expect(() => {
        manager.deleteBindingState('chat-x', 'user-x')
      }).not.toThrow()
    })
  })

  describe('isTimeout', () => {
    it('returns false for fresh state', () => {
      const state = { userId: 'user-1', timestamp: Date.now() }

      expect(manager.isTimeout(state)).toBe(false)
    })

    it('returns true for expired state', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000 - 1000
      const state = { userId: 'user-1', timestamp: fiveMinutesAgo }

      expect(manager.isTimeout(state)).toBe(true)
    })
  })

  describe('cleanupExpired', () => {
    it('removes expired states', () => {
      manager.setBindingState('chat-1', 'user-1', 100)
      manager.setBindingState('chat-2', 'user-2', 200)

      // Advance time by 6 minutes
      vi.advanceTimersByTime(6 * 60 * 1000)

      manager.cleanupExpired()

      expect(manager.getBindingState('chat-1', 'user-1')).toBeUndefined()
      expect(manager.getBindingState('chat-2', 'user-2')).toBeUndefined()
    })

    it('keeps non-expired states', () => {
      manager.setBindingState('chat-1', 'user-1', 100)

      // Advance time by 2 minutes
      vi.advanceTimersByTime(2 * 60 * 1000)

      manager.cleanupExpired()

      expect(manager.getBindingState('chat-1', 'user-1')).toBeTruthy()
    })

    it('handles mixed expired and non-expired states', () => {
      manager.setBindingState('chat-1', 'user-1', 100)

      // Advance time by 6 minutes
      vi.advanceTimersByTime(6 * 60 * 1000)

      manager.setBindingState('chat-2', 'user-2', 200)

      manager.cleanupExpired()

      expect(manager.getBindingState('chat-1', 'user-1')).toBeUndefined()
      expect(manager.getBindingState('chat-2', 'user-2')).toBeTruthy()
    })
  })
})
