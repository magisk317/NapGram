import fs from 'fs';
import path from 'path';
import { inspect } from 'util';
import env from '../domain/models/env';

type LogLevel = 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type EnvLogLevel = Exclude<LogLevel, 'silly'> | 'mark' | 'off';

const levelId: Record<LogLevel | 'mark' | 'off', number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
  mark: 3,
  off: 7,
};

const normalizeLevel = (level: string | undefined): EnvLogLevel => {
  const normalized = (level || '').toLowerCase();
  if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off'].includes(normalized)) {
    return normalized as EnvLogLevel;
  }
  return 'info';
};

const consoleLevel = normalizeLevel(env.LOG_LEVEL);
const fileLevel = normalizeLevel(env.LOG_FILE_LEVEL);
const consoleThreshold = levelId[consoleLevel];
const fileThreshold = levelId[fileLevel];
const tz = process.env.TZ || 'Asia/Shanghai';
const timeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: tz,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const logDir = path.dirname(env.LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const buildDatedFile = (dateStr: string) => {
  // Always name file as YYYY-MM-DD.1.log
  return path.join(logDir, `${dateStr}.1.log`);
};

let currentDate = dateFormatter.format(new Date());
let fileStream = fs.createWriteStream(buildDatedFile(currentDate), { flags: 'a' });

const rotateIfNeeded = () => {
  const today = dateFormatter.format(new Date());
  if (today === currentDate) return;
  fileStream.end();
  currentDate = today;
  fileStream = fs.createWriteStream(buildDatedFile(currentDate), { flags: 'a' });
};

const formatArgs = (args: unknown[], color = false) =>
  args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 4, colors: color, breakLength: 120 })));

const levelColor: Record<LogLevel, string> = {
  silly: '\x1b[90m', // bright black
  trace: '\x1b[90m',
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[41m', // red background
};
const resetColor = '\x1b[0m';

const logToConsole = (logger: string, level: LogLevel, args: unknown[]) => {
  const id = levelId[level];
  if (id < consoleThreshold || consoleThreshold >= levelId.off) return;
  const time = timeFormatter.format(new Date()).replace(' ', 'T');
  const color = levelColor[level] || '';
  const formattedArgs = formatArgs(args, true);
  console.log(`${color}[${time}] ${level.toUpperCase()} ${logger}:${resetColor}`, ...formattedArgs);
};

const logToFile = (logger: string, level: LogLevel, args: unknown[]) => {
  if (fileThreshold >= levelId.off || levelId[level] < fileThreshold) return;
  rotateIfNeeded();
  const payload = {
    time: timeFormatter.format(new Date()).replace(' ', 'T'),
    level,
    logger,
    messages: formatArgs(args, false),
  };
  fileStream.write(`${JSON.stringify(payload)}\n`);
};

export type AppLogger = {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
};

export const getLogger = (name: string): AppLogger => {
  const emit = (level: LogLevel, ...args: unknown[]) => {
    logToConsole(name, level, args);
    logToFile(name, level, args);
  };

  return {
    trace: (...args: unknown[]) => emit('trace', ...args),
    debug: (...args: unknown[]) => emit('debug', ...args),
    info: (...args: unknown[]) => emit('info', ...args),
    warn: (...args: unknown[]) => emit('warn', ...args),
    error: (...args: unknown[]) => emit('error', ...args),
    fatal: (...args: unknown[]) => emit('fatal', ...args),
  };
};

export default getLogger;
