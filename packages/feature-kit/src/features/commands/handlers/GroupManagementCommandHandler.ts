import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'
import { getLogger } from '@napgram/infra-kit'
import { DurationParser } from '../../../shared-types'
import { PermissionChecker } from '../../../shared-types'
import { CommandArgsParser } from '../utils/CommandArgsParser'

const logger = getLogger('GroupManagementCommandHandler')

/**
 * 群组管理命令处理器
 * 处理: ban, unban, kick, card
 */
export class GroupManagementCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const chatId = msg.chat.id
    // 不传args给extractThreadId,避免把QQ号当成thread ID
    const threadId = this.context.extractThreadId(msg, [])

    // 查找绑定关系
    const forwardMap = this.context.instance.forwardPairs as ForwardMap
    const pair = forwardMap.findByTG(chatId, threadId, true)

    if (!pair) {
      await this.context.replyTG(chatId, '❌ 当前聊天未绑定任何 QQ 群', threadId)
      return
    }

    const qqGroupId = pair.qqRoomId.toString()

    switch (commandName) {
      case 'ban':
        await this.handleBan(chatId, threadId, qqGroupId, msg, args)
        break
      case 'unban':
        await this.handleUnban(chatId, threadId, qqGroupId, msg, args)
        break
      case 'kick':
        await this.handleKick(chatId, threadId, qqGroupId, msg, args)
        break
      case 'card':
        await this.handleCard(chatId, threadId, qqGroupId, msg, args)
        break
    }
  }

  /**
   * 处理禁言命令
   */
  private async handleBan(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 1. 解析目标用户
      const targetUin = await this.resolveTargetUser(msg, args, 0)
      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n请使用以下方式指定用户：\n• 回复目标用户的消息\n• 直接输入QQ号：/ban 123456789 [时长]`,
          threadId,
        )
        return
      }

      // 2. 解析禁言时长（支持人性化格式：1m, 30m, 1h, 1d）
      let duration = DurationParser.DEFAULT_BAN_DURATION // 默认30分钟
      const durationArg = args[1] || args[0] // 可能在第0个或第1个位置

      if (durationArg && durationArg !== targetUin) {
        try {
          duration = DurationParser.parse(durationArg)

          if (duration > DurationParser.MAX_BAN_DURATION) {
            await this.context.replyTG(
              chatId,
              `❌ 禁言时长不能超过30天`,
              threadId,
            )
            return
          }
        }
        catch (error: any) {
          await this.context.replyTG(chatId, `❌ ${error.message}`, threadId)
          return
        }
      }

      // 3. 权限验证
      const botUin = this.context.qqClient.uin.toString()
      const canManage = await PermissionChecker.canManageUser(
        this.context.qqClient,
        qqGroupId,
        botUin,
        targetUin,
      )

      if (!canManage.canManage) {
        await this.context.replyTG(chatId, `❌ ${canManage.reason}`, threadId)
        return
      }

      // 4. 执行禁言
      const banUser = this.context.qqClient.banUser
      if (!banUser) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持禁言功能', threadId)
        return
      }

      await banUser.call(this.context.qqClient, qqGroupId, targetUin, duration)

      // 5. 获取用户信息并发送确认
      const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, targetUin)
      const userName = memberInfo?.card || memberInfo?.nickname || targetUin
      const durationStr = DurationParser.format(duration)

      await this.context.replyTG(
        chatId,
        `✅ 已禁言 ${userName}(${targetUin})\n时长：${durationStr}`,
        threadId,
      )

      logger.info(`Banned user ${targetUin} in group ${qqGroupId} for ${duration}s`)
    }
    catch (error: any) {
      logger.error('Failed to execute ban command:', error)
      await this.context.replyTG(chatId, `❌ 操作失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 处理解禁命令
   */
  private async handleUnban(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 1. 解析目标用户
      const targetUin = await this.resolveTargetUser(msg, args, 0)
      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n请使用以下方式指定用户：\n• 回复目标用户的消息\n• 直接输入QQ号：/unban 123456789`,
          threadId,
        )
        return
      }

      // 2. 权限验证
      const botUin = this.context.qqClient.uin.toString()
      const canManage = await PermissionChecker.canManageUser(
        this.context.qqClient,
        qqGroupId,
        botUin,
        targetUin,
      )

      if (!canManage.canManage) {
        await this.context.replyTG(chatId, `❌ ${canManage.reason}`, threadId)
        return
      }

      // 3. 执行解禁
      const unbanUser = this.context.qqClient.unbanUser
      if (!unbanUser) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持解禁功能', threadId)
        return
      }

      await unbanUser.call(this.context.qqClient, qqGroupId, targetUin)

      // 4. 发送确认
      const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, targetUin)
      const userName = memberInfo?.card || memberInfo?.nickname || targetUin

      await this.context.replyTG(
        chatId,
        `✅ 已解除 ${userName}(${targetUin}) 的禁言`,
        threadId,
      )

      logger.info(`Unbanned user ${targetUin} in group ${qqGroupId}`)
    }
    catch (error) {
      logger.error('Failed to execute unban command:', error)
      await this.context.replyTG(chatId, `❌ 操作失败：${(error as any).message || error}`, threadId)
    }
  }

  /**
   * 处理踢人命令
   */
  private async handleKick(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 1. 解析目标用户
      const targetUin = await this.resolveTargetUser(msg, args, 0)
      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n请使用以下方式指定用户：\n• 回复目标用户的消息\n• 直接输入QQ号：/kick 123456789`,
          threadId,
        )
        return
      }

      // 2. 权限验证
      const botUin = this.context.qqClient.uin.toString()
      const canManage = await PermissionChecker.canManageUser(
        this.context.qqClient,
        qqGroupId,
        botUin,
        targetUin,
      )

      if (!canManage.canManage) {
        await this.context.replyTG(chatId, `❌ ${canManage.reason}`, threadId)
        return
      }

      // 3. 执行踢出
      const kickUser = this.context.qqClient.kickUser
      if (!kickUser) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持踢人功能', threadId)
        return
      }

      // 获取用户信息（在踢出前，因为踢出后无法获取）
      const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, targetUin)
      const userName = memberInfo?.card || memberInfo?.nickname || targetUin

      await kickUser.call(this.context.qqClient, qqGroupId, targetUin, false)

      // 4. 发送确认
      await this.context.replyTG(
        chatId,
        `✅ 已将 ${userName}(${targetUin}) 移出群聊`,
        threadId,
      )

      logger.info(`Kicked user ${targetUin} from group ${qqGroupId}`)
    }
    catch (error) {
      logger.error('Failed to execute kick command:', error)
      await this.context.replyTG(chatId, `❌ 操作失败：${(error as any).message || error}`, threadId)
    }
  }

  /**
   * 处理设置群名片命令
   */
  private async handleCard(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 使用 CommandArgsParser 解析参数
      const hasReply = CommandArgsParser.hasReplyMessage(msg)
      const { uin: targetUin, content: newCard } = CommandArgsParser.parseUserContent(args, msg, hasReply)

      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/card 新名片\n• 直接指定：/card 123456789 新名片\n• 参数可互换：/card 新名片 123456789`,
          threadId,
        )
        return
      }

      if (!newCard || newCard.trim() === '') {
        await this.context.replyTG(chatId, '❌ 请输入新的群名片', threadId)
        return
      }

      // 2. 权限验证
      const botUin = this.context.qqClient.uin.toString()
      const isAdmin = await PermissionChecker.isGroupAdmin(this.context.qqClient, qqGroupId, botUin)

      if (!isAdmin) {
        await this.context.replyTG(chatId, '❌ 权限不足：需要管理员或群主权限', threadId)
        return
      }

      // 3. 执行设置
      const setGroupCard = this.context.qqClient.setGroupCard
      if (!setGroupCard) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持设置群名片功能', threadId)
        return
      }

      await setGroupCard.call(this.context.qqClient, qqGroupId, targetUin, newCard)

      // 4. 发送确认
      await this.context.replyTG(
        chatId,
        `✅ 已将 ${targetUin} 的群名片设置为：${newCard}`,
        threadId,
      )

      logger.info(`Set group card for user ${targetUin} in group ${qqGroupId} to: ${newCard}`)
    }
    catch (error) {
      logger.error('Failed to execute card command:', error)
      await this.context.replyTG(chatId, `❌ 操作失败：${(error as any).message || error}`, threadId)
    }
  }

  /**
   * 解析目标用户ID
   * @param msg 消息对象
   * @param args 命令参数
   * @param argIndex QQ号在参数中的位置
   * @returns 用户QQ号
，如果无法解析则返回null
   */
  private async resolveTargetUser(
    msg: UnifiedMessage,
    args: string[],
    argIndex: number,
  ): Promise<string | null> {
    // 1. 检查是否为回复消息
    const raw = (msg.metadata as any)?.raw as any

    // 先尝试从TG结构提取reply sender
    if (raw?.replyToMessage || raw?.replyTo) {
      const replyMsg = raw.replyToMessage || raw.replyTo
      if (replyMsg?.senderId) {
        return String(replyMsg.senderId)
      }
    }

    // 尝试从QQ结构（content中的reply段）提取
    const replyContent = msg.content.find(c => c.type === 'reply')
    if (replyContent) {
      const replyData = replyContent.data as any
      if (replyData.senderId) {
        return String(replyData.senderId)
      }
    }

    // 2. 从命令参数中提取
    const arg = args[argIndex]
    if (arg && /^\d+$/.test(arg)) {
      return arg
    }

    return null
  }

  /**
   * 检查消息是否为回复消息
   */
  private hasReplyMessage(msg: UnifiedMessage): boolean {
    const raw = (msg.metadata as any)?.raw as any
    if (raw?.replyToMessage || raw?.replyTo) {
      return true
    }
    return msg.content.some(c => c.type === 'reply')
  }
}
