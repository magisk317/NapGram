import type { Buffer } from 'node:buffer'
/**
 * 统一的消息类型定义
 * Phase 1: Message Abstraction Layer
 *
 * 这是整个重构的核心，所有平台的消息都会转换为这个统一格式
 */

export type MessageContentType
  = | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'file'
    | 'sticker'
    | 'location'
    | 'dice'
    | 'forward'
    | 'reply'
    | 'at'
    | 'face'
    | 'markdown'

export interface MessageContent {
  type: MessageContentType
  data: any
}

export interface TextContent extends MessageContent {
  type: 'text'
  data: {
    text: string
  }
}

export interface ImageContent extends MessageContent {
  type: 'image'
  data: {
    url?: string
    file?: Buffer | string
    mimeType?: string
    width?: number
    height?: number
    isSpoiler?: boolean // 闪照
    isGif?: boolean
    isSticker?: boolean
  }
}

export interface VideoContent extends MessageContent {
  type: 'video'
  data: {
    url?: string
    file?: Buffer | string
    duration?: number
    width?: number
    height?: number
    thumbnail?: Buffer
  }
}

export interface AudioContent extends MessageContent {
  type: 'audio'
  data: {
    url?: string
    file?: Buffer | string
    duration?: number
  }
}

export interface FileContent extends MessageContent {
  type: 'file'
  data: {
    url?: string
    file?: Buffer | string
    filename: string
    fileId?: string
    size?: number
  }
}

export interface StickerContent extends MessageContent {
  type: 'sticker'
  data: {
    id?: string
    url?: string
    file?: Buffer | string
    isAnimated?: boolean
  }
}

export interface LocationContent extends MessageContent {
  type: 'location'
  data: {
    latitude: number
    longitude: number
    title?: string
    address?: string
  }
}

export interface ForwardContent extends MessageContent {
  type: 'forward'
  data: {
    messages: UnifiedMessage[]
  }
}

export interface ReplyContent extends MessageContent {
  type: 'reply'
  data: {
    messageId: string
    senderId: string
    senderName: string
    text?: string
  }
}

export interface AtContent extends MessageContent {
  type: 'at'
  data: {
    userId: string
    userName: string
  }
}

export interface FaceContent extends MessageContent {
  type: 'face'
  data: {
    id: number
    text?: string
  }
}

export interface DiceContent extends MessageContent {
  type: 'dice'
  data: {
    emoji?: string
    value?: number
  }
}

export interface MarkdownContent extends MessageContent {
  type: 'markdown'
  data: {
    content: string
  }
}

export type ChatType = 'private' | 'group' | 'discuss'

export interface Sender {
  id: string
  name: string
  avatar?: string
  isBot?: boolean
}

export interface Chat {
  id: string
  type: ChatType
  name?: string
  avatar?: string
}

/**
 * 统一的消息格式
 */
export interface UnifiedMessage {
  id: string
  platform: 'qq' | 'telegram'
  sender: Sender
  chat: Chat
  content: MessageContent[]
  timestamp: number
  metadata?: {
    raw?: any
    isEdited?: boolean
    isRecalled?: boolean
    [key: string]: any
  }
}

/**
 * 消息发送结果
 */
export interface MessageReceipt {
  messageId: string
  timestamp: number
  success: boolean
  error?: string
}

/**
 * 消息撤回事件
 */
export interface RecallEvent {
  messageId: string
  chatId: string
  operatorId: string
  timestamp: number
}

/**
 * 消息编辑事件
 */
export interface EditEvent {
  messageId: string
  newContent: MessageContent[]
  timestamp: number
}
