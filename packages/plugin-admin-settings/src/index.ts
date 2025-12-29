import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import { settingsRoutes, tokensRoutes } from '@napgram/web-interfaces';

const plugin: NapGramPlugin = {
    id: 'admin-settings',
    name: 'Admin Settings API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin settings and token routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin settings API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(settingsRoutes);
            app.register(tokensRoutes);
        });
    },
};

export default plugin;
