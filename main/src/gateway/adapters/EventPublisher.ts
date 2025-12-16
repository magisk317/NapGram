/**
 * Gateway 事件发布器
 * 将 NapGram 的 UnifiedMessage 转换为 Gateway 事件并发布
 */

import type { UnifiedMessage } from '../../domain/message';
import type { GatewayServer } from '../server/GatewayServer';
import type { MessageCreatedEvent, Segment } from '../protocol/events';
import type { ForwardPairRecord } from '../../domain/models/ForwardMap';
import { getLogger } from '../../shared/logger';
import { ThreadIdExtractor } from '../../features/commands/services/ThreadIdExtractor';

const logger = getLogger('EventPublisher');

export class EventPublisher {
    private eventSeq = 0;

    constructor(private gateway: GatewayServer) { }

    /**
     * 发布 message.created 事件
     */
    async publishMessageCreated(
        instanceId: number,
        msg: UnifiedMessage,
        pair: ForwardPairRecord
    ): Promise<void> {
        try {
            const platform = this.normalizePlatform(msg.platform);
            const threadId = platform === 'tg' ? new ThreadIdExtractor().extractFromRaw(msg.metadata?.raw || msg) : undefined;
            const channelId = this.buildChannelId(platform, msg.chat.type, msg.chat.id, threadId);
            const userId = this.buildUserId(platform, msg.sender.id);
            const messageId = this.buildMessageId(platform, msg.chat.id, msg.id);

            const event: MessageCreatedEvent = {
                seq: this.nextSeq(),
                type: 'message.created',
                instanceId,
                channelId,
                actor: {
                    userId,
                    name: msg.sender.name || 'Unknown'
                },
                message: {
                    messageId,
                    platform,
                    native: this.extractNative(msg),
                    segments: this.convertToSegments(msg.content),
                    timestamp: msg.timestamp
                }
            };

            await this.gateway.publishEvent(instanceId, event);

            logger.info(`Published message.created: ${messageId} in ${channelId}`);
        } catch (error: any) {
            logger.error('Failed to publish message.created:', error);
        }
    }

    /**
     * 构建 Channel ID
     * 格式:
     * - QQ: "qq:g:<group_id>" | "qq:p:<uin>"
     * - TG: "tg:c:<chat_id>" | "tg:c:<chat_id>:t:<thread_id>"
     */
    private buildChannelId(platform: 'qq' | 'tg', chatType: string, chatId: string, threadId?: number): string {
        if (platform === 'qq') {
            const prefix = chatType === 'private' ? 'p' : 'g';
            return `qq:${prefix}:${chatId}`;
        }
        if (threadId) return `tg:c:${chatId}:t:${threadId}`;
        return `tg:c:${chatId}`;
    }

    /**
     * 构建 User ID
     * 格式: "qq:u:123456" 或 "tg:u:123456"
     */
    private buildUserId(platform: 'qq' | 'tg', userId: string): string {
        return `${platform}:u:${userId}`;
    }

    /**
     * 构建 Message ID
     * 格式:
     * - QQ: "qq:m:<message_id>"
     * - TG: "tg:m:<chat_id>:<msg_id>"
     */
    private buildMessageId(platform: 'qq' | 'tg', chatId: string, msgId: string): string {
        if (platform === 'tg') return `tg:m:${chatId}:${msgId}`;
        return `qq:m:${msgId}`;
    }

    private normalizePlatform(platform: UnifiedMessage['platform']): 'qq' | 'tg' {
        return platform === 'telegram' ? 'tg' : 'qq';
    }

    /**
     * 提取原始消息对象（简化版）
     */
    private extractNative(msg: UnifiedMessage): any {
        return {
            id: msg.id,
            chatId: msg.chat.id,
            senderId: msg.sender.id,
            timestamp: msg.timestamp
        };
    }

    /**
     * 转换 UnifiedMessage.content 到 Gateway Segments
     */
    private convertToSegments(content: any[]): Segment[] {
        return content.map(item => {
            // 简化版转换，保留核心类型
            switch (item.type) {
                case 'text':
                    return { type: 'text', data: { text: item.data.text } };

                case 'image':
                    return { type: 'image', data: { url: item.data.url || item.data.file } };

                case 'video':
                    return { type: 'video', data: { url: item.data.url || item.data.file } };

                case 'audio':
                    return { type: 'audio', data: { url: item.data.url || item.data.file } };

                case 'file':
                    return { type: 'file', data: { url: item.data.url, name: item.data.name } };

                case 'at':
                    return { type: 'at', data: { userId: item.data.qq || item.data.user } };

                case 'reply':
                    return { type: 'reply', data: { messageId: item.data.id } };

                default:
                    logger.warn(`Unknown content type: ${item.type}`);
                    return { type: item.type as any, data: item.data };
            }
        });
    }

    /**
     * 获取下一个事件序列号
     */
    private nextSeq(): number {
        return ++this.eventSeq;
    }
}
