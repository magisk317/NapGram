import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  db,
  ErrorResponses,
  getLogger,
  Instance,
  TTLCache,
} from '@napgram/runtime-kit/legacy'
import { authMiddleware } from '@napgram/auth-kit'
import { processNestedForward } from '@napgram/message-kit'

const forwardCache = new TTLCache<string, any>(60000) // 1 minute TTL
const logger = getLogger('MessagesApi')

export default async function (fastify: FastifyInstance) {
  // 管理端 - 消息列表
  fastify.get('/api/admin/messages', {
    preHandler: authMiddleware,
  }, async (request: FastifyRequest) => {
    const { page = 1, limit = 20, search, from, to, sortBy = 'id', sortDir = 'desc' } = request.query as any
    const take = Math.min(1000, Math.max(Number.parseInt(String(limit)) || 20, 1))
    const skip = (Math.max(Number.parseInt(String(page)) || 1, 1) - 1) * take

    const where: any = {}
    if (search) {
      where.contentRaw = { contains: search }
    }
    if (from) {
      where.fromId = from
    }
    if (to) {
      where.toId = to
    }

    const [total, items] = await Promise.all([
      (db as any).message.count({ where }),
      (db as any).message.findMany({
        where,
        take,
        skip,
        orderBy: { [sortBy]: sortDir },
      }),
    ])

    return {
      code: 0,
      data: {
        total,
        items,
      },
    }
  })

  // 补发/重试转发
  fastify.post('/api/admin/messages/retry', {
    preHandler: authMiddleware,
  }, async (request: FastifyRequest, reply) => {
    const { messageId } = request.body as any
    if (!messageId) {
      return ErrorResponses.badRequest(reply, 'messageId is required')
    }

    const msg = await (db as any).message.findUnique({
      where: { id: messageId },
    })

    if (!msg) {
      return ErrorResponses.notFound(reply, 'Message not found')
    }

    try {
      // 这里的逻辑需要根据业务需求实现具体的补发
      // 目前简单返回成功
      return { code: 0, message: 'Retry initiated' }
    }
    catch (error) {
      logger.error(error, `Failed to retry message ${messageId}`)
      return ErrorResponses.internalError(reply, 'Failed to retry message')
    }
  })

  // 转发搜索/预览 (由转发逻辑调用)
  fastify.post('/api/admin/messages/forward-preview', {
    preHandler: authMiddleware,
  }, async (request: FastifyRequest, reply) => {
    const { content, sourcePlatform, targetPlatform } = request.body as any

    try {
      // processNestedForward modifies content in-place
      await processNestedForward(content, 0) // Using 0 as a dummy ID for preview
      return { code: 0, data: content }
    }
    catch (error) {
      return ErrorResponses.internalError(reply, 'Forward preview failed')
    }
  })
}
