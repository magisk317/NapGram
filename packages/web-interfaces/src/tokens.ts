import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiResponse, db, schema, eq, desc } from '@napgram/infra-kit'
import { authMiddleware, TokenManager } from '@napgram/auth-kit'

function maskToken(token: string) {
  if (!token)
    return ''
  if (token.length <= 10)
    return `${token.slice(0, 2)}***${token.slice(-2)}`
  return `${token.slice(0, 6)}...${token.slice(-4)}`
}

/**
 * Access Token 管理 API（用于“用户自定义 token 登录”）
 *
 * 注意：
 * - AccessToken 本身拥有完整后台权限，因此默认只允许 ENV/SESSION 创建/撤销，避免 token 自繁殖
 * - 列表不返回明文 token，仅返回 mask
 */
export default async function (fastify: FastifyInstance) {
  const createSchema = z.object({
    token: z
      .preprocess(v => (typeof v === 'string' ? v.trim() : v), z.string().min(10).max(512).regex(/^\S+$/))
      .optional(),
    description: z.string().max(200).optional(),
    expiresAt: z
      .string()
      .datetime()
      .optional()
      .transform(v => (v ? new Date(v) : undefined)),
    expiresInDays: z.number().int().min(1).max(3650).optional(),
  })

  fastify.get(
    '/api/admin/tokens',
    {
      preHandler: authMiddleware,
    },
    async () => {
      const tokens = await db.select({
        id: schema.accessToken.id,
        token: schema.accessToken.token,
        description: schema.accessToken.description,
        isActive: schema.accessToken.isActive,
        expiresAt: schema.accessToken.expiresAt,
        createdAt: schema.accessToken.createdAt,
        createdBy: schema.accessToken.createdBy,
        lastUsedAt: schema.accessToken.lastUsedAt,
      })
        .from(schema.accessToken)
        .orderBy(desc(schema.accessToken.id))

      return ApiResponse.success(
        tokens.map((t: any) => ({
          ...t,
          token: maskToken(t.token),
        })),
      )
    },
  )

  fastify.post(
    '/api/admin/tokens',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      try {
        const auth = (request as any).auth as { type: 'access' | 'session' | 'env', userId?: number }
        if (auth.type === 'access') {
          return reply.code(403).send(ApiResponse.error('Access token cannot create more tokens'))
        }

        const body = createSchema.parse(request.body)
        const expiresAt
          = body.expiresAt
          ?? (body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000) : undefined)

        const token = body.token
          ? (
            await db.insert(schema.accessToken).values({
              token: body.token,
              description: body.description,
              createdBy: auth.userId ?? null,
              expiresAt,
              isActive: true,
            }).returning()
          )[0].token
          : await TokenManager.createAccessToken(body.description, auth.userId, expiresAt)
        return ApiResponse.success({ token }, 'Token created')
      }
      catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid request',
            details: error.issues,
          })
        }
        if (error && (error.code === 'P2002' || error.constraint?.includes('Unique'))) {
          return reply.code(409).send(ApiResponse.error('Token already exists'))
        }
        throw error
      }
    },
  )

  fastify.delete(
    '/api/admin/tokens/:id',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      try {
        const auth = (request as any).auth as { type: 'access' | 'session' | 'env', userId?: number }
        if (auth.type === 'access') {
          return reply.code(403).send(ApiResponse.error('Access token cannot revoke tokens'))
        }

        const { id } = request.params as { id: string }
        const tokenId = Number(id)
        if (!Number.isFinite(tokenId)) {
          return reply.code(400).send(ApiResponse.error('Invalid token id'))
        }

        await db.update(schema.accessToken)
          .set({ isActive: false })
          .where(eq(schema.accessToken.id, tokenId))

        return ApiResponse.success(undefined, 'Token revoked')
      }
      catch (error: any) {
        if (error.code === 'P2025') {
          return reply.code(404).send(ApiResponse.error('Token not found'))
        }
        throw error
      }
    },
  )
}
