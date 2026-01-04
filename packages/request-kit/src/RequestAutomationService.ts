import type { IQQClient, Instance } from './runtime'
import { db, schema, eq, and, or, lt, desc, sql, getLogger } from './runtime'

const logger = getLogger('RequestAutomationService')

/**
 * 请求自动化服务
 * Phase 4: 自动清理、自动审批规则
 */
export class RequestAutomationService {
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000 // 24小时
  private readonly EXPIRY_DAYS = 7 // 7天过期

  constructor(
    private readonly instance: Instance,
    private readonly qqClient: IQQClient,
  ) {
    this.startCleanupSchedule()
    logger.info('RequestAutomationService ✓ 初始化完成')
  }

  /**
   * 启动定时清理任务
   */
  private startCleanupSchedule() {
    // 立即执行一次
    this.cleanupExpiredRequests().catch((err) => {
      logger.error('Initial cleanup failed:', err)
    })

    // 每24小时执行一次
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRequests().catch((err) => {
        logger.error('Scheduled cleanup failed:', err)
      })
    }, this.CLEANUP_INTERVAL)

    logger.info(`Cleanup scheduler started (interval: ${this.CLEANUP_INTERVAL / 1000 / 60 / 60}h, expiry: ${this.EXPIRY_DAYS}d)`)
  }

  /**
   * 清理过期请求
   */
  async cleanupExpiredRequests(): Promise<number> {
    try {
      const expiryDate = new Date(Date.now() - this.EXPIRY_DAYS * 24 * 60 * 60 * 1000)

      const result = await db.delete(schema.qqRequest)
        .where(and(
          eq(schema.qqRequest.instanceId, this.instance.id),
          eq(schema.qqRequest.status, 'pending'),
          lt(schema.qqRequest.createdAt, expiryDate),
        ))
        .returning()

      if (result.length > 0) {
        logger.info(`Cleaned up ${result.length} expired requests (older than ${this.EXPIRY_DAYS} days)`)
      }

      return result.length
    }
    catch (error) {
      logger.error('Failed to cleanup expired requests:', error)
      throw error
    }
  }

  /**
   * 应用自动化规则到新请求
   * @returns true 如果有规则匹配并执行
   */
  async applyAutomationRules(request: any): Promise<boolean> {
    try {
      // 查询启用的规则，按优先级排序
      const rules = await db.select().from(schema.automationRule).where(and(
        eq(schema.automationRule.instanceId, this.instance.id),
        eq(schema.automationRule.enabled, true),
        or(
          eq(schema.automationRule.target, request.type),
          eq(schema.automationRule.target, 'all'),
        ),
      )).orderBy(desc(schema.automationRule.priority))

      // 遍历规则，找到第一个匹配的
      for (const rule of rules) {
        if (await this.matchRule(rule, request)) {
          await this.executeRule(rule, request)
          return true
        }
      }

      return false
    }
    catch (error) {
      logger.error('Failed to apply automation rules:', error)
      return false
    }
  }

  /**
   * 检查请求是否匹配规则
   */
  private async matchRule(rule: any, request: any): Promise<boolean> {
    const conditions = rule.conditions as any

    // 黑名单检查
    if (rule.type === 'blacklist') {
      const userIds = conditions.userIds || []
      return userIds.includes(request.userId.toString())
    }

    // 白名单检查
    if (rule.type === 'whitelist') {
      const userIds = conditions.userIds || []
      return userIds.includes(request.userId.toString())
    }

    // 关键词匹配
    if (rule.type === 'keyword' && request.comment) {
      const keywords = conditions.keywords || []
      return keywords.some((kw: string) =>
        request.comment.toLowerCase().includes(kw.toLowerCase()),
      )
    }

    return false
  }

  /**
   * 执行规则动作
   */
  private async executeRule(rule: any, request: any): Promise<void> {
    try {
      logger.info(`Executing automation rule #${rule.id} (${rule.type}) for request ${request.flag}`)

      // 执行自动审批
      if (rule.action === 'approve') {
        await this.autoApprove(request)
      }
      else if (rule.action === 'reject') {
        await this.autoReject(request, rule.reason || '自动拒绝')
      }

      // 更新规则匹配计数
      await db.update(schema.automationRule)
        .set({ matchCount: sql`${schema.automationRule.matchCount} + 1` })
        .where(eq(schema.automationRule.id, rule.id))

      logger.info(`Automation rule #${rule.id} executed successfully`)
    }
    catch (error) {
      logger.error(`Failed to execute rule #${rule.id}:`, error)
      throw error
    }
  }

  /**
   * 自动批准请求
   */
  private async autoApprove(request: any): Promise<void> {
    if (request.type === 'friend') {
      const handleFriendRequest = this.qqClient.handleFriendRequest
      if (handleFriendRequest) {
        await handleFriendRequest.call(this.qqClient, request.flag, true)
      }
    }
    else if (request.type === 'group') {
      const handleGroupRequest = this.qqClient.handleGroupRequest
      if (handleGroupRequest) {
        await handleGroupRequest.call(
          this.qqClient,
          request.flag,
          request.subType,
          true,
        )
      }
    }

    // 更新数据库状态
    await db.update(schema.qqRequest)
      .set({
        status: 'approved',
        handledBy: BigInt(0), // 0 表示自动处理
        handledAt: new Date(),
      })
      .where(eq(schema.qqRequest.id, request.id))
  }

  /**
   * 自动拒绝请求
   */
  private async autoReject(request: any, reason: string): Promise<void> {
    if (request.type === 'friend') {
      const handleFriendRequest = this.qqClient.handleFriendRequest
      if (handleFriendRequest) {
        await handleFriendRequest.call(this.qqClient, request.flag, false, reason)
      }
    }
    else if (request.type === 'group') {
      const handleGroupRequest = this.qqClient.handleGroupRequest
      if (handleGroupRequest) {
        await handleGroupRequest.call(
          this.qqClient,
          request.flag,
          request.subType,
          false,
          reason,
        )
      }
    }

    // 更新数据库状态
    await db.update(schema.qqRequest)
      .set({
        status: 'rejected',
        handledBy: BigInt(0), // 0 表示自动处理
        handledAt: new Date(),
        rejectReason: reason,
      })
      .where(eq(schema.qqRequest.id, request.id))
  }

  /**
   * 更新统计数据
   */
  async updateStatistics(): Promise<void> {
    try {
      // 统计各类请求数量
      const rows = await db.select({
        type: schema.qqRequest.type,
        status: schema.qqRequest.status,
        count: sql<number>`count(${schema.qqRequest.id})`,
      })
        .from(schema.qqRequest)
        .where(eq(schema.qqRequest.instanceId, this.instance.id))
        .groupBy(schema.qqRequest.type, schema.qqRequest.status)

      // 准备更新数据
      const updateData: any = {
        friendTotal: 0,
        friendPending: 0,
        friendApproved: 0,
        friendRejected: 0,
        groupTotal: 0,
        groupPending: 0,
        groupApproved: 0,
        groupRejected: 0,
      }

      // 汇总统计
      for (const row of rows) {
        const count = Number(row.count)
        if (row.type === 'friend') {
          updateData.friendTotal += count
          if (row.status === 'pending')
            updateData.friendPending = count
          else if (row.status === 'approved')
            updateData.friendApproved = count
          else if (row.status === 'rejected')
            updateData.friendRejected = count
        }
        else if (row.type === 'group') {
          updateData.groupTotal += count
          if (row.status === 'pending')
            updateData.groupPending = count
          else if (row.status === 'approved')
            updateData.groupApproved = count
          else if (row.status === 'rejected')
            updateData.groupRejected = count
        }
      }

      // Upsert统计数据
      const existing = await db.select().from(schema.requestStatistics)
        .where(eq(schema.requestStatistics.instanceId, this.instance.id))
        .limit(1)

      if (existing[0]) {
        await db.update(schema.requestStatistics)
          .set(updateData)
          .where(eq(schema.requestStatistics.instanceId, this.instance.id))
      } else {
        await db.insert(schema.requestStatistics)
          .values({
            instanceId: this.instance.id,
            ...updateData,
          })
      }

      logger.debug('Statistics updated successfully')
    }
    catch (error) {
      logger.error('Failed to update statistics:', error)
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    logger.info('RequestAutomationService destroyed')
  }
}
