import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from './CommandContext'
import { db, schema, eq, and, desc, gte, sql, count, getLogger, env } from '@napgram/infra-kit'

const logger = getLogger('RequestManagementCommandHandler')

/**
 * 请求管理命令处理器
 * Phase 3/4: pending, approve, reject, reqstats, approveall, rejectall
 */
export class RequestManagementCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram')
      return

    const chatId = msg.chat.id
    const threadId = this.extractThreadIdFromRaw(msg)

    switch (commandName) {
      case 'pending':
      case '待处理':
        await this.handlePending(chatId, threadId, args)
        break
      case 'approve':
      case '同意':
      case '通过':
        await this.handleApprove(chatId, threadId, msg, args)
        break
      case 'reject':
      case '拒绝':
        await this.handleReject(chatId, threadId, msg, args)
        break
      case 'reqstats':
      case '请求统计':
      case '统计':
        await this.handleRequestStats(chatId, threadId, args)
        break
      case 'approveall':
      case '批量批准':
        await this.handleApproveAll(chatId, threadId, msg, args)
        break
      case 'rejectall':
      case '批量拒绝':
        await this.handleRejectAll(chatId, threadId, msg, args)
        break
    }
  }

  /**
   * 仅从消息元数据提取 threadId，避免把参数误判为 threadId
   * （例如 /reject <flag> <reason...> 的 reason 可能以数字开头）
   */
  private extractThreadIdFromRaw(msg: UnifiedMessage): number | undefined {
    return this.context.extractThreadId(msg, [])
  }

  private getFilterLabel(filter?: string): string {
    if (filter === 'friend')
      return '好友'
    if (filter === 'group')
      return '加群'
    return ''
  }

  /**
   * /pending [friend|group]
   */
  private async handlePending(chatId: string, threadId: number | undefined, args: string[]) {
    try {
      const filter = args[0]
      const instanceId = this.context.instance.id

      const conditionsPv = [
        eq(schema.qqRequest.instanceId, instanceId),
        eq(schema.qqRequest.status, 'pending'),
      ]
      if (filter === 'friend')
        conditionsPv.push(eq(schema.qqRequest.type, 'friend'))
      if (filter === 'group')
        conditionsPv.push(eq(schema.qqRequest.type, 'group'))

      const requests = await db.query.qqRequest.findMany({
        where: and(...conditionsPv),
        orderBy: [desc(schema.qqRequest.createdAt)],
        limit: 10,
      })

      if (requests.length === 0) {
        const label = this.getFilterLabel(filter)
        await this.context.replyTG(chatId, `📭 当前没有待处理的${label}申请`, threadId)
        return
      }

      const label = this.getFilterLabel(filter)
      let message = `📬 待处理的${label}申请 (${requests.length})\n\n`

      for (const req of requests) {
        const time = new Date(req.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        const groupId = req.groupId ? req.groupId.toString() : ''
        const typeText = req.type === 'friend' ? '好友' : `群(${groupId || '-'})`
        const subType = req.subType ? `/${req.subType}` : ''

        message += `━━━━━━━━━━━━━━━━\n`
        message += `📝 ${typeText}${subType} | 用户: ${req.userId}\n`
        if (req.comment)
          message += `💬 ${req.comment}\n`
        message += `⏰ ${time}\n`
        message += `🔑 /approve ${req.flag}\n`
        message += `❌ /reject ${req.flag}\n\n`
      }

      await this.context.replyTG(chatId, message.trim(), threadId)
      logger.info(`Listed ${requests.length} pending requests`)
    }
    catch (error: any) {
      logger.error('Failed to list pending requests:', error)
      await this.context.replyTG(chatId, `❌ 查询失败：${error?.message ?? error}`, threadId)
    }
  }

  /**
   * /approve <flag>
   */
  private async handleApprove(chatId: string, threadId: number | undefined, msg: UnifiedMessage, args: string[]) {
    try {
      const flag = args[0]
      if (!flag) {
        await this.context.replyTG(chatId, '❌ 请指定请求flag\n\n使用方式：/approve <flag>', threadId)
        return
      }

      const rows = await db.query.qqRequest.findMany({
        where: eq(schema.qqRequest.flag, flag),
        limit: 1,
      })
      const request = rows[0]
      if (!request || request.instanceId !== this.context.instance.id) {
        await this.context.replyTG(chatId, `❌ 未找到请求：${flag}`, threadId)
        return
      }

      if (request.status !== 'pending') {
        await this.context.replyTG(chatId, `❌ 该请求已处理（状态：${request.status}）`, threadId)
        return
      }

      if (request.type === 'friend') {
        const handleFriendRequest = this.context.qqClient.handleFriendRequest
        if (!handleFriendRequest)
          throw new Error('QQ客户端不支持处理好友申请')
        await handleFriendRequest.call(this.context.qqClient, flag, true)
      }
      else if (request.type === 'group') {
        const handleGroupRequest = this.context.qqClient.handleGroupRequest
        if (!handleGroupRequest)
          throw new Error('QQ客户端不支持处理加群申请')
        if (!request.subType)
          throw new Error('请求缺少 subType，无法处理加群申请')
        await handleGroupRequest.call(this.context.qqClient, flag, request.subType as 'add' | 'invite', true)
      }

      await db.update(schema.qqRequest)
        .set({
          status: 'approved',
          handledBy: BigInt(msg.sender.id),
          handledAt: new Date(),
        })
        .where(eq(schema.qqRequest.id, request.id))

      const typeText = request.type === 'friend' ? '好友' : '加群'
      await this.context.replyTG(chatId, `✅ 已同意${typeText}申请\n用户：${request.userId}`, threadId)
      logger.info(`Approved ${request.type} request: ${flag}`)
    }
    catch (error: any) {
      logger.error('Failed to approve request:', error)
      await this.context.replyTG(chatId, `❌ 批准失败：${error?.message ?? error}`, threadId)
    }
  }

  /**
   * /reject <flag> [reason...]
   */
  private async handleReject(chatId: string, threadId: number | undefined, msg: UnifiedMessage, args: string[]) {
    try {
      const flag = args[0]
      const reason = args.slice(1).join(' ') || undefined

      if (!flag) {
        await this.context.replyTG(chatId, '❌ 请指定请求flag\n\n使用方式：/reject <flag> [理由]', threadId)
        return
      }

      const rows = await db.query.qqRequest.findMany({
        where: eq(schema.qqRequest.flag, flag),
        limit: 1,
      })
      const request = rows[0]
      if (!request || request.instanceId !== this.context.instance.id) {
        await this.context.replyTG(chatId, `❌ 未找到请求：${flag}`, threadId)
        return
      }

      if (request.status !== 'pending') {
        await this.context.replyTG(chatId, `❌ 该请求已处理（状态：${request.status}）`, threadId)
        return
      }

      if (request.type === 'friend') {
        const handleFriendRequest = this.context.qqClient.handleFriendRequest
        if (!handleFriendRequest)
          throw new Error('QQ客户端不支持处理好友申请')
        await handleFriendRequest.call(this.context.qqClient, flag, false, reason)
      }
      else if (request.type === 'group') {
        const handleGroupRequest = this.context.qqClient.handleGroupRequest
        if (!handleGroupRequest)
          throw new Error('QQ客户端不支持处理加群申请')
        if (!request.subType)
          throw new Error('请求缺少 subType，无法处理加群申请')
        await handleGroupRequest.call(this.context.qqClient, flag, request.subType as 'add' | 'invite', false, reason)
      }

      await db.update(schema.qqRequest)
        .set({
          status: 'rejected',
          handledBy: BigInt(msg.sender.id),
          handledAt: new Date(),
          rejectReason: reason,
        })
        .where(eq(schema.qqRequest.id, request.id))

      const typeText = request.type === 'friend' ? '好友' : '加群'
      await this.context.replyTG(
        chatId,
        `✅ 已拒绝${typeText}申请\n用户：${request.userId}${reason ? `\n理由：${reason}` : ''}`,
        threadId,
      )
      logger.info(`Rejected ${request.type} request: ${flag}`)
    }
    catch (error: any) {
      logger.error('Failed to reject request:', error)
      await this.context.replyTG(chatId, `❌ 拒绝失败：${error?.message ?? error}`, threadId)
    }
  }

  /**
   * /reqstats [today|week|month|all]
   */
  private async handleRequestStats(chatId: string, threadId: number | undefined, args: string[]) {
    try {
      const period = args[0] || 'all'
      const instanceId = this.context.instance.id

      let startDate: Date | undefined
      const now = new Date()

      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = undefined
      }

      const conditionsSt = [eq(schema.qqRequest.instanceId, instanceId)]
      if (startDate)
        conditionsSt.push(gte(schema.qqRequest.createdAt, startDate))

      const stats = await db.select({
        type: schema.qqRequest.type,
        status: schema.qqRequest.status,
        count: count(),
      })
        .from(schema.qqRequest)
        .where(and(...conditionsSt))
        .groupBy(schema.qqRequest.type, schema.qqRequest.status)

      const summary = {
        friend: { total: 0, pending: 0, approved: 0, rejected: 0 },
        group: { total: 0, pending: 0, approved: 0, rejected: 0 },
      }

      for (const stat of stats) {
        const count = stat.count
        const type = stat.type as 'friend' | 'group'
        summary[type].total += count
        if (stat.status === 'pending')
          summary[type].pending = count
        if (stat.status === 'approved')
          summary[type].approved = count
        if (stat.status === 'rejected')
          summary[type].rejected = count
      }

      const periodText = { today: '今天', week: '最近7天', month: '最近30天', all: '全部' }[period] || '全部'
      let message = `📊 请求统计数据（${periodText}）\n\n`

      const pct = (count: number, total: number) => (total > 0 ? ((count / total) * 100).toFixed(1) : '0.0')

      if (summary.friend.total > 0) {
        message += `👥 好友申请：\n━━━━━━━━━━━━━━━━\n`
        message += `✅ 已批准：${summary.friend.approved} (${pct(summary.friend.approved, summary.friend.total)}%)\n`
        message += `❌ 已拒绝：${summary.friend.rejected} (${pct(summary.friend.rejected, summary.friend.total)}%)\n`
        message += `⏳ 待处理：${summary.friend.pending} (${pct(summary.friend.pending, summary.friend.total)}%)\n`
        message += `📈 总计：${summary.friend.total}\n\n`
      }

      if (summary.group.total > 0) {
        message += `🏠 加群申请：\n━━━━━━━━━━━━━━━━\n`
        message += `✅ 已批准：${summary.group.approved} (${pct(summary.group.approved, summary.group.total)}%)\n`
        message += `❌ 已拒绝：${summary.group.rejected} (${pct(summary.group.rejected, summary.group.total)}%)\n`
        message += `⏳ 待处理：${summary.group.pending} (${pct(summary.group.pending, summary.group.total)}%)\n`
        message += `📈 总计：${summary.group.total}\n\n`
      }

      if (summary.friend.total === 0 && summary.group.total === 0) {
        message += '📭 暂无请求数据'
      }

      if (startDate) {
        message += `\n📅 时间范围：${startDate.toLocaleDateString('zh-CN')} ~ ${now.toLocaleDateString('zh-CN')}`
      }

      await this.context.replyTG(chatId, message.trim(), threadId)
    }
    catch (error: any) {
      logger.error('Failed to get request statistics:', error)
      await this.context.replyTG(chatId, `❌ 获取统计数据失败：${error?.message ?? error}`, threadId)
    }
  }

  /**
   * /approveall [friend|group]
   */
  private async handleApproveAll(chatId: string, threadId: number | undefined, msg: UnifiedMessage, args: string[]) {
    try {
      const filter = args[0]
      const instanceId = this.context.instance.id

      const conditionsApA = [
        eq(schema.qqRequest.instanceId, instanceId),
        eq(schema.qqRequest.status, 'pending'),
      ]
      if (filter === 'friend' || filter === 'group')
        conditionsApA.push(eq(schema.qqRequest.type, filter))

      const requests = await db.query.qqRequest.findMany({
        where: and(...conditionsApA),
        limit: 50,
      })
      if (requests.length === 0) {
        await this.context.replyTG(chatId, '📭 没有待处理的请求', threadId)
        return
      }

      let successCount = 0
      let failureCount = 0

      const handleFriendRequest = this.context.qqClient.handleFriendRequest
      const handleGroupRequest = this.context.qqClient.handleGroupRequest

      for (const request of requests) {
        try {
          if (request.type === 'friend') {
            if (!handleFriendRequest)
              throw new Error('QQ客户端不支持处理好友申请')
            await handleFriendRequest.call(this.context.qqClient, request.flag, true)
          }
          else if (request.type === 'group') {
            if (!handleGroupRequest)
              throw new Error('QQ客户端不支持处理加群申请')
            if (!request.subType)
              throw new Error('请求缺少 subType，无法处理加群申请')
            await handleGroupRequest.call(this.context.qqClient, request.flag, request.subType as 'add' | 'invite', true)
          }

          await db.update(schema.qqRequest)
            .set({
              status: 'approved',
              handledBy: BigInt(msg.sender.id),
              handledAt: new Date(),
            })
            .where(eq(schema.qqRequest.id, request.id))
          successCount++
        }
        catch (error) {
          logger.error(`Failed to approve request ${request.flag}:`, error)
          failureCount++
        }
      }

      const typeText = this.getFilterLabel(filter)
      await this.context.replyTG(
        chatId,
        `✅ 批量批准完成\n\n✅ 成功：${successCount}\n❌ 失败：${failureCount}\n📈 总计：${requests.length}${typeText ? `\n📝 类型：${typeText}申请` : ''}`,
        threadId,
      )
    }
    catch (error: any) {
      logger.error('Failed to batch approve:', error)
      await this.context.replyTG(chatId, `❌ 批量批准失败：${error?.message ?? error}`, threadId)
    }
  }

  /**
   * /rejectall [friend|group] [reason...]
   */
  private async handleRejectAll(chatId: string, threadId: number | undefined, msg: UnifiedMessage, args: string[]) {
    try {
      const filter = args[0]
      const reason = args.slice(1).join(' ') || '批量拒绝'
      const instanceId = this.context.instance.id

      const conditionsReA = [
        eq(schema.qqRequest.instanceId, instanceId),
        eq(schema.qqRequest.status, 'pending'),
      ]
      if (filter === 'friend' || filter === 'group')
        conditionsReA.push(eq(schema.qqRequest.type, filter))

      const requests = await db.query.qqRequest.findMany({
        where: and(...conditionsReA),
        limit: 50,
      })
      if (requests.length === 0) {
        await this.context.replyTG(chatId, '📭 没有待处理的请求', threadId)
        return
      }

      let successCount = 0
      let failureCount = 0

      const handleFriendRequest = this.context.qqClient.handleFriendRequest
      const handleGroupRequest = this.context.qqClient.handleGroupRequest

      for (const request of requests) {
        try {
          if (request.type === 'friend') {
            if (!handleFriendRequest)
              throw new Error('QQ客户端不支持处理好友申请')
            await handleFriendRequest.call(this.context.qqClient, request.flag, false, reason)
          }
          else if (request.type === 'group') {
            if (!handleGroupRequest)
              throw new Error('QQ客户端不支持处理加群申请')
            if (!request.subType)
              throw new Error('请求缺少 subType，无法处理加群申请')
            await handleGroupRequest.call(this.context.qqClient, request.flag, request.subType as 'add' | 'invite', false, reason)
          }

          await db.update(schema.qqRequest)
            .set({
              status: 'rejected',
              handledBy: BigInt(msg.sender.id),
              handledAt: new Date(),
              rejectReason: reason,
            })
            .where(eq(schema.qqRequest.id, request.id))
          successCount++
        }
        catch (error) {
          logger.error(`Failed to reject request ${request.flag}:`, error)
          failureCount++
        }
      }

      const typeText = this.getFilterLabel(filter)
      await this.context.replyTG(
        chatId,
        `✅ 批量拒绝完成\n\n✅ 成功：${successCount}\n❌ 失败：${failureCount}\n📈 总计：${requests.length}${typeText ? `\n📝 类型：${typeText}申请` : ''}\n💬 理由：${reason}`,
        threadId,
      )
    }
    catch (error: any) {
      logger.error('Failed to batch reject:', error)
      await this.context.replyTG(chatId, `❌ 批量拒绝失败：${error?.message ?? error}`, threadId)
    }
  }
}
