import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../infrastructure/auth/authMiddleware';
import fs from 'fs/promises';
import path from 'path';
import { ApiResponse } from '../shared/utils/api-response';
import env from '../domain/models/env';
import { z } from 'zod';

/**
 * 系统配置 API
 */
export default async function (fastify: FastifyInstance) {
    const configSchema = z.object({
        systemName: z.string().optional(),
        enableAutoBackup: z.boolean().optional(),
        enableNotifications: z.boolean().optional(),
        qqToTgForward: z.boolean().optional(),
        tgToQqForward: z.boolean().optional(),
        showNickname: z.boolean().optional(),
        autoRecallMessage: z.boolean().optional(),
        messageCacheHours: z.number().int().min(1).max(168).optional(),
        maxConcurrentConnections: z.number().int().min(1).max(100).optional(),
        enableMessageCompression: z.boolean().optional(),
        enableIpWhitelist: z.boolean().optional(),
        enableOperationLog: z.boolean().optional(),
    });

    const configFile = path.join(env.DATA_DIR || '.', 'config.json');

    /**
     * GET /api/admin/settings
     * 获取系统配置
     */
    fastify.get('/api/admin/settings', {
        preHandler: authMiddleware
    }, async () => {
        try {
            const data = await fs.readFile(configFile, 'utf-8');
            const config = JSON.parse(data);
            return {
                success: true,
                data: config
            };
        } catch (err) {
            // 如果文件不存在，返回默认配置
            const defaultConfig = {
                systemName: 'NapGram',
                enableAutoBackup: true,
                enableNotifications: true,
                qqToTgForward: true,
                tgToQqForward: true,
                showNickname: true,
                autoRecallMessage: false,
                messageCacheHours: 24,
                maxConcurrentConnections: 10,
                enableMessageCompression: true,
                enableIpWhitelist: false,
                enableOperationLog: true,
            };
            return {
                success: true,
                data: defaultConfig
            };
        }
    });

    /**
     * PUT /api/admin/settings
     * 更新系统配置
     */
    fastify.put('/api/admin/settings', {
        preHandler: authMiddleware
    }, async (request, reply) => {
        try {
            const body = configSchema.parse(request.body);
            const auth = (request as any).auth;

            // 读取现有配置
            let currentConfig = {};
            try {
                const data = await fs.readFile(configFile, 'utf-8');
                currentConfig = JSON.parse(data);
            } catch (err) {
                // 文件不存在，使用空对象
            }

            // 合并配置
            const newConfig = {
                ...currentConfig,
                ...body,
                updatedAt: new Date().toISOString(),
                updatedBy: auth.userId,
            };

            // 保存配置
            await fs.writeFile(configFile, JSON.stringify(newConfig, null, 2), 'utf-8');

            // 审计日志
            const { AuthService } = await import('../infrastructure/auth');
            await AuthService.logAudit(
                auth.userId,
                'update_settings',
                'system_config',
                'settings',
                body,
                request.ip,
                request.headers['user-agent']
            );

            return {
                success: true,
                message: 'Settings saved successfully',
                data: newConfig
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid request',
                    details: error.issues
                });
            }
            throw error;
        }
    });
}
