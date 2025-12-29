import { getInfraLogger } from './deps'
import { performanceMonitor } from './PerformanceMonitor'

const logger = getInfraLogger('CacheManager')

interface CacheItem<T> {
  data: T
  expires: number
  hits: number
}

export interface CacheConfig {
  maxSize?: number
  defaultTTL?: number
  cleanupInterval?: number
}

export class CacheManager<T = any> {
  private cache = new Map<string, CacheItem<T>>()
  private maxSize: number
  private defaultTTL: number
  private cleanupTimer: NodeJS.Timeout

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize || 1000
    this.defaultTTL = config.defaultTTL || 300000

    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, config.cleanupInterval || 60000)
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, {
      data: value,
      expires: Date.now() + (ttl || this.defaultTTL),
      hits: 0,
    })

    logger.trace(`Cache set: ${key}`)
  }

  get(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) {
      performanceMonitor.recordCacheMiss()
      logger.trace(`Cache miss: ${key}`)
      return null
    }

    if (item.expires < Date.now()) {
      this.cache.delete(key)
      performanceMonitor.recordCacheMiss()
      logger.trace(`Cache expired: ${key}`)
      return null
    }

    item.hits++
    performanceMonitor.recordCacheHit()
    logger.trace(`Cache hit: ${key}`)

    return item.data
  }

  delete(key: string): boolean {
    const result = this.cache.delete(key)
    if (result) {
      logger.trace(`Cache deleted: ${key}`)
    }
    return result
  }

  clear(): void {
    this.cache.clear()
    logger.info('Cache cleared')
  }

  has(key: string): boolean {
    const item = this.cache.get(key)
    if (!item)
      return false

    if (item.expires < Date.now()) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  size(): number {
    return this.cache.size
  }

  getStats() {
    let totalHits = 0
    let expiredCount = 0
    const now = Date.now()

    for (const [, item] of this.cache) {
      totalHits += item.hits
      if (item.expires < now) {
        expiredCount++
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalHits,
      expiredCount,
      utilization: (this.cache.size / this.maxSize) * 100,
    }
  }

  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, item] of this.cache) {
      if (item.expires < now) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired cache items`)
    }
  }

  private evictLRU(): void {
    let lruKey: string | null = null
    let lruHits = Infinity

    for (const [key, item] of this.cache) {
      if (item.hits < lruHits) {
        lruHits = item.hits
        lruKey = key
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey)
      logger.debug(`Evicted LRU cache item: ${lruKey}`)
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
    this.cache.clear()
    logger.info('CacheManager destroyed')
  }
}

export const groupInfoCache = new CacheManager({ defaultTTL: 300000 })
export const userInfoCache = new CacheManager({ defaultTTL: 600000 })
export const mediaCache = new CacheManager({ defaultTTL: 3600000 })
export const configCache = new CacheManager({ defaultTTL: Infinity })
