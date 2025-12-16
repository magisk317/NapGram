/**
 * Gateway 动作执行器
 * 执行来自 Gateway 客户端的动作请求
 */

import type { IQQClient } from '../../infrastructure/clients/qq';
import type Telegram from '../../infrastructure/clients/telegram/client';
import type { Segment } from '../protocol/events';
import type { MessageSendResult } from '../protocol/actions';
import type { UnifiedMessage, MessageContent } from '../../domain/message';
import { getLogger } from '../../shared/logger';

const logger = getLogger('ActionExecutor');

export class ActionExecutor {
    constructor(
        private readonly qqClient: IQQClient,
        private readonly tgBot: Telegram
    ) { }

    /**
     * 执行动作
     */
    async execute(action: string, params: any): Promise<any> {
        logger.info(`Executing action: ${action}`);

        switch (action) {
            case 'message.send':
                return await this.sendMessage(params);

            // Phase 2: 更多动作
            // case 'channel.list':
            //     return await this.listChannels(params);
            // case 'user.info':
            //     return await this.getUserInfo(params);

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    /**
     * message.send - 发送消息
     */
    private async sendMessage(params: {
        channelId: string;
        segments: Segment[];
        reply?: string;
    }): Promise<MessageSendResult> {
        const parsed = this.parseChannelId(params.channelId);
        if (parsed.platform === 'qq') {
            return await this.sendToQQ(parsed.id, params.segments);
        }
        if (parsed.platform === 'tg') {
            return await this.sendToTG(parsed.id, parsed.threadId, params.segments);
        }
        throw new Error(`Unknown platform: ${parsed.platform}`);
    }

    private parseChannelId(channelId: string): { platform: 'qq' | 'tg'; id: string; threadId?: number } {
        // Supported:
        // - qq:g:<id>, qq:p:<id>, qq:c:<id> (legacy)
        // - tg:c:<chatId>, tg:c:<chatId>:t:<threadId>
        const parts = channelId.split(':');
        const platformRaw = parts[0];
        const platform = platformRaw === 'telegram' ? 'tg' : (platformRaw as any);
        if (platform !== 'qq' && platform !== 'tg') {
            throw new Error(`Invalid channelId platform: ${platformRaw}`);
        }

        if (platform === 'qq') {
            const id = parts[2] ?? parts[1];
            if (!id) throw new Error(`Invalid qq channelId: ${channelId}`);
            return { platform, id };
        }

        // tg
        const chatId = parts[2];
        if (!chatId) throw new Error(`Invalid tg channelId: ${channelId}`);
        let threadId: number | undefined;
        if (parts.length >= 5 && parts[3] === 't') {
            const num = Number(parts[4]);
            if (Number.isFinite(num)) threadId = num;
        }
        return { platform, id: chatId, threadId };
    }

    /**
     * 发送到 QQ
     */
    private async sendToQQ(roomId: string, segments: Segment[]): Promise<MessageSendResult> {
        try {
            // 转换 Segments → MessageContent[]
            const content = this.segmentsToMessageContent(segments);

            // 构建 UnifiedMessage (简化版)
            const msg: Partial<UnifiedMessage> = {
                platform: 'qq',
                chat: { id: roomId, type: 'group', name: '' },
                sender: { id: String(this.qqClient.uin), name: 'Bot' },
                content,
                timestamp: Date.now()
            };

            // 发送消息
            const result = await this.qqClient.sendMessage(roomId, msg as UnifiedMessage);

            logger.info(`Message sent to QQ: ${roomId}`);

            return {
                messageId: `qq:m:${result?.messageId || Date.now()}`,
                platform: 'qq',
                timestamp: Date.now()
            };
        } catch (error: any) {
            logger.error('Failed to send QQ message:', error);
            throw new Error(`Failed to send QQ message: ${error.message}`);
        }
    }

    /**
     * 发送到 Telegram
     */
    private async sendToTG(chatId: string, threadId: number | undefined, segments: Segment[]): Promise<MessageSendResult> {
        try {
            const chatIdNum = Number(chatId);

            // 简单处理：只发送文本
            const textSegments = segments.filter(s => s.type === 'text');
            const text = textSegments.map(s => s.data.text).join(' ');

            if (!text) {
                throw new Error('No text content to send');
            }

            const chat = await this.tgBot.getChat(chatIdNum);
            const result = await chat.sendMessage(text, threadId ? { messageThreadId: threadId } as any : undefined);

            logger.info(`Message sent to TG: ${chatId}`);

            return {
                messageId: `tg:m:${chatId}:${result.id}`,
                platform: 'tg',
                timestamp: Date.now()
            };
        } catch (error: any) {
            logger.error('Failed to send TG message:', error);
            throw new Error(`Failed to send TG message: ${error.message}`);
        }
    }

    /**
     * 转换 Segments → MessageContent[]
     */
    private segmentsToMessageContent(segments: Segment[]): MessageContent[] {
        return segments.map(seg => {
            switch (seg.type) {
                case 'text':
                    return { type: 'text', data: { text: seg.data.text } };

                case 'image':
                    return { type: 'image', data: { url: seg.data.url } };

                case 'video':
                    return { type: 'video', data: { url: seg.data.url } };

                case 'audio':
                    return { type: 'audio', data: { url: seg.data.url } };

                case 'file':
                    return { type: 'file', data: { url: seg.data.url, name: seg.data.name } };

                case 'at':
                    return { type: 'at', data: { qq: seg.data.userId } };

                default:
                    logger.warn(`Unknown segment type: ${seg.type}`);
                    return { type: seg.type as any, data: seg.data };
            }
        });
    }
}
