import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiResponse, authMiddleware, db } from '@napgram/runtime-kit'

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

    const [items, total] = await Promise.all([
      db.instance.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          qqBot: true,
          ForwardPair: {
            take: 5, // 只取前5个配对预览
          },
        },
        orderBy: {
          id: 'desc',
        },
      }),
      db.instance.count(),
    ])

    return ApiResponse.paginated(
      items.map(item => ({
        ...item,
        owner: item.owner.toString(),
        qqBot: item.qqBot
          ? {
              ...item.qqBot,
              uin: item.qqBot.uin?.toString() || null,
            }
          : null,
        ForwardPair: item.ForwardPair.map(pair => ({
          ...pair,
          qqRoomId: pair.qqRoomId.toString(),
          tgChatId: pair.tgChatId.toString(),
          qqFromGroupId: pair.qqFromGroupId?.toString() || null,
        })),
        pairCount: item.ForwardPair.length,
      })),
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

    const instance = await db.instance.findUnique({
      where: { id: Number.parseInt(id) },
      include: {
        qqBot: true,
        ForwardPair: true,
      },
    })

    if (!instance) {
      return reply.code(404).send(
        ApiResponse.error('Instance not found'),
      )
    }

    return {
      success: true,
      data: {
        ...instance,
        owner: instance.owner.toString(),
        qqBot: instance.qqBot
          ? {
              ...instance.qqBot,
              uin: instance.qqBot.uin?.toString() || null,
            }
          : null,
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
        const bot = await db.qqBot.create({
          data: {
            type: body.qqBot.type,
            name: body.qqBot.name || null,
            wsUrl: body.qqBot.wsUrl || null,
            uin: body.qqBot.uin ?? null,
          },
        })
        qqBotId = bot.id
      }

      const instance = await db.instance.create({
        data: {
          owner: body.owner,
          workMode: body.workMode,
          isSetup: false,
          qqBotId,
        },
      })

      // 审计日志
      const { AuthService } = await import('@napgram/runtime-kit')
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
      const currentInstance = await db.instance.findUnique({
        where: { id: instanceId },
        select: { id: true, qqBotId: true },
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
          await db.qqBot.update({
            where: { id: currentInstance.qqBotId },
            data: {
              type: body.qqBot.type,
              name: body.qqBot.name || null,
              wsUrl: body.qqBot.wsUrl || null,
              uin: body.qqBot.uin ?? null,
            },
          })
          qqBotId = currentInstance.qqBotId
        }
        else {
          const bot = await db.qqBot.create({
            data: {
              type: body.qqBot.type,
              name: body.qqBot.name || null,
              wsUrl: body.qqBot.wsUrl || null,
              uin: body.qqBot.uin ?? null,
            },
          })
          qqBotId = bot.id
        }
      }

      const instance = await db.instance.update({
        where: { id: instanceId },
        data: {
          ...(body.owner !== undefined && { owner: body.owner }),
          ...(body.workMode !== undefined && { workMode: body.workMode }),
          ...(body.isSetup !== undefined && { isSetup: body.isSetup }),
          ...(body.flags !== undefined && { flags: body.flags }),
          ...(qqBotId !== undefined && { qqBotId }),
        },
      })

      // 审计日志
      const { AuthService } = await import('@napgram/runtime-kit')
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
      if (error.code === 'P2025') {
        return reply.code(404).send(
          ApiResponse.error('Instance not found'),
        )
      }
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
      const instance = await db.instance.delete({
        where: { id: Number.parseInt(id) },
      })

      // 审计日志
      const { AuthService } = await import('@napgram/runtime-kit')
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
    const bots = await db.qqBot.findMany({
      include: {
        Instance: {
          select: {
            id: true,
            owner: true,
          },
        },
      },
    })

    return {
      success: true,
      items: bots.map(bot => ({
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

      const bot = await db.qqBot.create({
        data: {
          type: body.type,
          name: body.name || null,
          wsUrl: body.wsUrl || null,
          uin: body.uin ?? null,
        },
      })

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
