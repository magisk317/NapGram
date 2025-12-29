import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import { statisticsRoutes } from '@napgram/web-interfaces';

const plugin: NapGramPlugin = {
    id: 'statistics',
    name: 'Statistics',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin statistics endpoints',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Statistics plugin installed');
        ctx.web.registerRoutes((app: any) => statisticsRoutes(app));
    },
};

export default plugin;
