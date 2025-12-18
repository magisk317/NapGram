/**
 * Ping Pong 插件示例
 * 
 * 这是一个简单的 NapGram 原生插件，演示基本的消息监听和回复功能
 */

import type { NapGramPlugin, PluginContext, MessageEvent } from '../core/interfaces';

/**
 * Ping Pong 插件
 */
const plugin: NapGramPlugin = {
    // 插件 ID（必需）
    id: 'ping-pong',

    // 插件名称（必需）
    name: 'Ping Pong Plugin',

    // 插件版本（必需）
    version: '1.0.0',

    // 插件作者
    author: 'NapGram Team',

    // 插件描述
    description: '回复包含 "ping" 的消息，发送 "pong"',

    // 插件安装（必需）
    async install(ctx: PluginContext) {
        ctx.logger.info('Ping Pong plugin installed');

        // 监听消息事件
        ctx.on('message', async (event: MessageEvent) => {
            const text = event.message.text.toLowerCase();

            // 检查消息是否包含 "ping"
            if (text.includes('ping')) {
                // 回复 "pong"
                await event.reply('pong!');

                ctx.logger.info(`Replied to ${event.sender.userName} in ${event.channelId}`);
            }
        });

        // 注册卸载钩子
        ctx.onUnload(() => {
            ctx.logger.info('Ping Pong plugin unloaded');
        });
    },
};

// 导出插件
export default plugin;
