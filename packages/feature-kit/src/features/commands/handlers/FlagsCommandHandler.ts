import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from './CommandContext'
import { db, sql } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('FlagsCommandHandler')

/**
 * Flags 命令处理器
 * 管理实验性功能标志
 */
export class FlagsCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const chatId = msg.chat.id
    const senderId = msg.sender.id
    const threadId = this.context.extractThreadId(msg, args)

    // 检查管理员权限
    if (!this.context.permissionChecker.isAdmin(String(senderId))) {
      await this.context.replyTG(chatId, '❌ 需要管理员权限才能管理功能标志', threadId)
      return
    }

    if (args.length === 0) {
      // 显示所有功能标志
      await this.showAllFlags(chatId, threadId)
      return
    }

    const action = args[0].toLowerCase()
    const flagName = args[1]

    switch (action) {
      case 'enable':
      case 'on':
        if (!flagName) {
          await this.context.replyTG(chatId, '用法: /flags enable <flag_name>', threadId)
          return
        }
        await this.setFlag(chatId, threadId, flagName, true)
        break

      case 'disable':
      case 'off':
        if (!flagName) {
          await this.context.replyTG(chatId, '用法: /flags disable <flag_name>', threadId)
          return
        }
        await this.setFlag(chatId, threadId, flagName, false)
        break

      case 'list':
        await this.showAllFlags(chatId, threadId)
        break

      default:
        await this.context.replyTG(
          chatId,
          `⚙️ **实验性功能标志管理**\n\n用法:\n`
          + `/flags list - 查看所有标志\n`
          + `/flags enable <name> - 启用标志\n`
          + `/flags disable <name> - 禁用标志`,
          threadId,
        )
    }
  }

  /**
   * 显示所有功能标志
   */
  private async showAllFlags(chatId: string, threadId: number | undefined) {
    const instanceId = this.context.instance.id

    try {
      // 从environment/config表获取所有flags
      // 这里使用一个简单的键值对方案
      const flags = await db.execute(sql`
                SELECT key, value FROM instance_flags WHERE instance_id = ${instanceId}
            `).then(res => res.rows as unknown as Array<{ key: string, value: boolean }>).catch(() => [] as Array<{ key: string, value: boolean }>)

      let message = `⚙️ **实验性功能标志**\n\n`

      if (flags.length === 0) {
        message += `当前没有启用任何实验性功能\n\n`
      }
      else {
        for (const flag of flags) {
          const status = flag.value ? '✅ 已启用' : '❌ 已禁用'
          message += `\`${flag.key}\` - ${status}\n`
        }
        message += `\n`
      }

      message += `⚠️ **警告**: 实验性功能可能不稳定！\n`
      message += `\n可用标志（示例）:\n`
      message += `• \`experimental_forward_optimization\` - 转发优化\n`
      message += `• \`debug_mode\` - 调试模式`

      await this.context.replyTG(chatId, message, threadId)
    }
    catch (error) {
      logger.error('Failed to list flags:', error)
      await this.context.replyTG(chatId, '❌ 获取功能标志失败', threadId)
    }
  }

  /**
   * 设置功能标志
   */
  private async setFlag(chatId: string, threadId: number | undefined, flagName: string, enabled: boolean) {
    const instanceId = this.context.instance.id

    try {
      // 这里需要实际的数据库表支持
      // TODO: 创建 instance_flags 表存储功能标志

      // 临时方案：使用内存存储（重启失效）
      if (!(this.context.instance as any)._flagsStore) {
        (this.context.instance as any)._flagsStore = new Map<string, boolean>()
      }

      (this.context.instance as any)._flagsStore.set(flagName, enabled)

      const status = enabled ? '✅ 已启用' : '❌ 已禁用'
      await this.context.replyTG(
        chatId,
        `${status} 功能标志: \`${flagName}\`\n\n⚠️ 当前使用内存存储，重启后失效\n建议实现持久化存储`,
        threadId,
      )

      logger.info(`Flag ${flagName} ${enabled ? 'enabled' : 'disabled'} for instance ${instanceId}`)
    }
    catch (error) {
      logger.error('Failed to set flag:', error)
      await this.context.replyTG(chatId, '❌ 设置功能标志失败', threadId)
    }
  }

  /**
   * 检查功能标志是否启用
   */
  static isEnabled(instance: any, flagName: string): boolean {
    if (!instance._flagsStore) {
      return false
    }
    return instance._flagsStore.get(flagName) === true
  }
}
