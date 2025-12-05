import fs from 'fs';
import path from 'path';
import pino from 'pino';
import env from '../../domain/models/env';
import pretty from 'pino-pretty';

const prettyTarget = env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace' || process.env.NODE_ENV === 'development'
  ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      // 使用系统时区（已设置为 Asia/Shanghai），格式：YYYY-MM-DD HH:mm:ss.SSS
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o',
      ignore: 'pid,hostname',
    },
    level: env.LOG_LEVEL,
  }
  : undefined;

// Map env log levels to pino levels
const levelMap: Record<string, string> = {
  mark: 'info',
  off: 'silent',
};

const consoleLevel = levelMap[env.LOG_LEVEL] || env.LOG_LEVEL;
const fileLevel = levelMap[env.LOG_FILE_LEVEL] || env.LOG_FILE_LEVEL;
// Use the most verbose level across targets so transports can filter independently
const levelValue = (lvl: string) => pino.levels.values[lvl as pino.Level] ?? pino.levels.values.info;
const baseLevel = levelValue(consoleLevel) <= levelValue(fileLevel) ? consoleLevel : fileLevel;

// Ensure log directory exists before creating transport
const logDir = path.dirname(env.LOG_FILE);
fs.mkdirSync(logDir, { recursive: true });
// File name pattern: YYYY-MM-DD.1.log
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: process.env.TZ || 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());
const filePath = path.join(logDir, `${today}.1.log`);

const targets = [
  ...(prettyTarget ? [prettyTarget] : []),
  {
    target: 'pino/file',
    options: {
      destination: filePath,
      mkdir: true,
    },
    level: fileLevel,
  },
];

const loggerTransport = pino.transport({ targets: targets as any });

export const logger = pino({
  level: baseLevel,
  // 自定义时间戳格式化函数，转换为 UTC+8
  timestamp: () => {
    const now = new Date();
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return `,"time":"${utc8.toISOString().replace('T', ' ').replace('Z', ' +0800')}"`;
  },
}, loggerTransport);

export type AppLogger = pino.Logger;

export const getLogger = (name: string): AppLogger => {
  return logger.child({ name });
};

export default getLogger;
