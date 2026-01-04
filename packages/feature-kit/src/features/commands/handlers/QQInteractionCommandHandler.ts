import type { UnifiedMessage } from '@napgram/message-kit'
import { getLogger } from '@napgram/infra-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'

const logger = getLogger('QQInteractionCommandHandler')

export class QQInteractionCommandHandler {
  constructor(private context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
    const subCommand = commandName

    if (subCommand === 'qq' && args.length > 0) {
      await this.execute(msg, args.slice(1), args[0])
      return
    }

    switch (subCommand) {
      case 'poke':
        await this.handlePoke(msg, args)
        return
      case 'ban':
        await this.handleBan(msg, args)
        return
      case 'card':
        await this.handleCard(msg, args)
        return
      case 'nick':
        await this.handleNick(msg, args)
        return
      case 'like':
        await this.handleLike(msg, args)
        return
      case 'honor':
        await this.handleHonor(msg, args)
        return
      default:
        await this.reply(msg, '未知交互指令。可用指令: poke, ban, card')
    }
  }

  private async reply(msg: UnifiedMessage, text: string) {
    if (msg.platform === 'telegram') {
      const threadId = this.context.extractThreadId(msg, [])
      await this.context.replyTG(msg.chat.id, text, threadId)
    }
    else {
      logger.warn('QQInteractionCommandHandler used from non-TG platform, ignored reply')
    }
  }

  private async handlePoke(msg: UnifiedMessage, args: string[]) {
    const pair = this.getPair(msg)
    if (!pair) {
      await this.reply(msg, '未绑定任何 QQ 群')
      return
    }

    const target = this.resolveTarget(args, msg)
    if (!target) {
      await this.reply(msg, '无法识别目标用户')
      return
    }

    const qqClient = this.context.qqClient as any
    try {
      if (typeof qqClient.sendGroupPoke === 'function') {
        await qqClient.sendGroupPoke(String(pair.qqRoomId), String(target))
        await this.reply(msg, `已戳一戳 ${target}`)
        return
      }
      if (typeof qqClient.callApi === 'function') {
        await qqClient.callApi('send_group_poke', {
          group_id: Number(pair.qqRoomId),
          user_id: Number(target),
        })
        await this.reply(msg, `已戳一戳 ${target}`)
        return
      }
      await this.reply(msg, '不支持戳一戳')
    }
    catch (e: any) {
      logger.error(e)
      await this.reply(msg, `执行出错: ${e.message}`)
    }
  }

  private async handleBan(msg: UnifiedMessage, args: string[]) {
    const pair = this.getPair(msg)
    if (!pair) {
      await this.reply(msg, '未绑定任何 QQ 群')
      return
    }

    const target = args[0]
    if (!target) {
      await this.reply(msg, '用法: /qq ban <qq_id> [duration_seconds]')
      return
    }

    const duration = args[1] ? parseInt(args[1], 10) : 30 * 60

    try {
      const success = await this.context.qqClient.setGroupBan?.(String(pair.qqRoomId), target, duration)
      if (success) {
        await this.reply(msg, `已禁言 ${target} ${duration}秒`)
      }
      else {
        await this.reply(msg, '禁言失败，可能是Bot权限不足')
      }
    }
    catch (e: any) {
      logger.error(e)
      await this.reply(msg, `执行出错: ${e.message}`)
    }
  }

  private async handleCard(msg: UnifiedMessage, args: string[]) {
    const pair = this.getPair(msg)
    if (!pair) {
      await this.reply(msg, '未绑定任何 QQ 群')
      return
    }

    const target = args[0]
    const newCard = args.slice(1).join(' ')
    if (!target || !newCard) {
      await this.reply(msg, '用法: /qq card <qq_id> <new_name>')
      return
    }

    try {
      const success = await this.context.qqClient.setGroupCard?.(String(pair.qqRoomId), target, newCard)
      if (success !== false) {
        await this.reply(msg, '已修改群名片')
      }
      else {
        await this.reply(msg, '修改群名片失败，可能是Bot权限不足')
      }
    }
    catch (e: any) {
      logger.error(e)
      await this.reply(msg, `执行出错: ${e.message}`)
    }
  }

