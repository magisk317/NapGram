import type { UnifiedMessage } from '../../../../../../main/src/domain/message'
import type ForwardMap from '../../../../../../main/src/domain/models/ForwardMap'
import type { CommandContext } from './CommandContext'
import { getLogger } from '../../../../../../main/src/shared/logger'
import { CommandArgsParser } from '../utils/CommandArgsParser'

const logger = getLogger('QQInteractionCommandHandler')

/**
 * QQ 交互命令处理器
 * 处理: poke, nick, like, honor
 */
export class QQInteractionCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const chatId = msg.chat.id
    // 不传args给extractThreadId,避免把QQ号/次数当成thread ID
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
      case 'poke':
        await this.handlePoke(chatId, threadId, qqGroupId, msg, args)
        break
      case 'nick':
        await this.handleNick(chatId, threadId, qqGroupId, args)
        break
      case 'like':
      case '点赞':
        await this.handleLike(chatId, threadId, qqGroupId, msg, args)
        break
      case 'honor':
      case '群荣誉':
        await this.handleGroupHonor(chatId, threadId, qqGroupId, args)
        break
    }
  }

  /**
   * 处理戳一戳命令
   */
  private async handlePoke(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      const targetUin = await this.resolveTargetUser(msg, args, 0)
      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户消息：/poke\n• 直接指定：/poke 123456789`,
          threadId,
        )
        return
      }

      if (this.context.qqClient.sendGroupPoke) {
        await this.context.qqClient.sendGroupPoke(qqGroupId, targetUin)
      }
      else if (this.context.qqClient.callApi) {
        const groupId = Number(qqGroupId)
        const userId = Number(targetUin)

        let lastError: unknown
        for (const method of ['send_group_poke', 'group_poke']) {
          try {
            await this.context.qqClient.callApi(method, { group_id: groupId, user_id: userId })
            lastError = undefined
            break
          }
          catch (error) {
            lastError = error
          }
        }

        if (lastError) {
          throw lastError
        }
      }
      else {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持戳一戳功能', threadId)
        return
      }

      await this.context.replyTG(chatId, `👉 已戳一戳 ${targetUin}`, threadId)
      logger.info(`Sent poke to ${targetUin} in group ${qqGroupId}`)
    }
    catch (error) {
      logger.error('Failed to send poke:', error)
      await this.context.replyTG(chatId, '❌ 发送戳一戳失败', threadId)
    }
  }

  /**
   * 处理昵称命令
   */
  private async handleNick(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[]) {
    try {
      const botUin = this.context.qqClient.uin.toString()

      if (args.length === 0) {
        // 获取当前昵称
        const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, botUin)
        const card = memberInfo?.card || memberInfo?.nickname || '未设置'
        await this.context.replyTG(
          chatId,
          `📝 当前群名片: \`${card}\`\n\n使用 \`/nick 新名片\` 修改`,
          threadId,
        )
      }
      else {
        // 设置新昵称
        const newCard = args.join(' ')

        const setGroupCard = this.context.qqClient.setGroupCard
        if (!setGroupCard) {
          await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持修改群名片', threadId)
          return
        }

        await setGroupCard.call(this.context.qqClient, qqGroupId, botUin, newCard)

        await this.context.replyTG(
          chatId,
          `✅ 已修改群名片为: \`${newCard}\``,
          threadId,
        )
        logger.info(`Set group card for bot ${botUin} in group ${qqGroupId}`)
      }
    }
    catch (error) {
      logger.error('Failed to handle nick command:', error)
      await this.context.replyTG(chatId, '❌ 获取/设置群名片失败', threadId)
    }
  }

  /**
   * 处理点赞命令
   * Phase 3: /like <QQ号/回复消息> [次数]
   */
  private async handleLike(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    msg: UnifiedMessage,
    args: string[],
  ) {
    try {
      // 使用 CommandArgsParser 解析参数
      const hasReply = CommandArgsParser.hasReplyMessage(msg)
      const { uin: targetUin, times } = CommandArgsParser.parseLikeArgs(args, msg, hasReply)

      if (!targetUin) {
        await this.context.replyTG(
          chatId,
          `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/like [次数]\n• 直接指定：/like 123456789 [次数]\n• 参数顺序可互换：/like 10 123456789`,
          threadId,
        )
        return
      }

      // 执行点赞
      const sendLike = this.context.qqClient.sendLike
      if (!sendLike) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持点赞功能', threadId)
        return
      }

      await sendLike.call(this.context.qqClient, targetUin, times)

      await this.context.replyTG(
        chatId,
        `✅ 已给 ${targetUin} 点赞 x${times}`,
        threadId,
      )

      logger.info(`Sent like to ${targetUin} x${times}`)
    }
    catch (error: any) {
      logger.error('Failed to send like:', error)
      await this.context.replyTG(chatId, `❌ 点赞失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 处理群荣誉命令
   * Phase 3: /honor [类型]
   */
  private async handleGroupHonor(
    chatId: string,
    threadId: number | undefined,
    qqGroupId: string,
    args: string[],
  ) {
    try {
      const type = args[0] || 'all'
      const validTypes = ['talkative', 'performer', 'legend', 'strong_newbie', 'emotion', 'all']

      if (!validTypes.includes(type)) {
        await this.context.replyTG(
          chatId,
          `❌ 无效的类型\n\n有效类型：talkative(龙王), performer(群聊之火), legend(快乐源泉), strong_newbie(冲高之星), emotion(一笔当先), all(全部)`,
          threadId,
        )
        return
      }

      const getGroupHonorInfo = this.context.qqClient.getGroupHonorInfo
      if (!getGroupHonorInfo) {
        await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持群荣誉功能', threadId)
        return
      }

      const result = await getGroupHonorInfo.call(this.context.qqClient, qqGroupId, type as any)

      // 格式化结果
      let message = `🏆 群荣誉榜单\n\n`

      if (type === 'all' && result) {
        const types = ['talkative', 'performer', 'legend', 'strong_newbie', 'emotion']
        const typeNames: any = {
          talkative: '🐉 龙王',
          performer: '🔥 群聊之火',
          legend: '😄 快乐源泉',
          strong_newbie: '⭐ 冲高之星',
          emotion: '✍️ 一笔当先',
        }

        for (const t of types) {
          const list = result[`${t}_list`]
          if (list && list.length > 0) {
            message += `${typeNames[t]}\n`
            list.slice(0, 3).forEach((item: any, i: number) => {
              // honor API 返回的字段是 desc/name，不是 nickname
              // QQ号字段是 user_id，不是 uin
              const displayName = item.desc || item.name || item.nickname || item.user_id || 'Unknown'
              const userId = item.user_id || item.uin || 'Unknown'
              message += `  ${i + 1}. ${displayName} (${userId})\n`
            })
            message += '\n'
          }
        }
      }
      else {
        message += JSON.stringify(result, null, 2)
      }

      await this.context.replyTG(chatId, message, threadId)
      logger.info(`Retrieved group honor info for ${qqGroupId}: ${type}`)
    }
    catch (error: any) {
      logger.error('Failed to get group honor:', error)
      await this.context.replyTG(chatId, `❌ 获取群荣誉失败：${error.message || error}`, threadId)
    }
  }

  /**
   * 解析目标用户ID
   */
  private async resolveTargetUser(
    msg: UnifiedMessage,
    args: string[],
    argIndex: number,
  ): Promise<string | null> {
    const raw = (msg.metadata as any)?.raw as any

    if (raw?.replyToMessage || raw?.replyTo) {
      const replyMsg = raw.replyToMessage || raw.replyTo
      if (replyMsg?.senderId) {
        return String(replyMsg.senderId)
      }
    }

    const replyContent = msg.content.find(c => c.type === 'reply')
    if (replyContent) {
      const replyData = replyContent.data as any
      if (replyData.senderId) {
        return String(replyData.senderId)
      }
    }

    const arg = args[argIndex]
    if (arg && /^\d{5,11}$/.test(arg)) {
      return arg
    }

    return null
  }
}
