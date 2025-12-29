import type { FastifyInstance } from 'fastify'
import { Buffer } from 'node:buffer'
import { ErrorResponses, getLogger, registerDualRoute } from '@napgram/runtime-kit'

const logger = getLogger('QQAvatar')

export default async function (fastify: FastifyInstance) {
  const handler = async (request: any, reply: any) => {
    const { userId } = request.params
    try {
      const url = `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=0`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (contentType) {
        reply.header('content-type', contentType)
      }
      reply.header('cache-control', 'public, max-age=86400') // Cache for 1 day

      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }
    catch (e) {
      logger.error(`Failed to fetch avatar for ${userId}:`, e)
      return ErrorResponses.notFound(reply, 'Avatar not found')
    }
  }

  registerDualRoute(
    fastify,
    '/qqAvatar/:userId',
    '/api/avatar/qq/:userId',
    handler,
  )
}
