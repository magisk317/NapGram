import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheManager } from '../CacheManager'
import * as performanceMonitorModule from '../PerformanceMonitor'

describe('cacheManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(performanceMonitorModule.performanceMonitor, 'recordCacheHit')
    vi.spyOn(performanceMonitorModule.performanceMonitor, 'recordCacheMiss')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const cache = new CacheManager()

      expect(cache.size()).toBe(0)
      const stats = cache.getStats()
      expect(stats.maxSize).toBe(1000)
    })

    it('should initialize with custom config', () => {
      const cache = new CacheManager({
        maxSize: 50,
        defaultTTL: 60000,
        cleanupInterval: 30000,
      })

      const stats = cache.getStats()
      expect(stats.maxSize).toBe(50)
    })

    it('should start cleanup timer', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const cache = new CacheManager({ cleanupInterval: 10000 })

      expect(setIntervalSpy).toHaveBeenCalled()
      expect(cache).toBeDefined()
    })
  })

  describe('set', () => {
    it('should add item to cache', () => {
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')

      expect(cache.size()).toBe(1)
      expect(cache.get('key1')).toBe('value1')
    })

    it('should use custom TTL when provided', () => {
      const cache = new CacheManager<string>({ defaultTTL: 1000 })

      cache.set('key1', 'value1', 500)

      // Advance time past custom TTL but before default TTL
      vi.advanceTimersByTime(600)

      expect(cache.get('key1')).toBeNull()
    })

    it('should evict LRU item when cache is full', () => {
      const cache = new CacheManager<number>({ maxSize: 3 })

      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)

      // Access key1 and key2 to increase their hit count
      cache.get('key1')
      cache.get('key2')

      // Add fourth item, should evict key3 (lowest hits)
      cache.set('key4', 4)

      expect(cache.size()).toBe(3)
      expect(cache.has('key3')).toBe(false)
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(true)
      expect(cache.has('key4')).toBe(true)
    })
  })

  describe('get', () => {
    it('should return value for existing key', () => {
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')
      const value = cache.get('key1')

      expect(value).toBe('value1')
      expect(performanceMonitorModule.performanceMonitor.recordCacheHit).toHaveBeenCalled()
    })

    it('should return null for non-existent key', () => {
      const cache = new CacheManager<string>()

      const value = cache.get('nonexistent')

      expect(value).toBeNull()
      expect(performanceMonitorModule.performanceMonitor.recordCacheMiss).toHaveBeenCalled()
    })

    it('should return null for expired item', () => {
      const cache = new CacheManager<string>({ defaultTTL: 1000 })

      cache.set('key1', 'value1')

      // Advance time past TTL
      vi.advanceTimersByTime(1100)

      const value = cache.get('key1')

      expect(value).toBeNull()
      expect(performanceMonitorModule.performanceMonitor.recordCacheMiss).toHaveBeenCalled()
    })

    it('should increment hit count on access', () => {
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')

      cache.get('key1')
      cache.get('key1')
      cache.get('key1')

      const stats = cache.getStats()
      expect(stats.totalHits).toBe(3)
    })

    it('should delete expired item from cache', () => {
      const cache = new CacheManager<string>({ defaultTTL: 1000 })

      cache.set('key1', 'value1')
      vi.advanceTimersByTime(1100)

      cache.get('key1')

      expect(cache.size()).toBe(0)
    })
  })

  describe('delete', () => {
    it('should remove item from cache', () => {
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')
      const result = cache.delete('key1')

      expect(result).toBe(true)
      expect(cache.size()).toBe(0)
      expect(cache.get('key1')).toBeNull()
    })

    it('should return false for non-existent key', () => {
      const cache = new CacheManager<string>()

      const result = cache.delete('nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('clear', () => {
    it('should remove all items from cache', () => {
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      cache.clear()

      expect(cache.size()).toBe(0)
    })
  })

  describe('has', () => {
    it('should return true for existing key', () => {
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')

      expect(cache.has('key1')).toBe(true)
    })

    it('should return false for non-existent key', () => {
      const cache = new CacheManager<string>()

      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should return false for expired item', () => {
      const cache = new CacheManager<string>({ defaultTTL: 1000 })

      cache.set('key1', 'value1')
      vi.advanceTimersByTime(1100)

      expect(cache.has('key1')).toBe(false)
    })

    it('should delete expired item from cache', () => {
      const cache = new CacheManager<string>({ defaultTTL: 1000 })

      cache.set('key1', 'value1')
      vi.advanceTimersByTime(1100)

      cache.has('key1')

      expect(cache.size()).toBe(0)
    })
  })

  describe('size', () => {
    it('should return current cache size', () => {
      const cache = new CacheManager<string>()

      expect(cache.size()).toBe(0)

      cache.set('key1', 'value1')
      expect(cache.size()).toBe(1)

      cache.set('key2', 'value2')
      expect(cache.size()).toBe(2)

      cache.delete('key1')
      expect(cache.size()).toBe(1)
    })
  })

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const cache = new CacheManager<string>({ maxSize: 100 })

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.get('key1')
      cache.get('key1')

      const stats = cache.getStats()

      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(100)
      expect(stats.totalHits).toBe(2)
      expect(stats.expiredCount).toBe(0)
      expect(stats.utilization).toBe(2)
    })

    it('should count expired items', () => {
      const cache = new CacheManager<string>({ defaultTTL: 1000 })

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      vi.advanceTimersByTime(1100)

      const stats = cache.getStats()
      expect(stats.expiredCount).toBe(2)
    })

    it('should calculate utilization correctly', () => {
      const cache = new CacheManager<string>({ maxSize: 100 })

      for (let i = 0; i < 50; i++) {
        cache.set(`key${i}`, `value${i}`)
      }

      const stats = cache.getStats()
      expect(stats.utilization).toBe(50)
    })
  })

  describe('cleanup', () => {
    it('should remove expired items automatically', () => {
      const cache = new CacheManager<string>({
        defaultTTL: 1000,
        cleanupInterval: 5000,
      })

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      // Expire key1
      vi.advanceTimersByTime(1100)

      // Trigger cleanup
      vi.advanceTimersByTime(5000)

      expect(cache.size()).toBe(0) // Both items should be cleaned up
    })

    it('should only remove expired items', () => {
      const cache = new CacheManager<string>({
        cleanupInterval: 5000,
      })

      cache.set('key1', 'value1', 1000)
      cache.set('key2', 'value2', 10000)

      vi.advanceTimersByTime(1100)

      // Trigger cleanup
      vi.advanceTimersByTime(5000)

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
    })
  })

  describe('evictLRU', () => {
    it('should evict least recently used item', () => {
      const cache = new CacheManager<number>({ maxSize: 2 })

      cache.set('key1', 1)
      cache.set('key2', 2)

      // Access key1 multiple times to increase hits
      cache.get('key1')
      cache.get('key1')
      cache.get('key1')

      // key2 has 0 hits, should be evicted
      cache.set('key3', 3)

      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(true)
    })
  })

  describe('destroy', () => {
    it('should clear cache and stop cleanup timer', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const cache = new CacheManager<string>()

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.destroy()

      expect(cache.size()).toBe(0)
      expect(clearIntervalSpy).toHaveBeenCalled()
    })

    it('should not run cleanup after destroy', () => {
      const cache = new CacheManager<string>({
        defaultTTL: 1000,
        cleanupInterval: 5000,
      })

      cache.set('key1', 'value1')
      cache.destroy()

      // Try to trigger cleanup
      vi.advanceTimersByTime(10000)

      // Size should remain 0 (cleanup not running)
      expect(cache.size()).toBe(0)
    })
  })

  describe('tTL and Expiration', () => {
    it('should respect default TTL', () => {
      const cache = new CacheManager<string>({ defaultTTL: 5000 })

      cache.set('key1', 'value1')

      vi.advanceTimersByTime(4000)
      expect(cache.get('key1')).toBe('value1')

      vi.advanceTimersByTime(2000)
      expect(cache.get('key1')).toBeNull()
    })

    it('should override default TTL with custom TTL', () => {
      const cache = new CacheManager<string>({ defaultTTL: 5000 })

      cache.set('key1', 'value1', 2000)

      vi.advanceTimersByTime(2100)
      expect(cache.get('key1')).toBeNull()
    })
  })

  describe('global Cache Instances', () => {
    it('should export configured cache instances', async () => {
      // Import to check they exist
      const module = await import('../CacheManager')

      expect(module.groupInfoCache).toBeInstanceOf(CacheManager)
      expect(module.userInfoCache).toBeInstanceOf(CacheManager)
      expect(module.mediaCache).toBeInstanceOf(CacheManager)
      expect(module.configCache).toBeInstanceOf(CacheManager)
    })
  })

  describe('edge Cases', () => {
    it('should no-op when evictLRU runs on empty cache', () => {
      const cache = new CacheManager<string>()

            ;(cache as any).evictLRU()

      expect(cache.size()).toBe(0)
    })

    it('should handle concurrent set operations', () => {
      const cache = new CacheManager<number>()

      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, i)
      }

      expect(cache.size()).toBe(100)
    })

    it('should handle concurrent get while cleanup runs', () => {
      const cache = new CacheManager<string>({
        defaultTTL: 1000,
        cleanupInterval: 500,
      })

      cache.set('key1', 'value1')

      vi.advanceTimersByTime(600)

      // Get while cleanup might be running
      const value = cache.get('key1')

      expect(value).toBe('value1')
    })
  })
})
