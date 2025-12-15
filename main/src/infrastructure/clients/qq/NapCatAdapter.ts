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
        // 连接事件
        this.client.on('connect', () => {
            this.emit('online');
            this.refreshSelfInfo();
            this.emit('connection:restored', {
                timestamp: Date.now()
            });
        });

        this.client.on('disconnect', () => {
            this.emit('offline');
            this.emit('connection:lost', {
                timestamp: Date.now(),
                reason: 'WebSocket closed'
            });
        });

        // 消息事件 - 使用SDK的细粒度事件
        this.client.on('message', async (data: MessageEvent) => {
            try {
                await this.client.hydrateMessage(data.message);
                const unifiedMsg = messageConverter.fromNapCat(data);
                (this as any).emit('message', unifiedMsg);
            } catch (err) {
                logger.error('Failed to handle message event:', err);
            }
        });

        // 撤回事件
        this.client.on('notice.group_recall', (data: any) => {
            (this as any).emit('recall', {
                messageId: String(data.message_id),
                chatId: String(data.group_id),
                operatorId: String(data.operator_id),
                timestamp: data.time * 1000,
            } as RecallEvent);
        });

        this.client.on('notice.friend_recall', (data: any) => {
            (this as any).emit('recall', {
                messageId: String(data.message_id),
                chatId: String(data.user_id),
                operatorId: String(data.user_id),
                timestamp: data.time * 1000,
            } as RecallEvent);
        });

        // 群成员变动
        this.client.on('notice.group_increase', (data: any) => {
            (this as any).emit('group.increase', String(data.group_id), {
                id: String(data.user_id),
                name: '',
            });
        });

        this.client.on('notice.group_decrease', (data: any) => {
            (this as any).emit('group.decrease', String(data.group_id), String(data.user_id));
        });

        // 好友添加
        this.client.on('notice.friend_add', (data: any) => {
            (this as any).emit('friend.increase', {
                id: String(data.user_id),
                name: '',
            });
        });

        // 戳一戳 - 使用细粒度事件
        this.client.on('notice.notify.poke', (data: any) => {
            (this as any).emit('poke',
                String(data.group_id || data.user_id),
                String(data.user_id),
                String(data.target_id)
            );
        });

        // Phase 3: 请求事件
        this.client.on('request.friend', (data: any) => {
            (this as any).emit('request.friend', {
                flag: data.flag,
                userId: String(data.user_id),
                comment: data.comment || '',
                timestamp: data.time * 1000,
            });
        });

        this.client.on('request.group', (data: any) => {
            (this as any).emit('request.group', {
                flag: data.flag,
                groupId: String(data.group_id),
                userId: String(data.user_id),
                subType: data.sub_type,
                comment: data.comment || '',
                timestamp: data.time * 1000,
            });
        });
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
            // Skip if msg or msg.message is invalid
            if (!msg || !Array.isArray(msg.message)) return;

            for (const elem of msg.message) {
                // Skip if elem is null/undefined or doesn't have expected structure
                if (!elem || typeof elem !== 'object' || !elem.type) continue;

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
            return await this.client.getFile(normalizedId);
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

    // ============ 群组管理 ============

    /**
     * 禁言群成员
     */
    async banUser(groupId: string, userId: string, duration: number): Promise<void> {
        try {
            await this.client.setGroupBan(groupId, userId, duration);
            logger.info(`Banned user ${userId} in group ${groupId} for ${duration}s`);
        } catch (error) {
            logger.error(`Failed to ban user ${userId} in group ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * 解除群成员禁言
     */
    async unbanUser(groupId: string, userId: string): Promise<void> {
        try {
            await this.client.unsetGroupBan(groupId, userId);
            logger.info(`Unbanned user ${userId} in group ${groupId}`);
        } catch (error) {
            logger.error(`Failed to unban user ${userId} in group ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * 踢出群成员
     */
    async kickUser(groupId: string, userId: string, rejectAddRequest: boolean = false): Promise<void> {
        try {
            await this.client.setGroupKick(groupId, userId, rejectAddRequest);
            logger.info(`Kicked user ${userId} from group ${groupId}`);
        } catch (error) {
            logger.error(`Failed to kick user ${userId} from group ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * 设置群成员名片
     */
    async setGroupCard(groupId: string, userId: string, card: string): Promise<void> {
        try {
            await this.client.setGroupCard(groupId, userId, card);
            logger.info(`Set group card for user ${userId} in group ${groupId} to: ${card}`);
        } catch (error) {
            logger.error(`Failed to set group card for user ${userId} in group ${groupId}:`, error);
            throw error;
        }
    }

    // ============ Phase 2: 高级群组管理 ============

    /**
     * 全员禁言
     */
    async setGroupWholeBan(groupId: string, enable: boolean): Promise<void> {
        try {
            await this.client.setGroupWholeBan(groupId, enable);
            logger.info(`[NapCat] ${enable ? '开启' : '关闭'}全员禁言: ${groupId}`);
        } catch (error: any) {
            logger.error(`[NapCat] 设置全员禁言失败: ${groupId}`, error);
            throw new Error(`设置全员禁言失败: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * 设置管理员
     */
    async setGroupAdmin(groupId: string, userId: string, enable: boolean): Promise<void> {
        try {
            await this.client.setGroupAdmin(groupId, userId, enable);
            logger.info(`[NapCat] ${enable ? '设置' : '取消'}管理员: 群${groupId} 用户${userId}`);
        } catch (error: any) {
            logger.error(`[NapCat] 设置管理员失败: 群${groupId} 用户${userId}`, error);
            throw new Error(`设置管理员失败: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * 修改群名
     */
    async setGroupName(groupId: string, groupName: string): Promise<void> {
        try {
            await this.client.setGroupName(groupId, groupName);
            logger.info(`[NapCat] 修改群名: 群${groupId} -> ${groupName}`);
        } catch (error: any) {
            logger.error(`[NapCat] 修改群名失败: 群${groupId}`, error);
            throw new Error(`修改群名失败: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * 设置专属头衔
     */
    async setGroupSpecialTitle(groupId: string, userId: string, title: string, duration: number = -1): Promise<void> {
        try {
            await this.client.setGroupSpecialTitle(groupId, userId, title, duration);
            logger.info(`[NapCat] 设置专属头衔: 群${groupId} 用户${userId} -> ${title}`);
        } catch (error: any) {
            logger.error(`[NapCat] 设置专属头衔失败: 群${groupId} 用户${userId}`, error);
            throw new Error(`设置专属头衔失败: ${error.message || 'Unknown error'}`);
        }
    }

    // ============ Phase 2: 请求处理 ============

    /**
     * 处理好友申请
     */
    async handleFriendRequest(flag: string, approve: boolean, remark?: string): Promise<void> {
        try {
            await this.client.handleFriendRequest(flag, approve, remark);
            logger.info(`[NapCat] ${approve ? '同意' : '拒绝'}好友申请: ${flag}`);
        } catch (error: any) {
            logger.error(`[NapCat] 处理好友申请失败: ${flag}`, error);
            throw new Error(`处理好友申请失败: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * 处理加群申请
     */
    async handleGroupRequest(flag: string, subType: 'add' | 'invite', approve: boolean, reason?: string): Promise<void> {
        try {
            await this.client.handleGroupRequest(flag, subType, approve, reason);
            logger.info(`[NapCat] ${approve ? '同意' : '拒绝'}加群申请: ${flag} (${subType})`);
        } catch (error: any) {
            logger.error(`[NapCat] 处理加群申请失败: ${flag}`, error);
            throw new Error(`处理加群申请失败: ${error.message || 'Unknown error'}`);
        }
    }

    // ============ Phase 3: QQ交互增强 ============

    /**
     * 点赞
     */
    async sendLike(userId: string, times: number = 1): Promise<void> {
        try {
            if (times < 1 || times > 10) {
                throw new Error('点赞次数必须在1-10之间');
            }
            await this.client.sendLike(userId, times);
            logger.info(`[NapCat] 点赞用户 ${userId} x${times}`);
        } catch (error: any) {
            logger.error(`[NapCat] 点赞失败: ${userId}`, error);
            throw new Error(`点赞失败: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * 获取群荣誉信息
     */
    async getGroupHonorInfo(groupId: string, type: string = 'all'): Promise<any> {
        try {
            const result = await this.client.getGroupHonorInfo(groupId, type as any);
            logger.info(`[NapCat] 获取群荣誉信息: ${groupId} (${type})`);
            return result;
        } catch (error: any) {
            logger.error(`[NapCat] 获取群荣誉信息失败: ${groupId}`, error);
            throw new Error(`获取群荣誉信息失败: ${error.message || 'Unknown error'}`);
        }
    }
}

