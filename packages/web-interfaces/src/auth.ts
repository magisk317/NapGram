import type { FastifyInstance } from 'fastify'
import process from 'node:process'
import '@fastify/cookie'
import { z } from 'zod'
import { ApiResponse } from '@napgram/infra-kit'
import { AuthService } from '@napgram/auth-kit'

/**
 * 认证 API 路由
 */
export default async function (fastify: FastifyInstance) {
  const loginSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
  })

  const tokenLoginSchema = z.object({
    token: z.string(),
  })

  const createUserSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    displayName: z.string().optional(),
    email: z.string().email().optional(),
  })

  const changePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(6),
  })

  /**
   * POST /api/auth/login
   * 用户名密码登录
   */
  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body)

      const result = await AuthService.loginWithPassword(
        body.username,
        body.password,
        request.ip,
        request.headers['user-agent'],
      )

      if (!result) {
        return reply.code(401).send(
          ApiResponse.error('Invalid username or password'),
        )
      }

      // 设置 cookie
      reply.setCookie('admin_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      })

      return {
        success: true,
        token: result.token,
        user: result.user,
      }
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: error.issues,
        })
      }
      throw error
    }
  })

  /**
   * POST /api/auth/login/token
   * Token 登录（验证 token 是否有效）
   */
  fastify.post('/api/auth/login/token', async (request, reply) => {
    try {
      const body = tokenLoginSchema.parse(request.body)

      const result = await AuthService.loginWithToken(body.token)

      if (!result) {
        return reply.code(401).send(
          ApiResponse.error('Invalid token'),
        )
      }

      // 设置 cookie
      reply.setCookie('admin_token', body.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      })

      return {
        success: true,
        type: result.type,
        userId: result.userId,
      }
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: error.issues,
        })
      }
      throw error
    }
  })

  /**
   * POST /api/auth/logout
   * 登出
   */
  fastify.post('/api/auth/logout', async (request, reply) => {
    const auth = (request as any).auth
    const token = auth?.token || request.cookies.admin_token

    if (token && auth?.type === 'session') {
      await AuthService.logout(token, auth.userId)
    }

    reply.clearCookie('admin_token')

    return ApiResponse.success(undefined, 'Logged out successfully')
  })

  /**
   * GET /api/auth/me
   * 获取当前用户信息（需要认证）
   */
  fastify.get('/api/auth/me', {
    preHandler: async (request, reply) => {
      const { authMiddleware } = await import('@napgram/auth-kit')
      await authMiddleware(request, reply)
    },
  }, async (request) => {
    const auth = (request as any).auth

    if (auth.type === 'env' || auth.type === 'access') {
      return {
        type: auth.type,
        user: null,
      }
    }

    if (auth.userId) {
      const { db, schema, eq } = await import('@napgram/infra-kit')
      const user = await db.query.adminUser.findFirst({
        where: eq(schema.adminUser.id, auth.userId),
        columns: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          createdAt: true,
        },
      })

      return {
        type: auth.type,
        user,
      }
    }

    return { type: auth.type, user: null }
  })

  /**
   * POST /api/auth/users
   * 创建新管理员用户（需要认证）
   */
  fastify.post('/api/auth/users', {
    preHandler: async (request, reply) => {
      const { authMiddleware } = await import('@napgram/auth-kit')
      await authMiddleware(request, reply)
    },
  }, async (request, reply) => {
    try {
      const body = createUserSchema.parse(request.body)
      const auth = (request as any).auth

      const user = await AuthService.createAdminUser(
        body.username,
        body.password,
        body.displayName,
        body.email,
        auth.userId,
      )

      return {
        success: true,
        user,
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: error.issues,
        })
      }
      if (error.code === 'P2002') {
        return reply.code(409).send(
          ApiResponse.error('Username already exists'),
        )
      }
      throw error
    }
  })

  /**
   * POST /api/auth/change-password
   * 修改密码（需要认证）
   */
  fastify.post('/api/auth/change-password', {
    preHandler: async (request, reply) => {
      const { authMiddleware } = await import('@napgram/auth-kit')
      await authMiddleware(request, reply)
    },
  }, async (request, reply) => {
    try {
      const body = changePasswordSchema.parse(request.body)
      const auth = (request as any).auth

      if (!auth.userId) {
        return reply.code(403).send(
          ApiResponse.error('Cannot change password for token-based auth'),
        )
      }

      const success = await AuthService.changePassword(
        auth.userId,
        body.oldPassword,
        body.newPassword,
      )

      if (!success) {
        return reply.code(400).send(
          ApiResponse.error('Invalid old password'),
        )
      }

      return ApiResponse.success(undefined, 'Password changed successfully')
    }
    catch (error) {
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
