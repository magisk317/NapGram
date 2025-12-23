import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { ErrorResponses } from '../shared/utils/fastify'
import { getMimeType } from '../shared/utils/mime'
import { TEMP_PATH } from '../shared/utils/temp'

export default async function (fastify: FastifyInstance) {
  fastify.get('/temp/:filename', async (request: any, reply: any) => {
    const { filename } = request.params
    const filePath = path.join(TEMP_PATH, filename)

    // Prevent directory traversal
    if (!path.resolve(filePath).startsWith(path.resolve(TEMP_PATH))) {
      return ErrorResponses.forbidden(reply)
    }

    if (fs.existsSync(filePath)) {
      reply.header('Content-Type', getMimeType(filename))
      return fs.createReadStream(filePath)
    }

    return ErrorResponses.notFound(reply)
  })
}
