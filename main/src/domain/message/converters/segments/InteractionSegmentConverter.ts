import type { MessageContent } from '../../types'
import qface from '../../../constants/qface'

/**
 * 交互类型消息段转换器（@、表情、骰子等）
 */
export class InteractionSegmentConverter {
  convertAt(data: any): MessageContent {
    return {
      type: 'at',
      data: {
        userId: String(data.qq),
        userName: data.name || '',
      },
    }
  }

  convertFace(data: any): MessageContent {
    const faceTextRaw = (data.raw?.faceText || '').toString()
    const isDiceFace = /骰/.test(faceTextRaw)
    const isRpsFace = /猜拳|石头|剪刀|[布✊✌✋]/.test(faceTextRaw)

    if (isDiceFace) {
      return {
        type: 'dice',
        data: {
          emoji: '🎲',
        },
      }
    }
    if (isRpsFace) {
      return {
        type: 'dice',
        data: {
          emoji: '✊✋✌️',
        },
      }
    }

    const faceId = Number(data.id)
    const faceText = typeof data.raw?.faceText === 'string'
      ? data.raw.faceText
      : (qface as Record<number, string>)[faceId]
    return {
      type: 'face',
      data: {
        id: faceId,
        text: faceText,
      },
    }
  }

  convertDice(data: any): MessageContent {
    return {
      type: 'dice',
      data: {
        emoji: '🎲',
        value: Number(data.result),
      },
    }
  }

  convertRps(data: any): MessageContent {
    return {
      type: 'dice',
      data: {
        emoji: '✊✋✌️',
        value: Number(data.result),
      },
    }
  }

  convertLocation(data: any): MessageContent {
    return {
      type: 'location',
      data: {
        latitude: Number(data.lat ?? data.latitude ?? 0),
        longitude: Number(data.lng ?? data.longitude ?? 0),
        title: data.title,
        address: data.address,
      },
    }
  }

  convertReply(data: any): MessageContent {
    return {
      type: 'reply',
      data: {
        messageId: String(data.id),
        senderId: '',
        senderName: '',
      },
    }
  }
}
