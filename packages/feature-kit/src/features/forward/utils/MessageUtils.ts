import type { UnifiedMessage } from '@napgram/message-kit'
import type { Instance } from '../../../shared-types'
import type { IQQClient } from '../../../shared-types'
import type { Telegram } from '../../../shared-types'
import { env } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('MessageUtils')

/**
 * Utility functions for message processing
 */
export class MessageUtils {
  /**
   * Populate @mention display names in QQ messages.
   * Priority: group card > nickname > QQ ID
   */
  static async populateAtDisplayNames(msg: UnifiedMessage, qqClient: IQQClient): Promise<void> {
    if (msg.chat.type !== 'group') {
      return
    }

    const nameCache = new Map<string, string>()
    for (const content of msg.content) {
      if (content.type !== 'at') {
        continue
      }

      const userId = String(content.data?.userId ?? '')
      if (!userId || userId === 'all') {
        continue
      }

      const cached = nameCache.get(userId)
      if (cached) {
        content.data.userName = cached
        continue
      }

      const providedName = (content.data?.userName || '').trim()
      if (providedName && providedName !== userId) {
        nameCache.set(userId, providedName)
        content.data.userName = providedName
        continue
      }

      try {
        const memberInfo = await qqClient.getGroupMemberInfo(msg.chat.id, userId)
        const card = memberInfo?.card?.trim()
        const nickname = memberInfo?.nickname?.trim()
        const resolvedName = card || nickname || userId

        content.data.userName = resolvedName
        nameCache.set(userId, resolvedName)
      }
      catch (error) {
        logger.warn(error, `Failed to resolve @ mention name for ${userId} in group ${msg.chat.id}`)
        content.data.userName = providedName || userId
        nameCache.set(userId, content.data.userName)
      }
    }
  }

  /**
   * Check if a user is an admin
   */
  static isAdmin(userId: string, instance: Instance): boolean {
    const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null
    const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null
    return userId === String(instance.owner)
      || !!(envAdminQQ && userId === envAdminQQ)
      || !!(envAdminTG && userId === envAdminTG)
  }

  /**
   * Send a reply message to Telegram
   */
  static async replyTG(
    tgBot: Telegram,
    chatId: string | number,
    text: string,
    replyTo?: any,
  ): Promise<void> {
    try {
      // Ensure numeric chat IDs are passed as numbers to avoid being treated as usernames
      const resolvedChatId = (typeof chatId === 'string' && /^-?\d+$/.test(chatId))
        ? Number(chatId)
        : chatId

      const chat = await tgBot.getChat(resolvedChatId)
      const params: any = { linkPreview: { disable: true } }
      if (replyTo) {
        params.replyTo = replyTo
        // Force implicit thread routing if replyTo is treated as threadId
        params.messageThreadId = Number(replyTo)
      }
      await chat.sendMessage(text, params)
    }
    catch (error) {
      logger.warn('Failed to send TG reply:', error)
    }
  }
}
