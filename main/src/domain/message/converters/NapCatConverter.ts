import type { MessageContent, UnifiedMessage } from '../types'
import { BaseConverter } from './BaseConverter'
import { InteractionSegmentConverter } from './segments/InteractionSegmentConverter'
import { JsonCardConverter } from './segments/JsonCardConverter'
import { MediaSegmentConverter } from './segments/MediaSegmentConverter'
import { TextSegmentConverter } from './segments/TextSegmentConverter'

export class NapCatConverter extends BaseConverter {
  private textConverter = new TextSegmentConverter()
  private mediaConverter = new MediaSegmentConverter()
  private interactionConverter = new InteractionSegmentConverter()
  private jsonCardConverter = new JsonCardConverter()

  /**
   * 从 NapCat 消息转换为统一格式
   */
  fromNapCat(napCatMsg: any): UnifiedMessage {
    this.logger.debug(`[Forward][QQ->TG] Converting from NapCat: ${napCatMsg.message_id}`)
    this.logger.debug(`Converting NapCat message segments:\n${JSON.stringify(napCatMsg.message, null, 2)}`)

    const content: MessageContent[] = []

    // 解析消息内容
    if (napCatMsg.message) {
      for (const segment of napCatMsg.message) {
        const converted = this.convertNapCatSegment(segment, napCatMsg)
        if (!converted)
          continue
        if (Array.isArray(converted)) {
          content.push(...converted)
        }
        else {
          content.push(converted)
        }
      }
    }

    // 提取发送者名称：优先使用群名片，如果为空则使用昵称
    const senderCard = napCatMsg.sender?.card?.trim()
    const senderNickname = napCatMsg.sender?.nickname?.trim()
    const senderName = (senderCard && senderCard.length > 0) ? senderCard : (senderNickname || 'Unknown')

    return {
      id: String(napCatMsg.message_id),
      platform: 'qq',
      sender: {
        id: String(napCatMsg.sender?.user_id || napCatMsg.user_id),
        name: senderName,
        avatar: napCatMsg.sender?.avatar,
      },
      chat: {
        id: String(napCatMsg.group_id || napCatMsg.user_id),
        type: napCatMsg.message_type === 'group' ? 'group' : 'private',
        name: napCatMsg.group_name,
      },
      content,
      timestamp: napCatMsg.time * 1000,
      metadata: {
        raw: napCatMsg,
        messageType: napCatMsg.message_type,
        subType: napCatMsg.sub_type,
      },
    }
  }

  private convertNapCatSegment(segment: any, rawMsg?: any): MessageContent | MessageContent[] | null {
    this.logger.debug(`Converting segment:\n${JSON.stringify(segment, null, 2)}`)
    const data: any = segment?.data || {}
    const type = (segment?.type || '') as string
    const rawMessage: string | undefined = rawMsg?.raw_message

    switch (type) {
      // Text types
      case 'text':
        return this.textConverter.convertText(data)

      case 'share':
        return this.textConverter.convertShare(data, rawMessage)

      case 'poke':
        return this.textConverter.convertPoke(data)

      case 'markdown':
        return this.textConverter.convertMarkdown(data, segment)

        // Media types
      case 'image':
        return this.mediaConverter.convertImage(data)

      case 'video':
        return this.mediaConverter.convertVideo(data, rawMessage)

      case 'record':
        return this.mediaConverter.convertAudio(data)

      case 'flash':
        return this.mediaConverter.convertFlash(data)

      case 'file':
        return this.mediaConverter.convertFile(data, rawMessage)

      case 'mface':
        return this.mediaConverter.convertSticker(data)

        // Interaction types
      case 'at':
        return this.interactionConverter.convertAt(data)

      case 'face':
        return this.interactionConverter.convertFace(data)

      case 'location':
        return this.interactionConverter.convertLocation(data)

      case 'dice':
        return this.interactionConverter.convertDice(data)

      case 'rps':
        return this.interactionConverter.convertRps(data)

      case 'reply':
        return this.interactionConverter.convertReply(data)

        // Complex types
      case 'json': {
        const converted = this.jsonCardConverter.convertJsonCard(data)
        if (converted) {
          return converted
        }
        const fallback = typeof data.data === 'string' ? data.data : JSON.stringify(segment.data)
        return {
          type: 'text',
          data: {
            text: this.truncateText(fallback),
          },
        }
      }

      case 'forward':
        // 转发消息需要特殊处理
        // QQ 只发送 ResID, 实际内容需要调用 getForwardMsg API
        // 这里只保存元数据，内容由下游处理器获取
        return {
          type: 'forward',
          data: {
            id: data.id, // ResID for fetching actual content later
            // Note: messages will be populated by calling getForwardMsg with this id
            messages: [], // Empty until fetched
          },
        }

      default:
        this.logger.warn({ type }, 'Unknown NapCat segment type:')
        return null
    }
  }

  private truncateText(text: string, maxLength = 500): string {
    if (!text)
      return ''
    if (text.length <= maxLength)
      return text
    return `${text.slice(0, maxLength - 3)}...`
  }
}
