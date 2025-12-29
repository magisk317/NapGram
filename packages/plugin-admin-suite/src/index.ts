import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import {
    authRoutes,
    databaseRoutes,
    instancesRoutes,
    logsRoutes,
    marketplacesRoutes,
    messagesRoutes,
    pairsRoutes,
    pluginsRoutes,
    settingsRoutes,
    tokensRoutes,
} from '@napgram/web-interfaces';

type AdminSuiteConfig = {
    routes?: string[];
    exclude?: string[];
};

const routeMap = {
    auth: authRoutes,
    database: databaseRoutes,
    instances: instancesRoutes,
    logs: logsRoutes,
    marketplaces: marketplacesRoutes,
    messages: messagesRoutes,
    pairs: pairsRoutes,
    plugins: pluginsRoutes,
    settings: settingsRoutes,
    tokens: tokensRoutes,
};

const routeOrder = Object.keys(routeMap);

function resolveRouteList(config?: AdminSuiteConfig): string[] {
    const configured = Array.isArray(config?.routes) ? config?.routes.filter(Boolean) : [];
    if (configured.length) {
        return configured;
    }
    const excludeSet = new Set(Array.isArray(config?.exclude) ? config?.exclude.filter(Boolean) : []);
    return routeOrder.filter(key => !excludeSet.has(key));
}

const plugin: NapGramPlugin = {
    id: 'admin-suite',
    name: 'Admin Suite',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Bundle admin API routes into one plugin',

    install: async (ctx: PluginContext, config?: AdminSuiteConfig) => {
        ctx.logger.info('Admin suite plugin installed');
        const routes = resolveRouteList(config);

        ctx.web.registerRoutes((app: any) => {
            for (const key of routes) {
                const route = (routeMap as Record<string, any>)[key];
                if (!route) {
                    ctx.logger.warn(`Unknown admin suite route: ${key}`);
                    continue;
                }
                app.register(route);
            }
        });
    },
};

export default plugin;
