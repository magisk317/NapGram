import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import {
    qqAvatarRoutes,
    richHeaderRoutes,
    telegramAvatarRoutes,
    tempFileRoutes,
} from '@napgram/web-interfaces';

const plugin: NapGramPlugin = {
    id: 'web-assets',
    name: 'Web Assets',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose public assets and avatar routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Web assets plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(telegramAvatarRoutes);
            app.register(qqAvatarRoutes);
            app.register(richHeaderRoutes);
            app.register(tempFileRoutes);
        });
    },
};

export default plugin;
