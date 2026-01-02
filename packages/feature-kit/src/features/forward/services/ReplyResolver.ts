import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMapper } from './MessageMapper'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('ReplyResolver')

/**
 * 回复消息解析服务
 * 负责解析和查找回复消息的映射关系
 */
export class ReplyResolver {
  constructor(private readonly mapper: ForwardMapper) { }

  /**
   * 从 QQ 消息中提取并解析回复的 TG 消息 ID
   */
  async resolveQQReply(
    msg: UnifiedMessage,
    instanceId: number,
    qqRoomId: bigint,
  ): Promise<number | undefined> {
    const replyContent = msg.content.find(c => c.type === 'reply')
    if (!replyContent || replyContent.type !== 'reply') {
      return undefined
    }

    const qqMsgId = replyContent.data.messageId
    const tgMsgId = await this.mapper.findTgMsgId(instanceId, qqRoomId, qqMsgId)

    if (tgMsgId) {
      logger.debug(`Resolved QQ reply: QQ msg ${qqMsgId} -> TG msg ${tgMsgId}`)
    }

    return tgMsgId
  }

  /**
   * 从 TG 消息中提取并解析回复的 QQ 消息
   */
  async resolveTGReply(
    tgMsg: any,
    instanceId: number,
    tgChatId: number,
  ): Promise<{ seq?: number, qqRoomId?: bigint, senderUin?: string, time?: number } | undefined> {
    // mtcute uses replyToMessage, not replyTo
    const replyToMsgId = tgMsg.replyToMessage?.id
    if (!replyToMsgId) {
      return undefined
    }

    const qqSource = await this.mapper.findQqSource(instanceId, tgChatId, replyToMsgId)
    if (qqSource) {
      logger.debug(`Resolved TG reply: TG msg ${replyToMsgId} -> QQ seq ${qqSource.seq}`)
      return {
        seq: qqSource.seq,
        qqRoomId: qqSource.qqRoomId,
        senderUin: qqSource.qqSenderId?.toString(),
        time: qqSource.time,
      }
    }

    return undefined
  }
}
