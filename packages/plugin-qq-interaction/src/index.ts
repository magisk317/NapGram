import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import { sendPoke, handleNick, sendLike, getGroupHonor } from './helpers/qq-helpers';

const plugin: NapGramPlugin = {
    id: 'qq-interaction',
    name: 'QQ Interaction Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Provides QQ interaction commands (poke, nick, like, honor)',

    permissions: {
        // 可以指定允许的实例 ID，留空表示所有实例
        instances: [],
    },

    install: async (ctx: PluginContext, config?: any) => {
        ctx.logger.info('QQ Interaction plugin installed');

        // === 注册命令 ===

        // 注册 /poke 命令
        ctx.command({
            name: 'poke',
            aliases: ['戳一戳'],
            description: '戳一戳（需要 NapCat API 支持）',
            handler: async (event, args) => {
                ctx.logger.info(`Poke command received from ${event.sender.userName}`);
                const result = await sendPoke(event, args);
                if (!result.success) {
                    await event.reply(result.message);
                }
            },
        });

        // 注册 /nick 命令
        ctx.command({
            name: 'nick',
            aliases: ['群名片'],
            description: '获取/设置群名片',
            handler: async (event, args) => {
                ctx.logger.info(`Nick command received from ${event.sender.userName}`);
                const result = await handleNick(event, args);
                await event.reply(result.message);
            },
        });

        // 注册 /like 命令
        ctx.command({
            name: 'like',
            aliases: ['点赞'],
            description: '给用户点赞',
            handler: async (event, args) => {
                ctx.logger.info(`Like command received from ${event.sender.userName}`);
                const result = await sendLike(event, args);
                await event.reply(result.message);
            },
        });

        // 注册 /honor 命令
        ctx.command({
            name: 'honor',
            aliases: ['群荣誉'],
            description: '查看群荣誉榜单',
            handler: async (event, args) => {
                ctx.logger.info(`Honor command received from ${event.sender.userName}`);
                const result = await getGroupHonor(event, args);
                await event.reply(result.message);
            },
        });

        ctx.logger.info('QQ Interaction plugin: All commands registered');
    },

    uninstall: async () => {
        // 清理工作（如果需要）
    },
};

export default plugin;
