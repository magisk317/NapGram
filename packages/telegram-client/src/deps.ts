export interface LoggerLike {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    trace?(message: string, ...args: any[]): void;
}

export type LoggerFactory = (name: string) => LoggerLike;

export interface TelegramEnv {
    DATA_DIR?: string;
    PROXY_IP?: string;
    PROXY_PORT?: string | number;
    PROXY_USERNAME?: string;
    PROXY_PASSWORD?: string;
    TG_API_ID?: string | number;
    TG_API_HASH?: string;
    TG_BOT_TOKEN?: string;
    INTERNAL_WEB_ENDPOINT?: string;
    WEB_ENDPOINT?: string;
}

export interface TelegramSessionStore {
    dbId?: number;
    sessionString?: string | null;
    load(): Promise<void>;
    save(session: string): Promise<void>;
}

export type TelegramSessionFactory = (sessionId?: number) => TelegramSessionStore;

export interface TelegramClientDependencies {
    env?: TelegramEnv;
    sessionFactory: TelegramSessionFactory;
    loggerFactory?: LoggerFactory;
    tempPath?: string;
}

let currentDependencies: TelegramClientDependencies | null = null;

export function configureTelegramClient(deps: TelegramClientDependencies): void {
    currentDependencies = deps;
}

export function getTelegramClientDependencies(): TelegramClientDependencies {
    if (!currentDependencies) {
        throw new Error('Telegram client dependencies not configured');
    }
    return currentDependencies;
}

export function resolveTelegramEnv(env?: TelegramEnv): TelegramEnv {
    return {
        DATA_DIR: env?.DATA_DIR ?? process.env.DATA_DIR,
        PROXY_IP: env?.PROXY_IP ?? process.env.PROXY_IP,
        PROXY_PORT: env?.PROXY_PORT ?? process.env.PROXY_PORT,
        PROXY_USERNAME: env?.PROXY_USERNAME ?? process.env.PROXY_USERNAME,
        PROXY_PASSWORD: env?.PROXY_PASSWORD ?? process.env.PROXY_PASSWORD,
        TG_API_ID: env?.TG_API_ID ?? process.env.TG_API_ID,
        TG_API_HASH: env?.TG_API_HASH ?? process.env.TG_API_HASH,
        TG_BOT_TOKEN: env?.TG_BOT_TOKEN ?? process.env.TG_BOT_TOKEN,
        INTERNAL_WEB_ENDPOINT: env?.INTERNAL_WEB_ENDPOINT ?? process.env.INTERNAL_WEB_ENDPOINT,
        WEB_ENDPOINT: env?.WEB_ENDPOINT ?? process.env.WEB_ENDPOINT,
    };
}

export function resolveLoggerFactory(factory?: LoggerFactory): LoggerFactory {
    if (factory) return factory;
    return (name: string) => {
        const prefix = `[${name}]`;
        return {
            debug: (message: string, ...args: any[]) => console.debug(prefix, message, ...args),
            info: (message: string, ...args: any[]) => console.info(prefix, message, ...args),
            warn: (message: string, ...args: any[]) => console.warn(prefix, message, ...args),
            error: (message: string, ...args: any[]) => console.error(prefix, message, ...args),
            trace: (message: string, ...args: any[]) => console.trace(prefix, message, ...args),
        };
    };
}

export function resolveTempPath(env: TelegramEnv, tempPath?: string): string {
    if (tempPath) return tempPath;
    const dataDir = env.DATA_DIR || '/app/data';
    return `${dataDir.replace(/\/+$/, '')}/temp`;
}
