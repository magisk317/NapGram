import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiResponse, db, getLogger, groupInfoCache, schema, eq, and, or, count, desc, inArray } from '@napgram/infra-kit'
import { Instance } from '@napgram/runtime-kit'
import { authMiddleware } from '@napgram/auth-kit'

const log = getLogger('PairsApi')

/**
 * 配对管理 API
 */
export default async function (fastify: FastifyInstance) {
  const bigIntId = z.preprocess((v) => {
    if (typeof v === 'bigint')
      return v
    if (typeof v === 'number' && Number.isFinite(v))
      return BigInt(v)
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed === '')
        return undefined
      if (/^-?\d+$/.test(trimmed))
        return BigInt(trimmed)
    }
    return v
  }, z.bigint())

  const optionalInt = z.preprocess((v) => {
    if (v === '' || v === undefined || v === null)
      return null
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed === '')
        return null
      const num = Number(trimmed)
      return Number.isFinite(num) ? num : v
    }
    return v
  }, z.number().int().nullable())

  const intWithDefault = (defaultValue: number) =>
    z.preprocess((v) => {
      if (v === '' || v === undefined || v === null)
        return defaultValue
      if (typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed === '')
          return defaultValue
        const num = Number(trimmed)
        return Number.isFinite(num) ? num : v
      }
      return v
    }, z.number().int())

  const optionalMode = z.preprocess((v) => {
    if (v === '' || v === undefined || v === null)
      return null
    if (typeof v === 'string') {
      const trimmed = v.trim().toLowerCase()
      if (trimmed === '' || trimmed === 'null' || trimmed === 'default')
        return null
    }
    return v
  }, z.enum(['00', '01', '10', '11']).nullable())

  const optionalText = z.preprocess((v) => {
    if (v === '' || v === undefined || v === null)
      return null
    if (typeof v === 'string' && v.trim() === '')
      return null
    return v
  }, z.string().nullable())

  const createPairSchema = z.object({
    qqRoomId: bigIntId,
    tgChatId: bigIntId,
    tgThreadId: optionalInt.optional(),
    instanceId: intWithDefault(0).default(0),
    forwardMode: optionalMode.optional(),
    nicknameMode: optionalMode.optional(),
    commandReplyMode: z.preprocess((v) => {
      if (v === '' || v === undefined || v === null)
        return null
      if (typeof v === 'string' && (v === '0' || v === '1'))
        return v
      return null
    }, z.enum(['0', '1']).nullable()).optional(),
    commandReplyFilter: z.preprocess((v) => {
      if (v === '' || v === undefined || v === null)
        return null
      if (typeof v === 'string' && (v === 'whitelist' || v === 'blacklist'))
        return v
      return null
    }, z.enum(['whitelist', 'blacklist']).nullable()).optional(),
    commandReplyList: optionalText.optional(),
    notifyTelegram: z.boolean().default(false),
    notifyQQ: z.boolean().default(false),
    ignoreRegex: optionalText.optional(),
    ignoreSenders: optionalText.optional(),
  })

  const updatePairSchema = z.object({
    qqRoomId: bigIntId.optional(),
    tgChatId: bigIntId.optional(),
    tgThreadId: optionalInt.optional(),
    instanceId: z.preprocess((v) => {
      if (v === '' || v === undefined || v === null)
        return undefined
      if (typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed === '')
          return undefined
        const num = Number(trimmed)
        return Number.isFinite(num) ? num : v
      }
      return v
    }, z.number().int()).optional(),
    forwardMode: optionalMode.optional(),
    nicknameMode: optionalMode.optional(),
    commandReplyMode: z.preprocess((v) => {
      if (v === '' || v === undefined || v === null)
        return null
      if (typeof v === 'string' && (v === '0' || v === '1'))
        return v
      return null
    }, z.enum(['0', '1']).nullable()).optional(),
    commandReplyFilter: z.preprocess((v) => {
      if (v === '' || v === undefined || v === null)
        return null
      if (typeof v === 'string' && (v === 'whitelist' || v === 'blacklist'))
        return v
      return null
    }, z.enum(['whitelist', 'blacklist']).nullable()).optional(),
    commandReplyList: optionalText.optional(),
    notifyTelegram: z.boolean().optional(),
    notifyQQ: z.boolean().optional(),
    ignoreRegex: optionalText.optional(),
    ignoreSenders: optionalText.optional(),
  })

  const refreshInstanceForwardMap = async (instanceId: number) => {
    const inst = Instance.instances.find((it: any) => it.id === instanceId)
    const map = inst?.forwardPairs as any
    if (map && typeof map.reload === 'function') {
      await map.reload()
      log.info({ instanceId }, 'forward map reloaded')
    }
  }

  /**
   * GET /api/admin/pairs
   * 获取所有配对
   */
  fastify.get('/api/admin/pairs', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { page = 1, pageSize = 20, instanceId, search, withNames = 'false' } = request.query as any
    const pageNum = typeof page === 'string' ? Number.parseInt(page, 10) : page
    const pageSizeNum = typeof pageSize === 'string' ? Number.parseInt(pageSize, 10) : pageSize
    const needNames = String(withNames).toLowerCase() === 'true'

    const filters: any[] = []

    if (instanceId !== undefined) {
      filters.push(eq(schema.forwardPair.instanceId, Number.parseInt(instanceId)))
    }

    if (search) {
      const trimmed = String(search).trim()
      if (/^-?\d+$/.test(trimmed)) {
        const id = BigInt(trimmed)
        filters.push(or(
          eq(schema.forwardPair.qqRoomId, id),
          eq(schema.forwardPair.tgChatId, id),
        ))
      }
    }

    const where = filters.length > 0 ? (filters.length === 1 ? filters[0] : and(...filters)) : undefined

    const [items, totalResult] = await Promise.all([
      db.query.forwardPair.findMany({
        where,
        offset: (pageNum - 1) * pageSizeNum,
        limit: pageSizeNum,
        with: {
          instance: {
            with: {
              qqBot: true,
            },
          },
        },
        orderBy: [desc(schema.forwardPair.id)],
      }),
      db.select({ value: count() }).from(schema.forwardPair).where(where),
    ])
    const total = totalResult[0].value

    const mapped = items.map((item: any) => ({
      ...item,
      qqRoomId: item.qqRoomId.toString(),
      tgChatId: item.tgChatId.toString(),
      qqFromGroupId: item.qqFromGroupId?.toString() || null,
      instance: item.instance
        ? {
          ...item.instance,
          owner: item.instance.owner.toString(),
          qqBot: item.instance.qqBot
            ? {
              ...item.instance.qqBot,
              uin: item.instance.qqBot.uin?.toString() || null,
            }
            : null,
        }
        : null,
      notifyTelegram: item.notifyTelegram,
      notifyQQ: item.notifyQQ,
    }))

    if (needNames) {
      await Promise.all(mapped.map(async (pair: any) => {
        try {
          pair.qqRoomName = await resolveQqGroupName(pair.instanceId, pair.qqRoomId)
        }
        catch (e: any) {
          log.debug(e, 'resolveQqGroupName error')
        }
        try {
          pair.tgChatName = await resolveTgChatName(pair.instanceId, pair.tgChatId)
        }
        catch (e: any) {
          log.debug(e, 'resolveTgChatName error')
        }
      }))
    }

    return ApiResponse.paginated(mapped, total, page, pageSize)
  })

  /**
   * GET /api/admin/pairs/:id
   * 获取单个配对详情
   */
  fastify.get('/api/admin/pairs/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const pair = await db.query.forwardPair.findFirst({
      where: eq(schema.forwardPair.id, Number.parseInt(id)),
      with: {
        instance: {
          with: {
            qqBot: true,
          },
        },
      },
    })

    if (!pair) {
      return reply.code(404).send({
        success: false,
        error: 'Pair not found',
      })
    }

    return {
      success: true,
      data: {
        ...pair,
        qqRoomId: pair.qqRoomId.toString(),
        tgChatId: pair.tgChatId.toString(),
        qqFromGroupId: pair.qqFromGroupId?.toString() || null,
        instance: pair.instance
          ? {
            ...pair.instance,
            owner: pair.instance.owner.toString(),
            qqBot: pair.instance.qqBot
              ? {
                ...pair.instance.qqBot,
                uin: pair.instance.qqBot.uin?.toString() || null,
              }
              : null,
          }
          : null,
        notifyTelegram: pair.notifyTelegram,
        notifyQQ: pair.notifyQQ,
      },
    }
  })

  /**
   * POST /api/admin/pairs
   * 创建新配对
   */
  fastify.post('/api/admin/pairs', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const body = createPairSchema.parse(request.body)
      const auth = (request as any).auth

      const pairArr = await db.insert(schema.forwardPair).values({
        qqRoomId: body.qqRoomId,
        tgChatId: body.tgChatId,
        tgThreadId: body.tgThreadId || null,
        instanceId: body.instanceId,
        forwardMode: body.forwardMode || null,
        nicknameMode: body.nicknameMode || null,
        commandReplyMode: body.commandReplyMode || null,
        commandReplyFilter: body.commandReplyFilter || null,
        commandReplyList: body.commandReplyList || null,
        notifyTelegram: body.notifyTelegram,
        notifyQQ: body.notifyQQ,
        ignoreRegex: body.ignoreRegex || null,
        ignoreSenders: body.ignoreSenders || null,
      }).returning()
      const pair = pairArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'create_pair',
        'forward_pair',
        pair.id.toString(),
        {
          qqRoomId: pair.qqRoomId.toString(),
          tgChatId: pair.tgChatId.toString(),
        },
        request.ip,
        request.headers['user-agent'],
      )

      await refreshInstanceForwardMap(pair.instanceId)
      await notifyPairBinding(pair, {
        notifyTelegram: body.notifyTelegram,
        notifyQQ: body.notifyQQ,
      })

      return {
        success: true,
        data: {
          ...pair,
          qqRoomId: pair.qqRoomId.toString(),
          tgChatId: pair.tgChatId.toString(),
          qqFromGroupId: pair.qqFromGroupId?.toString() || null,
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        log.warn({ issues: error.issues }, 'create_pair invalid request')
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: error.issues,
        })
      }
      if (error && (error.code === 'P2002' || error.constraint?.includes('Unique'))) {
        log.warn(error, 'create_pair conflict')
        return reply.code(409).send(
          {
            ...ApiResponse.error('Pair already exists for this QQ room or TG chat'),
            errorCode: error.code,
          },
        )
      }
      log.error(error, 'create_pair failed')
      throw error
    }
  })

  /**
   * PUT /api/admin/pairs/:id
   * 更新配对
   */
  fastify.put('/api/admin/pairs/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const body = updatePairSchema.parse(request.body)
      const auth = (request as any).auth

      const pairId = Number.parseInt(id)
      const existing = await db.query.forwardPair.findFirst({
        where: eq(schema.forwardPair.id, pairId),
      })
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Pair not found',
        })
      }

      const updatedArr = await db.update(schema.forwardPair)
        .set({
          ...(body.qqRoomId !== undefined ? { qqRoomId: body.qqRoomId } : {}),
          ...(body.tgChatId !== undefined ? { tgChatId: body.tgChatId } : {}),
          ...(body.tgThreadId !== undefined ? { tgThreadId: body.tgThreadId } : {}),
          ...(body.instanceId !== undefined ? { instanceId: body.instanceId } : {}),
          forwardMode: body.forwardMode,
          nicknameMode: body.nicknameMode,
          commandReplyMode: body.commandReplyMode,
          commandReplyFilter: body.commandReplyFilter,
          commandReplyList: body.commandReplyList,
          ...(body.notifyTelegram !== undefined ? { notifyTelegram: body.notifyTelegram } : {}),
          ...(body.notifyQQ !== undefined ? { notifyQQ: body.notifyQQ } : {}),
          ignoreRegex: body.ignoreRegex,
          ignoreSenders: body.ignoreSenders,
        })
        .where(eq(schema.forwardPair.id, pairId))
        .returning()
      const pair = updatedArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'update_pair',
        'forward_pair',
        pair.id.toString(),
        body,
        request.ip,
        request.headers['user-agent'],
      )

      await refreshInstanceForwardMap(existing.instanceId)
      if (pair.instanceId !== existing.instanceId) {
        await refreshInstanceForwardMap(pair.instanceId)
      }

      return {
        success: true,
        data: {
          ...pair,
          qqRoomId: pair.qqRoomId.toString(),
          tgChatId: pair.tgChatId.toString(),
          qqFromGroupId: pair.qqFromGroupId?.toString() || null,
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        log.warn({ issues: error.issues }, 'update_pair invalid request')
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: error.issues,
        })
      }
      if (error && (error.code === 'P2002' || error.constraint?.includes('Unique'))) {
        log.warn(error, 'update_pair conflict')
        return reply.code(409).send({
          ...ApiResponse.error('Pair already exists for this QQ room or TG chat'),
          errorCode: error.code,
        })
      }
      log.error(error, 'update_pair failed')
      throw error
    }
  })

  /**
   * DELETE /api/admin/pairs/:id
   * 删除配对
   */
  fastify.delete('/api/admin/pairs/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const auth = (request as any).auth

    try {
      const pairId = Number.parseInt(id)
      const existing = await db.query.forwardPair.findFirst({
        where: eq(schema.forwardPair.id, pairId),
      })
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Pair not found',
        })
      }

      const pairArr = await db.delete(schema.forwardPair)
        .where(eq(schema.forwardPair.id, pairId))
        .returning()
      const pair = pairArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'delete_pair',
        'forward_pair',
        pair.id.toString(),
        {
          qqRoomId: pair.qqRoomId.toString(),
          tgChatId: pair.tgChatId.toString(),
        },
        request.ip,
        request.headers['user-agent'],
      )

      await refreshInstanceForwardMap(existing.instanceId)

      return ApiResponse.success(undefined, 'Pair deleted successfully')
    }
    catch (error: any) {
      log.error(error, 'delete_pair failed')
      throw error
    }
  })

  interface PairNotificationOptions {
    notifyTelegram: boolean
    notifyQQ: boolean
  }

  async function notifyPairBinding(pair: any, options: PairNotificationOptions) {
    if (!options.notifyTelegram && !options.notifyQQ)
      return

    const instance = Instance.instances.find((it: any) => it.id === pair.instanceId)
    if (!instance) {
      log.warn({ instanceId: pair.instanceId }, 'Instance not available for pair notification')
      return
    }

    const tgChatId = pair.tgChatId
    const tgChatIdStr = tgChatId?.toString() || ''
    const tgChatIdValue = tgChatId !== null && tgChatId !== undefined ? Number(tgChatId) : null
    const qqRoomId = pair.qqRoomId?.toString() || ''
    const description = `✅ 新配对已创建\nQQ 群: ${qqRoomId}\nTG 群: ${tgChatIdStr}${pair.tgThreadId ? ` 话题 ${pair.tgThreadId}` : ''}`

    if (options.notifyTelegram && instance.tgBot) {
      try {
        if (tgChatIdValue === null || !Number.isFinite(tgChatIdValue)) {
          log.warn({ instanceId: instance.id, tgChatId: tgChatIdStr }, 'Invalid Telegram chat id for notification')
          return
        }
        const chat = await instance.tgBot.getChat(tgChatIdValue)
        await chat.sendMessage(description, { disableWebPreview: true })
        log.info({ instanceId: instance.id, tgChatId: tgChatIdStr }, 'Telegram binding notification sent')
      }
      catch (error: any) {
        log.warn(error, 'Failed to send Telegram binding notification')
      }
    }

    if (options.notifyQQ && instance.qqClient) {
      try {
        const now = Date.now()
        await instance.qqClient.sendMessage(String(qqRoomId), {
          id: `binding-${now}`,
          platform: 'qq',
          sender: {
            id: String(instance.qqClient.uin ?? ''),
            name: instance.qqClient.nickname || 'NapGram',
          },
          chat: { id: String(qqRoomId), type: 'group' },
          content: [{ type: 'text', data: { text: description } }],
          timestamp: now,
        } as any)
        log.info({ instanceId: instance.id, qqRoomId }, 'QQ binding notification sent')
      }
      catch (error: any) {
        log.warn(error, 'Failed to send QQ binding notification')
      }
    }
  }

  /**
   * GET /api/admin/pairs/:id/statistics
   * 获取配对的统计信息
   */
  fastify.get('/api/admin/pairs/:id/statistics', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const pair = await db.query.forwardPair.findFirst({
      where: eq(schema.forwardPair.id, Number.parseInt(id)),
    })

    if (!pair) {
      return reply.code(404).send({
        success: false,
        error: 'Pair not found',
      })
    }

    // 统计消息数量
    const messageCountResult = await db.select({ value: count() }).from(schema.message).where(and(
      eq(schema.message.qqRoomId, pair.qqRoomId),
      eq(schema.message.tgChatId, pair.tgChatId),
      eq(schema.message.instanceId, pair.instanceId),
    ))
    const messageCount = messageCountResult[0].value

    // 最近消息
    const recentMessage = await db.query.message.findFirst({
      where: and(
        eq(schema.message.qqRoomId, pair.qqRoomId),
        eq(schema.message.tgChatId, pair.tgChatId),
        eq(schema.message.instanceId, pair.instanceId),
      ),
      orderBy: [desc(schema.message.time)],
    })

    return {
      success: true,
      data: {
        messageCount,
        lastMessageTime: recentMessage?.time || null,
      },
    }
  })
}

