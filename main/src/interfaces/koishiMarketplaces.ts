import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiResponse } from '../shared/utils/api-response';
import { readMarketplaces, readMarketplaceCache, refreshMarketplaceIndex, removeMarketplaceIndex, writeMarketplaces, upsertMarketplaceIndex } from '../koishi/marketplace';

/**
 * Koishi Marketplace (index) Admin API
 *
 * Note: This is only the "index" layer (fetch + cache).
 * Install/uninstall will be implemented after local plugin management is stable.
 */
export default async function (fastify: FastifyInstance) {
  async function requireKoishiAdmin(request: any, reply: any) {
    const header = String(request.headers?.authorization || '');
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const cookieToken = request.cookies?.admin_token ? String(request.cookies.admin_token) : '';
    const queryToken = request.query && typeof request.query === 'object' && 'token' in request.query ? String(request.query.token) : '';
    const token = bearer || cookieToken || queryToken;

    const koishiAdmin = String(process.env.KOISHI_ADMIN_TOKEN || '').trim();
    if (koishiAdmin && token && token === koishiAdmin) return;

    const { authMiddleware } = await import('../infrastructure/auth/authMiddleware');
    await authMiddleware(request, reply);

    const auth = (request as any).auth;
    if (auth?.type !== 'env') {
      return reply.code(403).send(ApiResponse.error('Forbidden'));
    }
  }

  const marketplaceUpsertSchema = z.object({
    id: z.string().min(1).max(64),
    url: z.string().url(),
    enabled: z.boolean().optional(),
  });

  const marketplacesWriteSchema = z.object({
    indexes: z.array(marketplaceUpsertSchema).default([]),
  });

  /**
   * GET /api/admin/koishi/marketplaces
   */
  fastify.get('/api/admin/koishi/marketplaces', {
    preHandler: requireKoishiAdmin,
  }, async () => {
    return ApiResponse.success(await readMarketplaces());
  });

  /**
   * PUT /api/admin/koishi/marketplaces
   * Replace marketplaces config file
   */
  fastify.put('/api/admin/koishi/marketplaces', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    const body = marketplacesWriteSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues });
    }
    try {
      const result = await writeMarketplaces({ version: 1, indexes: body.data.indexes });
      return ApiResponse.success(result);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * POST /api/admin/koishi/marketplaces
   * Upsert one marketplace index entry
   */
  fastify.post('/api/admin/koishi/marketplaces', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    const body = marketplaceUpsertSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues });
    }
    try {
      const record = await upsertMarketplaceIndex(body.data);
      return ApiResponse.success(record);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * DELETE /api/admin/koishi/marketplaces/:id
   */
  fastify.delete('/api/admin/koishi/marketplaces/:id', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    try {
      return ApiResponse.success(await removeMarketplaceIndex(String((request.params as any).id)));
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  const marketplaceRefreshSchema = z.object({
    id: z.string().min(1).max(64).optional(),
  });

  /**
   * POST /api/admin/koishi/marketplaces/refresh
   * Fetch and cache marketplace index (all or one)
   */
  fastify.post('/api/admin/koishi/marketplaces/refresh', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    const body = marketplaceRefreshSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues });
    }

    try {
      const { config } = await readMarketplaces();
      const targets = body.data.id ? config.indexes.filter(i => i.id === body.data.id) : config.indexes;
      const results: any[] = [];
      for (const idx of targets) {
        if (idx.enabled === false) continue;
        results.push(await refreshMarketplaceIndex(idx.id, idx.url));
      }
      return ApiResponse.success({ refreshed: results.length, results });
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * GET /api/admin/koishi/marketplaces/:id/index
   * Read cached marketplace index (call refresh first)
   */
  fastify.get('/api/admin/koishi/marketplaces/:id/index', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    try {
      const data = await readMarketplaceCache(String((request.params as any).id));
      if (!data.exists) return reply.code(404).send(ApiResponse.error('Marketplace cache not found'));
      return ApiResponse.success(data);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });
}

