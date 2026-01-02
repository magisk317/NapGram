import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { inspect } from 'node:util'
import env from './env'

type LogLevel = 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type EnvLogLevel = Exclude<LogLevel, 'silly'> | 'mark' | 'off'

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
}

function normalizeLevel(level: string | undefined): EnvLogLevel {
    const normalized = (level || '').toLowerCase()
    if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off'].includes(normalized)) {
        return normalized as EnvLogLevel
    }
    return 'info'
}

let consoleLevel = normalizeLevel(env.LOG_LEVEL as any)
const fileLevel = normalizeLevel(env.LOG_FILE_LEVEL as any)
let consoleThreshold = levelId[consoleLevel]
const fileThreshold = levelId[fileLevel]
const fileLoggingRequested = fileThreshold < levelId.off
const tz = process.env.TZ || 'Asia/Shanghai'
const timeFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
})
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

const logDir = path.dirname(env.LOG_FILE)
let fileStream: fs.WriteStream | null = null
let fileLoggingEnabled = fileLoggingRequested
if (fileLoggingRequested) {
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true })
        }
    }
    catch {
        fileLoggingEnabled = false
    }
}

function buildDatedFile(dateStr: string) {
    // Always name file as YYYY-MM-DD.1.log
    return path.join(logDir, `${dateStr}.1.log`)
}

let currentDate = dateFormatter.format(new Date())
if (fileLoggingEnabled) {
    try {
        fileStream = fs.createWriteStream(buildDatedFile(currentDate), { flags: 'a' })
    }
    catch {
        fileLoggingEnabled = false
        fileStream = null
    }
}

export function rotateIfNeeded() {
    if (!fileLoggingEnabled || !fileStream)
        return
    const today = dateFormatter.format(new Date())
    if (today === currentDate)
        return
    fileStream.end()
    currentDate = today
    try {
        fileStream = fs.createWriteStream(buildDatedFile(currentDate), { flags: 'a' })
    }
    catch {
        fileLoggingEnabled = false
        fileStream = null
    }
}

function formatArgs(args: unknown[], color = false) {
    return args.map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: 4, colors: color, breakLength: 120 })))
}

const resetColor = '\x1B[0m'

const MODULE_COLORS: Record<string, string> = {
    // Enhanced Palette
    steel_blue: '\x1B[38;5;67m',
    orange: '\x1B[38;5;208m',
    bright_green: '\x1B[38;5;82m',
    pale_blue: '\x1B[38;5;68m',
    bold_white: '\x1B[1;97m',
    bright_yellow: '\x1B[93m',
    bright_purple: '\x1B[95m',
    bright_cyan: '\x1B[96m',
    purple: '\x1B[35m',
    dark_grey: '\x1B[38;5;242m',
    cyan: '\x1B[38;5;45m',
    green: '\x1B[38;5;10m',
    grey: '\x1B[38;5;8m',
    soft_pink: '\x1B[38;5;175m',
    dark_orange: '\x1B[38;5;166m',
    light_purple: '\x1B[38;5;141m',
    gold: '\x1B[38;5;220m',
    teal: '\x1B[38;5;30m',
    crimson: '\x1B[38;5;161m',
    sky_blue: '\x1B[38;5;39m',
}

// Map NapGram Loggers to Colors
const LOGGER_COLOR_MAP: Record<string, string> = {
    // Core System
    'Instance': MODULE_COLORS.bold_white,
    'Main': MODULE_COLORS.bold_white,
    'FeatureManager': MODULE_COLORS.purple,
    'Plugin': MODULE_COLORS.purple,

    // Forwarding Core
    'ForwardFeature': MODULE_COLORS.bright_green,
    'ForwardPair': MODULE_COLORS.bright_yellow,

    // Senders (Outbound)
    'TelegramSender': MODULE_COLORS.steel_blue,
    'MediaSender': MODULE_COLORS.pale_blue,
    'TelegramReply': MODULE_COLORS.steel_blue,

    // Handlers (Inbound)
    'TelegramMessageHandler': MODULE_COLORS.cyan,
    'QQMessageHandler': MODULE_COLORS.cyan,
    'MediaGroupHandler': MODULE_COLORS.pale_blue,
    'ModeCommandHandler': MODULE_COLORS.orange,

    // Command System (Orange/Gold)
    'CommandsFeature': MODULE_COLORS.orange,
    'HelpCommandHandler': MODULE_COLORS.orange,
    'UnbindCommandHandler': MODULE_COLORS.orange,
    'StatusCommandHandler': MODULE_COLORS.orange,
    'BindCommandHandler': MODULE_COLORS.orange,
    'RecallCommandHandler': MODULE_COLORS.orange,
    'PermissionChecker': MODULE_COLORS.orange,
    'InteractiveStateManager': MODULE_COLORS.orange,

    // Clients & Infrastructure
    'TelegramClient': MODULE_COLORS.dark_grey,
    'QQClientFactory': MODULE_COLORS.bright_purple,
    'NapCatAdapter': MODULE_COLORS.dark_grey,
    'Web Api': MODULE_COLORS.teal,
    'ReconnectingWS': MODULE_COLORS.teal,
    'QQAvatar': MODULE_COLORS.teal,
    'telegramAvatar': MODULE_COLORS.teal,

    // Memory & Recall
    'RecallFeature': MODULE_COLORS.soft_pink,
    'CacheManager': MODULE_COLORS.soft_pink,

    // Media & Utilities
    'MediaFeature': MODULE_COLORS.sky_blue,
    'NapCatConverter': MODULE_COLORS.bright_cyan,
    'MessageConverter': MODULE_COLORS.bright_cyan,
    'FileNormalizer': MODULE_COLORS.bright_cyan,
    'AudioConverter': MODULE_COLORS.bright_cyan,
    'TextSegmentConverter': MODULE_COLORS.bright_cyan,
    'MediaSegmentConverter': MODULE_COLORS.bright_cyan,
    'MessageUtils': MODULE_COLORS.bright_cyan,
    'ReplyResolver': MODULE_COLORS.bright_cyan,
    'convertWithFfmpeg': MODULE_COLORS.bright_cyan,

    // System Monitoring
    'PerformanceMonitor': MODULE_COLORS.light_purple,
    'MessageQueue': MODULE_COLORS.light_purple,
    'NotificationService': MODULE_COLORS.crimson,
}

