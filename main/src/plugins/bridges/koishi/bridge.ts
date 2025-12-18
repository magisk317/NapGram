/**
 * Koishi 兼容桥接器
 * 
 * 将 NapGram 事件和 API 转换为 Koishi 格式
 */

import type { MessageEvent as NapGramMessageEvent } from '../../core/interfaces';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('KoishiBridge');

/**
 * Koishi Session 接口（简化版）
 */
export interface KoishiSession {
    type: 'message';
    platform: string;
    selfId: string;
    userId: string;
    channelId: string;
    guildId?: string;
    author: {
        userId: string;
        username: string;
        nickname?: string;
    };
    content: string;
    elements: any[];
    quote?: {
        id: string;
        content: string;
    };
    timestamp: number;

    // Koishi 方法
    send(content: string | any[]): Promise<string[]>;
    sendQueued(content: string | any[]): Promise<string[]>;

    // NapGram 扩展（Koishi 插件可通过此访问原始事件）
    referrer?: {
        napgram: NapGramMessageEvent;
    };
}

/**
 * NapGram 事件 → Koishi Session 转换器
 */
export class KoishiBridge {
    /**
     * 将 NapGram MessageEvent 转换为 Koishi Session
     */
    static toKoishiSession(event: NapGramMessageEvent): KoishiSession {
        // 构建 Koishi Session
        const session: KoishiSession = {
            type: 'message',
            platform: event.platform === 'qq' ? 'onebot' : 'telegram',
            selfId: String(event.instanceId),
            userId: event.sender.userId,
            channelId: event.channelId,
            guildId: event.channelType === 'group' ? event.channelId : undefined,
            author: {
                userId: event.sender.userId,
                username: event.sender.userName,
                nickname: event.sender.userNick,
            },
            content: event.message.text,
            elements: this.convertSegments(event.message.segments),
            quote: event.message.quote ? {
                id: event.message.quote.id,
                content: event.message.quote.text,
            } : undefined,
            timestamp: event.message.timestamp,

            // 实现 Koishi 方法
            send: async (content: string | any[]) => {
                const result = await event.send(content);
                return [result.messageId];
            },

            sendQueued: async (content: string | any[]) => {
                const result = await event.send(content);
                return [result.messageId];
            },

            // NapGram 扩展
            referrer: {
                napgram: event,
            },
        };

        return session;
    }

    /**
     * 转换消息片段为 Koishi elements
     */
    private static convertSegments(segments: any[]): any[] {
        return segments.map(segment => {
            switch (segment.type) {
                case 'text':
                    return { type: 'text', attrs: { content: segment.data.text } };

                case 'at':
                    return { type: 'at', attrs: { id: segment.data.userId, name: segment.data.userName } };

                case 'image':
                    return { type: 'img', attrs: { src: segment.data.url || segment.data.file } };

                case 'video':
                    return { type: 'video', attrs: { src: segment.data.url || segment.data.file } };

                case 'audio':
                    return { type: 'audio', attrs: { src: segment.data.url || segment.data.file } };

                case 'reply':
                    return { type: 'quote', attrs: { id: segment.data.messageId } };

                default:
                    return { type: segment.type, attrs: segment.data };
            }
        });
    }

    /**
     * 转换 Koishi elements 为 NapGram 片段
     */
    static fromKoishiElements(elements: any[]): any[] {
        if (!elements) return [];

        return elements.map(element => {
            const type = element.type;
            const attrs = element.attrs || {};

            switch (type) {
                case 'text':
                    return { type: 'text', data: { text: attrs.content || '' } };

                case 'at':
                    return { type: 'at', data: { userId: attrs.id, userName: attrs.name } };

                case 'img':
                case 'image':
                    return { type: 'image', data: { url: attrs.src } };

                case 'video':
                    return { type: 'video', data: { url: attrs.src } };

                case 'audio':
                    return { type: 'audio', data: { url: attrs.src } };

                case 'quote':
                    return { type: 'reply', data: { messageId: attrs.id } };

                default:
                    return { type, data: attrs };
            }
        });
    }

    /**
     * 解析 Koishi 消息内容
     * 
     * 支持字符串或 element 数组
     */
    static parseKoishiContent(content: string | any[]): any[] {
        if (typeof content === 'string') {
            return [{ type: 'text', data: { text: content } }];
        }

        return this.fromKoishiElements(content);
    }
}
