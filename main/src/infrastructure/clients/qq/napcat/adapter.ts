import { EventEmitter } from 'events';
import { getLogger } from '../../../../shared/logger';
import type { IQQClient, NapCatCreateParams } from '../interface';
import type { UnifiedMessage, MessageReceipt, RecallEvent, Chat, Sender } from '../../../../domain/message/types';
import { messageConverter } from '../../../../domain/message/converter';
import { napCatForwardMultiple } from './convert';
import type { ForwardMessage } from '../types';
import { ReconnectingWebSocket } from '../../../../shared/network/ReconnectingWebSocket';

const logger = getLogger('NapCatAdapter');

/**
 * NapCat 客户端适配器
 * Phase 1: 将 NapCat 适配到统一的 IQQClient 接口
 */
export class NapCatAdapter extends EventEmitter implements IQQClient {
    readonly clientType = 'napcat' as const;
    private ws: ReconnectingWebSocket;
    private _uin: number = 0;
    private _nickname: string = '';
    private apiCallbacks = new Map<string, { resolve: Function; reject: Function }>();
    private echoCounter = 0;

    constructor(private readonly params: NapCatCreateParams) {
        super();
        this.ws = new ReconnectingWebSocket(params.wsUrl, {
            maxRetries: params.reconnect ? Infinity : 0,
            factor: 1.3,
        });

        this.setupWebSocket();
    }

    get uin(): number {
        return this._uin;
    }

    get nickname(): string {
        return this._nickname;
    }

    private setupWebSocket() {
        this.ws.on('open', () => {
            // logger.info('NapCat WebSocket connected'); // ReconnectingWebSocket already logs this
            this.emit('online');
            this.refreshSelfInfo();
        });

        this.ws.on('message', (event: any) => {
            try {
                const data = JSON.parse(event.data.toString());
                this.handleWebSocketMessage(data).catch(err => logger.error('Failed to handle WebSocket message:', err));
            } catch (error) {
                logger.error('Failed to parse WebSocket message:', error);
            }
        });

        this.ws.on('close', () => {
            // logger.warn('NapCat WebSocket disconnected'); // ReconnectingWebSocket already logs this
            this.emit('offline');
        });

        this.ws.on('error', (error) => {
            logger.error('NapCat WebSocket error:', error);
            // avoid throwing unhandled error; reconnecting websocket will retry
        });
    }

    private async handleWebSocketMessage(data: any) {
        // 处理 API 响应
        if (data.echo) {
            const callback = this.apiCallbacks.get(data.echo);
            if (callback) {
                if (data.status === 'ok') {
                    callback.resolve(data.data);
                } else {
                    callback.reject(new Error(data.message || 'API call failed'));
                }
                this.apiCallbacks.delete(data.echo);
            }
            return;
        }

        // 处理事件
        if (data.post_type === 'message') {
            await this.hydrateMediaUrls(data.message);
            const unifiedMsg = messageConverter.fromNapCat(data);
            this.emit('message', unifiedMsg);
        } else if (data.post_type === 'notice') {
            this.handleNotice(data);
        } else if (data.post_type === 'request') {
            // 处理请求事件
        }
    }

    /**
     * 补充媒体直链，确保图片/语音/视频可直接下载
     */
    private async hydrateMediaUrls(message?: any[]) {
        if (!Array.isArray(message)) return;
        await Promise.all(message.map(async (segment) => {
            const type = segment?.type;
            const data = segment?.data;
            if (!type || !data) return;

            if (type === 'image' || type === 'video' || type === 'record' || type === 'audio' || type === 'file') {
                const fileId = data.file;
                if (typeof fileId === 'string' && !/^https?:\/\//.test(fileId) && !fileId.startsWith('file://')) {
                    try {
                        const res = await this.callApi<any>('get_file', { file_id: fileId });
                        if (res?.file) {
                            data.url = res.file;
                            data.file = res.file;
                        } else if (type === 'record' || type === 'audio') {
                            // 部分版本 get_file 不支持语音，用 get_record
                            const rec = await this.callApi<any>('get_record', { file: fileId, out_format: 'mp3' });
                            if (rec?.file) {
                                data.url = rec.file;
                                data.file = rec.file;
                            }
                        } else if (type === 'image') {
                            // 尝试 get_image 兜底
                            const img = await this.callApi<any>('get_image', { file: fileId });
                            if (img?.file) {
                                data.url = img.file;
                                data.file = img.file;
                            }
                        }
                    } catch (e) {
                        logger.warn('get_file/get_record/get_image failed for incoming media', e);
                    }
                }
            }
        }));
    }

