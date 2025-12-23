/**
 * Gateway 事件类型定义
 * MVP 仅支持 message.created
 */

// ============= 消息片段 (Segment) =============
export interface Segment {
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'at' | 'reply' | 'forward' | 'raw'
  data: any
}

// ============= message.created 事件 =============
export interface MessageCreatedEvent {
  seq: number
  type: 'message.created'
  instanceId: number
  channelId: string // QQ: "qq:g:<id>" | "qq:p:<id>" ; TG: "tg:c:<chat_id>" | "tg:c:<chat_id>:t:<thread_id>"
  threadId?: number | null // TG topic/thread id (if any)
  actor: {
    userId: string // 格式: "qq:u:<id>" 或 "tg:u:<id>"
    name: string
  }
  message: {
    messageId: string // QQ: "qq:m:<msg_id>" ; TG: "tg:m:<chat_id>:<msg_id>"
    platform: 'qq' | 'tg'
    threadId?: number | null
    native: any // 原始平台消息对象
    segments: Segment[] // 统一消息片段
    timestamp: number
  }
}

// ============= 其他事件类型（Phase 2）=============
// export interface MessageDeletedEvent { ... }
// export interface UserJoinedEvent { ... }
// etc.

// ============= 联合类型 =============
export type GatewayEvent = MessageCreatedEvent
