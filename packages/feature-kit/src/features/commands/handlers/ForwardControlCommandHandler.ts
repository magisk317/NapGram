import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'
import { db, schema, eq } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('ForwardControlCommandHandler')

/**
 * 转发控制命令处理器
 * 处理: forwardoff, forwardon, disable_qq_forward, enable_qq_forward, disable_tg_forward, enable_tg_forward
 */
export class ForwardControlCommandHandler {
  constructor(private readonly context: CommandContext) { }

  /**
   * 执行转发控制命令
   */
  async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
    // 只在 Telegram 端处理这些命令
    if (msg.platform !== 'telegram') {
      return
    }

    const chatId = msg.chat.id
    const threadId = this.context.extractThreadId(msg, args)

    // 查找当前绑定
    const forwardMap = this.context.instance.forwardPairs as ForwardMap
    const pair = forwardMap.findByTG(chatId, threadId, true)

    if (!pair) {
      await this.context.replyTG(chatId, '当前聊天未绑定任何 QQ 群', threadId)
      return
    }

    let newMode: string | null = null
    let message = ''

    switch (commandName) {
      case 'forwardoff':
        newMode = 'off'
        message = '✅ 已暂停双向转发'
        break
      case 'forwardon':
        newMode = null // null 表示正常转发
        message = '✅ 已恢复双向转发'
        break
      case 'disable_qq_forward':
        newMode = 'tg_only' // 只转发 TG -> QQ
        message = '✅ 已停止 QQ → TG 的转发'
        break
      case 'enable_qq_forward':
        newMode = null
        message = '✅ 已恢复 QQ → TG 的转发'
        break
      case 'disable_tg_forward':
        newMode = 'qq_only' // 只转发 QQ -> TG
        message = '✅ 已停止 TG → QQ 的转发'
        break
      case 'enable_tg_forward':
        newMode = null
        message = '✅ 已恢复 TG → QQ 的转发'
        break
      default:
        await this.context.replyTG(chatId, '未知命令', threadId)
        return
    }

    try {
      // 更新数据库
      await db.update(schema.forwardPair)
        .set({ forwardMode: newMode })
        .where(eq(schema.forwardPair.id, pair.id))

      // 更新内存中的记录
      pair.forwardMode = newMode

      const bindingInfo = `QQ ${pair.qqRoomId} ↔ TG ${pair.tgChatId}${threadId ? ` (话题 ${threadId})` : ''}`
      await this.context.replyTG(chatId, `${message}\n\n绑定信息：${bindingInfo}`, threadId)

      logger.info(`Forward control: ${commandName} for ${bindingInfo}, new mode: ${newMode || 'normal'}`)
    }
    catch (error) {
      logger.error('Failed to update forward mode:', error)
      await this.context.replyTG(chatId, '❌ 更新转发模式失败，请查看日志', threadId)
    }
  }
}
