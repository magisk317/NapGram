import type { FastifyInstance } from 'fastify'
import { db, getGlobalRuntime, schema, eq, and, or, gte, lte, count, sql, desc } from '@napgram/runtime-kit'
import { Instance } from '@napgram/runtime-kit'
import { authMiddleware } from '@napgram/auth-kit'
/**
 * 统计分析 API
 */
export default async function (fastify: FastifyInstance) {
  /**
   * GET /api/admin/statistics/overview
   * 获取系统概览统计
   */
  fastify.get('/api/admin/statistics/overview', {
    preHandler: authMiddleware,
  }, async () => {
    const startOfToday = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
    const [
      pairCountResult,
      instanceCountResult,
      messageCountResult,
      todayMessageCountResult,
    ] = await Promise.all([
      db.select({ value: count() }).from(schema.forwardPair),
      db.select({ value: count() }).from(schema.instance),
      db.select({ value: count() }).from(schema.message),
      db.select({ value: count() }).from(schema.message).where(gte(schema.message.time, startOfToday)),
    ])
    const pairCount = pairCountResult[0].value
    const instanceCount = instanceCountResult[0].value
    const messageCount = messageCountResult[0].value
    const todayMessageCount = todayMessageCountResult[0].value

    // Basic health check
    const health = {
      db: true,
      instances: { total: 0, online: 0, details: [] as Array<{ id: number, tg: boolean, qq: boolean }> },
      plugins: { enabled: false, loaded: 0, failed: 0 },
    }

    try {
      await db.execute(sql`SELECT 1`)
    }
    catch {
      health.db = false
    }

    try {
      const runtimeReport = getGlobalRuntime().getLastReport()
      health.plugins.enabled = Boolean(runtimeReport?.enabled)
      health.plugins.loaded = Array.isArray(runtimeReport?.loaded) ? runtimeReport.loaded.length : 0
      health.plugins.failed = Array.isArray(runtimeReport?.failed) ? runtimeReport.failed.length : 0
    }
    catch {
      // ignore
    }

    try {
      const instances = Instance.instances || []
      health.instances.total = instances.length
      for (const inst of instances) {
        const tgOk = Boolean((inst as any).tgBot?.isOnline)
        let qqOk = false
        try {
          qqOk = Boolean(await inst.qqClient?.isOnline?.())
        }
        catch {
          qqOk = false
        }
        if (tgOk && qqOk)
          health.instances.online++
        health.instances.details.push({ id: inst.id, tg: tgOk, qq: qqOk })
      }
    }
    catch {
      // ignore
    }

    const status
      = !health.db
        ? 'unhealthy'
        : (health.plugins.failed > 0
          ? 'degraded'
          : (health.instances.total > 0 && health.instances.online < health.instances.total ? 'degraded' : 'healthy'))

    // Strict DB health check for status field
    let dbStatus = 'healthy';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'unhealthy';
    }
    // If db is unhealthy, overall status must be unhealthy
    const finalStatus = dbStatus === 'unhealthy' ? 'unhealthy' : status;


    return {
      success: true,
      data: {
        pairCount,
        instanceCount,
        messageCount,
        todayMessageCount,
        avgMessagesPerDay: messageCount > 0 ? Math.round(messageCount / 30) : 0,
        status: finalStatus,
        health,
      },
    }
  })

  /**
   * GET /api/admin/statistics/messages/trend
   * 获取消息趋势（按天）
   */
  fastify.get('/api/admin/statistics/messages/trend', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { days = 7 } = request.query as { days?: number }
    const daysNum = Math.min(Math.max(Number.parseInt(String(days)), 1), 90)

    // 生成日期范围
    const endTimestamp = Math.floor(Date.now() / 1000)
    const startTimestamp = endTimestamp - daysNum * 24 * 60 * 60

    // 按天分组统计消息数量
    const messages = await db.select({
      time: schema.message.time,
      count: count(schema.message.id),
    })
      .from(schema.message)
      .where(and(
        gte(schema.message.time, startTimestamp),
        lte(schema.message.time, endTimestamp),
      ))
      .groupBy(schema.message.time)

    // 生成每日数据映射
    const dailyCounts = new Map<string, number>()
    for (let i = 0; i < daysNum; i++) {
      const date = new Date((startTimestamp + i * 24 * 60 * 60) * 1000)
      const dateKey = date.toISOString().split('T')[0]
      dailyCounts.set(dateKey, 0)
    }

    // 填充实际数据
    messages.forEach((msg: any) => {
      const dateKey = new Date(msg.time * 1000).toISOString().split('T')[0]
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + Number(msg.count))
    })

    // 转换为数组
    const trend = Array.from(dailyCounts.entries()).map(([date, count]) => ({
      date,
      count,
    }))

    return {
      success: true,
      data: trend,
    }
  })

  /**
   * GET /api/admin/statistics/pairs/activity
   * 获取配对活跃度统计
   */
  fastify.get('/api/admin/statistics/pairs/activity', {
    preHandler: authMiddleware,
  }, async () => {
    const topPairs = await db.select({
      qqRoomId: schema.message.qqRoomId,
      tgChatId: schema.message.tgChatId,
      instanceId: schema.message.instanceId,
      count: count(schema.message.id),
    })
      .from(schema.message)
      .groupBy(schema.message.qqRoomId, schema.message.tgChatId, schema.message.instanceId)
      .orderBy(desc(count(schema.message.id)))
      .limit(10)

    const relatedPairs = topPairs.length > 0
      ? await db.query.forwardPair.findMany({
        where: or(...topPairs.map((pair: any) => and(
          eq(schema.forwardPair.qqRoomId, pair.qqRoomId),
          eq(schema.forwardPair.tgChatId, pair.tgChatId),
          eq(schema.forwardPair.instanceId, pair.instanceId),
        ))),
        columns: {
          id: true,
          qqRoomId: true,
          tgChatId: true,
          instanceId: true,
        },
      })
      : []

    const pairIdMap = new Map<string, number>()
    relatedPairs.forEach((pair: any) => {
      const key = `${pair.qqRoomId.toString()}-${pair.tgChatId.toString()}-${pair.instanceId}`
      pairIdMap.set(key, pair.id)
    })

    return {
      success: true,
      data: topPairs.map((pair: any) => {
        const key = `${pair.qqRoomId.toString()}-${pair.tgChatId.toString()}-${pair.instanceId}`
        const pairId = pairIdMap.get(key) ?? null
        return {
          id: pairId,
          qqRoomId: pair.qqRoomId.toString(),
          tgChatId: pair.tgChatId.toString(),
          messageCount: Number(pair.count),
        }
      }),
    }
  })

  /**
   * GET /api/admin/statistics/instances/status
   * 获取实例状态统计
   */
  fastify.get('/api/admin/statistics/instances/status', {
    preHandler: authMiddleware,
  }, async () => {
    const instances = await db.query.instance.findMany({
      with: {
        qqBot: true,
        forwardPairs: true,
      },
    })

    const stats = {
      total: instances.length,
      online: instances.filter((i: any) => i.isSetup && i.qqBot).length,
      offline: instances.filter((i: any) => !i.isSetup || !i.qqBot).length,
      instances: instances.map((instance: any) => ({
        id: instance.id,
        owner: instance.owner.toString(),
        isOnline: instance.isSetup && !!instance.qqBot,
        pairCount: instance.forwardPairs.length,
        botType: instance.qqBot?.type || null,
      })),
    }

    return {
      success: true,
      data: stats,
    }
  })

  /**
   * GET /api/admin/statistics/messages/recent
   * 获取最近消息（用于实时监控）
   */
  fastify.get('/api/admin/statistics/messages/recent', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { limit = 20 } = request.query as { limit?: number }
    const limitNum = Math.min(Math.max(Number.parseInt(String(limit)), 1), 100)

    const messages = await db.query.message.findMany({
      limit: limitNum,
      orderBy: [desc(schema.message.time)],
      with: {
        instance: true,
      },
    })

    return {
      success: true,
      data: messages.map((msg: any) => ({
        id: msg.id,
        qqRoomId: msg.qqRoomId.toString(),
        tgChatId: msg.tgChatId.toString(),
        time: msg.time,
        instanceId: msg.instanceId,
        instanceOwner: msg.instance?.owner.toString() || null,
      })),
    }
  })

  /**
   * GET /api/admin/statistics/performance
   * 获取性能指标
   */
  fastify.get('/api/admin/statistics/performance', {
    preHandler: authMiddleware,
  }, async () => {
    // 计算最近1小时的消息速率
    const oneHourAgo = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
    const recentMessagesResult = await db.select({ value: count() }).from(schema.message).where(gte(schema.message.time, oneHourAgo))
    const recentMessages = recentMessagesResult[0].value

    const messagesPerHour = recentMessages
    const messagesPerMinute = Math.round(recentMessages / 60)

    return {
      success: true,
      data: {
        messagesPerHour,
        messagesPerMinute,
        timestamp: new Date().toISOString(),
      },
    }
  })
}