function getLoggerColor(name: string) {
    // Direct match
    if (LOGGER_COLOR_MAP[name]) {
        return LOGGER_COLOR_MAP[name]
    }

    // Prefix match (e.g. Instance - 0 matching Instance)
    for (const key of Object.keys(LOGGER_COLOR_MAP)) {
        if (name.startsWith(key)) {
            return LOGGER_COLOR_MAP[key]
        }
    }

    // Fallback hash for unknown loggers
    const safeColors = [
        MODULE_COLORS.steel_blue,
        MODULE_COLORS.bright_green,
        MODULE_COLORS.orange,
        MODULE_COLORS.bright_yellow,
        MODULE_COLORS.bright_purple,
        MODULE_COLORS.cyan,
    ]

    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % safeColors.length
    return safeColors[index]
}

function highlightContent(str: string): string {
    return str
        // Keywords
        .replace(/(\[Forward\]|\[TG->QQ\]|\[QQ->TG\]|\[TG\]|\[Commands\])/g, '\x1B[93m$1\x1B[0m') // Bright Yellow
        .replace(/(incoming|recv)/g, '\x1B[32m$1\x1B[0m') // Green
        .replace(/(resolved|Sending to thread)/g, '\x1B[36m$1\x1B[0m') // Cyan
        .replace(/(message )/g, '\x1B[34m$1\x1B[0m') // Blue

        // Data patterns
        .replace(/((?:id|chatId|senderId|text|qqMsgId|qqRoomId|tgChatId|threadId):)/g, '\x1B[90m$1\x1B[0m') // Grey keys
        .replace(/(: )(\d+|'[^']*')/g, '$1\x1B[33m$2\x1B[0m') // Yellow values
        .replace(/ (\{|\}) /g, ' \x1B[90m$1\x1B[0m ') // Grey braces
}

function logToConsole(logger: string, level: LogLevel, args: unknown[]) {
    const id = levelId[level]
    if (id < consoleThreshold || consoleThreshold >= levelId.off)
        return
    const time = timeFormatter.format(new Date()).replace(' ', 'T')
    const loggerColor = getLoggerColor(logger)

    // Unified prefix color: [Time] Level Logger -> All use loggerColor
    const prefix = `${loggerColor}[${time}] ${level.toUpperCase().padEnd(5)} ${logger.padEnd(24)}${resetColor} :`

    // Highlight content
    const formattedArgs = formatArgs(args, true).map(arg => highlightContent(arg))

    const message = formattedArgs.join(' ')
    const line = message ? `${prefix} ${message}` : prefix
    process.stdout.write(`${line}\n`)
}

function logToFile(logger: string, level: LogLevel, args: unknown[]) {
    if (!fileLoggingEnabled || !fileStream)
        return
    if (fileThreshold >= levelId.off || levelId[level] < fileThreshold)
        return
    rotateIfNeeded()

    // Recheck after rotation - rotateIfNeeded() may have disabled file logging or nulled fileStream
    if (!fileLoggingEnabled || !fileStream)
        return

    const payload = {
        time: timeFormatter.format(new Date()).replace(' ', 'T'),
        level,
        logger,
        messages: formatArgs(args, false),
    }
    fileStream.write(`${JSON.stringify(payload)}\n`)
}

export interface AppLogger {
    trace: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    fatal: (...args: unknown[]) => void
}

export function setConsoleLogLevel(level: EnvLogLevel) {
    consoleLevel = level
    consoleThreshold = levelId[level]
}

export function getLogger(name: string): AppLogger {
    const emit = (level: LogLevel, ...args: unknown[]) => {
        logToConsole(name, level, args)
        logToFile(name, level, args)
    }

    return {
        trace: (...args: unknown[]) => emit('trace', ...args),
        debug: (...args: unknown[]) => emit('debug', ...args),
        info: (...args: unknown[]) => emit('info', ...args),
        warn: (...args: unknown[]) => emit('warn', ...args),
        error: (...args: unknown[]) => emit('error', ...args),
        fatal: (...args: unknown[]) => emit('fatal', ...args),
    }
}

export default getLogger
