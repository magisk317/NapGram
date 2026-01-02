import type { UnifiedMessage } from '@napgram/message-kit'

/**
 * 命令参数解析工具
 * 提供灵活的参数解析，支持各种参数顺序和类型
 */
export class CommandArgsParser {
  /**
   * 解析带QQ号和开关状态的命令参数
   * 支持参数顺序互换，无参数时返回切换模式
   * @returns 解析结果（QQ号与操作类型）
   */
  static parseUserAction(
    args: string[],
    msg: UnifiedMessage,
    hasReply: boolean,
  ): { uin: string | null, action: 'on' | 'off' | 'toggle' } {
    let uin: string | null = null
    let action: 'on' | 'off' | 'toggle' = 'toggle'

    // 从回复消息提取QQ号
    if (hasReply) {
      uin = this.extractUinFromReply(msg)
      // 参数是on/off
      if (args.length > 0) {
        action = this.parseAction(args[0])
      }
    }
    else {
      // 没有回复，从args中解析
      for (const arg of args) {
        const actionResult = this.parseAction(arg)
        if (actionResult !== 'toggle') {
          action = actionResult
        }
        else if (this.isValidUin(arg)) {
          uin = arg
        }
      }
    }

    return { uin, action }
  }

  /**
   * 解析带QQ号和文本内容的命令参数（如card, title）
   * @returns 解析结果（QQ号与文本内容）
   */
  static parseUserContent(
    args: string[],
    msg: UnifiedMessage,
    hasReply: boolean,
  ): { uin: string | null, content: string } {
    let uin: string | null = null
    let contentParts: string[] = []

    if (hasReply) {
      uin = this.extractUinFromReply(msg)
      // 所有参数都是内容
      contentParts = args
    }
    else {
      // 提取QQ号（通常是第一个数字参数）
      const uinIndex = args.findIndex(arg => this.isValidUin(arg))
      if (uinIndex !== -1) {
        uin = args[uinIndex]
        // 其余参数是内容
        contentParts = [...args.slice(0, uinIndex), ...args.slice(uinIndex + 1)]
      }
      else {
        // 没找到QQ号，全部当内容
        contentParts = args
      }
    }

    return { uin, content: contentParts.join(' ') }
  }

  /**
   * 解析点赞命令参数：QQ号 + 次数
   * @returns 解析结果（QQ号与次数）
   */
  static parseLikeArgs(
    args: string[],
    msg: UnifiedMessage,
    hasReply: boolean,
  ): { uin: string | null, times: number } {
    let uin: string | null = null
    let times = 1

    if (hasReply) {
      uin = this.extractUinFromReply(msg)
      // 参数是次数
      if (args.length > 0) {
        const parsed = Number.parseInt(args[0])
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
          times = parsed
        }
      }
    }
    else {
      // 从args中找QQ号和次数
      let foundUin = false
      let foundTimes = false

      for (const arg of args) {
        if (this.isValidUin(arg) && !foundUin) {
          uin = arg
          foundUin = true
        }
        else if (!foundTimes) {
          const parsed = Number.parseInt(arg)
          if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
            times = parsed
            foundTimes = true
          }
        }
      }
    }

    return { uin, times }
  }

  /**
   * 从回复消息中提取QQ号
   */
  private static extractUinFromReply(msg: UnifiedMessage): string | null {
    const raw = (msg.metadata as any)?.raw as any

    // 尝试从TG结构提取
    if (raw?.replyToMessage || raw?.replyTo) {
      const replyMsg = raw.replyToMessage || raw.replyTo
      if (replyMsg?.senderId) {
        return String(replyMsg.senderId)
      }
    }

    // 尝试从QQ结构提取
    const replyContent = msg.content.find(c => c.type === 'reply')
    if (replyContent) {
      const replyData = replyContent.data as any
      if (replyData.senderId) {
        return String(replyData.senderId)
      }
    }

    return null
  }

  /**
   * 解析操作类型（on/off）
   */
  private static parseAction(arg: string): 'on' | 'off' | 'toggle' {
    const lower = arg.toLowerCase()
    if (lower === 'on' || lower === '开')
      return 'on'
    if (lower === 'off' || lower === '关')
      return 'off'
    return 'toggle'
  }

  /**
   * 验证是否为有效的QQ号
   */
  private static isValidUin(arg: string): boolean {
    return /^\d{5,11}$/.test(arg)
  }

  /**
   * 检查消息是否为回复消息
   */
  static hasReplyMessage(msg: UnifiedMessage): boolean {
    const raw = (msg.metadata as any)?.raw as any

    // 检查TG的replyToMessage或replyTo字段
    if (raw) {
      // 必须有实际的replyToMessage对象
      // 但要排除 isForumTopic=true 的情况（那是thread context，不是reply）
      if (raw.replyToMessage && raw.replyToMessage.id) {
        // 如果是 forum topic 的 thread 上下文，不算 reply
        if (raw.replyToMessage.isForumTopic) {
          return false
        }
        // 检查是否有实际的sender（真正的reply会有）
        if (raw.replyToMessage.sender || raw.replyToMessage.chat) {
          return true
        }
      }
      if (raw.replyTo && raw.replyTo.replyToMsgId) {
        return true
      }
    }

    // 检查content中的reply类型
    return msg.content.some(c => c.type === 'reply')
  }
}
