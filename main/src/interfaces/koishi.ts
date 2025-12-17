import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiResponse } from '../shared/utils/api-response';
import { KoishiHost } from '../koishi/KoishiHost';

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
}
