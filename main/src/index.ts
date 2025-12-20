import { getLogger } from './shared/logger';
import Instance from './domain/models/Instance';
import db from './domain/models/db';
import api from './interfaces';
import posthog from './domain/models/posthog';
import env from './domain/models/env';
import { PluginRuntime } from './plugins/runtime';

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
  // 打印 Admin Token（如果已配置）
  if (process.env.ADMIN_TOKEN) {
    const token = process.env.ADMIN_TOKEN;
    // 在开发环境或设置了 SHOW_FULL_TOKEN 时显示完整 token
    if (process.env.SHOW_FULL_TOKEN === 'true' || process.env.NODE_ENV === 'development') {
      log.info(`ADMIN_TOKEN (FULL): ${env.ADMIN_TOKEN}`);
      log.info(`Login URL: ${env.WEB_ENDPOINT || 'http://localhost:8080'}/login`);
    } else {
      const maskedToken = env.ADMIN_TOKEN.length > 12
        ? `${'*'.repeat(env.ADMIN_TOKEN.length - 8)}${env.ADMIN_TOKEN.slice(-8)}`
        : env.ADMIN_TOKEN;
      log.info(`ADMIN_TOKEN: ${maskedToken} (use this to login to /login`);
    }
  } else {
    // Generate random 32-character token
    const randomToken = Array.from({ length: 32 }, () =>
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]
    ).join('');

    // Set to both process.env and env object
    process.env.ADMIN_TOKEN = randomToken;
    (env as any).ADMIN_TOKEN = randomToken;

    log.info('━'.repeat(80));
    log.info('⚠️  ADMIN_TOKEN auto-generated for this session:');
    log.info('');
    log.info(`    ${randomToken}`);
    log.info('');
    log.info('    Copy this token to access the admin panel at /login');
    log.info('    This token is temporary and will change on restart.');
    log.info('    To use a permanent token, set ADMIN_TOKEN in your .env file.');
    log.info('━'.repeat(80));
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

  // 先启动插件运行时（在 Instance 之前，确保插件命令可被 CommandsFeature 发现）
  await PluginRuntime.start({ defaultInstances: targets });

  // 再启动实例（包括 FeatureManager 中的 CommandsFeature）
  await Promise.all(targets.map(id => Instance.start(id)));

  posthog.capture('启动完成', { instanceCount: targets.length });
})();
