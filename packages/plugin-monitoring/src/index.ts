import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import {
    configCache,
    groupInfoCache,
    mediaCache,
    performanceMonitor,
    userInfoCache,
} from '@napgram/infra-kit';

const plugin: NapGramPlugin = {
    id: 'monitoring',
    name: 'Monitoring',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose monitoring and health endpoints',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Monitoring plugin installed');

        ctx.web.registerRoutes((app: any) => {
            app.get('/api/monitor/performance', async () => {
                const stats = performanceMonitor.getStats();
                return {
                    uptime: stats.uptime,
                    uptimeMinutes: (stats.uptime / 1000 / 60).toFixed(2),
                    totalMessages: stats.totalMessages,
                    messagesPerSecond: Number.parseFloat(stats.messagesPerSecond.toFixed(2)),
                    avgLatency: Number.parseFloat(stats.avgLatency.toFixed(2)),
                    p50Latency: Number.parseFloat(stats.p50Latency.toFixed(2)),
                    p95Latency: Number.parseFloat(stats.p95Latency.toFixed(2)),
                    p99Latency: Number.parseFloat(stats.p99Latency.toFixed(2)),
                    errorRate: Number.parseFloat((stats.errorRate * 100).toFixed(2)),
                    cacheHitRate: Number.parseFloat((stats.cacheHitRate * 100).toFixed(2)),
                    memoryUsageMB: Number.parseFloat(stats.memoryUsageMB.toFixed(2)),
                };
            });

            app.get('/api/monitor/cache', async () => {
                return {
                    userCache: userInfoCache.getStats(),
                    groupCache: groupInfoCache.getStats(),
                    mediaCache: mediaCache.getStats(),
                    configCache: configCache.getStats(),
                };
            });

            app.get('/api/monitor/health', async () => {
                const stats = performanceMonitor.getStats();
                const errorRate = stats.errorRate;
                const cacheHitRate = stats.cacheHitRate;

                let status = 'healthy';
                if (errorRate > 0.1) {
                    status = 'unhealthy';
                } else if (errorRate > 0.05 || cacheHitRate < 0.5) {
                    status = 'degraded';
                }

                return {
                    status,
                    timestamp: new Date().toISOString(),
                    uptime: stats.uptime,
                    metrics: {
                        messagesPerSecond: Number.parseFloat(stats.messagesPerSecond.toFixed(2)),
                        errorRate: Number.parseFloat((errorRate * 100).toFixed(2)),
                        cacheHitRate: Number.parseFloat((cacheHitRate * 100).toFixed(2)),
                        avgLatency: Number.parseFloat(stats.avgLatency.toFixed(2)),
                    },
                };
            });

            app.post('/api/monitor/stats/print', async () => {
                performanceMonitor.printStats();
                return { success: true, message: 'Stats printed to logs' };
            });
        });
    },
};

export default plugin;
