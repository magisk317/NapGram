/**
 * A simple TTL (Time To Live) cache implementation
 */
export class TTLCache<K, V> {
  private cache = new Map<K, { value: V, expires: number }>()
  private defaultTTL: number

  /**
   * @param defaultTTL Default TTL in milliseconds (default: 60000ms = 1 minute)
   */
  constructor(defaultTTL = 60000) {
    this.defaultTTL = defaultTTL
  }

  /**
   * Set a value in the cache with optional custom TTL
   */
  set(key: K, value: V, ttl?: number): void {
    const expires = Date.now() + (ttl ?? this.defaultTTL)
    this.cache.set(key, { value, expires })
  }

  /**
   * Get a value from the cache, returns undefined if expired or not found
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (!entry)
      return undefined

    if (Date.now() > entry.expires) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  /**
   * Delete a key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get the number of entries (including expired ones)
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key)
      }
    }
  }
}
