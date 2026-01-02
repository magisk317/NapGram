import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('UnbindCommandHandler')

/**
 * 解绑命令处理器
 */
export class UnbindCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const qqGroupId = args.length === 1 ? args[0] : undefined
    const chatId = msg.chat.id
    const forwardMap = this.context.instance.forwardPairs as ForwardMap
    const threadId = this.context.extractThreadId(msg, args)

    const target = qqGroupId && /^-?\d+$/.test(qqGroupId)
      ? forwardMap.findByQQ(qqGroupId)
      : forwardMap.findByTG(chatId, threadId, !threadId)

    if (!target) {
      await this.context.replyTG(chatId, '未找到绑定关系', threadId)
      return
    }

    await forwardMap.remove(target.qqRoomId)
    const threadInfo = target.tgThreadId ? ` (话题 ${target.tgThreadId})` : ''
    await this.context.replyTG(chatId, `已解绑：QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`, threadId || target.tgThreadId || undefined)
    logger.info(`Unbind command: QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`)
  }
}
