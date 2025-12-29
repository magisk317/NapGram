import type { FastifyInstance } from 'fastify'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { z } from 'zod'
import {
  ApiResponse,
  readMarketplaceCache,
  readMarketplaces,
  refreshMarketplaceIndex,
  removeMarketplaceIndex,
  upsertMarketplaceIndex,
  writeMarketplaces,
} from '@napgram/runtime-kit'

/**
 * Marketplace (index) Admin API
 *
 * Note: This is only the "index" layer (fetch + cache).
 */
export default async function (fastify: FastifyInstance) {
  async function requirePluginAdmin(request: any, reply: any) {
    const header = String(request.headers?.authorization || '')
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    const cookieToken = request.cookies?.admin_token ? String(request.cookies.admin_token) : ''
    const queryToken = request.query && typeof request.query === 'object' && 'token' in request.query ? String(request.query.token) : ''
    const token = bearer || cookieToken || queryToken

    const direct = String(process.env.PLUGIN_ADMIN_TOKEN || '').trim()
    if (direct && token && token === direct)
      return

    const { authMiddleware } = await import('@napgram/runtime-kit')
    await authMiddleware(request, reply)
  }

  const marketplaceUpsertSchema = z.object({
    id: z.string().min(1).max(64),
    url: z.string().url(),
    enabled: z.boolean().optional(),
  })

  const marketplacesWriteSchema = z.object({
    indexes: z.array(marketplaceUpsertSchema).default([]),
  })

  fastify.get('/api/admin/marketplaces', { preHandler: requirePluginAdmin }, async () => {
    return ApiResponse.success(await readMarketplaces())
  })

  fastify.put('/api/admin/marketplaces', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const body = marketplacesWriteSchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      const result = await writeMarketplaces({ version: 1, indexes: body.data.indexes })
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.post('/api/admin/marketplaces', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const body = marketplaceUpsertSchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      const record = await upsertMarketplaceIndex(body.data)
      return ApiResponse.success(record)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.delete('/api/admin/marketplaces/:id', { preHandler: requirePluginAdmin }, async (request, reply) => {
    try {
      return ApiResponse.success(await removeMarketplaceIndex(String((request.params as any).id)))
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  const marketplaceRefreshSchema = z.object({
    id: z.string().min(1).max(64).optional(),
  })

  const isValidReadmeUrl = (value: string) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:'
    }
    catch {
      return false
    }
  }

  const MAX_README_BYTES = 512 * 1024

  fastify.post('/api/admin/marketplaces/refresh', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const body = marketplaceRefreshSchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }

    try {
      const { config } = await readMarketplaces()
      const targets = body.data.id ? config.indexes.filter(i => i.id === body.data.id) : config.indexes
      const results: any[] = []
      for (const idx of targets) {
        if (idx.enabled === false)
          continue
        results.push(await refreshMarketplaceIndex(idx.id, idx.url))
      }
      return ApiResponse.success({ refreshed: results.length, results })
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.get('/api/admin/marketplaces/:id/index', { preHandler: requirePluginAdmin }, async (request, reply) => {
    try {
      const data = await readMarketplaceCache(String((request.params as any).id))
      if (!data.exists)
        return reply.code(404).send(ApiResponse.error('Marketplace cache not found'))
      return ApiResponse.success(data)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.get('/api/admin/marketplaces/:id/plugins/:pluginId/readme', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const marketplaceId = String((request.params as any).id || '').trim()
    const pluginId = String((request.params as any).pluginId || '').trim()
    try {
      const data = await readMarketplaceCache(marketplaceId)
      if (!data.exists)
        return reply.code(404).send(ApiResponse.error('Marketplace cache not found'))
      const index = data.data?.data
      const plugins = Array.isArray(index?.plugins) ? index.plugins : []
      const plugin = plugins.find((p: any) => String(p?.id || '') === pluginId)
      if (!plugin)
        return reply.code(404).send(ApiResponse.error('Plugin not found in marketplace'))

      const readmeUrl = String(plugin?.readme || '').trim()
      if (!readmeUrl)
        return reply.code(404).send(ApiResponse.error('README not available'))
      if (!isValidReadmeUrl(readmeUrl))
        return reply.code(400).send(ApiResponse.error('Invalid README url'))

      const res = await fetch(readmeUrl, { headers: { accept: 'text/plain,text/markdown,*/*' } })
      if (!res.ok) {
        return reply.code(502).send(ApiResponse.error(`README fetch failed: ${res.status} ${res.statusText}`))
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_README_BYTES) {
        return reply.code(413).send(ApiResponse.error('README too large'))
      }
      const content = buf.toString('utf8')
      return ApiResponse.success({ url: readmeUrl, content })
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })
}
