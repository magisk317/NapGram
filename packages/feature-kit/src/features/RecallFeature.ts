import type { RecallEvent } from '@napgram/message-kit'
import type { Instance } from '../shared-types'
import type { IQQClient } from '../shared-types'
import type { Telegram } from '../shared-types'
import { db, schema, eq, and } from '@napgram/infra-kit'
import { env } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('RecallFeature')

/**
 * 消息撤回功能
 * Phase 3: 处理双向消息撤回
 */
export class RecallFeature {
  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
  ) {
    this.setupListeners()
    logger.info('RecallFeature ✓ 初始化完成')
  }

  /**
   * 设置事件监听器
   */
  private setupListeners() {
    // 监听 QQ 消息撤回
    this.qqClient.on('recall', this.handleQQRecall)

    // 监听 Telegram 消息删除
    this.tgBot.addDeletedMessageEventHandler(this.handleTGDelete)
  }

  /**
   * 处理 QQ 消息撤回
   */
  private handleQQRecall = async (event: RecallEvent) => {
    try {
      logger.info(`QQ message recalled: ${event.messageId}`)

      // 检查是否启用自动撤回
      if (!env.ENABLE_AUTO_RECALL) {
        logger.debug('Auto recall is disabled, skipping TG message deletion')
        return
      }

      // 查找对应的 Telegram 消息
      const dbEntry = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, this.instance.id),
          eq(schema.message.qqRoomId, BigInt(event.chatId)),
          eq(schema.message.seq, Number(event.messageId)),
        ),
      })

      if (!dbEntry) {
        logger.debug(`No corresponding TG message found for QQ message: ${event.messageId}`)
        return
      }

      // 删除 Telegram 消息
      try {
        const chat = await this.tgBot.getChat(Number(dbEntry.tgChatId))
        await chat.deleteMessages([dbEntry.tgMsgId])
        logger.info(`TG message ${dbEntry.tgMsgId} deleted successfully`)
      }
      catch (error) {
        logger.error(error, 'Failed to delete TG message:')
      }

      // 更新数据库
      await db.update(schema.message)
        .set({ ignoreDelete: true })
        .where(eq(schema.message.id, dbEntry.id))
    }
    catch (error) {
      logger.error(error, 'Failed to handle QQ recall:')
    }
  }

  /**
   * 处理 Telegram 消息删除（直接删除，非 /rm 命令）
   */
  private handleTGDelete = async (update: any) => {
    try {
      const chatId = update.channelId // mtcute 使用 channelId
      const messageIds = update.messages // 删除的消息 ID 数组

      if (!messageIds || !Array.isArray(messageIds)) {
        logger.debug('Invalid delete update: messageIds is missing or not an array')
        return
      }

      logger.info(`TG messages deleted in ${chatId}: ${messageIds.join(', ')}`)

      // 检查是否启用自动撤回
      if (!env.ENABLE_AUTO_RECALL) {
        logger.debug('Auto recall disabled, skipping QQ message recall')
        return
      }

      // 遍历所有被删除的消息
      for (const tgMsgId of messageIds) {
        try {
          // 查找对应的 QQ 消息
          const dbEntry = await db.query.message.findFirst({
            where: and(
              eq(schema.message.instanceId, this.instance.id),
              eq(schema.message.tgChatId, BigInt(chatId)),
              eq(schema.message.tgMsgId, Number(tgMsgId)),
            ),
          })

          if (!dbEntry) {
            logger.debug(`No corresponding QQ message found for TG message: ${tgMsgId}`)
            continue
          }

          if (!dbEntry.seq) {
            logger.debug(`No seq found for TG message: ${tgMsgId}`)
            continue
          }

          // 撤回 QQ 消息
          try {
            await this.qqClient.recallMessage(String(dbEntry.seq))
            logger.info(`QQ message ${dbEntry.seq} recalled after TG message ${tgMsgId} deleted`)
          }
          catch (error) {
            logger.warn(error, `Failed to recall QQ message ${dbEntry.seq}:`)
          }
        }
        catch (error) {
          logger.error(error, `Failed to process deleted TG message ${tgMsgId}:`)
        }
      }
    }
    catch (error) {
      logger.error(error, 'Failed to handle TG delete:')
    }
  }

  /**
   * 处理 Telegram 消息撤回
   */
  async handleTGRecall(tgChatId: number, tgMsgId: number) {
    try {
      logger.info(`TG message recall requested: ${tgMsgId}`)

      // 查找对应的 QQ 消息
      const dbEntry = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, this.instance.id),
          eq(schema.message.tgChatId, BigInt(tgChatId)),
          eq(schema.message.tgMsgId, tgMsgId),
        ),
      })

      if (!dbEntry || !dbEntry.seq) {
        logger.debug(`No corresponding QQ message found for TG message: ${tgMsgId}`)
        return
      }

      // 撤回 QQ 消息
      try {
        await this.qqClient.recallMessage(String(dbEntry.seq))
        logger.info(`QQ message ${dbEntry.seq} recalled`)
      }
      catch (error) {
        logger.error('Failed to recall QQ message:', error)
      }

      // 更新数据库
      await db.update(schema.message)
        .set({ ignoreDelete: true })
        .where(eq(schema.message.id, dbEntry.id))
    }
    catch (error) {
      logger.error('Failed to handle TG recall:', error)
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    this.qqClient.off('recall', this.handleQQRecall)
    this.tgBot.removeDeletedMessageEventHandler(this.handleTGDelete)
    logger.info('RecallFeature destroyed')
  }
}
