import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../infrastructure/auth/authMiddleware';
import db from '../domain/models/db';

import { ApiResponse } from '../shared/utils/api-response';
import Instance from '../domain/models/Instance';
import { PluginRuntime } from '../plugins/runtime';
/**
 * 统计分析 API
 */
export default async function (fastify: FastifyInstance) {
    /**
     * GET /api/admin/statistics/overview
     * 获取系统概览统计
     */
    fastify.get('/api/admin/statistics/overview', {
        preHandler: authMiddleware
    }, async () => {
        const startOfToday = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        const [
            pairCount,
            instanceCount,
            messageCount,
            todayMessageCount,
        ] = await Promise.all([
            db.forwardPair.count(),
            db.instance.count(),
            db.message.count(),
            db.message.count({
                where: {
                    time: {
                        gte: startOfToday
                    }
                }
            }),
        ]);

        // Basic health check
        const health = {
            db: true,
            instances: { total: 0, online: 0, details: [] as Array<{ id: number; tg: boolean; qq: boolean }> },
            plugins: { enabled: false, loaded: 0, failed: 0 },
        };

        try {
            await db.$queryRaw`SELECT 1`;
        } catch {
            health.db = false;
        }

        try {
            const runtimeReport = PluginRuntime.getLastReport();
            health.plugins.enabled = Boolean(runtimeReport?.enabled);
            health.plugins.loaded = Array.isArray(runtimeReport?.loaded) ? runtimeReport.loaded.length : 0;
            health.plugins.failed = Array.isArray(runtimeReport?.failed) ? runtimeReport.failed.length : 0;
        } catch {
            // ignore
        }

        try {
            const instances = Instance.instances || [];
            health.instances.total = instances.length;
            for (const inst of instances) {
                const tgOk = Boolean((inst as any).tgBot?.isOnline);
                let qqOk = false;
                try {
                    qqOk = Boolean(await inst.qqClient?.isOnline?.());
                } catch {
                    qqOk = false;
                }
                if (tgOk && qqOk) health.instances.online++;
                health.instances.details.push({ id: inst.id, tg: tgOk, qq: qqOk });
            }
        } catch {
            // ignore
        }

        const status =
            !health.db ? 'unhealthy'
                : (health.plugins.failed > 0 ? 'degraded'
                    : (health.instances.total > 0 && health.instances.online < health.instances.total ? 'degraded' : 'healthy'));

        return {
            success: true,
            data: {
                pairCount,
                instanceCount,
                messageCount,
                todayMessageCount,
                avgMessagesPerDay: messageCount > 0 ? Math.round(messageCount / 30) : 0,
                status,
                health,
            }
        };
    });

    /**
     * GET /api/admin/statistics/messages/trend
     * 获取消息趋势（按天）
     */
    fastify.get('/api/admin/statistics/messages/trend', {
        preHandler: authMiddleware
    }, async (request) => {
        const { days = 7 } = request.query as { days?: number };
        const daysNum = Math.min(Math.max(parseInt(String(days)), 1), 90);

        // 生成日期范围
        const endTimestamp = Math.floor(Date.now() / 1000);
        const startTimestamp = endTimestamp - daysNum * 24 * 60 * 60;

        // 按天分组统计消息数量
        const messages = await db.message.groupBy({
            by: ['time'],
            where: {
                time: {
                    gte: startTimestamp,
                    lte: endTimestamp
                }
            },
            _count: {
                id: true
            }
        });

        // 生成每日数据映射
        const dailyCounts = new Map<string, number>();
        for (let i = 0; i < daysNum; i++) {
            const date = new Date((startTimestamp + i * 24 * 60 * 60) * 1000);
            const dateKey = date.toISOString().split('T')[0];
            dailyCounts.set(dateKey, 0);
        }

        // 填充实际数据
        messages.forEach(msg => {
            const dateKey = new Date(msg.time * 1000).toISOString().split('T')[0];
            dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + msg._count.id);
        });

        // 转换为数组
        const trend = Array.from(dailyCounts.entries()).map(([date, count]) => ({
            date,
            count
        }));

        return {
            success: true,
            data: trend
        };
    });

    /**
     * GET /api/admin/statistics/pairs/activity
     * 获取配对活跃度统计
     */
    fastify.get('/api/admin/statistics/pairs/activity', {
        preHandler: authMiddleware
    }, async () => {
        const topPairs = await db.message.groupBy({
            by: ['qqRoomId', 'tgChatId', 'instanceId'],
            _count: { id: true },
            orderBy: {
                _count: {
                    id: 'desc'
                }
            },
            take: 10
        });

        const relatedPairs = topPairs.length > 0 ? await db.forwardPair.findMany({
            where: {
                OR: topPairs.map(pair => ({
                    qqRoomId: pair.qqRoomId,
                    tgChatId: pair.tgChatId,
                    instanceId: pair.instanceId
                }))
            },
            select: {
                id: true,
                qqRoomId: true,
                tgChatId: true,
                instanceId: true
            }
        }) : [];

        const pairIdMap = new Map<string, number>();
        relatedPairs.forEach(pair => {
            const key = `${pair.qqRoomId.toString()}-${pair.tgChatId.toString()}-${pair.instanceId}`;
            pairIdMap.set(key, pair.id);
        });

        return {
            success: true,
            data: topPairs.map(pair => {
                const key = `${pair.qqRoomId.toString()}-${pair.tgChatId.toString()}-${pair.instanceId}`;
                const pairId = pairIdMap.get(key) ?? null;
                return {
                    id: pairId,
                    qqRoomId: pair.qqRoomId.toString(),
                    tgChatId: pair.tgChatId.toString(),
                    messageCount: pair._count.id
                };
            })
        };
    });

    /**
     * GET /api/admin/statistics/instances/status
     * 获取实例状态统计
     */
    fastify.get('/api/admin/statistics/instances/status', {
        preHandler: authMiddleware
    }, async () => {
        const instances = await db.instance.findMany({
            include: {
                qqBot: true,
                _count: {
                    select: {
                        ForwardPair: true
                    }
                }
            }
        });

        const stats = {
            total: instances.length,
            online: instances.filter(i => i.isSetup && i.qqBot).length,
            offline: instances.filter(i => !i.isSetup || !i.qqBot).length,
            instances: instances.map(instance => ({
                id: instance.id,
                owner: instance.owner.toString(),
                isOnline: instance.isSetup && !!instance.qqBot,
                pairCount: instance._count.ForwardPair,
                botType: instance.qqBot?.type || null
            }))
        };

        return {
            success: true,
            data: stats
        };
    });

    /**
     * GET /api/admin/statistics/messages/recent
     * 获取最近消息（用于实时监控）
     */
    fastify.get('/api/admin/statistics/messages/recent', {
        preHandler: authMiddleware
    }, async (request) => {
        const { limit = 20 } = request.query as { limit?: number };
        const limitNum = Math.min(Math.max(parseInt(String(limit)), 1), 100);

        const messages = await db.message.findMany({
            take: limitNum,
            orderBy: {
                time: 'desc'
            },
            include: {
                instance: true
            }
        });

        return {
            success: true,
            data: messages.map(msg => ({
                id: msg.id,
                qqRoomId: msg.qqRoomId.toString(),
                tgChatId: msg.tgChatId.toString(),
                time: msg.time,
                instanceId: msg.instanceId,
                instanceOwner: msg.instance?.owner.toString() || null
            }))
        };
    });

    /**
     * GET /api/admin/statistics/performance
     * 获取性能指标
     */
    fastify.get('/api/admin/statistics/performance', {
        preHandler: authMiddleware
    }, async () => {
        // 计算最近1小时的消息速率
        const oneHourAgo = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
        const recentMessages = await db.message.count({
            where: {
                time: {
                    gte: oneHourAgo
                }
            }
        });

        const messagesPerHour = recentMessages;
        const messagesPerMinute = Math.round(recentMessages / 60);

        return {
            success: true,
            data: {
                messagesPerHour,
                messagesPerMinute,
                timestamp: new Date().toISOString()
            }
        };
    });
}
