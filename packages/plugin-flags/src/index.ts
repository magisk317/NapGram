import type { NapGramPlugin, PluginContext, MessageEvent } from '@napgram/sdk';

type FlagsByInstance = Record<string, Record<string, boolean>>;

const STORAGE_KEY = 'flags-v1';

const normalizeFlagName = (input: string) => String(input || '').trim().replace(/\s+/g, '_');

const loadAllFlags = async (ctx: PluginContext): Promise<FlagsByInstance> => {
    try {
        const data = await ctx.storage.get<FlagsByInstance>(STORAGE_KEY);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
        return data;
    } catch (error) {
        ctx.logger.warn('Flags plugin: Failed to load flags, fallback to empty', error);
        return {};
    }
};

const saveAllFlags = async (ctx: PluginContext, data: FlagsByInstance) => {
    await ctx.storage.set(STORAGE_KEY, data);
};

const applyInstanceFlags = (event: MessageEvent, flags: Record<string, boolean>) => {
    const instance = event.instance as any;
    if (!instance) return;
    instance._flagsStore = new Map(Object.entries(flags));
};

const plugin: NapGramPlugin = {
    id: 'flags',
    name: 'Flags Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Manages experimental feature flags',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Flags plugin installed');

        ctx.command({
            name: 'flags',
            description: '管理实验性功能标志',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (event.platform !== 'tg') {
                    return;
                }

                // 权限检查 (简单起见，这里假设 isAdmin 逻辑在外部集成，或者通过 event.raw 检查)
                // 暂时允许通过，生产环境建议由 CommandRegistry 统一处理 adminOnly

                const showHelp = async () => {
                    await event.reply(
                        `⚙️ **实验性功能标志管理**\n\n用法:\n` +
                        `/flags list - 查看所有标志\n` +
                        `/flags enable <name> - 启用标志\n` +
                        `/flags disable <name> - 禁用标志`
                    );
                };

                if (args.length === 0) {
                    await listFlags(event);
                    return;
                }

                const action = args[0].toLowerCase();
                const flagName = normalizeFlagName(args[1]);

                switch (action) {
                    case 'list':
                        await listFlags(event);
                        break;
                    case 'enable':
                    case 'on':
                        if (!flagName) {
                            await event.reply('用法: /flags enable <flag_name>');
                            return;
                        }
                        await setFlag(event, flagName, true);
                        break;
                    case 'disable':
                    case 'off':
                        if (!flagName) {
                            await event.reply('用法: /flags disable <flag_name>');
                            return;
                        }
                        await setFlag(event, flagName, false);
                        break;
                    default:
                        await showHelp();
                }
            },
        });

        const listFlags = async (event: MessageEvent) => {
            const instanceId = String(event.instance?.id ?? event.instanceId ?? '0');
            const allFlags = await loadAllFlags(ctx);
            const flagsMap = allFlags[instanceId] || {};

            let message = `⚙️ **实验性功能标志**\n\n`;

            const entries = Object.entries(flagsMap);
            if (entries.length === 0) {
                message += `当前没有启用任何实验性功能\n\n`;
            } else {
                for (const [key, value] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
                    const status = value ? '✅ 已启用' : '❌ 已禁用';
                    message += `\`${key}\` - ${status}\n`;
                }
                message += `\n`;
            }

            message += `⚠️ **警告**: 实验性功能可能不稳定！\n`;
            message += `\n可用标志参考:\n`;
            message += `• \`debug_mode\` - 调试模式`;

            applyInstanceFlags(event, flagsMap);
            await event.reply(message);
        };

        const setFlag = async (event: MessageEvent, flagName: string, enabled: boolean) => {
            try {
                const instanceId = String(event.instance?.id ?? event.instanceId ?? '0');
                const allFlags = await loadAllFlags(ctx);
                const next = { ...(allFlags[instanceId] || {}) };
                next[flagName] = enabled;
                allFlags[instanceId] = next;
                await saveAllFlags(ctx, allFlags);
                applyInstanceFlags(event, next);

                const status = enabled ? '✅ 已启用' : '❌ 已禁用';
                await event.reply(
                    `${status} 功能标志: \`${flagName}\`\n\n✅ 已持久化保存（实例 ${instanceId}）`
                );
            } catch (error) {
                ctx.logger.error('Flags plugin: Failed to set flag', error);
                await event.reply('❌ 设置功能标志失败，请查看日志');
            }
        };

        ctx.logger.info('Flags plugin: All commands registered');
    },

    uninstall: async () => {
    },
};

export default plugin;
