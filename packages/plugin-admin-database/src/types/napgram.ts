// NapGram Plugin Types
// 这是简化的类型定义，用于插件开发

export interface NapGramPlugin {
    id: string;
    name: string;
    version: string;
    author?: string;
    description?: string;
    permissions?: {
        instances?: number[];
    };
    install(ctx: PluginContext, config?: any): void | Promise<void>;
    uninstall?(): void | Promise<void>;
}

export interface PluginContext {
    readonly pluginId: string;
    readonly logger: PluginLogger;
    readonly config: any;
    readonly web: WebAPI;
}

export interface WebAPI {
    registerRoutes(register: (app: any) => void): void;
}

export interface PluginLogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}
