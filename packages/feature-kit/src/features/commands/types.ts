import type { UnifiedMessage } from '@napgram/message-kit'

/**
 * 命令处理函数类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>

/**
 * 命令定义
 */
export interface Command {
  name: string
  aliases?: string[]
  description: string
  usage?: string
  handler: CommandHandler
  adminOnly?: boolean
}

/**
 * 待处理的交互式命令
 */
export interface PendingAction {
  action: 'bind' | 'unbind'
  threadId?: number
}
