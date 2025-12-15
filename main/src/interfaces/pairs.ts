import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../infrastructure/auth/authMiddleware';
import db from '../domain/models/db';
import { z } from 'zod';
import Instance from '../domain/models/Instance';
import { groupInfoCache } from '../infrastructure/services/CacheManager';
import { getLogger } from '../shared/logger';
import { ApiResponse } from '../shared/utils/api-response';

const log = getLogger('PairsApi');

/**
 * 配对管理 API
 */
export default async function (fastify: FastifyInstance) {
    const createPairSchema = z.object({
        qqRoomId: z.string().or(z.number()).transform(val => BigInt(val)),
        tgChatId: z.string().or(z.number()).transform(val => BigInt(val)),
        tgThreadId: z.number().nullable().optional(),
        instanceId: z.number().default(0),
        forwardMode: z.enum(['00', '01', '10', '11']).nullable().optional(),
        nicknameMode: z.enum(['00', '01', '10', '11']).nullable().optional(),
        ignoreRegex: z.string().nullable().optional(),
        ignoreSenders: z.string().nullable().optional()
    });

    const updatePairSchema = z.object({
        forwardMode: z.enum(['00', '01', '10', '11']).nullable().optional(),
        nicknameMode: z.enum(['00', '01', '10', '11']).nullable().optional(),
        ignoreRegex: z.string().nullable().optional(),
        ignoreSenders: z.string().nullable().optional()
    });

    /**
     * GET /api/admin/pairs
     * 获取所有配对
     */
    fastify.get('/api/admin/pairs', {
        preHandler: authMiddleware
    }, async (request) => {
        const { page = 1, pageSize = 20, instanceId, search, withNames = 'false' } = request.query as any;
        const needNames = String(withNames).toLowerCase() === 'true';

        const where: any = {};

        if (instanceId !== undefined) {
            where.instanceId = parseInt(instanceId);
        }

        if (search) {
            where.OR = [
                { qqRoomId: { contains: search } },
                { tgChatId: { contains: search } }
            ];
        }

        const [items, total] = await Promise.all([
            db.forwardPair.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    instance: {
                        include: {
                            qqBot: true
                        }
                    }
                },
                orderBy: {
                    id: 'desc'
                }
            }),
            db.forwardPair.count({ where })
        ]);

        const mapped = items.map(item => ({
            ...item,
            qqRoomId: item.qqRoomId.toString(),
            tgChatId: item.tgChatId.toString(),
            qqFromGroupId: item.qqFromGroupId?.toString() || null,
            instance: item.instance ? {
                ...item.instance,
                owner: item.instance.owner.toString(),
                qqBot: item.instance.qqBot ? {
                    ...item.instance.qqBot,
                    uin: item.instance.qqBot.uin?.toString() || null
                } : null
            } : null
        }));

        if (needNames) {
            await Promise.all(mapped.map(async (pair: any) => {
                try {
                    pair.qqRoomName = await resolveQqGroupName(pair.instanceId, pair.qqRoomId);
                } catch (e: any) {
                    log.debug(e, 'resolveQqGroupName error');
                }
                try {
                    pair.tgChatName = await resolveTgChatName(pair.instanceId, pair.tgChatId);
                } catch (e: any) {
                    log.debug(e, 'resolveTgChatName error');
                }
            }));
        }

        return ApiResponse.paginated(mapped, total, page, pageSize);
    });

    /**
     * GET /api/admin/pairs/:id
     * 获取单个配对详情
     */
    fastify.get('/api/admin/pairs/:id', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        const { id } = request.params as { id: string };

        const pair = await db.forwardPair.findUnique({
            where: { id: parseInt(id) },
            include: {
                instance: {
                    include: {
                        qqBot: true
                    }
                }
            }
        });

        if (!pair) {
            return reply.code(404).send({
                success: false,
                error: 'Pair not found'
            });
        }

        return {
            success: true,
            data: {
                ...pair,
                qqRoomId: pair.qqRoomId.toString(),
                tgChatId: pair.tgChatId.toString(),
                qqFromGroupId: pair.qqFromGroupId?.toString() || null,
                instance: pair.instance ? {
                    ...pair.instance,
                    owner: pair.instance.owner.toString(),
                    qqBot: pair.instance.qqBot ? {
                        ...pair.instance.qqBot,
                        uin: pair.instance.qqBot.uin?.toString() || null
                    } : null
                } : null
            }
        };
    });

    /**
     * POST /api/admin/pairs
     * 创建新配对
     */
    fastify.post('/api/admin/pairs', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        try {
            const body = createPairSchema.parse(request.body);
            const auth = (request as any).auth;

            const pair = await db.forwardPair.create({
                data: {
                    qqRoomId: body.qqRoomId,
                    tgChatId: body.tgChatId,
                    tgThreadId: body.tgThreadId || null,
                    instanceId: body.instanceId,
                    forwardMode: body.forwardMode || null,
                    nicknameMode: body.nicknameMode || null,
                    ignoreRegex: body.ignoreRegex || null,
                    ignoreSenders: body.ignoreSenders || null
                }
            });

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'create_pair',
                'forward_pair',
                pair.id.toString(),
                {
                    qqRoomId: pair.qqRoomId.toString(),
                    tgChatId: pair.tgChatId.toString()
                },
                request.ip,
                request.headers['user-agent']
            );

            return {
                success: true,
                data: {
                    ...pair,
                    qqRoomId: pair.qqRoomId.toString(),
                    tgChatId: pair.tgChatId.toString(),
                    qqFromGroupId: pair.qqFromGroupId?.toString() || null
                }
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid request',
                    details: error.issues
                });
            }
            if (error.code === 'P2002') {
                return reply.code(409).send(
                    ApiResponse.error('Pair already exists for this QQ room or TG chat')
                );
            }
            throw error;
        }
    });

    /**
     * PUT /api/admin/pairs/:id
     * 更新配对
     */
    fastify.put('/api/admin/pairs/:id', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const body = updatePairSchema.parse(request.body);
            const auth = (request as any).auth;

            const pair = await db.forwardPair.update({
                where: { id: parseInt(id) },
                data: {
                    forwardMode: body.forwardMode,
                    nicknameMode: body.nicknameMode,
                    ignoreRegex: body.ignoreRegex,
                    ignoreSenders: body.ignoreSenders
                }
            });

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'update_pair',
                'forward_pair',
                pair.id.toString(),
                body,
                request.ip,
                request.headers['user-agent']
            );

            return {
                success: true,
                data: {
                    ...pair,
                    qqRoomId: pair.qqRoomId.toString(),
                    tgChatId: pair.tgChatId.toString(),
                    qqFromGroupId: pair.qqFromGroupId?.toString() || null
                }
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid request',
                    details: error.issues
                });
            }
            if (error.code === 'P2025') {
                return reply.code(404).send({
                    success: false,
                    error: 'Pair not found'
                });
            }
            throw error;
        }
    });

    /**
     * DELETE /api/admin/pairs/:id
     * 删除配对
     */
    fastify.delete('/api/admin/pairs/:id', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const auth = (request as any).auth;

        try {
            const pair = await db.forwardPair.delete({
                where: { id: parseInt(id) }
            });

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'delete_pair',
                'forward_pair',
                pair.id.toString(),
                {
                    qqRoomId: pair.qqRoomId.toString(),
                    tgChatId: pair.tgChatId.toString()
                },
                request.ip,
                request.headers['user-agent']
            );

            return ApiResponse.success(undefined, 'Pair deleted successfully');
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.code(404).send({
                    success: false,
                    error: 'Pair not found'
                });
            }
            throw error;
        }
    });

    /**
     * GET /api/admin/pairs/:id/statistics
     * 获取配对的统计信息
     */
    fastify.get('/api/admin/pairs/:id/statistics', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        const { id } = request.params as { id: string };

        const pair = await db.forwardPair.findUnique({
            where: { id: parseInt(id) }
        });

        if (!pair) {
            return reply.code(404).send({
                success: false,
                error: 'Pair not found'
            });
        }

        // 统计消息数量
        const messageCount = await db.message.count({
            where: {
                qqRoomId: pair.qqRoomId,
                tgChatId: pair.tgChatId,
                instanceId: pair.instanceId
            }
        });

        // 最近消息
        const recentMessage = await db.message.findFirst({
            where: {
                qqRoomId: pair.qqRoomId,
                tgChatId: pair.tgChatId,
                instanceId: pair.instanceId
            },
            orderBy: {
                time: 'desc'
            }
        });

        return {
            success: true,
            data: {
                messageCount,
                lastMessageTime: recentMessage?.time || null
            }
        };
    });
}

