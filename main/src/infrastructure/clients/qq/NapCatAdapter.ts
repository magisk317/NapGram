import { EventEmitter } from 'events';
import { getLogger } from '../../../shared/logger';
import type { IQQClient, NapCatCreateParams } from './interface';
import type { UnifiedMessage, MessageReceipt, RecallEvent, Chat, Sender } from '../../../domain/message/types';
import { messageConverter } from '../../../domain/message/converter';
import { napCatForwardMultiple } from './napcatConvert';
import type { ForwardMessage } from './types';
import { NapLink, OneBotApi, type MessageEvent, type NoticeEvent, type RequestEvent, type MetaEvent } from '@naplink/naplink';

const logger = getLogger('NapCatAdapter');

/**
 * NapCat 客户端适配器
 * Phase 1: 将 NapCat 适配到统一的 IQQClient 接口
 * Note: Does not explicitly implement IQQClient to avoid EventEmitter interface conflict,
 * but provides all required methods and is cast to IQQClient in the factory.
 */
export class NapCatAdapter extends EventEmitter {
    readonly clientType = 'napcat' as const;
    private _uin: number = 0;
    private _nickname: string = '';
    private client: NapLink;

    constructor(private readonly params: NapCatCreateParams) {
        const clientLogger = getLogger('NapLink');

        super();
        this.client = new NapLink({
            connection: {
                url: params.wsUrl,
                // token: params.token,
            },
            reconnect: params.reconnect ? {
                enabled: true,
                maxAttempts: 100,
            } : undefined,
            logging: {
                level: 'info',
                logger: {
                    // 过滤掉 NapLink 的 debug 日志，避免心跳刷屏
                    debug: (msg, ...args) => { },
                    info: (msg, ...args) => clientLogger.info(msg, ...args),
                    warn: (msg, ...args) => clientLogger.warn(msg, ...args),
                    error: (msg, err, ...args) => clientLogger.error(msg, err, ...args),
                }
            }
        });

        this.setupEvents();
    }

    get uin(): number {
        return this._uin;
    }

    get nickname(): string {
        return this._nickname;
    }

    private setupEvents() {
        this.client.on('connect', () => {
            this.emit('online');
            this.refreshSelfInfo();
            // this.startHeartbeat(); // SDK handles heartbeat if configured

            // 触发重连成功事件  
            this.emit('connection:restored', {
                timestamp: Date.now()
            });
        });

        // NapLink splits events, but we can listen to 'raw' to get everything and process it via existing handler
        this.client.on('raw', (context: any) => {
            this.handleWebSocketMessage(context).catch(err => logger.error('Failed to handle WebSocket message:', err));
        });

        this.client.on('disconnect', () => {
            this.emit('offline');

            // 触发掉线通知事件
            this.emit('connection:lost', {
                timestamp: Date.now(),
                reason: 'WebSocket closed'
            });
        });
    }

    private async handleWebSocketMessage(data: MessageEvent | NoticeEvent | RequestEvent | MetaEvent) {
        // SDK handles Echo/API responses internally, we only get events here
        // 处理事件
        if (data.post_type === 'message') {
            const msgEvent = data as MessageEvent;
            // Use SDK's media hydration
            await this.client.hydrateMessage(msgEvent.message);
            const unifiedMsg = messageConverter.fromNapCat(data);
            (this as any).emit('message', unifiedMsg);
        } else if (data.post_type === 'notice') {
            this.handleNotice(data as NoticeEvent);
        } else if (data.post_type === 'request') {
            // 处理请求事件
        }
    }

    private handleNotice(data: any) {
        switch (data.notice_type) {
            case 'group_recall':
            case 'friend_recall':
                (this as any).emit('recall', {
                    messageId: String(data.message_id),
                    chatId: String(data.group_id || data.user_id),
                    operatorId: String(data.operator_id || data.user_id),
                    timestamp: data.time * 1000,
                } as RecallEvent);
                break;

            case 'group_increase':
                (this as any).emit('group.increase', String(data.group_id), {
                    id: String(data.user_id),
                    name: '',
                });
                break;

            case 'group_decrease':
                (this as any).emit('group.decrease', String(data.group_id), String(data.user_id));
                break;

            case 'friend_add':
                (this as any).emit('friend.increase', {
                    id: String(data.user_id),
                    name: '',
                });
                break;

            case 'notify':
                if (data.sub_type === 'poke') {
                    (this as any).emit('poke', String(data.group_id || data.user_id), String(data.user_id), String(data.target_id));
                }
                break;
        }
    }

    private async refreshSelfInfo() {
        try {
            const info = await this.client.getLoginInfo();
            this._uin = info.user_id;
            this._nickname = info.nickname;
            logger.info(`Logged in as ${this._nickname} (${this._uin})`);
        } catch (error) {
            logger.error('Failed to get login info:', error);
        }
    }

    async isOnline(): Promise<boolean> {
        try {
            const status = await this.client.getStatus();
            return status.online === true;
        } catch {
            return false;
        }
    }

