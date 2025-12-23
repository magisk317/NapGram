import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Register the same handler for two routes (useful for legacy API compatibility)
 */
export function registerDualRoute(
  fastify: FastifyInstance,
  path1: string,
  path2: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any> | any,
  opts?: { schema?: any },
) {
  const config = opts?.schema ? { schema: opts.schema } : {}
  fastify.get(path1, config, handler)
  fastify.get(path2, config, handler)
}

/**
 * Common error response helpers
 */
export const ErrorResponses = {
  notFound(reply: FastifyReply, message = 'Not Found') {
    return reply.code(404).send({ error: message })
  },

  badRequest(reply: FastifyReply, message = 'Bad Request') {
    return reply.code(400).send({ error: message })
  },

  unauthorized(reply: FastifyReply, message = 'Unauthorized') {
    return reply.code(401).send({ error: message })
  },

  forbidden(reply: FastifyReply, message = 'Forbidden') {
    return reply.code(403).send({ error: message })
  },

  internalError(reply: FastifyReply, message = 'Internal Server Error') {
    return reply.code(500).send({ error: message })
  },
}
