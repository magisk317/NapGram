import type { FastifyInstance } from 'fastify'
import {
  configCache,
  groupInfoCache,
  mediaCache,
  performanceMonitor,
  userInfoCache,
} from '@napgram/infra-kit'

/**
 * 监控和统计 API
 * 提供实时性能指标和缓存统计
 */
export default function setupMonitoring(app: FastifyInstance) {
  /**
   * GET /api/monitor/performance
   * 获取性能统计数据
   */
  app.get('/api/monitor/performance', async () => {
    const stats = performanceMonitor.getStats()
    return {
      uptime: stats.uptime,
      uptimeMinutes: (stats.uptime / 1000 / 60).toFixed(2),
      totalMessages: stats.totalMessages,
      messagesPerSecond: Number.parseFloat(stats.messagesPerSecond.toFixed(2)),
      avgLatency: Number.parseFloat(stats.avgLatency.toFixed(2)),
      p50Latency: Number.parseFloat(stats.p50Latency.toFixed(2)),
      p95Latency: Number.parseFloat(stats.p95Latency.toFixed(2)),
      p99Latency: Number.parseFloat(stats.p99Latency.toFixed(2)),
      errorRate: Number.parseFloat((stats.errorRate * 100).toFixed(2)),
      cacheHitRate: Number.parseFloat((stats.cacheHitRate * 100).toFixed(2)),
      memoryUsageMB: Number.parseFloat(stats.memoryUsageMB.toFixed(2)),
    }
  })

  /**
   * GET /api/monitor/cache
   * 获取缓存统计数据
   */
  app.get('/api/monitor/cache', async () => {
    return {
      userCache: userInfoCache.getStats(),
      groupCache: groupInfoCache.getStats(),
      mediaCache: mediaCache.getStats(),
      configCache: configCache.getStats(),
    }
  })

  /**
   * GET /api/monitor/health
   * 健康检查端点
   */
  app.get('/api/monitor/health', async () => {
    const stats = performanceMonitor.getStats()
    const errorRate = stats.errorRate
    const cacheHitRate = stats.cacheHitRate

    // 健康判断逻辑
    let status = 'healthy'
    if (errorRate > 0.1) {
      status = 'unhealthy' // 错误率超过 10%
    }
    else if (errorRate > 0.05 || cacheHitRate < 0.5) {
      status = 'degraded' // 错误率超过 5% 或缓存命中率低于 50%
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: stats.uptime,
      metrics: {
        messagesPerSecond: Number.parseFloat(stats.messagesPerSecond.toFixed(2)),
        errorRate: Number.parseFloat((errorRate * 100).toFixed(2)),
        cacheHitRate: Number.parseFloat((cacheHitRate * 100).toFixed(2)),
        avgLatency: Number.parseFloat(stats.avgLatency.toFixed(2)),
      },
    }
  })

  /**
   * POST /api/monitor/stats/print
   * 手动触发统计信息打印到日志
   */
  app.post('/api/monitor/stats/print', async () => {
    performanceMonitor.printStats()
    return { success: true, message: 'Stats printed to logs' }
  })
}
