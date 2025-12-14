import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../infrastructure/auth/authMiddleware';
import db from '../domain/models/db';
import { z } from 'zod';
import { ApiResponse } from '../shared/utils/api-response';

/**
 * 实例管理 API
 */
export default async function (fastify: FastifyInstance) {
    const createInstanceSchema = z.object({
        owner: z.string().or(z.number()).transform(val => BigInt(val)),
        workMode: z.string().default(''),
        qqBotId: z.number().optional()
    });

    const updateInstanceSchema = z.object({
        owner: z.string().or(z.number()).transform(val => BigInt(val)).optional(),
        workMode: z.string().optional(),
        isSetup: z.boolean().optional(),
        flags: z.number().optional()
    });

    const createQqBotSchema = z.object({
        uin: z.string().or(z.number()).transform(val => BigInt(val)).optional(),
        password: z.string().optional(),
        platform: z.number().optional(),
        type: z.enum(['oicq', 'napcat']).default('napcat'),
        wsUrl: z.string().optional(),
        signApi: z.string().optional(),
        signVer: z.string().optional()
    });

    /**
     * GET /api/admin/instances
     * 获取所有实例
     */
    fastify.get('/api/admin/instances', {
        preHandler: authMiddleware
    }, async (request) => {
        const { page = 1, pageSize = 20 } = request.query as any;

        const [items, total] = await Promise.all([
            db.instance.findMany({
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    qqBot: true,
                    ForwardPair: {
                        take: 5 // 只取前5个配对预览
                    }
                },
                orderBy: {
                    id: 'desc'
                }
            }),
            db.instance.count()
        ]);

        return ApiResponse.paginated(
            items.map(item => ({
                ...item,
                owner: item.owner.toString(),
                qqBot: item.qqBot ? {
                    ...item.qqBot,
                    uin: item.qqBot.uin?.toString() || null
                } : null,
                ForwardPair: item.ForwardPair.map(pair => ({
                    ...pair,
                    qqRoomId: pair.qqRoomId.toString(),
                    tgChatId: pair.tgChatId.toString(),
                    qqFromGroupId: pair.qqFromGroupId?.toString() || null
                })),
                pairCount: item.ForwardPair.length
            })),
            total,
            page,
            pageSize
        );
    });

    /**
     * GET /api/admin/instances/:id
     * 获取单个实例详情
     */
    fastify.get('/api/admin/instances/:id', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        const { id } = request.params as { id: string };

        const instance = await db.instance.findUnique({
            where: { id: parseInt(id) },
            include: {
                qqBot: true,
                ForwardPair: true
            }
        });

        if (!instance) {
            return reply.code(404).send(
                ApiResponse.error('Instance not found')
            );
        }

        return {
            success: true,
            data: {
                ...instance,
                owner: instance.owner.toString(),
                qqBot: instance.qqBot ? {
                    ...instance.qqBot,
                    uin: instance.qqBot.uin?.toString() || null
                } : null
            }
        };
    });

    /**
     * POST /api/admin/instances
     * 创建新实例
     */
    fastify.post('/api/admin/instances', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        try {
            const body = createInstanceSchema.parse(request.body);
            const auth = (request as any).auth;

            const instance = await db.instance.create({
                data: {
                    owner: body.owner,
                    workMode: body.workMode,
                    isSetup: false,
                    qqBotId: body.qqBotId || null
                }
            });

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'create_instance',
                'instance',
                instance.id.toString(),
                {
                    owner: instance.owner.toString(),
                    workMode: instance.workMode
                },
                request.ip,
                request.headers['user-agent']
            );

            return {
                success: true,
                data: {
                    ...instance,
                    owner: instance.owner.toString()
                }
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({
                    ...ApiResponse.error('Invalid request'),
                    details: error.errors
                });
            }
            throw error;
        }
    });

    /**
     * PUT /api/admin/instances/:id
     * 更新实例
     */
    fastify.put('/api/admin/instances/:id', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const body = updateInstanceSchema.parse(request.body);
            const auth = (request as any).auth;

            const instance = await db.instance.update({
                where: { id: parseInt(id) },
                data: {
                    ...(body.owner && { owner: body.owner }),
                    ...(body.workMode !== undefined && { workMode: body.workMode }),
                    ...(body.isSetup !== undefined && { isSetup: body.isSetup }),
                    ...(body.flags !== undefined && { flags: body.flags })
                }
            });

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'update_instance',
                'instance',
                instance.id.toString(),
                body,
                request.ip,
                request.headers['user-agent']
            );

            return {
                success: true,
                data: {
                    ...instance,
                    owner: instance.owner.toString()
                }
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({
                    ...ApiResponse.error('Invalid request'),
                    details: error.errors
                });
            }
            if (error.code === 'P2025') {
                return reply.code(404).send(
                    ApiResponse.error('Instance not found')
                );
            }
            throw error;
        }
    });

    /**
     * DELETE /api/admin/instances/:id
     * 删除实例
     */
    fastify.delete('/api/admin/instances/:id', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const auth = (request as any).auth;

        try {
            const instance = await db.instance.delete({
                where: { id: parseInt(id) }
            });

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'delete_instance',
                'instance',
                instance.id.toString(),
                {
                    owner: instance.owner.toString(),
                    workMode: instance.workMode
                },
                request.ip,
                request.headers['user-agent']
            );

            return ApiResponse.success(undefined, 'Instance deleted successfully');
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.code(404).send(
                    ApiResponse.error('Instance not found')
                );
            }
            throw error;
        }
    });

    /**
     * GET /api/admin/qqbots
     * 获取所有 QQ Bot 配置
     */
    fastify.get('/api/admin/qqbots', {
        preHandler: authMiddleware
    }, async () => {
        const bots = await db.qqBot.findMany({
            include: {
                Instance: {
                    select: {
                        id: true,
                        owner: true
                    }
                }
            }
        });

        return {
            success: true,
            items: bots.map(bot => ({
                ...bot,
                uin: bot.uin?.toString() || null,
                password: bot.password ? '******' : null // 隐藏密码
            }))
        };
    });

    /**
     * POST /api/admin/qqbots
     * 创建 QQ Bot 配置
     */
    fastify.post('/api/admin/qqbots', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        try {
            const body = createQqBotSchema.parse(request.body);

            const bot = await db.qqBot.create({
                data: {
                    uin: body.uin || null,
                    password: body.password || null,
                    platform: body.platform || 0,
                    type: body.type,
                    wsUrl: body.wsUrl || null,
                    signApi: body.signApi || null,
                    signVer: body.signVer || null
                }
            });

            return {
                success: true,
                data: {
                    ...bot,
                    uin: bot.uin?.toString() || null,
                    password: bot.password ? '******' : null
                }
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({
                    ...ApiResponse.error('Invalid request'),
                    details: error.errors
                });
            }
            throw error;
        }
    });
}
