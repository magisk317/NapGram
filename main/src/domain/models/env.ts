import z from 'zod';
import path from 'path';

// 在测试环境下填充必要的占位符，避免 zod 校验直接退出
if (process.env.NODE_ENV === 'test') {
  process.env.TG_API_ID ??= '1';
  process.env.TG_API_HASH ??= 'dummy-hash';
  process.env.TG_BOT_TOKEN ??= 'dummy-token';
}

const configParsed = z.object({
  DATA_DIR: z.string().default(path.resolve('./data')),
  CACHE_DIR: z.string().default(path.join(process.env.DATA_DIR || path.resolve('./data'), 'cache')),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('info'),
  LOG_FILE_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('debug'),
  LOG_FILE: z.string().default(path.join(process.env.DATA_DIR || path.resolve('./data'), 'logs', 'app.log')),
  OICQ_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('warn'),
  TG_LOG_LEVEL: z.enum(['none', 'error', 'warn', 'info', 'debug']).default('warn'),

  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  // 只会在实例 0 自动使用
  NAPCAT_WS_URL: z.string().url().optional(),

  SIGN_API: z.string().url().optional(),
  SIGN_VER: z.string().optional(),

  TG_API_ID: z.string().regex(/^\d+$/).transform(Number),
  TG_API_HASH: z.string(),
  TG_BOT_TOKEN: z.string(),
  TG_CONNECTION: z.enum(['websocket', 'tcp']).default('tcp'),
  TG_INITIAL_DCID: z.string().regex(/^\d+$/).transform(Number).optional(),
  TG_INITIAL_SERVER: z.string().ip().optional(),
  TG_USE_TEST_DC: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),
  IPV6: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),
  ADMIN_QQ: z.string().regex(/^\d+$/).transform(Number).optional(),
  ADMIN_TG: z.string().regex(/^-?\d+$/).transform(Number).optional(),

  PROXY_IP: z.string().ip().optional(),
  PROXY_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  PROXY_USERNAME: z.string().optional(),
  PROXY_PASSWORD: z.string().optional(),

  TGS_TO_GIF: z.string().default('tgs_to_gif'),

  CRV_API: z.string().url().optional(),
  CRV_VIEWER_APP: z.string().url().startsWith('https://t.me/').optional(),
  CRV_KEY: z.string().optional(),

  DISABLE_FILE_UPLOAD_TIP: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),
  IMAGE_SUMMARY: z.string().optional(),
  ENABLE_FEATURE_MANAGER: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),

  LISTEN_PORT: z.string().regex(/^\d+$/).transform(Number).default('8080'),

  UI_PATH: z.string().optional(),
  UI_PROXY: z.string().url().optional(),
  WEB_ENDPOINT: z.string().url().optional(),
  INTERNAL_WEB_ENDPOINT: z.string().url().optional(),

  POSTHOG_OPTOUT: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('false'),
  SHOW_NICKNAME_MODE: z.string().regex(/^[01]{2}$/).default('11'),
  FORWARD_MODE: z.string().regex(/^[01]{2}$/).default('11'),
  ENABLE_AUTO_RECALL: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('true'),
  ENABLE_OFFLINE_NOTIFICATION: z.string().transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase())).default('true'),
  OFFLINE_NOTIFICATION_COOLDOWN: z.string().regex(/^\d+$/).transform(Number).default('3600000'), // 默认1小时

  REPO: z.string().default('Local Build'),
  REF: z.string().default('Local Build'),
  COMMIT: z.string().default('Local Build'),
}).safeParse(process.env);

if (!configParsed.success) {
  console.error('环境变量解析错误:', (configParsed as any).error);
  process.exit(1);
}

export default configParsed.data;