async function resolveQqGroupName(instanceId: number, qqRoomId: string) {
    const cacheKey = `qqname:${instanceId}:${qqRoomId}`;
    const cached = groupInfoCache.get(cacheKey);
    if (cached) return cached as string;

    const instance = Instance.instances.find(it => it.id === instanceId);
    if (!instance?.qqClient) return null;
    try {
        const groupId = qqRoomId.startsWith('-') ? qqRoomId.slice(1) : qqRoomId;
        const info = await instance.qqClient.getGroupInfo(groupId);
        const name = info?.name || null;
        if (name) groupInfoCache.set(cacheKey, name);
        return name;
    } catch (e) {
        log.debug(e, 'Failed to resolve QQ group name');
        return null;
    }
}

async function resolveTgChatName(instanceId: number, tgChatId: string) {
    const cacheKey = `tgname:${instanceId}:${tgChatId}`;
    const cached = groupInfoCache.get(cacheKey);
    if (cached) return cached as string;

    const instance = Instance.instances.find(it => it.id === instanceId);
    const chatIdNum = Number(tgChatId);
    if (!instance?.tgBot || Number.isNaN(chatIdNum)) return null;
    try {
        const chat = await instance.tgBot.getChat(chatIdNum);
        const name = (chat.chat as any)?.title || null;
        if (name) groupInfoCache.set(cacheKey, name);
        return name;
    } catch (e) {
        log.debug(e, 'Failed to resolve TG chat name');
        return null;
    }
}
