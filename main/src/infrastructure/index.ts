/**
 * Infrastructure Layer Exports
 *
 * 此模块负责导出基础设施层的所有组件，包括：
 * - 客户端适配器 (QQ、Telegram)
 * - 性能监控和优化服务
 * - 缓存管理
 * - 消息队列
 */

import { configureInfraKit } from '@napgram/infra-kit'
import { getLogger } from '../shared/logger'

configureInfraKit({ loggerFactory: getLogger })

// ============================================
// Clients - 外部服务客户端
// ============================================

/**
 * QQ Client
 * NapCat WebSocket 适配器及相关工具
 */
export * from './clients/qq'

/**
 * Telegram Client
 * MTCute 客户端封装
 */
export * from './clients/telegram'

// ============================================
// Services - 基础设施服务
// ============================================

/**
 * Cache Management
 * LRU 缓存管理器 - 减少数据库查询和网络请求
 * - 群组信息缓存
 * - 用户信息缓存
 * - 媒体文件缓存
 * - 配置缓存
 */
export {
  type CacheConfig,
  CacheManager,
  configCache,
  groupInfoCache,
  mediaCache,
  userInfoCache,
} from './services/CacheManager'

/**
 * Message Queue
 * 消息队列 - 批量处理消息，提升性能
 * - 优先级队列支持
 * - 批量处理
 * - 自动重试
 */
export {
  type MessageHandler,
  MessageQueue,
  type QueueConfig,
} from './services/MessageQueue'

/**
 * Performance Monitoring
 * 性能监控器 - 收集和分析系统性能指标
 * - 消息处理延迟跟踪
 * - 错误率统计
 * - 缓存命中率
 * - 内存使用监控
 */
export {
  type PerformanceMetrics,
  PerformanceMonitor,
  performanceMonitor,
  type PerformanceStats,
} from './services/PerformanceMonitor'
