import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'
import { md } from '@mtcute/markdown-parser'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('InfoCommandHandler')

/**
 * Info 命令处理器
 * 显示当前聊天的绑定信息和消息详情
 */
export class InfoCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const chatId = msg.chat.id
    const threadId = this.context.extractThreadId(msg, args)

    // 查找绑定关系
    const forwardMap = this.context.instance.forwardPairs as ForwardMap
    const pair = forwardMap.findByTG(chatId, threadId, true)

    if (!pair) {
      await this.context.replyTG(chatId, '❌ 当前聊天未绑定任何 QQ 群', threadId)
      return
    }

    // 构建绑定信息 - 使用 mtcute 的 md 标签模板（Markdown格式）
    const qqRoomId = pair.qqRoomId.toString()
    const tgChatId = pair.tgChatId.toString()
    const tgThreadId = pair.tgThreadId?.toString()

    // 转发模式
    const forwardMode = pair.forwardMode || 'normal'
    let modeText = ''
    switch (forwardMode) {
      case 'off':
        modeText = '❌ 已暂停'
        break
      case 'qq_only':
        modeText = '⬆️ 仅 QQ → TG'
        break
      case 'tg_only':
        modeText = '⬇️ 仅 TG → QQ'
        break
      default:
        modeText = '✅ 双向正常'
    }

    // 使用 md 标签模板构建消息（Markdown格式）
    let info = md`**📊 绑定信息**

🔗 QQ 群号: \`${qqRoomId}\`
🔗 TG 聊天 ID: \`${tgChatId}\``

    if (tgThreadId) {
      info = md`${info}
🔗 TG 话题 ID: \`${tgThreadId}\``
    }

    info = md`${info}

📡 转发状态: ${modeText}`

    // 昵称模式
    if (pair.nicknameMode) {
      info = md`${info}
👤 昵称模式: \`${pair.nicknameMode}\``
    }

    // 如果有ignore规则
    if (pair.ignoreRegex) {
      info = md`${info}
🚫 忽略正则: \`${pair.ignoreRegex}\``
    }
    if (pair.ignoreSenders) {
      info = md`${info}
🚫 忽略发送者: \`${pair.ignoreSenders}\``
    }

    // 检查是否回复了某条消息
    const raw = (msg.metadata as any)?.raw
    if (raw?.replyTo) {
      const replyId = (raw.replyTo.replyToMsgId || raw.replyTo).toString()
      info = md`${info}

**📬 回复的消息信息**
消息 ID: \`${replyId}\``
    }

    await this.context.replyTG(chatId, info, threadId)
    logger.debug(`Info command executed for TG ${chatId}, thread ${threadId}`)
  }
}
