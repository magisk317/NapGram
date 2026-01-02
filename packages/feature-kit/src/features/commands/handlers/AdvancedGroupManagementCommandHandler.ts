import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'
import { PermissionChecker } from '../../../shared-types'
import { getLogger } from '@napgram/infra-kit'
import { CommandArgsParser } from '../utils/CommandArgsParser'

const logger = getLogger('AdvancedGroupManagementCommandHandler')

/**
 * 高级群组管理命令处理器
 * Phase 2: 处理 muteall, admin, groupname, title
 */
export class AdvancedGroupManagementCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const chatId = msg.chat.id
    // 不传args给extractThreadId,避免把参数当成thread ID
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
      case 'muteall':
      case 'unmuteall':
      case '全员禁言':
        await this.handleMuteAll(chatId, threadId, qqGroupId, msg, args, commandName)
        break
      case 'admin':
        await this.handleSetAdmin(chatId, threadId, qqGroupId, msg, args)
        break
      case 'groupname':
      case '改群名':
        await this.handleGroupName(chatId, threadId, qqGroupId, msg, args)
        break
      case 'title':
      case '头衔':
        await this.handleSpecialTitle(chatId, threadId, qqGroupId, msg, args)
        break
    }
  }

  /**
   * 处理全员禁言命令
   */
  private async handleMuteAll(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
    commandName: string,
  ) {
    try {
      // 1. 权限验证 - 仅群主
      const botUin = this.context.qqClient.uin.toString()
      const isOwner = await PermissionChecker.isGroupOwner(this.context.qqClient, qqGroupId, botUin)

      if (!isOwner) {
        await this.context.replyTG(chatId, '❌ 权限不足：此操作仅限群主使用', threadId)
        return
      }

      // 2. 解析开关状态
      let enable: boolean
      const action = args[0]?.toLowerCase()

      if (action === 'on' || action === '开') {
        enable = true
      }
      else if (action === 'off' || action === '关') {
        enable = false
      }
      else if (action === 'toggle') {
        // TODO: 可以查询当前状态并切换，但NapLink似乎没有get_group_info的全员禁言字段
        await this.context.replyTG(
          chatId,
          '❌ 请明确指定操作：on/off 或 开/关',
          threadId,
        )
        return
      }
      else {
        // 如果是 unmuteall 命令，默认关闭禁言
        // 否则默认开启禁言
        enable = commandName !== 'unmuteall'
      }

      // 3. 执行操作
      const setGroupWholeBan = this.context.qqClient.setGroupWholeBan
      if (!setGroupWholeBan) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持全员禁言功能', threadId)
        return
      }

      await setGroupWholeBan.call(this.context.qqClient, qqGroupId, enable)

      // 4. 发送确认
      if (enable) {
        await this.context.replyTG(
          chatId,
          `✅ 已开启全员禁言\n管理员和群主不受影响`,
          threadId,
        )
      }
      else {
        await this.context.replyTG(
          chatId,
          `✅ 已关闭全员禁言\n所有成员可正常发言`,
          threadId,
        )
      }

      logger.info(`Set group whole ban in ${qqGroupId}: ${enable}`)
    }
    catch (error: any) {
      logger.error('Failed to execute muteall command:', error)
      await this.context.replyTG(chatId, `❌ 全员禁言操作失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 处理设置管理员命令
   */
  private async handleSetAdmin(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 1. 权限验证 - 仅群主
      const botUin = this.context.qqClient.uin.toString()
      const isOwner = await PermissionChecker.isGroupOwner(this.context.qqClient, qqGroupId, botUin)

      if (!isOwner) {
        await this.context.replyTG(chatId, '❌ 权限不足：此操作仅限群主使用', threadId)
        return
      }

      // 2. 使用 CommandArgsParser 解析参数
      const hasReply = CommandArgsParser.hasReplyMessage(msg)
      const { uin: targetUin, action } = CommandArgsParser.parseUserAction(args, msg, hasReply)

      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/admin [on|off]\n• 直接指定：/admin 123456789 [on|off]\n•参数可互换：/admin on 123456789\n• 无参数切换状态`,
          threadId,
        )
        return
      }

      // 3. 处理操作类型
      if (action === 'toggle') {
        // TODO: 查询当前状态并切换
        await this.context.replyTG(
          chatId,
          '❌ 暂不支持状态切换，请明确指定 on 或 off',
          threadId,
        )
        return
      }
      const enable = action === 'on'

      // 4. 执行操作
      const setGroupAdmin = this.context.qqClient.setGroupAdmin
      if (!setGroupAdmin) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持设置管理员功能', threadId)
        return
      }

      await setGroupAdmin.call(this.context.qqClient, qqGroupId, targetUin, enable)

      // 5. 发送确认
      const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, targetUin)
      const userName = memberInfo?.card || memberInfo?.nickname || targetUin

      if (enable) {
        await this.context.replyTG(
          chatId,
          `✅ 已将 ${userName}(${targetUin}) 设置为管理员`,
          threadId,
        )
      }
      else {
        await this.context.replyTG(
          chatId,
          `✅ 已取消 ${userName}(${targetUin}) 的管理员身份`,
          threadId,
        )
      }

      logger.info(`Set admin for user ${targetUin} in group ${qqGroupId}: ${enable}`)
    }
    catch (error: any) {
      logger.error('Failed to execute admin command:', error)
      await this.context.replyTG(chatId, `❌ 设置管理员失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 处理修改群名命令
   */
  private async handleGroupName(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 1. 权限验证 - 群主或管理员
      const botUin = this.context.qqClient.uin.toString()
      const isAdmin = await PermissionChecker.isGroupAdmin(this.context.qqClient, qqGroupId, botUin)

      if (!isAdmin) {
        await this.context.replyTG(chatId, '❌ 权限不足：需要管理员或群主权限', threadId)
        return
      }

      // 2. 解析新群名
      const newGroupName = args.join(' ')
      if (!newGroupName || newGroupName.trim() === '') {
        await this.context.replyTG(
          chatId,
          '❌ 请输入新的群名称\n\n使用方式：/groupname 新群名',
          threadId,
        )
        return
      }

      // 3. 执行操作
      const setGroupName = this.context.qqClient.setGroupName
      if (!setGroupName) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持修改群名功能', threadId)
        return
      }

      await setGroupName.call(this.context.qqClient, qqGroupId, newGroupName)

      // 4. 发送确认
      await this.context.replyTG(
        chatId,
        `✅ 群名称已更新为：${newGroupName}`,
        threadId,
      )

      logger.info(`Set group name for ${qqGroupId}: ${newGroupName}`)
    }
    catch (error: any) {
      logger.error('Failed to execute groupname command:', error)
      await this.context.replyTG(chatId, `❌ 修改群名失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 处理设置专属头衔命令
   */
  private async handleSpecialTitle(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 1. 权限验证 - 仅群主
      const botUin = this.context.qqClient.uin.toString()
      const isOwner = await PermissionChecker.isGroupOwner(this.context.qqClient, qqGroupId, botUin)

      if (!isOwner) {
        await this.context.replyTG(chatId, '❌ 权限不足：此操作仅限群主使用', threadId)
        return
      }

      // 2. 使用 CommandArgsParser 解析参数
      const hasReply = CommandArgsParser.hasReplyMessage(msg)
      const { uin: targetUin, content: title } = CommandArgsParser.parseUserContent(args, msg, hasReply)

      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/title 头衔内容\n• 直接指定：/title 123456789 头衔内容\n• 参数可互换：/title 头衔 123456789`,
          threadId,
        )
        return
      }

      if (!title || title.trim() === '') {
        await this.context.replyTG(
          chatId,
          '❌ 请输入头衔内容',
          threadId,
        )
        return
      }

      // 4. 执行操作
      const setGroupSpecialTitle = this.context.qqClient.setGroupSpecialTitle
      if (!setGroupSpecialTitle) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持设置专属头衔功能', threadId)
        return
      }

      await setGroupSpecialTitle.call(this.context.qqClient, qqGroupId, targetUin, title, -1) // -1 = 永久

      // 5. 发送确认
      const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, targetUin)
      const userName = memberInfo?.card || memberInfo?.nickname || targetUin

      await this.context.replyTG(
        chatId,
        `✅ 已为 ${userName}(${targetUin}) 设置专属头衔：${title}`,
        threadId,
      )

      logger.info(`Set special title for user ${targetUin} in group ${qqGroupId}: ${title}`)
    }
    catch (error: any) {
      logger.error('Failed to execute title command:', error)
      await this.context.replyTG(chatId, `❌ 设置头衔失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 解析目标用户ID（复用GroupManagementCommandHandler的逻辑）
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
