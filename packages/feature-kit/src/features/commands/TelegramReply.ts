import type { Telegram } from '../../shared-types'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('TelegramReply')

/**
 * Telegram 回复工具类
 * 封装向 Telegram 发送消息的逻辑，处理话题 ID 和回复参数
 */
export class TelegramReply {
  constructor(private readonly tgBot: Telegram) { }

  /**
   * 向 Telegram 发送回复消息
   * @param chatId 聊天 ID
   * @param text 消息文本
   * @param threadId 话题 ID（可选）
   * @param raw 原始消息对象（用于提取话题信息）
   */
  async send(chatId: string | number, text: string, threadId?: number, raw?: any): Promise<void> {
    try {
      // 尝试将数字字符串转换为数字，避免 mtcute 将其误认为 username
      let peer: string | number = chatId
      if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
        peer = Number(chatId)
      }

      const rawThread = this.getThreadIdFromRaw(raw)
      const rawIdCandidate = raw as any
      const rawId
        = typeof rawIdCandidate?.id === 'number'
          ? rawIdCandidate.id
          : typeof rawIdCandidate?.messageId === 'number'
            ? rawIdCandidate.messageId
            : typeof rawIdCandidate?.msgId === 'number'
              ? rawIdCandidate.msgId
              : undefined

      // 如果未解析到话题 ID，兜底用当前命令消息 ID 回复，保证留在同一话题
      const effectiveThread = threadId ?? rawThread ?? rawId

      logger.debug({
        chatId: peer,
        effectiveThread,
        threadId,
        rawThread,
        rawId,
        rawReplyTo: raw?.replyTo,
        rawTopicId: (raw as any)?.topicId,
        rawForumTopicId: (raw as any)?.forumTopicId,
        rawThreadId: (raw as any)?.threadId,
        rawReplyToThreadId: (raw as any)?.replyToThreadId,
        rawReplyToTopId: (raw as any)?.replyToTopId,
        rawMessageId: rawIdCandidate?.messageId,
        rawMsgId: rawIdCandidate?.msgId,
        rawKeys: raw ? Object.keys(raw) : [],
      }, 'TelegramReply params')

      const chat = await this.tgBot.getChat(peer as any)
      const params: any = { linkPreview: { disable: true } }
      if (effectiveThread) {
        params.replyTo = effectiveThread
        params.replyToTopId = effectiveThread
      }
      await chat.sendMessage(text, params)
    }
    catch (error) {
      logger.warn(error, 'Failed to send reply:')
    }
  }

  /**
   * 从原始 TG 消息中提取话题 ID
   */
  private getThreadIdFromRaw(raw: any): number | undefined {
    if (!raw)
      return undefined
    const replyTo = raw?.replyTo
    const candidates = [
      replyTo?.replyToTopId,
      replyTo?.replyToMsgId,
      replyTo?.forumTopicId,
      replyTo?.topicId,
      replyTo?.replyToTopicId,
      (raw as any).replyToTopId,
      (raw as any).replyToMsgId,
      (raw as any).topicId,
      (raw as any).forumTopicId,
      (raw as any).threadId,
      (raw as any).replyToThreadId,
      (raw as any).replyToTopMsgId,
      (raw as any).messageThreadId,
    ]
    for (const c of candidates) {
      if (typeof c === 'number' && c > 0)
        return c
    }
    return undefined
  }
}
