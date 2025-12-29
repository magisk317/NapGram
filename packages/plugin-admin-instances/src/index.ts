import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import { instancesRoutes } from '@napgram/web-interfaces';

const plugin: NapGramPlugin = {
    id: 'admin-instances',
    name: 'Admin Instances API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin instance routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin instances API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(instancesRoutes);
        });
    },
};

export default plugin;
