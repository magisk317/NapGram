import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService, TokenManager } from './index'

/**
 * 认证中间件 - 验证请求是否携带有效 token
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // 从 header 或 cookie 获取 token
  let token: string | undefined

  // 1. Authorization header
  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  }

  // 2. Cookie
  if (!token && request.cookies.admin_token) {
    token = request.cookies.admin_token
  }

  // 3. Query parameter (仅用于某些特殊场景，如下载链接)
  if (!token && request.query && typeof request.query === 'object' && 'token' in request.query) {
    token = request.query.token as string
  }

  if (!token) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'No authentication token provided',
    })
  }

  // 验证 token
  const authResult = await TokenManager.verifyToken(token)

  if (!authResult) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    })
  }

  // 将认证信息附加到 request 对象
  (request as any).auth = {
    type: authResult.type,
    userId: authResult.userId,
    token,
  }

  // 记录 API 访问日志（可选）
  if (authResult.userId) {
    const action = `api:${request.method}:${request.url}`
    await AuthService.logAudit(
      authResult.userId,
      action,
      undefined,
      undefined,
      undefined,
      request.ip,
      request.headers['user-agent'],
    )
  }
}

/**
 * 可选认证中间件 - token 有效时附加认证信息，无效时继续
 */
export async function optionalAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  let token: string | undefined

  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  }

  if (!token && request.cookies.admin_token) {
    token = request.cookies.admin_token
  }

  if (token) {
    const authResult = await TokenManager.verifyToken(token)
    if (authResult) {
      (request as any).auth = {
        type: authResult.type,
        userId: authResult.userId,
        token,
      }
    }
  }
}

/**
 * TypeScript 类型扩展
 */
declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      type: 'access' | 'session' | 'env'
      userId?: number
      token: string
    }
  }
}
