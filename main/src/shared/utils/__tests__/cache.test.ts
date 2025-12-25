import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TTLCache } from '../cache'

describe('TTLCache', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should set and get values', () => {
        const cache = new TTLCache<string, string>()
        cache.set('k', 'v')
        expect(cache.get('k')).toBe('v')
        expect(cache.has('k')).toBe(true)
        expect(cache.size).toBe(1)
    })

    it('should expire values', () => {
        const cache = new TTLCache<string, string>(1000) // 1s default
        cache.set('k', 'v')

        // Advance 500ms
        vi.advanceTimersByTime(500)
        expect(cache.get('k')).toBe('v')

        // Advance past expiration
        vi.advanceTimersByTime(600) // total 1.1s
        expect(cache.get('k')).toBeUndefined()
        expect(cache.has('k')).toBe(false)
        // delete is called lazily on get? Yes: this.cache.delete(key)
        expect(cache.size).toBe(0)
    })

    it('should respect custom TTL', () => {
        const cache = new TTLCache<string, string>(1000)
        cache.set('long', 'v', 5000)

        vi.advanceTimersByTime(2000)
        expect(cache.get('long')).toBe('v') // valid

        vi.advanceTimersByTime(4000) // total 6s
        expect(cache.get('long')).toBeUndefined()
    })

    it('should delete keys', () => {
        const cache = new TTLCache<string, string>()
        cache.set('k', 'v')
        expect(cache.delete('k')).toBe(true)
        expect(cache.get('k')).toBeUndefined()
        expect(cache.delete('missing')).toBe(false)
    })

    it('should clear', () => {
        const cache = new TTLCache<string, string>()
        cache.set('a', '1')
        cache.set('b', '2')
        cache.clear()
        expect(cache.size).toBe(0)
    })

    it('should cleanup', () => {
        const cache = new TTLCache<string, string>(1000)
        cache.set('expired', 'v', 500)
        cache.set('valid', 'v', 2000)

        vi.advanceTimersByTime(1000)
        // expired: expired 500ms ago. valid: valid for another 1000ms.

        cache.cleanup()

        // Access internal map or check size?
        // get('expired') would verify it's gone. But cleanup() removes it from map.
        // If not cleaned, size would be 2 (until lazy fetch).
        // Wait, get() lazily removes. We want to test cleanup() removing without get().
        // Accessing private property is hard in TS test without casting.
        // But cache.size delegates to Map.size.

        expect(cache.size).toBe(1)
        expect(cache.has('valid')).toBe(true)
        // To verify 'expired' is gone without triggering lazy delete? 
        // has() calls get() which triggers lazy delete.
        // So we can relies on size.
    })
})
