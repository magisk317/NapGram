import process from 'node:process'
import { getInfraLogger } from './deps'

const logger = getInfraLogger('PerformanceMonitor')

export interface PerformanceMetrics {
  messageProcessed: number
  messageLatency: number[]
  errorCount: number
  cacheHits: number
  cacheMisses: number
  memoryUsage: NodeJS.MemoryUsage
  startTime: number
}

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

  private maxLatencyRecords = 1000

  recordMessage(latency: number) {
    this.metrics.messageProcessed++
    this.metrics.messageLatency.push(latency)

    if (this.metrics.messageLatency.length > this.maxLatencyRecords) {
      this.metrics.messageLatency.shift()
    }
  }

  recordError() {
    this.metrics.errorCount++
  }

  recordCacheHit() {
    this.metrics.cacheHits++
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++
  }

  updateMemoryUsage() {
    this.metrics.memoryUsage = process.memoryUsage()
  }

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

  printStats() {
    const stats = this.getStats()

    logger.debug({ stats }, 'Performance Statistics')
  }

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

  private average(arr: number[]): number {
    if (arr.length === 0)
      return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0)
      return 0

    const sorted = [...arr].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }
}

export const performanceMonitor = new PerformanceMonitor()

export const startMonitoring = () => {
  setInterval(() => {
    performanceMonitor.updateMemoryUsage()
    performanceMonitor.printStats()
  }, 300000)
}

if (process.env.NODE_ENV !== 'test') {
  startMonitoring()
}
