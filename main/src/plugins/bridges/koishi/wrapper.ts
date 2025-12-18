/**
 * Koishi 插件包装器
 * 
 * 将 Koishi 插件包装为 NapGram 原生插件
 */

import type { NapGramPlugin, PluginContext, MessageEvent } from '../../core/interfaces';
import { KoishiBridge, type KoishiSession } from './bridge';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('KoishiWrapper');

/**
 * Koishi 插件接口（简化）
 */
export interface KoishiPlugin {
    name?: string;
    apply: (ctx: any, config?: any) => void;
}

/**
 * Koishi Context 模拟（最小实现）
 */
class KoishiContextMock {
    private messageHandlers: Array<(session: KoishiSession) => void | Promise<void>> = [];

    constructor(
        private readonly napgramCtx: PluginContext,
    ) { }

    /**
     * Koishi middleware 注册
     */
    middleware(callback: (session: KoishiSession, next: () => Promise<void>) => void | Promise<void>) {
        this.messageHandlers.push(async (session) => {
            await callback(session, async () => { });
        });
    }

    /**
     * Koishi on 方法（简化）
     */
    on(event: string, handler: (session: KoishiSession) => void | Promise<void>) {
        if (event === 'message') {
            this.messageHandlers.push(handler);
        }
    }

    /**
     * 处理消息（内部使用）
     */
    async handleMessage(session: KoishiSession) {
        for (const handler of this.messageHandlers) {
            try {
                await handler(session);
            } catch (error) {
                logger.error({ error }, 'Koishi handler error');
            }
        }
    }
}

/**
 * 将 Koishi 插件包装为 NapGram 插件
 */
export function wrapKoishiPlugin(
    koishiPlugin: KoishiPlugin,
    pluginId: string,
    config?: any
): NapGramPlugin {
    let koishiCtx: KoishiContextMock | null = null;

    return {
        id: pluginId,
        name: koishiPlugin.name || pluginId,
        version: '1.0.0',
        author: 'Koishi Plugin (wrapped)',
        description: `Koishi plugin wrapped for NapGram: ${koishiPlugin.name || pluginId}`,

        async install(ctx: PluginContext, pluginConfig?: any) {
            logger.info({ id: pluginId }, 'Installing Koishi plugin (wrapped)');

            // 创建 Koishi Context 模拟
            koishiCtx = new KoishiContextMock(ctx);

            // 调用 Koishi 插件的 apply 方法
            try {
                koishiPlugin.apply(koishiCtx, pluginConfig || config);
            } catch (error) {
                logger.error({ error, id: pluginId }, 'Failed to apply Koishi plugin');
                throw error;
            }

            // 监听 NapGram 消息事件，转换为 Koishi Session
            ctx.on('message', async (event: MessageEvent) => {
                if (!koishiCtx) return;

                try {
                    // 转换为 Koishi Session
                    const session = KoishiBridge.toKoishiSession(event);

                    // 传递给 Koishi 处理器
                    await koishiCtx.handleMessage(session);
                } catch (error) {
                    logger.error({ error, pluginId }, 'Error in Koishi message handler');
                }
            });

            logger.info({ id: pluginId }, 'Koishi plugin installed (wrapped)');
        },

        async uninstall() {
            logger.info({ id: pluginId }, 'Uninstalling Koishi plugin (wrapped)');
            koishiCtx = null;
        },
    };
}
