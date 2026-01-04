// ============================================================================
// 从已有包导入（优先使用）
// ============================================================================
export { performanceMonitor } from '@napgram/infra-kit'
export * from '@napgram/message-kit' // 包含 messageConverter
export { silk } from '@napgram/media-kit'

// ============================================================================
// 核心领域模型和插件接口（从 Kit 导入）
import type { IInstance as Instance } from '@napgram/runtime-kit'
export { ForwardMap } from '@napgram/infra-kit'
export type { ForwardPairRecord } from '@napgram/infra-kit'

// 基础设施接口（从客户端包导入）
export type { IQQClient } from '@napgram/qq-client'
export type { default as Telegram } from '@napgram/telegram-client'

// 插件系统
import type { MessageSegment } from '@napgram/message-kit'
export { getEventPublisher } from '@napgram/plugin-kit'

// 领域常量和工具
export { flags } from '@napgram/infra-kit'
export { md5Hex } from '@napgram/runtime-kit'
export { DurationParser } from '@napgram/infra-kit'
export { PermissionChecker } from '@napgram/auth-kit'

// 导出类型
export type {
    Instance,
    MessageSegment,
}
