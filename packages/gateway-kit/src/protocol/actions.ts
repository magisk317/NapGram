/**
 * Gateway 动作类型定义
 * MVP 仅支持 message.send
 */

import type { Segment } from './events'

// ============= message.send 动作 =============
export interface MessageSendAction {
  action: 'message.send'
  params: {
    channelId: string // QQ: "qq:g:<id>" | "qq:p:<id>" ; TG: "tg:c:<chat_id>" | "tg:c:<chat_id>:t:<thread_id>"
    segments: Segment[] // 消息片段
    reply?: string // 可选：回复的消息ID
  }
}

export interface MessageSendResult {
  messageId: string // 发送成功后的消息ID
  platform: 'qq' | 'tg'
  timestamp: number
}

// ============= 其他动作（Phase 2）=============
// export interface ChannelListAction { ... }
// export interface UserInfoAction { ... }
// etc.

// ============= 联合类型 =============
export type GatewayAction = MessageSendAction
export type GatewayActionResult = MessageSendResult
