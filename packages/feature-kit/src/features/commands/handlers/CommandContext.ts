import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { Instance } from '../../../shared-types'
import type { IQQClient } from '../../../shared-types'
import type { Telegram } from '../../../shared-types'
import type { CommandRegistry } from '../services/CommandRegistry'
import type { InteractiveStateManager } from '../services/InteractiveStateManager'
import type { PermissionChecker } from '../services/PermissionChecker'
import { env } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('CommandContext')

/**
 * 命令处理器上下文 - 包含所有命令处理器需要的依赖
 */
export class CommandContext {
  constructor(
    public readonly instance: Instance,
    public readonly tgBot: Telegram,
    public readonly qqClient: IQQClient,
    public readonly registry: CommandRegistry,
    public readonly permissionChecker: PermissionChecker,
    public readonly stateManager: InteractiveStateManager,
    public readonly replyTG: (chatId: string | number, text: any, threadId?: number) => Promise<void>,
    public readonly extractThreadId: (msg: UnifiedMessage, args: string[]) => number | undefined,
  ) { }

  /**
   * 回复到QQ
   */
  async replyQQ(roomId: string, text: string): Promise<void> {
    try {
      const msg: UnifiedMessage = {
        id: `bot_reply_${Date.now()}`,
        platform: 'qq',
        sender: {
          id: String(this.qqClient.uin),
          name: 'Bot',
        },
        chat: {
          id: roomId,
          type: 'group',
        },
        content: [
          {
            type: 'text',
            data: { text },
          },
        ],
        timestamp: Date.now(),
      }

      await this.qqClient.sendMessage(roomId, msg)
    }
    catch (error) {
      logger.error(`Failed to reply to QQ ${roomId}:`, error)
    }
  }

  /**
   * 获取指定 pair 的命令回复模式配置
   * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
   */
  private getCommandReplyMode(pair: any): string {
    return pair?.commandReplyMode ?? (env.COMMAND_REPLY_BOTH_SIDES ? '1' : '0')
  }

  /**
   * 判断是否应该双向回复
   */
  private shouldReplyBothSides(pair: any): boolean {
    const mode = this.getCommandReplyMode(pair)
    return mode === '1'
  }

  /**
   * 双向回复 - 同时回复到TG和QQ
   * 如果找不到配对群，则只回复到发起平台
   * @param msg 消息对象
   * @param text 回复文本
   * @param commandName 命令名称（用于过滤），如 "help", "status"
   */
  async replyBoth(msg: UnifiedMessage, text: string, commandName?: string): Promise<void> {
    const platform = msg.platform
    const forwardMap = this.instance.forwardPairs as ForwardMap

    if (platform === 'telegram') {
      // 来自 TG，回复到 TG
      const threadId = this.extractThreadId(msg, [])
      await this.replyTG(msg.chat.id, text, threadId)

      // 查找配对的 QQ 群
      const pair = forwardMap.findByTG(msg.chat.id, threadId, !threadId)
      if (pair && this.shouldReplyBothSides(pair)) {
        // 检查命令过滤
        if (commandName && !this.isCommandAllowed(pair, commandName)) {
          logger.debug(`Command "${commandName}" filtered out by ${pair.commandReplyFilter} for pair ${pair.id}`)
          return
        }

        logger.debug(`Replying to paired QQ group: ${pair.qqRoomId}`)
        await this.replyQQ(String(pair.qqRoomId), text)
      }
      else if (!pair) {
        logger.debug('No paired QQ group found, reply to TG only')
      }
      else {
        logger.debug(`Command reply mode disabled for pair ${pair.id}`)
      }
    }
    else if (platform === 'qq') {
      // 来自 QQ，回复到 QQ
      await this.replyQQ(msg.chat.id, text)

      // 查找配对的 TG 群
      const pair = forwardMap.findByQQ(msg.chat.id)
      if (pair && this.shouldReplyBothSides(pair)) {
        // 检查命令过滤
        if (commandName && !this.isCommandAllowed(pair, commandName)) {
          logger.debug(`Command "${commandName}" filtered out by ${pair.commandReplyFilter} for pair ${pair.id}`)
          return
        }

        logger.debug(`Replying to paired TG chat: ${pair.tgChatId}`)
        await this.replyTG(
          Number(pair.tgChatId),
          text,
          pair.tgThreadId || undefined,
        )
      }
      else if (!pair) {
        logger.debug('No paired TG chat found, reply to QQ only')
      }
      else {
        logger.debug(`Command reply mode disabled for pair ${pair.id}`)
      }
    }
  }

  /**
   * 检查命令是否允许双向回复
   * @param pair 配对信息
   * @param commandName 命令名称（不含前缀，如 "help" 而不是 "/help"）
   */
  private isCommandAllowed(pair: any, commandName: string): boolean {
    const filter = pair.commandReplyFilter
    const list = pair.commandReplyList

    // 没有配置过滤规则，允许所有命令
    if (!filter || !list) {
      return true
    }

    // 解析命令列表
    const commands = list.split(',').map((cmd: string) => cmd.trim().toLowerCase())
    const normalizedCommand = commandName.toLowerCase()

    if (filter === 'whitelist') {
      // 白名单模式：只有在列表中的命令才转发
      const allowed = commands.includes(normalizedCommand)
      logger.debug(`Whitelist check for "${commandName}": ${allowed ? 'allowed' : 'denied'}`)
      return allowed
    }
    else if (filter === 'blacklist') {
      // 黑名单模式：列表中的命令不转发
      const blocked = commands.includes(normalizedCommand)
      logger.debug(`Blacklist check for "${commandName}": ${blocked ? 'denied' : 'allowed'}`)
      return !blocked
    }

    // 未知过滤模式，默认允许
    return true
  }
}
