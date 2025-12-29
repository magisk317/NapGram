import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import { databaseRoutes } from '@napgram/web-interfaces';

const plugin: NapGramPlugin = {
    id: 'admin-database',
    name: 'Admin Database API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin database routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin database API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(databaseRoutes);
        });
    },
};

export default plugin;
