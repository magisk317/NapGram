import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiResponse } from '../shared/utils/api-response';
import { KoishiHost } from '../koishi/KoishiHost';
import { normalizeModuleSpecifierForConfig, patchKoishiPlugin, readKoishiPluginsConfig, removeKoishiPlugin, upsertKoishiPlugin } from '../koishi/store';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * KoishiHost Admin API
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

  const reloadSchema = z.object({
    instances: z.array(z.number().int()).optional(),
  });

  /**
   * POST /api/admin/koishi/reload
   * Reload KoishiHost plugins/runtime (in-process)
   */
  fastify.post('/api/admin/koishi/reload', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    try {
      const body = reloadSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: body.error.issues,
        });
      }

      const result = await KoishiHost.reload({
        defaultInstances: body.data.instances,
      });

      return ApiResponse.success(result);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * GET /api/admin/koishi/status
   * Show last reload report/status
   */
  fastify.get('/api/admin/koishi/status', {
    preHandler: requireKoishiAdmin,
  }, async () => {
    return ApiResponse.success(KoishiHost.getLastReport());
  });

  const pluginCreateSchema = z.object({
    id: z.string().min(1).max(64).optional(),
    module: z.string().min(1),
    enabled: z.boolean().optional(),
    config: z.any().optional(),
    source: z.any().optional(),
    reload: z.boolean().optional(),
  });

  const pluginPatchSchema = z.object({
    module: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    config: z.any().optional(),
    source: z.any().optional(),
    reload: z.boolean().optional(),
  });

  async function moduleExistsAbsolute(moduleRaw: string): Promise<boolean> {
    const raw = String(moduleRaw || '').trim();
    if (!raw) return false;
    if (raw.startsWith('file://')) return true;
    if (!raw.startsWith('/') && !raw.startsWith('.')) return true;
    try {
      const abs = raw.startsWith('.') ? path.resolve(path.dirname((await readKoishiPluginsConfig()).path), raw) : raw;
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * GET /api/admin/koishi/plugins
   * Show current managed plugin config file (DATA_DIR/koishi/plugins.yaml by default)
   */
  fastify.get('/api/admin/koishi/plugins', {
    preHandler: requireKoishiAdmin,
  }, async () => {
    const { path: configPath, config, exists } = await readKoishiPluginsConfig();
    const report = KoishiHost.getLastReport();
    const failed = new Map(report.failed.map(f => [f.module, f.error] as const));
    const loaded = new Set(report.loaded);

    const plugins = await Promise.all(config.plugins.map(async p => {
      let absolute: string | null = null;
      try {
        absolute = (await normalizeModuleSpecifierForConfig(p.module)).absolute;
      } catch {
        absolute = null;
      }
      return {
        ...p,
        absolute,
        exists: await moduleExistsAbsolute(absolute || p.module),
        loaded: Boolean(absolute && loaded.has(absolute)),
        error: (absolute && failed.get(absolute)) || failed.get(p.id) || failed.get(p.module) || null,
      };
    }));

    return ApiResponse.success({ configPath, exists, plugins });
  });

  /**
   * POST /api/admin/koishi/plugins
   * Upsert plugin entry in managed config file
   */
  fastify.post('/api/admin/koishi/plugins', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    const body = pluginCreateSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid request',
        details: body.error.issues,
      });
    }

    try {
      const result = await upsertKoishiPlugin(body.data);
      if (body.data.reload) await KoishiHost.reload();
      return ApiResponse.success(result);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * PATCH /api/admin/koishi/plugins/:id
   */
  fastify.patch('/api/admin/koishi/plugins/:id', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    const body = pluginPatchSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid request',
        details: body.error.issues,
      });
    }

    try {
      const result = await patchKoishiPlugin(String((request.params as any).id), body.data);
      if (body.data.reload) await KoishiHost.reload();
      return ApiResponse.success(result);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });

  /**
   * DELETE /api/admin/koishi/plugins/:id
   */
  fastify.delete('/api/admin/koishi/plugins/:id', {
    preHandler: requireKoishiAdmin,
  }, async (request, reply) => {
    try {
      const result = await removeKoishiPlugin(String((request.params as any).id));
      return ApiResponse.success(result);
    } catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)));
    }
  });
}
