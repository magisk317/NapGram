/**
 * Gateway 事件发布器
 * 将 NapGram 的 UnifiedMessage 转换为 Gateway 事件并发布
 */

import type { UnifiedMessage } from '@napgram/message-kit'
import type { MessageCreatedEvent, Segment } from '../protocol/events'
import type { GatewayServer } from '../server/GatewayServer'
import { getLogger } from '../logger'

const logger = getLogger('EventPublisher')

export class EventPublisher {
  private eventSeq = 0

  constructor(private gateway: GatewayServer) { }

  /**
   * 发布 message.created 事件
   */
  async publishMessageCreated(
    instanceId: number,
    msg: UnifiedMessage,
    _pair: unknown,
  ): Promise<void> {
    try {
      const platform = this.normalizePlatform(msg.platform)
      const threadId = platform === 'tg' ? this.extractThreadId(msg.metadata?.raw || msg) : undefined
      const channelId = this.buildChannelId(platform, msg.chat.type, msg.chat.id, threadId)
      const userId = this.buildUserId(platform, msg.sender.id)
      const messageId = this.buildMessageId(platform, msg.chat.id, msg.id)

      const event: MessageCreatedEvent = {
        seq: this.nextSeq(),
        type: 'message.created',
        instanceId,
        channelId,
        threadId: threadId ?? null,
        actor: {
          userId,
          name: msg.sender.name || 'Unknown',
        },
        message: {
          messageId,
          platform,
          threadId: threadId ?? null,
          native: this.extractNative(platform, msg, threadId),
          segments: this.convertToSegments(platform, msg),
          timestamp: msg.timestamp,
        },
      }

      await this.gateway.publishEvent(instanceId, event)

      logger.info(`Published message.created: ${messageId} in ${channelId}`)
    }
    catch (error: any) {
      logger.error('Failed to publish message.created:', error)
    }
  }

  /**
   * 构建 Channel ID
   * 格式:
   * - QQ: "qq:g:<group_id>" | "qq:p:<uin>"
   * - TG: "tg:c:<chat_id>" | "tg:c:<chat_id>:t:<thread_id>"
   */
  private buildChannelId(platform: 'qq' | 'tg', chatType: string, chatId: string, threadId?: number): string {
    if (platform === 'qq') {
      const prefix = chatType === 'private' ? 'p' : 'g'
      return `qq:${prefix}:${chatId}`
    }
    if (threadId)
      return `tg:c:${chatId}:t:${threadId}`
    return `tg:c:${chatId}`
  }

  /**
   * 构建 User ID
   * 格式: "qq:u:123456" 或 "tg:u:123456"
   */
  private buildUserId(platform: 'qq' | 'tg', userId: string): string {
    return `${platform}:u:${userId}`
  }

  /**
   * 构建 Message ID
   * 格式:
   * - QQ: "qq:m:<message_id>"
   * - TG: "tg:m:<chat_id>:<msg_id>"
   */
  private buildMessageId(platform: 'qq' | 'tg', chatId: string, msgId: string): string {
    if (platform === 'tg')
      return `tg:m:${chatId}:${msgId}`
    return `qq:m:${msgId}`
  }

  private normalizePlatform(platform: UnifiedMessage['platform']): 'qq' | 'tg' {
    return platform === 'telegram' ? 'tg' : 'qq'
  }