    private handleNotice(data: any) {
        switch (data.notice_type) {
            case 'group_recall':
            case 'friend_recall':
                this.emit('recall', {
                    messageId: String(data.message_id),
                    chatId: String(data.group_id || data.user_id),
                    operatorId: String(data.operator_id || data.user_id),
                    timestamp: data.time * 1000,
                } as RecallEvent);
                break;

            case 'group_increase':
                this.emit('group.increase', String(data.group_id), {
                    id: String(data.user_id),
                    name: '',
                });
                break;

            case 'group_decrease':
                this.emit('group.decrease', String(data.group_id), String(data.user_id));
                break;

            case 'friend_add':
                this.emit('friend.increase', {
                    id: String(data.user_id),
                    name: '',
                });
                break;

            case 'notify':
                if (data.sub_type === 'poke') {
                    this.emit('poke', String(data.group_id || data.user_id), String(data.user_id), String(data.target_id));
                }
                break;
        }
    }

    private async callApi<T = any>(action: string, params?: any): Promise<T> {
        const echo = `${Date.now()}_${this.echoCounter++}`;

        return new Promise((resolve, reject) => {
            this.apiCallbacks.set(echo, { resolve, reject });

            this.ws.send(JSON.stringify({
                action,
                params,
                echo,
            }));

            // 30 秒超时
            setTimeout(() => {
                if (this.apiCallbacks.has(echo)) {
                    this.apiCallbacks.delete(echo);
                    reject(new Error('API call timeout'));
                }
            }, 30000);
        });
    }

    private async refreshSelfInfo() {
        try {
            const info = await this.callApi('get_login_info');
            this._uin = info.user_id;
            this._nickname = info.nickname;
            logger.info(`Logged in as ${this._nickname} (${this._uin})`);
        } catch (error) {
            logger.error('Failed to get login info:', error);
        }
    }

    async isOnline(): Promise<boolean> {
        try {
            const status = await this.callApi('get_status');
            return status.online === true;
        } catch {
            return false;
        }
    }

    async sendMessage(chatId: string, message: UnifiedMessage): Promise<MessageReceipt> {
        const segments = await messageConverter.toNapCat(message);

        try {
            const result = await this.callApi('send_msg', {
                [message.chat.type === 'group' ? 'group_id' : 'user_id']: Number(chatId),
                message: segments,
            });

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
            const result = await this.callApi('send_group_forward_msg', {
                group_id: Number(groupId),
                messages: messages,
            });

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
        await this.callApi('delete_msg', {
            message_id: Number(messageId),
        });
    }

    async getMessage(messageId: string): Promise<UnifiedMessage | null> {
        try {
            const msg = await this.callApi('get_msg', {
                message_id: Number(messageId),
            });
            return messageConverter.fromNapCat(msg);
        } catch {
            return null;
        }
    }

    async getForwardMsg(messageId: string, fileName?: string): Promise<ForwardMessage[]> {
        const data = await this.callApi<any>('get_forward_msg', {
            message_id: messageId as any,
            file_name: fileName,
        });
        const messages = napCatForwardMultiple((data as any)?.messages || []);

        // 补齐媒体直链，避免 video/file 只有 file_id
        await Promise.all(messages.map(async (msg) => {
            for (const elem of msg.message) {
                if ((elem.type === 'video' || elem.type === 'file' || elem.type === 'image' || elem.type === 'record')
                    && typeof (elem as any).file === 'string'
                    && !(elem as any).file.startsWith('http')) {
                    try {
                        const res = await this.callApi<any>('get_file', { file_id: (elem as any).file });
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

    async getFriendList(): Promise<Sender[]> {
        const friends = await this.callApi<any[]>('get_friend_list');
        return friends.map(f => ({
            id: String(f.user_id),
            name: f.nickname || f.remark,
        }));
    }

    async getGroupList(): Promise<Chat[]> {
        const groups = await this.callApi<any[]>('get_group_list');
        return groups.map(g => ({
            id: String(g.group_id),
            type: 'group' as const,
            name: g.group_name,
        }));
    }

    async getGroupMemberList(groupId: string): Promise<Sender[]> {
        const members = await this.callApi<any[]>('get_group_member_list', {
            group_id: Number(groupId),
        });
        return members.map(m => ({
            id: String(m.user_id),
            name: m.card || m.nickname,
        }));
    }

    async getFriendInfo(uin: string): Promise<Sender | null> {
        try {
            const info = await this.callApi('get_stranger_info', {
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
            const info = await this.callApi('get_group_info', {
                group_id: Number(groupId),
            });
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
            return await this.callApi('get_group_member_info', {
                group_id: Number(groupId),
                user_id: Number(userId),
            });
        } catch {
            return null;
        }
    }

    async getUserInfo(userId: string): Promise<any> {
        try {
            return await this.callApi('get_stranger_info', {
                user_id: Number(userId),
            });
        } catch {
            return null;
        }
    }

    async login(): Promise<void> {
        // NapCat 通过 WebSocket 连接自动登录
        return new Promise((resolve) => {
            const isOpen = this.ws.readyState === WebSocket.OPEN;
            if (isOpen) {
                resolve();
                return;
            }
            this.once('online', resolve);
        });
    }

    async logout(): Promise<void> {
        this.ws.close();
    }

    async destroy(): Promise<void> {
        this.removeAllListeners();
        this.ws.close();
        this.apiCallbacks.clear();
    }
}
