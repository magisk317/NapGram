import type { MessageEvent, NapGramPlugin, PluginContext } from '@napgram/sdk';

const plugin: NapGramPlugin = {
    id: 'ping-pong',
    name: 'Ping Pong Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: '回复包含 "ping" 的消息，发送 "pong"',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Ping Pong plugin installed');

        ctx.on('message', async (event: MessageEvent) => {
            const text = event.message.text.toLowerCase();

            if (text.includes('ping')) {
                await event.reply('pong!');

                ctx.logger.info(`Replied to ${event.sender.userName} in ${event.channelId}`);
            }
        });

        ctx.onUnload(() => {
            ctx.logger.info('Ping Pong plugin unloaded');
        });
    },
};

export default plugin;