async function resolveQqGroupName(instanceId: number, qqRoomId: string) {
  const cacheKey = `qqname:${instanceId}:${qqRoomId}`
  const cached = groupInfoCache.get(cacheKey)
  if (cached)
    return cached as string

  const instance = Instance.instances.find((it: any) => it.id === instanceId)
  if (!instance?.qqClient)
    return null
  try {
    const groupId = qqRoomId.startsWith('-') ? qqRoomId.slice(1) : qqRoomId
    const info = await instance.qqClient.getGroupInfo(groupId)
    const name = info?.name || null
    if (name)
      groupInfoCache.set(cacheKey, name)
    return name
  }
  catch (e) {
    log.debug(e, 'Failed to resolve QQ group name')
    return null
  }
}

async function resolveTgChatName(instanceId: number, tgChatId: string) {
  const cacheKey = `tgname:${instanceId}:${tgChatId}`
  const cached = groupInfoCache.get(cacheKey)
  if (cached)
    return cached as string

  const instance = Instance.instances.find((it: any) => it.id === instanceId)
  const chatIdNum = Number(tgChatId)
  if (!instance?.tgBot || Number.isNaN(chatIdNum))
    return null
  try {
    const chat = await instance.tgBot.getChat(chatIdNum)
    const name = (chat.chat as any)?.title || null
    if (name)
      groupInfoCache.set(cacheKey, name)
    return name
  }
  catch (e) {
    log.debug(e, 'Failed to resolve TG chat name')
    return null
  }
}
