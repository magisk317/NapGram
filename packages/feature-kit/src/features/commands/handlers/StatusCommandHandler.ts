import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from './CommandContext'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('StatusCommandHandler')

/**
 * 状态命令处理器
 */
export class StatusCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, _args: string[]): Promise<void> {
    const isOnline = await this.context.qqClient.isOnline()
    const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.context.qqClient.uin}
- 昵称: ${this.context.qqClient.nickname}
- 客户端类型: ${this.context.qqClient.clientType}
        `.trim()

    await this.context.replyTG(msg.chat.id, status)
    logger.info('Status command executed')
  }
}
