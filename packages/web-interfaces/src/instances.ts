import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiResponse, db, schema, eq, count, desc, sql, env } from '@napgram/infra-kit'
import { authMiddleware } from '@napgram/auth-kit'

/**
 * 实例管理 API
 */
export default async function (fastify: FastifyInstance) {
  const toOptionalBigInt = z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined)
        return undefined
      if (typeof val === 'bigint')
        return val
      return BigInt(val as any)
    },
    z.bigint().optional(),
  )

  const toRequiredBigInt = z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined)
        return undefined
      if (typeof val === 'bigint')
        return val
      return BigInt(val as any)
    },
    z.bigint(),
  )

  const optionalString = z.preprocess(
    val => (val === '' || val === null || val === undefined ? undefined : val),
    z.string().optional(),
  )

  const qqBotSchema = z.object({
    type: z.literal('napcat').default('napcat'),
    name: optionalString,
    wsUrl: optionalString,
    uin: toOptionalBigInt,
  }).nullable()

  const createInstanceSchema = z.object({
    owner: toRequiredBigInt,
    workMode: z.string().default(''),
    qqBotId: z.number().optional(),
    qqBot: qqBotSchema.optional(),
  })

  const updateInstanceSchema = z.object({
    owner: toOptionalBigInt,
    workMode: z.string().optional(),
    isSetup: z.boolean().optional(),
    flags: z.number().optional(),
    qqBot: qqBotSchema.optional(),
  })

  const toJsonSafe = (value: any): any => {
    if (typeof value === 'bigint')
      return value.toString()
    if (Array.isArray(value))
      return value.map(toJsonSafe)
    if (value && typeof value === 'object') {
      if (value instanceof Date)
        return value
      const out: Record<string, any> = {}
      for (const [key, val] of Object.entries(value))
        out[key] = toJsonSafe(val)
      return out
    }
    return value
  }

  const createQqBotSchema = z.object({
    type: z.literal('napcat').default('napcat'),
    name: optionalString,
    wsUrl: optionalString,
    uin: toOptionalBigInt,
  })

  /**
   * GET /api/admin/instances
   * 获取所有实例
   */
  fastify.get('/api/admin/instances', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { page = 1, pageSize = 20 } = request.query as any

    const [items, totalResult] = await Promise.all([
      db.query.instance.findMany({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        with: {
          qqBot: true,
          forwardPairs: {
            limit: 5,
          },
        },
        orderBy: [desc(schema.instance.id)],
      }),
      db.select({ value: count() }).from(schema.instance),
    ])
    const total = totalResult[0].value

    return ApiResponse.paginated(
      items.map((item: any) => {
        // Fallback to env vars for Instance 0
        const isDefaultInstance = item.id === 0
        const owner = (item.owner === 0n && isDefaultInstance && env.ADMIN_TG) ? env.ADMIN_TG.toString() : item.owner.toString()

        let qqBot = item.qqBot
          ? {
            ...item.qqBot,
            uin: item.qqBot.uin?.toString() || null,
          }
          : null

        if (!qqBot && isDefaultInstance && env.NAPCAT_WS_URL) {
          qqBot = {
            type: 'napcat',
            name: 'System Bootstrapped',
            wsUrl: env.NAPCAT_WS_URL,
            uin: env.ADMIN_QQ?.toString() || null,
            id: -1, // Virtual ID
            password: null,
            platform: null,
            signApi: null,
            signVer: null,
            signDockerId: null,
          }
        }

        return {
          ...toJsonSafe(item),
          owner,
          qqBot,
          ForwardPair: item.forwardPairs.map((pair: any) => ({
            ...pair,
            qqRoomId: pair.qqRoomId.toString(),
            tgChatId: pair.tgChatId.toString(),
            qqFromGroupId: pair.qqFromGroupId?.toString() || null,
          })),
          pairCount: item.forwardPairs.length,
        }
      }),
      total,
      page,
      pageSize,
    )
  })

  /**
   * GET /api/admin/instances/:id
   * 获取单个实例详情
   */
  fastify.get('/api/admin/instances/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const instanceId = Number.parseInt(id)

    const instance = await db.query.instance.findFirst({
      where: eq(schema.instance.id, instanceId),
      with: {
        qqBot: true,
        forwardPairs: true,
      },
    })

    if (!instance) {
      return reply.code(404).send(
        ApiResponse.error('Instance not found'),
      )
    }

    // Fallback logic
    const isDefaultInstance = instance.id === 0
    const owner = (instance.owner === 0n && isDefaultInstance && env.ADMIN_TG) ? env.ADMIN_TG.toString() : instance.owner.toString()

    let qqBot = instance.qqBot
      ? {
        ...instance.qqBot,
        uin: instance.qqBot.uin?.toString() || null,
      }
      : null

    if (!qqBot && isDefaultInstance && env.NAPCAT_WS_URL) {
      qqBot = {
        type: 'napcat',
        name: 'System Bootstrapped',
        wsUrl: env.NAPCAT_WS_URL,
        uin: env.ADMIN_QQ?.toString() || null,
        id: -1,
        password: null,
        platform: null,
        signApi: null,
        signVer: null,
        signDockerId: null,
      }
    }

    return {
      success: true,
      data: {
        ...toJsonSafe(instance),
        owner,
        qqBot,
      },
    }
  })

  /**
   * POST /api/admin/instances
   * 创建新实例
   */
  fastify.post('/api/admin/instances', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const body = createInstanceSchema.parse(request.body)
      const auth = (request as any).auth

      let qqBotId = body.qqBotId || null
      if (body.qqBot) {
        const botArr = await db.insert(schema.qqBot).values({
          type: body.qqBot.type,
          name: body.qqBot.name || null,
          wsUrl: body.qqBot.wsUrl || null,
          uin: body.qqBot.uin ?? null,
        }).returning()
        qqBotId = botArr[0].id
      }

      const instanceArr = await db.insert(schema.instance).values({
        owner: body.owner,
        workMode: body.workMode,
        isSetup: false,
        qqBotId,
      }).returning()
      const instance = instanceArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'create_instance',
        'instance',
        instance.id.toString(),
        {
          owner: instance.owner.toString(),
          workMode: instance.workMode,
        },
        request.ip,
        request.headers['user-agent'],
      )

      return {
        success: true,
        data: {
          ...instance,
          owner: instance.owner.toString(),
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          ...ApiResponse.error('Invalid request'),
          details: error.issues,
        })
      }
      throw error
    }
  })

  /**
   * PUT /api/admin/instances/:id
   * 更新实例
   */
  fastify.put('/api/admin/instances/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const body = updateInstanceSchema.parse(request.body)
      const auth = (request as any).auth

      const instanceId = Number.parseInt(id)
      const currentInstance = await db.query.instance.findFirst({
        where: eq(schema.instance.id, instanceId),
        columns: { id: true, qqBotId: true },
      })
      if (!currentInstance) {
        return reply.code(404).send(
          ApiResponse.error('Instance not found'),
        )
      }

      let qqBotId: number | null | undefined
      if (body.qqBot !== undefined) {
        if (body.qqBot === null) {
          qqBotId = null
        }
        else if (currentInstance.qqBotId) {
          await db.update(schema.qqBot)
            .set({
              type: body.qqBot.type,
              name: body.qqBot.name || null,
              wsUrl: body.qqBot.wsUrl || null,
              uin: body.qqBot.uin ?? null,
            })
            .where(eq(schema.qqBot.id, currentInstance.qqBotId))
          qqBotId = currentInstance.qqBotId
        }
        else {
          const botArr = await db.insert(schema.qqBot).values({
            type: body.qqBot.type,
            name: body.qqBot.name || null,
            wsUrl: body.qqBot.wsUrl || null,
            uin: body.qqBot.uin ?? null,
          }).returning()
          qqBotId = botArr[0].id
        }
      }

      const updatedArr = await db.update(schema.instance)
        .set({
          ...(body.owner !== undefined && { owner: body.owner }),
          ...(body.workMode !== undefined && { workMode: body.workMode }),
          ...(body.isSetup !== undefined && { isSetup: body.isSetup }),
          ...(body.flags !== undefined && { flags: body.flags }),
          ...(qqBotId !== undefined && { qqBotId }),
        })
        .where(eq(schema.instance.id, instanceId))
        .returning()
      const instance = updatedArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'update_instance',
        'instance',
        instance.id.toString(),
        body,
        request.ip,
        request.headers['user-agent'],
      )

      return {
        success: true,
        data: {
          ...instance,
          owner: instance.owner.toString(),
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          ...ApiResponse.error('Invalid request'),
          details: error.issues,
        })
      }
      return reply.code(404).send(
        ApiResponse.error('Instance update failed'),
      )
      throw error
    }
  })

  /**
   * DELETE /api/admin/instances/:id
   * 删除实例
   */
  fastify.delete('/api/admin/instances/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const auth = (request as any).auth

    try {
      const instanceArr = await db.delete(schema.instance)
        .where(eq(schema.instance.id, Number.parseInt(id)))
        .returning()
      const instance = instanceArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'delete_instance',
        'instance',
        instance.id.toString(),
        {
          owner: instance.owner.toString(),
          workMode: instance.workMode,
        },
        request.ip,
        request.headers['user-agent'],
      )

      return ApiResponse.success(undefined, 'Instance deleted successfully')
    }
    catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send(
          ApiResponse.error('Instance not found'),
        )
      }
      throw error
    }
  })

  /**
   * GET /api/admin/qqbots
   * 获取所有 QQ Bot 配置
   */
  fastify.get('/api/admin/qqbots', {
    preHandler: authMiddleware,
  }, async () => {
    const bots = await db.query.qqBot.findMany({
      with: {
        instances: {
          columns: {
            id: true,
            owner: true,
          },
        },
      },
    })

    return {
      success: true,
      data: bots.map((bot: any) => ({
        ...bot,
        uin: bot.uin?.toString() || null,
        password: bot.password ? '******' : null, // 隐藏密码
      })),
    }
  })

  /**
   * POST /api/admin/qqbots
   * 创建 QQ Bot 配置
   */
  fastify.post('/api/admin/qqbots', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const body = createQqBotSchema.parse(request.body)

      const botArr = await db.insert(schema.qqBot).values({
        type: body.type,
        name: body.name || null,
        wsUrl: body.wsUrl || null,
        uin: body.uin ?? null,
      }).returning()

      const bot = botArr[0]

      return {
        success: true,
        data: {
          ...bot,
          uin: bot.uin?.toString() || null,
          password: bot.password ? '******' : null,
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          ...ApiResponse.error('Invalid request'),
          details: error.issues,
        })
      }
      throw error
    }
  })
}
