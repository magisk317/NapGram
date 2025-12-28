/**
 * Gateway 动作执行器
 * 执行来自 Gateway 客户端的动作请求
 */

import type { InputText } from '@mtcute/core'
import type { tl } from '@mtcute/node'
import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '@napgram/qq-client'
import type Telegram from '@napgram/telegram-client'
import type { MessageSendResult } from '../protocol/actions'
import type { Segment } from '../protocol/events'
import { getLogger } from '../logger'

const logger = getLogger('ActionExecutor')

export class ActionExecutor {
  constructor(
    private readonly qqClient: IQQClient,
    private readonly tgBot: Telegram,
  ) { }

  /**
   * 执行动作
   */
  async execute(action: string, params: any): Promise<any> {
    logger.info(`Executing action: ${action}`)

    switch (action) {
      case 'message.send':
        return await this.sendMessage(params)

        // Phase 2: 更多动作
        // case 'channel.list':
        //     return await this.listChannels(params);
        // case 'user.info':
        //     return await this.getUserInfo(params);

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  /**
   * message.send - 发送消息
   */
  private async sendMessage(params: {
    channelId: string
    segments: Segment[]
    reply?: string
  }): Promise<MessageSendResult> {
    const parsed = this.parseChannelId(params.channelId)
    if (parsed.platform === 'qq') {
      return await this.sendToQQ(parsed.id, params.segments)
    }
    if (parsed.platform === 'tg') {
      return await this.sendToTG(parsed.id, parsed.threadId, params.segments)
    }
    throw new Error(`Unknown platform: ${parsed.platform}`)
  }

  private parseChannelId(channelId: string): { platform: 'qq' | 'tg', id: string, threadId?: number } {
    // Supported:
    // - qq:g:<id>, qq:p:<id>, qq:c:<id> (legacy)
    // - tg:c:<chatId>, tg:c:<chatId>:t:<threadId>
    const parts = channelId.split(':')
    const platformRaw = parts[0]
    const platform = platformRaw === 'telegram' ? 'tg' : (platformRaw as any)
    if (platform !== 'qq' && platform !== 'tg') {
      throw new Error(`Invalid channelId platform: ${platformRaw}`)
    }

    if (platform === 'qq') {
      const id = parts[2] ?? parts[1]
      if (!id)
        throw new Error(`Invalid qq channelId: ${channelId}`)
      return { platform, id }
    }

    // tg
    const chatId = parts[2]
    if (!chatId)
      throw new Error(`Invalid tg channelId: ${channelId}`)
    let threadId: number | undefined
    if (parts.length >= 5 && parts[3] === 't') {
      const num = Number(parts[4])
      if (Number.isFinite(num))
        threadId = num
    }
    return { platform, id: chatId, threadId }
  }

  /**
   * 发送到 QQ
   */
  private async sendToQQ(roomId: string, segments: Segment[]): Promise<MessageSendResult> {
    try {
      // 转换 Segments → MessageContent[]
      const content = this.segmentsToMessageContent(segments)

      // 构建 UnifiedMessage (简化版)
      const msg: Partial<UnifiedMessage> = {
        platform: 'qq',
        chat: { id: roomId, type: 'group', name: '' },
        sender: { id: String(this.qqClient.uin), name: 'Bot' },
        content,
        timestamp: Date.now(),
      }

      // 发送消息
      const result = await this.qqClient.sendMessage(roomId, msg as UnifiedMessage)

      logger.info(`Message sent to QQ: ${roomId}`)

      return {
        messageId: `qq:m:${result?.messageId || Date.now()}`,
        platform: 'qq',
        timestamp: Date.now(),
      }
    }
    catch (error: any) {
      logger.error('Failed to send QQ message:', error)
      throw new Error(`Failed to send QQ message: ${error.message}`)
    }
  }

  /**
   * 发送到 Telegram
   */
  private async sendToTG(chatId: string, threadId: number | undefined, segments: Segment[]): Promise<MessageSendResult> {
    try {
      const chatIdNum = Number(chatId)

      const chat = await this.tgBot.getChat(chatIdNum)

      const params: any = {}
      if (threadId)
        params.messageThreadId = threadId

      // reply：优先使用 segments 中的 reply
      const replySeg = segments.find(s => s?.type === 'reply')
      if (replySeg?.data?.messageId) {
        const replyTo = this.extractTgMsgId(String(replySeg.data.messageId), chatId)
        if (replyTo)
          params.replyTo = replyTo
      }
      else if (threadId) {
        // forums/topics: using top message id (threadId) as reply target helps Telegram route message into the topic
        // while still allowing explicit reply to override it above.
        params.replyTo = threadId
      }

      const text = this.buildTgInputTextFromSegments(segments)
      if (!text) {
        throw new Error('No text content to send')
      }

      const result = await chat.sendMessage(text, params)

      logger.info(`Message sent to TG: ${chatId}`)

      return {
        messageId: `tg:m:${chatId}:${result.id}`,
        platform: 'tg',
        timestamp: Date.now(),
      }
    }
    catch (error: any) {
      logger.error('Failed to send TG message:', error)
      throw new Error(`Failed to send TG message: ${error.message}`)
    }
  }

  private extractTgMsgId(messageId: string, fallbackChatId: string): number | undefined {
    const raw = String(messageId || '').trim()
    if (!raw)
      return undefined

    // tg:m:<chatId>:<msgId>
    const m = raw.match(/^tg:m:([^:]+):(\d+)$/)
    if (m)
      return Number(m[2])

    // numeric string
    if (/^\d+$/.test(raw))
      return Number(raw)

    // maybe tg messageId with different shape -> take last numeric
    const tail = raw.split(':').pop()
    if (tail && /^\d+$/.test(tail))
      return Number(tail)

    // allow "tg:m::<msgId>" etc (fallback)
    const fallback = `${fallbackChatId}:${raw}`
    const m2 = fallback.match(/^([^:]+):(\d+)$/)
    if (m2)
      return Number(m2[2])

    return undefined
  }

  private buildTgInputTextFromSegments(segments: Segment[]): InputText | '' {
    let text = ''
    const entities: tl.TypeMessageEntity[] = []

    for (const seg of segments) {
      if (!seg)
        continue

      if (seg.type === 'text') {
        const part = seg.data?.text != null ? String(seg.data.text) : ''
        if (part)
          text += part
        continue
      }

      if (seg.type === 'at') {
        const rawUserId = String(seg.data?.userId ?? '').trim()
        const display = String(seg.data?.name ?? seg.data?.username ?? '').trim()

        // tg:username:xxx -> plain @xxx (Telegram will parse it)
        const username = rawUserId.match(/^tg:username:(.+)$/)?.[1]
          || (rawUserId.startsWith('@') ? rawUserId.slice(1) : '')
        if (username) {
          text += `@${username}`
          continue
        }

        // tg:u:123 / 123 -> mention link entity (equivalent to <a href="tg://user?id=123">name</a>)
        const id = rawUserId.match(/^tg:u:(\d+)$/)?.[1] || (/^\d+$/.test(rawUserId) ? rawUserId : '')
        if (id) {
          const label = display || `user${id}`
          const offset = text.length
          text += label
          entities.push({
            _: 'messageEntityTextUrl',
            offset,
            length: label.length,
            url: `tg://user?id=${id}`,
          } as any)
          continue
        }

        // fallback: render as-is
        if (display)
          text += `@${display}`
        else if (rawUserId)
          text += rawUserId
        continue
      }

      // reply 仅用于 params.replyTo，不拼进文本
    }

    if (!text)
      return ''
    return entities.length ? { text, entities } : text
  }

  /**
   * 转换 Segments → MessageContent[]
   */
  private segmentsToMessageContent(segments: Segment[]): MessageContent[] {
    return segments.map((seg) => {
      switch (seg.type) {
        case 'text':
          return { type: 'text', data: { text: seg.data.text } }

        case 'image':
          return { type: 'image', data: { url: seg.data.url } }

        case 'video':
          return { type: 'video', data: { url: seg.data.url } }

        case 'audio':
          return { type: 'audio', data: { url: seg.data.url } }

        case 'file':
          return {
            type: 'file',
            data: {
              url: seg.data.url,
              filename: seg.data.name || seg.data.filename || 'file',
              size: seg.data.size,
            },
          }

        case 'at':
        {
          const id = String(seg.data?.userId ?? '')
          const rawId = id.startsWith('qq:u:') ? id.slice('qq:u:'.length) : id
          return {
            type: 'at',
            data: {
              userId: rawId,
              userName: String(seg.data?.name ?? seg.data?.userName ?? ''),
            },
          }
        }

        case 'reply':
          return {
            type: 'reply',
            data: {
              messageId: String(seg.data?.messageId ?? ''),
              senderId: String(seg.data?.sender?.userId ?? ''),
              senderName: String(seg.data?.sender?.name ?? ''),
              text: seg.data?.text ? String(seg.data.text) : undefined,
            },
          }

        default:
          logger.warn(`Unknown segment type: ${seg.type}`)
          return { type: seg.type as any, data: seg.data }
      }
    })
  }
}
