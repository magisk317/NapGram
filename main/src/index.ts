import { getLogger } from './shared/logger';
import Instance from './domain/models/Instance';
import db from './domain/models/db';
import api from './interfaces';
import posthog from './domain/models/posthog';
import env from './domain/models/env';

(async () => {
    const log = getLogger('Main');

    // 打印环境变量配置（仅在启动时打印一次）
    log.info('=== Environment Configuration ===');
    log.info(`FORWARD_MODE: ${env.FORWARD_MODE} (QQ→TG: ${env.FORWARD_MODE[0]}, TG→QQ: ${env.FORWARD_MODE[1]})`);
    log.info(`SHOW_NICKNAME_MODE: ${env.SHOW_NICKNAME_MODE} (QQ→TG: ${env.SHOW_NICKNAME_MODE[0]}, TG→QQ: ${env.SHOW_NICKNAME_MODE[1]})`);
    log.info(`TG_CONNECTION: ${env.TG_CONNECTION}`);
    log.info(`TG_INITIAL_DCID: ${env.TG_INITIAL_DCID || 'auto'}`);
    log.info(`TG_INITIAL_SERVER: ${env.TG_INITIAL_SERVER || 'auto'}`);
    log.info(`NAPCAT_WS_URL: ${env.NAPCAT_WS_URL || 'not set'}`);
    log.info(`WEB_ENDPOINT: ${env.WEB_ENDPOINT || 'not set'}`);
    log.info(`LOG_LEVEL: ${env.LOG_LEVEL}`);
    log.info(`TG_LOG_LEVEL: ${env.TG_LOG_LEVEL}`);
    if (env.PROXY_IP && env.PROXY_PORT) {
        log.info(`PROXY: socks5://${env.PROXY_IP}:${env.PROXY_PORT}`);
    }
    log.info('=================================');

    process.on('unhandledRejection', error => {
        log.error(error, 'UnhandledRejection: ');
        posthog.capture('UnhandledRejection', { error });
    });

    process.on('uncaughtException', error => {
        log.error(error, 'UncaughtException: ');
        posthog.capture('UncaughtException', { error });
    });

    api.startListening();

    const instanceEntries = await db.instance.findMany();
    const targets = instanceEntries.length ? instanceEntries.map(it => it.id) : [0];

    for (const id of targets) {
        await Instance.start(id);
    }

    posthog.capture('启动完成', { instanceCount: targets.length });
})();