  private extractThreadId(raw: any): number | undefined {
    if (!raw)
      return undefined

    const replyTo = raw?.replyTo
    const candidates = [
      replyTo?.replyToTopId,
      raw?.replyToTopId,
      replyTo?.forumTopicId,
      replyTo?.topicId,
      replyTo?.replyToTopicId,
      replyTo?.replyToMsgId,
      raw?.replyToMsgId,
      raw?.topicId,
      raw?.forumTopicId,
      raw?.threadId,
      raw?.replyToThreadId,
      raw?.replyToTopMsgId,
      raw?.messageThreadId,
    ]

    if (raw?.raw) {
      const tlReplyTo = raw.raw.replyTo
      candidates.push(
        tlReplyTo?.replyToTopId,
        tlReplyTo?.replyToMsgId,
        tlReplyTo?.forumTopicId,
        tlReplyTo?.topicId,
        raw.raw?.replyToTopId,
        raw.raw?.topicId,
        raw.raw?.messageThreadId,
      )
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && candidate > 0)
        return candidate
    }
    return undefined
  }

  /**
   * 提取原始消息对象（简化版）
   */
  private extractNative(platform: 'qq' | 'tg', msg: UnifiedMessage, threadId?: number): any {
    if (platform === 'qq') {
      const raw = msg.metadata?.raw
      return {
        platform: 'qq',
        chatId: msg.chat.id,
        msgId: msg.id,
        senderId: msg.sender.id,
        timestamp: msg.timestamp,
        raw: raw && typeof raw === 'object' ? raw : undefined,
      }
    }

    // tg
    const chatIdNum = Number(msg.chat.id)
    const msgIdNum = Number(msg.id)
    const raw = msg.metadata?.raw as any
    const text = msg.content
      .filter(c => c.type === 'text')
      .map(c => (c.data as any)?.text || '')
      .join('')

    const reply = msg.content.find(c => c.type === 'reply') as any
    const replyToMsgId = reply?.data?.messageId ? String(reply.data.messageId) : undefined

    return {
      platform: 'tg',
      chatId: Number.isFinite(chatIdNum) ? chatIdNum : msg.chat.id,
      msgId: Number.isFinite(msgIdNum) ? msgIdNum : msg.id,
      threadId: threadId ?? null,
      senderId: msg.sender.id,
      timestamp: msg.timestamp,
      isTopicMessage: typeof raw?.isTopicMessage === 'boolean' ? raw.isTopicMessage : undefined,
      replyToMsgId,
      text: text || undefined,
      entities: Array.isArray(raw?.entities)
        ? raw.entities
            .filter((e: any) => e && typeof e === 'object' && (e.kind === 'mention' || e.kind === 'text_mention'))
            .map((e: any) => ({
              kind: e.kind,
              offset: e.offset,
              length: e.length,
              text: e.text,
              userId: e.kind === 'text_mention' ? e.params?.userId : undefined,
            }))
        : undefined,
    }
  }

  /**
   * 转换 UnifiedMessage.content 到 Gateway Segments
   */
  private convertToSegments(platform: 'qq' | 'tg', msg: UnifiedMessage): Segment[] {
    const chatId = msg.chat.id
    return msg.content.map((item) => {
      switch (item.type) {
        case 'text':
          return { type: 'text', data: { text: String(item.data?.text ?? '') } }

        case 'image': {
          const ref = this.extractMediaRef(item.data)
          return { type: 'image', data: { ...ref, width: item.data?.width, height: item.data?.height } }
        }

        case 'video': {
          const ref = this.extractMediaRef(item.data)
          return { type: 'video', data: { ...ref, duration: item.data?.duration } }
        }

        case 'audio': {
          const ref = this.extractMediaRef(item.data)
          return { type: 'audio', data: { ...ref, duration: item.data?.duration } }
        }

        case 'file': {
          const ref = this.extractMediaRef(item.data)
          return {
            type: 'file',
            data: {
              ...ref,
              name: item.data?.filename || item.data?.name,
              size: item.data?.size,
              mimeType: item.data?.mimeType,
            },
          }
        }

        case 'at': {
          const rawUserId = String(item.data?.userId ?? item.data?.targetId ?? item.data?.qq ?? item.data?.user ?? '')
          const name = String(item.data?.userName ?? item.data?.name ?? '').trim()
          if (!rawUserId)
            return { type: 'raw', data: { type: 'at', data: item.data } }
          if (platform === 'tg' && !/^\d+$/.test(rawUserId)) {
            const username = rawUserId.replace(/^@/, '').trim()
            return {
              type: 'at',
              data: {
                userId: `tg:username:${username || rawUserId}`,
                name: name || undefined,
                username: username || undefined,
              },
            }
          }
          return {
            type: 'at',
            data: {
              userId: this.buildUserId(platform, rawUserId),
              name: name || undefined,
            },
          }
        }

        case 'reply': {
          const replyRawId = String(item.data?.messageId ?? item.data?.id ?? '')
          if (!replyRawId)
            return { type: 'raw', data: { type: 'reply', data: item.data } }

          const messageId = platform === 'tg'
            ? this.buildMessageId('tg', chatId, replyRawId.replace(/^tg:m:[^:]+:/, ''))
            : this.buildMessageId('qq', chatId, replyRawId.replace(/^qq:m:/, ''))

          const senderId = item.data?.senderId ? String(item.data.senderId) : ''
          const senderName = item.data?.senderName ? String(item.data.senderName) : ''
          const sender = senderId
            ? { userId: this.buildUserId(platform, senderId), name: senderName || 'Unknown' }
            : undefined

          return {
            type: 'reply',
            data: {
              messageId,
              sender,
              text: item.data?.text ? String(item.data.text) : undefined,
            },
          }
        }

        case 'forward':
          return { type: 'forward', data: item.data }

        default:
          return { type: 'raw', data: { type: item.type, data: item.data } }
      }
    })
  }

  private extractMediaRef(data: any): { url?: string, fileId?: string, uniqueFileId?: string } {
    if (!data || typeof data !== 'object')
      return {}

    const urlCandidate = [data.url, data.file].find((v: any) => typeof v === 'string' && v.length > 0)
    const fileObj = data.file && typeof data.file === 'object' ? data.file : undefined
    const fileIdCandidate = [data.fileId, fileObj?.fileId].find((v: any) => typeof v === 'string' && v.length > 0)
    const uniqueFileIdCandidate = [data.uniqueFileId, fileObj?.uniqueFileId].find((v: any) => typeof v === 'string' && v.length > 0)

    return {
      url: urlCandidate,
      fileId: fileIdCandidate,
      uniqueFileId: uniqueFileIdCandidate,
    }
  }

  /**
   * 获取下一个事件序列号
   */
  private nextSeq(): number {
    return ++this.eventSeq
  }
}
