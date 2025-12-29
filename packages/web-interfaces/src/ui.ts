import type { FastifyInstance } from 'fastify'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'

import { env, ErrorResponses, getMimeType } from '@napgram/runtime-kit'

export default async function (fastify: FastifyInstance) {
  if (env.UI_PROXY) {
    fastify.all('/*', async (request: any, reply: any) => {
      const targetUrl = new URL(env.UI_PROXY!)
      const reqUrl = new URL(request.url, targetUrl)
      reqUrl.protocol = targetUrl.protocol
      reqUrl.hostname = targetUrl.hostname
      reqUrl.port = targetUrl.port

      try {
        const fetchOptions: RequestInit = {
          method: request.method,
          headers: request.headers as any,
          body: request.body ? JSON.stringify(request.body) : undefined,
        }

        // Remove host header to avoid conflicts
        if (fetchOptions.headers) {
          delete (fetchOptions.headers as any).host
        }

        const response = await fetch(reqUrl.toString(), fetchOptions)

        reply.code(response.status)

        // Copy headers
        response.headers.forEach((value, key) => {
          reply.header(key, value)
        })

        // Return body as stream
        return Buffer.from(await response.arrayBuffer())
      }
      catch (err) {
        request.log.error('Proxy error', err)
        return reply.code(502).send({ error: 'Bad Gateway' })
      }
    })
  }
  else if (env.UI_PATH) {
    // Serve assets (dynamic, so dev rebuild doesn't require server restart)
    const assetsPath = path.join(env.UI_PATH, 'assets')
    fastify.get('/assets/*', async (req: any, reply: any) => {
      const name = String((req.params as any)['*'] || '')
      const safeName = path.basename(name)

      if (!safeName || safeName !== name) {
        return ErrorResponses.forbidden(reply)
      }

      const filePath = path.join(assetsPath, safeName)
      if (!path.resolve(filePath).startsWith(path.resolve(assetsPath))) {
        return ErrorResponses.forbidden(reply)
      }

      if (!fs.existsSync(filePath)) {
        return ErrorResponses.notFound(reply)
      }

      reply.header('cache-control', 'public, max-age=31536000, immutable')
      reply.header('content-type', getMimeType(safeName))
      return fs.createReadStream(filePath)
    })

    // Serve vite.svg
    fastify.get('/vite.svg', async (req: any, reply: any) => {
      const possiblePaths = [
        path.join(env.UI_PATH!, 'vite.svg'),
        path.join(env.UI_PATH!, 'public', 'vite.svg'),
        path.join(env.UI_PATH!, 'assets', 'vite.svg'),
      ]
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          reply.header('cache-control', 'no-store')
          reply.header('content-type', 'image/svg+xml')
          return fs.createReadStream(p)
        }
      }
      return ErrorResponses.notFound(reply)
    })

    // Fallback for SPA (must be last)
    fastify.get('/*', async (req: any, reply: any) => {
      reply.header('cache-control', 'no-store')
      reply.header('content-type', 'text/html')
      return fs.createReadStream(path.join(env.UI_PATH!, 'index.html'))
    })
  }
}
