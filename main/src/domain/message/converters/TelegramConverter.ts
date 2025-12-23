import type { Message } from '@mtcute/core'
import type { MessageContent, UnifiedMessage } from '../types'
import { BaseConverter } from './BaseConverter'

export class TelegramConverter extends BaseConverter {
  /**
   * 从 Telegram 消息转换为统一格式
   */
  fromTelegram(tgMsg: Message): UnifiedMessage {
    this.logger.debug(tgMsg.id, 'Converting from Telegram:')

    const content: MessageContent[] = []
    // Reply (quote)
    if (tgMsg.replyToMessage) {
      const reply = tgMsg.replyToMessage
      content.push({
        type: 'reply',
        data: {
          messageId: String(reply.id),
          senderId: String((reply.sender as any)?.id || ''),
          senderName: reply.sender?.displayName || 'Unknown',
          text: (reply as any).text || '',
        },
      })
    }

    // Text + mentions
    content.push(...this.convertTextWithMentions(tgMsg))

    const media = tgMsg.media

    if (media) {
      if (media.type === 'photo') {
        content.push({
          type: 'image',
          data: {
            file: media, // mtcute Photo object
            // url: media.full?.url, // mtcute doesn't expose URL directly for private media
          },
        })
      }
      else if (media.type === 'video') {
        content.push({
          type: 'video',
          data: {
            file: media,
            duration: media.duration,
          },
        })
      }
      else if (media.type === 'voice') {
        content.push({
          type: 'audio',
          data: {
            file: media,
            duration: media.duration,
          },
        })
      }
      else if (media.type === 'audio') {
        content.push({
          type: 'audio',
          data: {
            file: media,
            duration: media.duration,
          },
        })
      }
      else if (media.type === 'document') {
        // Check if it's a GIF (mime type)
        if (media.mimeType === 'image/gif') {
          content.push({
            type: 'image',
            data: {
              file: media,
              isSpoiler: false,
            },
          })
        }
        else {
          content.push({
            type: 'file',
            data: {
              file: media,
              filename: media.fileName || 'file',
              size: media.fileSize,
            },
          })
        }
      }
      else if (media.type === 'sticker') {
        // Treat sticker as image (or file if animated?)
        // For now, let's treat as image/file
        content.push({
          type: 'image',
          data: {
            file: media,
          },
        })
      }
    }

    const senderId = String(tgMsg.sender?.id ?? 'unknown')
    const senderName = tgMsg.sender?.displayName || 'Unknown'
    const chatId = String(tgMsg.chat?.id ?? 'unknown')
    const timestamp = tgMsg.date.getTime()

    return {
      id: String(tgMsg.id),
      platform: 'telegram',
      sender: {
        id: senderId,
        name: senderName,
      },
      chat: {
        id: chatId,
        type: (tgMsg.chat?.type as string) === 'private' ? 'private' : 'group',
      },
      content,
      timestamp,
      metadata: {
        raw: tgMsg,
      },
    }
  }

  private convertTextWithMentions(tgMsg: Message): MessageContent[] {
    const text = tgMsg.text || ''
    if (!text)
      return []

    const entities = Array.from(tgMsg.entities || [])
    const mentionEntities = entities
      .filter(e => e.is('mention') || e.is('text_mention'))
      .sort((a, b) => a.offset - b.offset)

    if (mentionEntities.length === 0) {
      return [{
        type: 'text',
        data: { text },
      }]
    }

    const segments: MessageContent[] = []
    let cursor = 0

    for (const entity of mentionEntities) {
      const start = Math.max(0, Math.min(text.length, entity.offset))
      const end = Math.max(start, Math.min(text.length, entity.offset + entity.length))

      if (start > cursor) {
        const before = text.slice(cursor, start)
        if (before) {
          segments.push({ type: 'text', data: { text: before } })
        }
      }

      const entityText = text.slice(start, end)
      if (entity.is('text_mention')) {
        segments.push({
          type: 'at',
          data: {
            userId: String(entity.params.userId),
            userName: entityText || 'Unknown',
          },
        })
      }
      else if (entity.is('mention')) {
        const username = entityText.replace(/^@/, '').trim()
        segments.push({
          type: 'at',
          data: {
            userId: username || entityText,
            userName: username || entityText || 'Unknown',
          },
        })
      }

      cursor = end
    }

    if (cursor < text.length) {
      const tail = text.slice(cursor)
      if (tail)
        segments.push({ type: 'text', data: { text: tail } })
    }

    return segments.length ? segments : [{ type: 'text', data: { text } }]
  }
}
