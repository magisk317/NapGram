import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from './CommandContext'
import { db, schema, eq, and, lt, desc, getLogger, env } from '@napgram/infra-kit'

const logger = getLogger('RecallCommandHandler')

/**
 * 撤回命令处理器
 */
export class RecallCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
    const raw = (msg.metadata as any)?.raw as any
    const cmdMsgId = raw?.id || msg.id

    // 检查是否有数字参数（批量撤回）
    const count = args[0] ? Number.parseInt(args[0]) : 0

    if (count > 0) {
      // 批量撤回模式
      await this.handleBatchRecall(msg, count, cmdMsgId)
      return
    }

    // 单条撤回模式（回复消息）
    await this.handleSingleRecall(msg, cmdMsgId)
  }

  /**
   * 处理批量撤回
   */
  private async handleBatchRecall(msg: UnifiedMessage, count: number, cmdMsgId: string | number) {
    const chatId = msg.chat.id
    const senderId = msg.sender.id

    // 只在 Telegram 端处理批量撤回
    if (msg.platform !== 'telegram') {
      await this.context.replyTG(chatId, '批量撤回仅支持 Telegram 端')
      return
    }

    // 检查权限
    const isAdmin = this.context.permissionChecker.isAdmin(String(senderId))
    if (!isAdmin) {
      await this.context.replyTG(chatId, '批量撤回需要管理员权限')
      return
    }

    // 限制最大撤回数量
    const maxCount = 100
    if (count > maxCount) {
      await this.context.replyTG(chatId, `批量撤回最多支持 ${maxCount} 条消息`)
      return
    }

    try {
      logger.info(`批量撤回: cmdMsgId=${cmdMsgId}, chatId=${chatId}, count=${count}`)

      // 获取命令消息之前的N条消息（不包括命令消息本身）
      const records = await db.query.message.findMany({
        where: and(
          eq(schema.message.tgChatId, BigInt(chatId)),
          eq(schema.message.instanceId, this.context.instance.id),
          lt(schema.message.tgMsgId, Number(cmdMsgId)),
        ),
        orderBy: [desc(schema.message.tgMsgId)],
        limit: count,
      })

      logger.info(`查询到 ${records.length} 条记录, tgMsgIds: ${records.map(r => r.tgMsgId).join(', ')}`)

      if (records.length === 0) {
        await this.context.replyTG(chatId, '没有找到可撤回的消息')
        return
      }

      // 收集所有需要删除的 TG 消息 ID
      const tgMessageIds: number[] = []
      const qqSeqList: string[] = []

      for (const record of records) {
        if (record.tgMsgId) {
          tgMessageIds.push(record.tgMsgId)
        }
        if (record.seq && env.ENABLE_AUTO_RECALL) {
          qqSeqList.push(String(record.seq))
        }
      }

      // 先撤回 QQ 端（批量）
      let qqSuccess = 0
      for (const seq of qqSeqList) {
        try {
          await this.context.qqClient.recallMessage(seq)
          qqSuccess++
          logger.info(`QQ message ${seq} recalled by /rm batch command`)
        }
        catch (e) {
          logger.warn(`撤回 QQ 消息 ${seq} 失败:`, e)
        }
      }

      // 再批量删除 TG 端（循环单个删除，因为批量API返回undefined）
      let tgSuccess = 0
      if (tgMessageIds.length > 0) {
        logger.info(`准备批量删除 TG 消息: chatId=${chatId}, messageIds=${tgMessageIds.join(', ')}`)
        const chat = await this.context.tgBot.getChat(Number(chatId))

        // 循环删除每条消息（单条删除是可靠的）
        for (const msgId of tgMessageIds) {
          try {
            await chat.deleteMessages([msgId])
            tgSuccess++
            logger.info(`TG message ${msgId} deleted successfully`)
          }
          catch (e) {
            logger.warn(`删除 TG 消息 ${msgId} 失败:`, e)
          }
        }

        logger.info(`批量删除完成: 成功 ${tgSuccess}/${tgMessageIds.length}`)
      }

      logger.info(`批量撤回完成: TG ${tgSuccess}/${records.length}, QQ ${qqSuccess}/${records.length}`)

      // 删除命令消息
      if (cmdMsgId) {
        try {
          const chat = await this.context.tgBot.getChat(Number(chatId))
          await chat.deleteMessages([Number(cmdMsgId)])
        }
        catch {
          logger.debug('删除命令消息失败')
        }
      }
    }
    catch (error) {
      logger.error('批量撤回失败:', error)
      await this.context.replyTG(chatId, '❌ 批量撤回失败，请查看日志')
    }
  }

  /**
   * 处理单条撤回（原有逻辑，双向同步）
   */
  private async handleSingleRecall(msg: UnifiedMessage, cmdMsgId: string | number) {
    const raw = (msg.metadata as any)?.raw as any

    // 提取 replyToId：
    // 1. TG 消息：从 raw.replyTo 中提取
    // 2. QQ 消息：从 content 中的 reply 段提取
    let replyToId: number | undefined

    // 先尝试 TG 结构
    replyToId = raw?.replyTo?.replyToMsgId
      || raw?.replyTo?.id
      || raw?.replyTo?.replyToTopId
      || raw?.replyToMessage?.id

    // 如果 TG 结构没找到，尝试 QQ 结构
    if (!replyToId) {
      const replyContent = msg.content.find(c => c.type === 'reply')
      if (replyContent) {
        const replyData = replyContent.data as any
        replyToId = Number(replyData.messageId || replyData.id || replyData.seq)
      }
    }

    const chatId = msg.chat.id
    const senderId = msg.sender.id

    if (!replyToId || !chatId) {
      await this.context.replyTG(chatId, '请回复要撤回的消息再使用 /rm，或使用 /rm <数字> 批量撤回')
      return
    }

    // 根据消息平台使用不同的查询策略
    let record
    if (msg.platform === 'qq') {
      // QQ 消息：replyToId 是 QQ 的 seq
      record = await db.query.message.findFirst({
        where: and(
          eq(schema.message.qqRoomId, BigInt(chatId)),
          eq(schema.message.seq, replyToId),
          eq(schema.message.instanceId, this.context.instance.id),
        ),
      })
    }
    else {
      // TG 消息：replyToId 是 TG 的 msgId
      record = await db.query.message.findFirst({
        where: and(
          eq(schema.message.tgChatId, BigInt(chatId)),
          eq(schema.message.tgMsgId, replyToId),
          eq(schema.message.instanceId, this.context.instance.id),
        ),
      })
    }

    const isAdmin = this.context.permissionChecker.isAdmin(String(senderId))
    const isSelf = record?.tgSenderId ? String(record.tgSenderId) === String(senderId) : false

    if (!isAdmin && !isSelf) {
      await this.context.replyTG(chatId, '无权限撤回他人消息')
      return
    }

    // 检查是否是 bot 的命令回复（级联删除触发命令）
    let triggerCommandId: number | undefined
    if (msg.platform === 'telegram' && raw?.replyToMessage) {
      const replyToMsg = raw.replyToMessage
      // 检查被回复的消息是否来自 bot 自己
      const self = await this.context.tgBot.client.call({ _: 'users.getUsers', id: [{ _: 'inputUserSelf' }] })
      const botId = self[0].id
      if (replyToMsg.senderId === botId) {
        // 这是 bot 的回复，查找它回复的那条消息（可能是触发命令）
        if (replyToMsg.replyTo?.replyToMsgId) {
          triggerCommandId = replyToMsg.replyTo.replyToMsgId
          logger.info(`检测到级联删除: bot回复${replyToId} 的触发命令是 ${triggerCommandId}`)
        }
      }
    }

    // 双向撤回逻辑
    // 撤回 QQ 端
    if (msg.platform === 'qq') {
      // QQ 端发起：撤回 QQ 原消息
      try {
        await this.context.qqClient.recallMessage(String(replyToId))
        logger.info(`QQ message ${replyToId} recalled by /rm command`)
      }
      catch (e) {
        logger.warn(e, `撤回 QQ 消息 ${replyToId} 失败`)
      }

      // 删除对应的 TG 消息
      if (record?.tgMsgId && record?.tgChatId) {
        try {
          const chat = await this.context.tgBot.getChat(Number(record.tgChatId))
          await chat.deleteMessages([record.tgMsgId])
          logger.info(`TG message ${record.tgMsgId} deleted by QQ /rm command`)
        }
        catch (e) {
          logger.warn(e, '删除 TG 消息失败')
        }
      }
    }
    else {
      // TG 端发起：删除 TG 原消息
      try {
        const chat = await this.context.tgBot.getChat(Number(chatId))
        await chat.deleteMessages([replyToId])
        logger.info(`TG message ${replyToId} deleted by /rm command`)
      }
      catch (e) {
        logger.warn(e, '撤回 TG 消息失败')
      }

      // 撤回对应的 QQ 消息
      if (record?.seq && env.ENABLE_AUTO_RECALL) {
        try {
          await this.context.qqClient.recallMessage(String(record.seq))
          logger.info(`QQ message ${record.seq} recalled by /rm command`)
        }
        catch (e) {
          logger.warn(e, '撤回 QQ 消息失败')
        }
      }

      // 级联删除：如果有触发命令，也删除它
      if (triggerCommandId) {
        try {
          const chat = await this.context.tgBot.getChat(Number(chatId))
          await chat.deleteMessages([triggerCommandId])
          logger.info(`级联删除触发命令: TG message ${triggerCommandId} deleted`)

          // 同时撤回触发命令对应的 QQ 消息
          const triggerRecord = await db.query.message.findFirst({
            where: and(
              eq(schema.message.tgChatId, BigInt(chatId)),
              eq(schema.message.tgMsgId, triggerCommandId),
              eq(schema.message.instanceId, this.context.instance.id),
            ),
          })
          if (triggerRecord?.seq && env.ENABLE_AUTO_RECALL) {
            try {
              await this.context.qqClient.recallMessage(String(triggerRecord.seq))
              logger.info(`级联撤回触发命令的 QQ 消息: ${triggerRecord.seq}`)
            }
            catch (e) {
              logger.warn('级联撤回 QQ 消息失败:', e)
            }
          }
        }
        catch (e) {
          logger.warn('级联删除触发命令失败:', e)
        }
      }
    }

    // 尝试删除命令消息自身
    if (cmdMsgId) {
      try {
        const chat = await this.context.tgBot.getChat(Number(chatId))
        await chat.deleteMessages([Number(cmdMsgId)])
      }
      catch (e) {
        logger.warn(e, '删除命令消息失败')
      }
    }
  }
}
