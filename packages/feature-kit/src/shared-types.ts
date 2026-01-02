// ============================================================================
// 从已有包导入（优先使用）
// ============================================================================
export { performanceMonitor } from '@napgram/infra-kit'
export * from '@napgram/message-kit' // 包含 messageConverter
export { silk } from '@napgram/media-kit'

// ============================================================================
// 从 main 重导出核心领域模型和插件接口
// 这些是应用核心，feature-kit 作为 main 的扩展依赖它们是合理的
// ============================================================================

// 领域模型类型
import type Instance from '../../../main/src/domain/models/Instance'
export { ForwardMap } from '@napgram/infra-kit'
export type { ForwardPairRecord } from '@napgram/infra-kit'

// 基础设施接口（从客户端包导入）
export type { IQQClient } from '@napgram/qq-client'
export type { default as Telegram } from '@napgram/telegram-client'

// 插件系统
import type { MessageSegment } from '@napgram/message-kit'
export { getEventPublisher } from '../../../main/src/plugins/core/event-publisher'

// 领域常量和工具
export { flags } from '@napgram/infra-kit'
export { md5Hex, DurationParser } from '@napgram/runtime-kit'
export { PermissionChecker } from '@napgram/auth-kit'

// 导出类型
export type {
    Instance,
    MessageSegment,
}
