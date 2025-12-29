import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import { marketplacesRoutes, pluginsRoutes } from '@napgram/web-interfaces';

const plugin: NapGramPlugin = {
    id: 'admin-plugins',
    name: 'Admin Plugins API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin plugin and marketplace routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin plugins API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(pluginsRoutes);
            app.register(marketplacesRoutes);
        });
    },
};

export default plugin;
