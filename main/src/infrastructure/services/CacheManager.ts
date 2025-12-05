import { getLogger } from '../../shared/utils/logger';
import { performanceMonitor } from './PerformanceMonitor';

const logger = getLogger('CacheManager');

/**
 * 缓存项
 */
interface CacheItem<T> {
    data: T;
    expires: number;
    hits: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
    maxSize?: number;
    defaultTTL?: number;
    cleanupInterval?: number;
}

/**
 * LRU 缓存管理器
 * Phase 5: 减少数据库查询和网络请求
 */
export class CacheManager<T = any> {
    private cache = new Map<string, CacheItem<T>>();
    private maxSize: number;
    private defaultTTL: number;
    private cleanupTimer: NodeJS.Timeout;

    constructor(config: CacheConfig = {}) {
        this.maxSize = config.maxSize || 1000;
        this.defaultTTL = config.defaultTTL || 300000; // 5分钟

        // 定期清理过期缓存
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, config.cleanupInterval || 60000); // 每分钟
    }

    /**
     * 设置缓存
     */
    set(key: string, value: T, ttl?: number): void {
        // 如果缓存已满，删除最少使用的项
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        this.cache.set(key, {
            data: value,
            expires: Date.now() + (ttl || this.defaultTTL),
            hits: 0,
        });

        logger.trace(`Cache set: ${key}`);
    }

    /**
     * 获取缓存
     */
    get(key: string): T | null {
        const item = this.cache.get(key);

        if (!item) {
            performanceMonitor.recordCacheMiss();
            logger.trace(`Cache miss: ${key}`);
            return null;
        }

        // 检查是否过期
        if (item.expires < Date.now()) {
            this.cache.delete(key);
            performanceMonitor.recordCacheMiss();
            logger.trace(`Cache expired: ${key}`);
            return null;
        }

        // 更新命中次数
        item.hits++;
        performanceMonitor.recordCacheHit();
        logger.trace(`Cache hit: ${key}`);

        return item.data;
    }

    /**
     * 删除缓存
     */
    delete(key: string): boolean {
        const result = this.cache.delete(key);
        if (result) {
            logger.trace(`Cache deleted: ${key}`);
        }
        return result;
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
        logger.info('Cache cleared');
    }

    /**
     * 检查是否存在
     */
    has(key: string): boolean {
        const item = this.cache.get(key);
        if (!item) return false;

        if (item.expires < Date.now()) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 获取缓存大小
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * 获取缓存统计
     */
    getStats() {
        let totalHits = 0;
        let expiredCount = 0;
        const now = Date.now();

        for (const [, item] of this.cache) {
            totalHits += item.hits;
            if (item.expires < now) {
                expiredCount++;
            }
        }

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            totalHits,
            expiredCount,
            utilization: (this.cache.size / this.maxSize) * 100,
        };
    }

    /**
     * 清理过期缓存
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, item] of this.cache) {
            if (item.expires < now) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`Cleaned ${cleaned} expired cache items`);
        }
    }

    /**
     * LRU 淘汰
     */
    private evictLRU(): void {
        let lruKey: string | null = null;
        let lruHits = Infinity;

        for (const [key, item] of this.cache) {
            if (item.hits < lruHits) {
                lruHits = item.hits;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
            logger.debug(`Evicted LRU cache item: ${lruKey}`);
        }
    }

    /**
     * 销毁缓存管理器
     */
    destroy(): void {
        clearInterval(this.cleanupTimer);
        this.cache.clear();
        logger.info('CacheManager destroyed');
    }
}

/**
 * 全局缓存实例
 */
export const groupInfoCache = new CacheManager({ defaultTTL: 300000 }); // 5分钟
export const userInfoCache = new CacheManager({ defaultTTL: 600000 }); // 10分钟
export const mediaCache = new CacheManager({ defaultTTL: 3600000 }); // 1小时
export const configCache = new CacheManager({ defaultTTL: Infinity }); // 永久