    async sendMessage(chatId: string, message: UnifiedMessage): Promise<MessageReceipt> {
        // Check if segments are already in NapCat format (bypass conversion)
        const segments = (message as any).__napCatSegments
            ? message.content
            : await messageConverter.toNapCat(message);

        try {
            // SDK method: send_msg
            const result = await this.client.sendMessage({
                [message.chat.type === 'group' ? 'group_id' : 'user_id']: Number(chatId),
                message: segments,
            } as any);

            return {
                messageId: String(result.message_id),
                timestamp: Date.now(),
                success: true,
            };
        } catch (error: any) {
            return {
                messageId: '',
                timestamp: Date.now(),
                success: false,
                error: error.message,
            };
        }
    }

    async sendGroupForwardMsg(groupId: string, messages: any[]): Promise<MessageReceipt> {
        try {
            const result = await this.client.sendGroupForwardMessage(
                groupId,
                messages
            );

            return {
                messageId: String(result.message_id),
                timestamp: Date.now(),
                success: true,
            };
        } catch (error: any) {
            return {
                messageId: '',
                timestamp: Date.now(),
                success: false,
                error: error.message,
            };
        }
    }

    async recallMessage(messageId: string): Promise<void> {
        await this.client.deleteMessage(messageId);
    }

    async getMessage(messageId: string): Promise<UnifiedMessage | null> {
        try {
            const msg = await this.client.getMessage(messageId);
            return messageConverter.fromNapCat(msg);
        } catch {
            return null;
        }
    }

    async getForwardMsg(messageId: string, fileName?: string): Promise<ForwardMessage[]> {
        const data = await this.client.getForwardMessage(messageId); // file_name not supported in SDK types yet or not common

        const messages = napCatForwardMultiple((data as any)?.messages || []);

        // 补齐媒体直链，避免 video/file 只有 file_id
        await Promise.all(messages.map(async (msg) => {
            for (const elem of msg.message) {
                if ((elem.type === 'video' || elem.type === 'file' || elem.type === 'image' || elem.type === 'record')
                    && typeof (elem as any).file === 'string'
                    && !(elem as any).file.startsWith('http')) {
                    try {
                        const res = await this.client.getFile((elem as any).file);
                        if (res?.file) {
                            (elem as any).url = res.file;
                            (elem as any).file = res.file;
                        }
                    } catch (e) {
                        logger.warn('get_file failed for forward media', e);
                    }
                }
            }
        }));

        return messages;
    }

    /**
     * 获取 NapCat 文件信息（直链或本地路径）
     */
    async getFile(fileId: string): Promise<any> {
        try {
            const normalizedId = fileId.replace(/^\//, '');
            if (typeof (this.client as any).getFile === 'function') {
                return await (this.client as any).getFile(normalizedId);
            }
            return await this.client.callApi('get_file', { file_id: normalizedId });
        } catch (e) {
            logger.warn(e, 'get_file failed');
            return null;
        }
    }

    async getFriendList(): Promise<Sender[]> {
        const friends = await this.client.getFriendList();
        return friends.map((f: any) => ({
            id: String(f.user_id),
            name: f.nickname || f.remark,
        }));
    }

    async getGroupList(): Promise<Chat[]> {
        const groups = await this.client.getGroupList();
        return groups.map((g: any) => ({
            id: String(g.group_id),
            type: 'group' as const,
            name: g.group_name,
        }));
    }

    async getGroupMemberList(groupId: string): Promise<Sender[]> {
        const members = await this.client.getGroupMemberList(groupId);
        return members.map((m: any) => ({
            id: String(m.user_id),
            name: m.card || m.nickname,
        }));
    }

    async getFriendInfo(uin: string): Promise<Sender | null> {
        try {
            const info = await this.client.callApi<any>('get_stranger_info', {
                user_id: Number(uin),
            });
            return {
                id: String(info.user_id),
                name: info.nickname,
            };
        } catch {
            return null;
        }
    }

    async getGroupInfo(groupId: string): Promise<Chat | null> {
        try {
            const info = await this.client.getGroupInfo(groupId);
            return {
                id: String(info.group_id),
                type: 'group',
                name: info.group_name,
            };
        } catch {
            return null;
        }
    }

    async getGroupMemberInfo(groupId: string, userId: string): Promise<any> {
        try {
            return await this.client.getGroupMemberInfo(groupId, userId);
        } catch {
            return null;
        }
    }

    async getUserInfo(userId: string): Promise<any> {
        try {
            return await this.client.callApi('get_stranger_info', {
                user_id: Number(userId),
            });
        } catch {
            return null;
        }
    }

    async login(): Promise<void> {
        // NapCat 通过 WebSocket 连接自动登录
        // SDK handles reconnection logic, but we can wait for initial connection if needed
        return this.client.connect(); // NCWebsocket has connect()
    }

    async logout(): Promise<void> {
        this.client.disconnect();
    }

    async destroy(): Promise<void> {
        // NCWebsocket handles its own listener cleanup
        this.client.disconnect();
    }

    async callApi(method: string, params?: any): Promise<any> {
        return this.client.callApi(method, params);
    }
}
