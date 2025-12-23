import process from 'node:process'
import { getLogger } from '../../shared/logger'

const logger = getLogger('PerformanceMonitor')

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  messageProcessed: number
  messageLatency: number[]
  errorCount: number
  cacheHits: number
  cacheMisses: number
  memoryUsage: NodeJS.MemoryUsage
  startTime: number
}

/**
 * 性能统计
 */
export interface PerformanceStats {
  uptime: number
  totalMessages: number
  messagesPerSecond: number
  avgLatency: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  errorRate: number
  cacheHitRate: number
  memoryUsageMB: number
}

/**
 * 性能监控器
 * Phase 5: 收集和分析性能指标
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    messageProcessed: 0,
    messageLatency: [],
    errorCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    memoryUsage: process.memoryUsage(),
    startTime: Date.now(),
  }

  private maxLatencyRecords = 1000 // 保留最近 1000 条延迟记录

  /**
   * 记录消息处理
   */
  recordMessage(latency: number) {
    this.metrics.messageProcessed++
    this.metrics.messageLatency.push(latency)

    // 限制数组大小
    if (this.metrics.messageLatency.length > this.maxLatencyRecords) {
      this.metrics.messageLatency.shift()
    }
  }

  /**
   * 记录错误
   */
  recordError() {
    this.metrics.errorCount++
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit() {
    this.metrics.cacheHits++
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++
  }

  /**
   * 更新内存使用情况
   */
  updateMemoryUsage() {
    this.metrics.memoryUsage = process.memoryUsage()
  }

  /**
   * 获取性能统计
   */
  getStats(): PerformanceStats {
    const uptime = Date.now() - this.metrics.startTime
    const uptimeSeconds = uptime / 1000

    return {
      uptime,
      totalMessages: this.metrics.messageProcessed,
      messagesPerSecond: this.metrics.messageProcessed / uptimeSeconds,
      avgLatency: this.average(this.metrics.messageLatency),
      p50Latency: this.percentile(this.metrics.messageLatency, 50),
      p95Latency: this.percentile(this.metrics.messageLatency, 95),
      p99Latency: this.percentile(this.metrics.messageLatency, 99),
      errorRate: this.metrics.messageProcessed > 0
        ? this.metrics.errorCount / this.metrics.messageProcessed
        : 0,
      cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
        ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
        : 0,
      memoryUsageMB: this.metrics.memoryUsage.heapUsed / 1024 / 1024,
    }
  }

  /**
   * 打印统计信息
   */
  printStats() {
    const stats = this.getStats()

    logger.info('=== Performance Statistics ===')
    logger.info(`Uptime: ${(stats.uptime / 1000 / 60).toFixed(2)} minutes`)
    logger.info(`Total Messages: ${stats.totalMessages}`)
    logger.info(`Messages/sec: ${stats.messagesPerSecond.toFixed(2)}`)
    logger.info(`Avg Latency: ${stats.avgLatency.toFixed(2)}ms`)
    logger.info(`P95 Latency: ${stats.p95Latency.toFixed(2)}ms`)
    logger.info(`P99 Latency: ${stats.p99Latency.toFixed(2)}ms`)
    logger.info(`Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`)
    logger.info(`Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(2)}%`)
    logger.info(`Memory Usage: ${stats.memoryUsageMB.toFixed(2)}MB`)
    logger.info('==============================')
  }

  /**
   * 重置统计
   */
  reset() {
    this.metrics = {
      messageProcessed: 0,
      messageLatency: [],
      errorCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: process.memoryUsage(),
      startTime: Date.now(),
    }
    logger.info('Performance metrics reset')
  }

  /**
   * 计算平均值
   */
  private average(arr: number[]): number {
    if (arr.length === 0)
      return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  /**
   * 计算百分位数
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0)
      return 0

    const sorted = [...arr].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }
}

// 全局单例
export const performanceMonitor = new PerformanceMonitor()

// 定期打印统计信息
setInterval(() => {
  performanceMonitor.updateMemoryUsage()
  performanceMonitor.printStats()
}, 300000) // 每 5 分钟