  private async handleNick(msg: UnifiedMessage, args: string[]) {
    const pair = this.getPair(msg)
    if (!pair) {
      await this.reply(msg, '未绑定任何 QQ 群')
      return
    }

    const qqClient = this.context.qqClient as any
    if (!args.length) {
      if (typeof qqClient.getGroupMemberInfo !== 'function') {
        await this.reply(msg, '不支持查询群名片')
        return
      }
      try {
        const info = await qqClient.getGroupMemberInfo(String(pair.qqRoomId), String(qqClient.uin))
        const name = info?.card || info?.nickname || '未设置'
        await this.reply(msg, `当前群名片：${name}`)
      }
      catch (e: any) {
        await this.reply(msg, `查询失败：${e.message}`)
      }
      return
    }

    if (typeof qqClient.setGroupCard !== 'function') {
      await this.reply(msg, '不支持修改群名片')
      return
    }

    const newCard = args.join(' ')
    try {
      await qqClient.setGroupCard(String(pair.qqRoomId), String(qqClient.uin), newCard)
      await this.reply(msg, '已修改群名片')
    }
    catch (e: any) {
      await this.reply(msg, `修改失败：${e.message}`)
    }
  }

  private async handleLike(msg: UnifiedMessage, args: string[]) {
    const qqClient = this.context.qqClient as any
    if (typeof qqClient.sendLike !== 'function') {
      await this.reply(msg, '不支持点赞')
      return
    }

    const parsed = this.parseTargetAndTimes(args)
    const target = parsed.target || this.resolveReplyTarget(msg)
    const times = parsed.times ?? 1
    if (!target) {
      await this.reply(msg, '无法识别目标用户')
      return
    }

    try {
      await qqClient.sendLike(String(target), times)
      await this.reply(msg, `已为 ${target} 点赞 x${times}`)
    }
    catch (e: any) {
      await this.reply(msg, `点赞失败：${e.message}`)
    }
  }

  private async handleHonor(msg: UnifiedMessage, args: string[]) {
    const pair = this.getPair(msg)
    if (!pair) {
      await this.reply(msg, '未绑定任何 QQ 群')
      return
    }

    const type = (args[0] || 'all').toLowerCase()
    const allowed = new Set(['all', 'talkative', 'performer', 'legend', 'strong_newbie', 'emotion'])
    if (!allowed.has(type)) {
      await this.reply(msg, '无效的类型')
      return
    }

    const qqClient = this.context.qqClient as any
    if (typeof qqClient.getGroupHonorInfo !== 'function') {
      await this.reply(msg, '不支持群荣誉')
      return
    }

    try {
      const data = await qqClient.getGroupHonorInfo(String(pair.qqRoomId), type)
      const sections = [
        { key: 'talkative_list', title: '龙王' },
        { key: 'performer_list', title: '群聊之火' },
        { key: 'legend_list', title: '群聊之星' },
        { key: 'strong_newbie_list', title: '群聊新秀' },
        { key: 'emotion_list', title: '快乐源泉' },
      ]
      const lines: string[] = ['群荣誉榜单']
      for (const section of sections) {
        if (type !== 'all' && !section.key.startsWith(type))
          continue
        const list = Array.isArray((data as any)?.[section.key]) ? (data as any)[section.key] : []
        if (!list.length)
          continue
        lines.push(`${section.title}:`)
        for (const entry of list) {
          const desc = entry?.desc || entry?.name || ''
          const userId = entry?.user_id ? `(${entry.user_id})` : ''
          lines.push(`- ${desc}${userId}`)
        }
      }
      await this.reply(msg, lines.join('\n'))
    }
    catch (e: any) {
      await this.reply(msg, `获取群荣誉失败：${e.message}`)
    }
  }

  private getPair(msg: UnifiedMessage) {
    if (msg.platform !== 'telegram') return null
    const forwardMap = this.context.instance.forwardPairs as ForwardMap
    const threadId = this.context.extractThreadId(msg, [])
    return forwardMap.findByTG(msg.chat.id, threadId, Boolean(threadId))
  }

  private resolveTarget(args: string[], msg: UnifiedMessage) {
    if (args[0])
      return args[0]
    return this.resolveReplyTarget(msg)
  }

  private resolveReplyTarget(msg: UnifiedMessage) {
    const reply = msg.content.find(part => part.type === 'reply')
    const senderId = reply?.data?.senderId
    return senderId ? String(senderId) : ''
  }

  private parseTargetAndTimes(args: string[]) {
    const isNumber = (value: string) => /^\d+$/.test(value)
    let target: string | undefined
    let times: number | undefined

    if (args.length >= 2) {
      const [a, b] = args
      if (isNumber(a) && isNumber(b)) {
        const aNum = Number(a)
        const bNum = Number(b)
        if (aNum <= bNum) {
          times = aNum
          target = b
        }
        else {
          times = bNum
          target = a
        }
      }
      else if (isNumber(a)) {
        times = Number(a)
        target = b
      }
      else if (isNumber(b)) {
        times = Number(b)
        target = a
      }
      else {
        target = a
      }
    }
    else if (args.length === 1) {
      if (isNumber(args[0])) {
        times = Number(args[0])
      }
      else {
        target = args[0]
      }
    }

    if (times && times < 1)
      times = 1
    return { target, times }
  }
}
