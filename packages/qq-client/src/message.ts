import type { Buffer } from 'node:buffer'


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
    isSpoiler?: boolean
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

export interface MessageReceipt {
  messageId: string
  timestamp: number
  success: boolean
  error?: string
}

export interface RecallEvent {
  messageId: string
  chatId: string
  operatorId: string
  timestamp: number
}

export interface EditEvent {
  messageId: string
  newContent: MessageContent[]
  timestamp: number
}
