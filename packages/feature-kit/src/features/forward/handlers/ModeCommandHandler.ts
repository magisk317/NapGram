import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardModeService } from '../services/ForwardModeService'
import { getLogger } from '@napgram/infra-kit'
import { ThreadIdExtractor } from '../../commands/services/ThreadIdExtractor'

const logger = getLogger('ModeCommandHandler')

/**
 * /mode 命令处理器
 * 负责处理转发模式和昵称模式的配置命令
 */
export class ModeCommandHandler {
  constructor(
    private readonly modeService: ForwardModeService,
    private readonly replyTG: (chatId: string | number, text: string, threadId?: number) => Promise<void>,
  ) { }

  /**
   * 处理 /mode 命令
   */
  async handle(msg: UnifiedMessage, args: string[]): Promise<void> {
    const chatId = msg.chat.id
    // Use standard ThreadIdExtractor via imports
    const threadId = new ThreadIdExtractor().extractFromRaw((msg.metadata as any)?.raw)

    const type = args[0]
    const value = args[1]

    if (!type || !value || !/^[01]{2}$/.test(value)) {
      await this.replyTG(chatId, '用法：/mode <nickname|forward> <00|01|10|11>\n示例：/mode nickname 10 (QQ->TG显示昵称，TG->QQ不显示)', threadId)
      return
    }

    if (type === 'nickname') {
      this.modeService.setNicknameMode(value as any)
      await this.replyTG(chatId, `昵称显示模式已更新为: ${value}`, threadId)
      logger.info(`Nickname mode updated to: ${value}`)
    }
    else if (type === 'forward') {
      this.modeService.setForwardMode(value as any)
      await this.replyTG(chatId, `转发模式已更新为: ${value}`, threadId)
      logger.info(`Forward mode updated to: ${value}`)
    }
    else {
      await this.replyTG(chatId, '未知模式类型，请使用 nickname 或 forward', threadId)
    }
  }
}
