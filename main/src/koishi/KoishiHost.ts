import { Context } from '@koishijs/core';
import { getLogger } from '../shared/logger';
import env from '../domain/models/env';
import { loadKoishiPluginSpecs, resolveKoishiEndpoint, resolveKoishiInstances, resolveKoishiEnabled } from './config';
import * as gatewayAdapter from './adapter-napgram-gateway';
import * as pingPong from './plugins/ping-pong';

const logger = getLogger('KoishiHost');

export class KoishiHost {
  private static ctx?: Context;
  private static started = false;

  static getContext(): Context | undefined {
    return this.ctx;
  }

  static async start(options?: { defaultInstances?: number[] }): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (!resolveKoishiEnabled()) {
      logger.info('KoishiHost disabled');
      return;
    }

    const endpoint = resolveKoishiEndpoint();
    const instances = resolveKoishiInstances(options?.defaultInstances);
    const token = env.ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
    if (!token) {
      logger.warn('Missing ADMIN_TOKEN; KoishiHost will not start');
      return;
    }

    const ctx = new Context();
    this.ctx = ctx;

    ctx.plugin(gatewayAdapter as any, {
      endpoint,
      token,
      instances,
      selfId: 'napgram',
      name: 'napgram',
      adapterVersion: '0.0.0',
    });

    // MVP 内置插件：收到 ping 回复 pong
    ctx.plugin(pingPong as any, {});

    if (String(process.env.KOISHI_DEBUG_SESSIONS || '').trim() === '1') {
      ctx.on('message', (session: any) => {
        logger.info({
          platform: session.platform,
          selfId: session.selfId,
          userId: session.userId,
          guildId: session.guildId,
          channelId: session.channelId,
          content: String(session.content || '').slice(0, 200),
          referrer: session.referrer?.napgram,
        }, 'Koishi session');
      });
    }

    // 可选：加载用户插件
    const specs = await loadKoishiPluginSpecs();
    for (const spec of specs) {
      try {
        if (!spec.enabled) continue;
        const plugin = await spec.load();
        ctx.plugin(plugin as any, spec.config ?? {});
        logger.info({ module: spec.module }, 'Loaded Koishi plugin');
      } catch (error: any) {
        logger.error({ module: spec.module, error }, 'Failed to load Koishi plugin');
      }
    }

    await ctx.start();
    logger.info({ endpoint, instances }, 'KoishiHost started');
  }
}
