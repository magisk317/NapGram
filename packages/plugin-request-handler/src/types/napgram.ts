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

    command(config: CommandConfig): this;

    on(event: 'message', handler: (event: MessageEvent) => void | Promise<void>): EventSubscription;
    on(event: 'friend-request', handler: (event: FriendRequestEvent) => void | Promise<void>): EventSubscription;
    on(event: 'group-request', handler: (event: GroupRequestEvent) => void | Promise<void>): EventSubscription;
    on(event: 'instance-status', handler: (event: InstanceStatusEvent) => void | Promise<void>): EventSubscription;
}

export interface CommandConfig {
    name: string;
    aliases?: string[];
    description?: string;
    usage?: string;
    adminOnly?: boolean;
    handler: (event: MessageEvent, args: string[]) => void | Promise<void>;
}

export interface MessageEvent {
    eventId: string;
    instanceId: number;
    platform: 'qq' | 'tg';
    channelId: string;
    threadId?: number;
    channelType: string;
    sender: {
        userId: string;
        userName: string;
    };
    message: {
        id: string;
        text: string;
        segments: any[];
        timestamp: number;
    };
    logger: PluginLogger;
    raw: any;

    // 便捷方法
    reply(content: string | any[]): Promise<any>;
    send(content: string | any[]): Promise<any>;
    recall(): Promise<void>;

    // API 访问
    qq?: QQClientAPI;
    tg?: any;
    instance?: InstanceAPI;
}

export interface FriendRequestEvent {
    eventId: string;
    instanceId: number;
    platform: 'qq' | 'tg';
    requestId: string;
    userId: string;
    userName: string;
    comment?: string;
    timestamp: number;

    approve(): Promise<void>;
    reject(reason?: string): Promise<void>;
}

export interface GroupRequestEvent {
    eventId: string;
    instanceId: number;
    platform: 'qq' | 'tg';
    requestId: string;
    groupId: string;
    userId: string;
    userName: string;
    comment?: string;
    subType?: 'add' | 'invite';
    timestamp: number;

    approve(): Promise<void>;
    reject(reason?: string): Promise<void>;
}

export interface InstanceStatusEvent {
    instanceId: number;
    status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
    error?: Error;
    timestamp: number;
}

// QQ Client API（简化版）
export interface QQClientAPI {
    uin: number;
    handleFriendRequest?(flag: string, approve: boolean, reason?: string): Promise<void>;
    handleGroupRequest?(flag: string, subType: 'add' | 'invite', approve: boolean, reason?: string): Promise<void>;
    callApi?(method: string, params: any): Promise<any>;
}

// Instance API（简化版）
export interface InstanceAPI {
    id: number;
    forwardPairs: any; // ForwardMap
}

export interface PluginLogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}

export interface EventSubscription {
    unsubscribe(): void;
}
