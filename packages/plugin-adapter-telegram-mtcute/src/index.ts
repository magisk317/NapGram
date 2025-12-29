import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import Telegram, { telegramClientFactory } from '@napgram/telegram-client';

const plugin: NapGramPlugin = {
    id: 'adapter-telegram-mtcute',
    name: 'Telegram Adapter (mtcute)',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Provide mtcute-based Telegram adapter',

    install: async (ctx: PluginContext) => {
        telegramClientFactory.register('mtcute', {
            create: async (params) => {
                return Telegram.create({
                    botToken: params.botToken,
                    botAuthToken: params.botToken,
                }, params.appName || 'NapGram');
            },
            connect: async (params) => {
                return Telegram.connect(params.sessionId, params.appName || 'NapGram', params.botToken);
            },
        });
        ctx.logger.info('Telegram mtcute adapter registered');
    },
};

export default plugin;
