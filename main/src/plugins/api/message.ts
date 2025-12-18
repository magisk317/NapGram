/**
 * NapGram 消息 API 实现
 * 
 * 提供插件发送、撤回和获取消息的能力
 */

import type {
    MessageAPI,
    SendMessageParams,
    SendMessageResult,
    RecallMessageParams,
    GetMessageParams,
    MessageInfo,
    MessageSegment,
} from '../core/interfaces';
import { getLogger } from '../../shared/logger';
import type { UnifiedMessage, MessageContent } from '../../domain/message/types';

const logger = getLogger('MessageAPI');

type TargetPlatform = 'qq' | 'tg';
type QqChannelType = 'group' | 'private';

function parseChannelId(raw: string): { platform: TargetPlatform; channelId: string; qqType?: QqChannelType } {
    const input = String(raw || '').trim();
    if (!input) throw new Error('channelId is required');

    const parts = input.split(':').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'qq' || parts[0] === 'tg' || parts[0] === 'telegram')) {
        const platform: TargetPlatform = parts[0] === 'qq' ? 'qq' : 'tg';
        if (platform === 'qq') {
            const maybeType = parts[1];
            if (maybeType === 'group' || maybeType === 'private') {
                const id = parts.slice(2).join(':');
                if (!id) throw new Error(`Invalid channelId: ${input}`);
                return { platform, channelId: id, qqType: maybeType };
            }
            const id = parts.slice(1).join(':');
            return { platform, channelId: id, qqType: 'group' };
        }

        const id = parts.slice(1).join(':');
        return { platform, channelId: id };
    }

    // Fallback: require explicit prefix (避免平台误判)
    throw new Error('channelId must be prefixed with "qq:" or "tg:" (e.g. "qq:group:123" / "tg:-100123")');
}

function parseMessageId(raw: string): { platform: TargetPlatform; chatId?: string; messageId: string } {
    const input = String(raw || '').trim();
    if (!input) throw new Error('messageId is required');

    const parts = input.split(':').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'qq' || parts[0] === 'tg' || parts[0] === 'telegram')) {
        const platform: TargetPlatform = parts[0] === 'qq' ? 'qq' : 'tg';
        if (platform === 'qq') {
            return { platform, messageId: parts.slice(1).join(':') };
        }
        if (parts.length < 3) throw new Error('Telegram messageId must be "tg:<chatId>:<messageId>"');
        return { platform, chatId: parts[1], messageId: parts.slice(2).join(':') };
    }

    // Assume QQ message id if not prefixed (legacy)
    return { platform: 'qq', messageId: input };
}

function parseReplyToForPlatform(replyToRaw: string, platform: TargetPlatform): { chatId?: string; messageId: string } {
    const replyTo = String(replyToRaw || '').trim();
    if (!replyTo) return { messageId: '' };

    if (/^\d+$/.test(replyTo)) {
        return { messageId: replyTo };
    }

    const parsed = parseMessageId(replyTo);
    if (parsed.platform !== platform) {
        throw new Error(`replyTo platform mismatch: expected ${platform}, got ${parsed.platform}`);
    }
    return { chatId: parsed.chatId, messageId: parsed.messageId };
}

function segmentsToText(segments: MessageSegment[]): string {
    return (segments || [])
        .map(seg => {
            if (!seg) return '';
            if (seg.type === 'text') return String(seg.data?.text ?? '');
            if (seg.type === 'at') return seg.data?.userName ? `@${seg.data.userName}` : '@';
            return '';
        })
        .filter(Boolean)
        .join('');
}

function contentToSegments(content: string | MessageSegment[]): MessageSegment[] {
    if (typeof content === 'string') return [{ type: 'text', data: { text: content } }];
    return content;
}

function pluginSegmentsToUnifiedContents(segments: MessageSegment[]): MessageContent[] {
    const out: MessageContent[] = [];
    for (const seg of segments || []) {
        if (!seg) continue;
        switch (seg.type) {
            case 'text':
                out.push({ type: 'text', data: { text: String(seg.data?.text ?? '') } });
                break;
            case 'at':
                out.push({ type: 'at', data: { userId: String(seg.data?.userId ?? ''), userName: seg.data?.userName } });
                break;
            case 'reply':
                out.push({ type: 'reply', data: { messageId: String(seg.data?.messageId ?? ''), senderId: '', senderName: '' } });
                break;
            case 'image':
                out.push({ type: 'image', data: { url: seg.data?.url, file: seg.data?.file } });
                break;
            case 'video':
                out.push({ type: 'video', data: { url: seg.data?.url, file: seg.data?.file } });
                break;
            case 'audio':
                out.push({ type: 'audio', data: { url: seg.data?.url, file: seg.data?.file } });
                break;
            case 'file':
                out.push({ type: 'file', data: { url: seg.data?.url, file: seg.data?.file, filename: seg.data?.name || 'file' } });
                break;
            default:
                out.push({ type: 'text', data: { text: '' } });
                break;
        }
    }
    return out;
}

/**
 * 消息 API 实现
 * 
 * 注意：这是一个适配器实现，实际的消息发送将在 Phase 4 集成到 Instance 时完成
 * 目前提供接口定义和基础实现框架
 */
export class MessageAPIImpl implements MessageAPI {
    /**
     * 实例访问器（Phase 4 注入）
     */
    private instanceResolver?: (instanceId: number) => any;

    constructor(instanceResolver?: (instanceId: number) => any) {
        this.instanceResolver = instanceResolver;
    }

    /**
     * 发送消息
     */
    async send(params: SendMessageParams): Promise<SendMessageResult> {
        logger.debug({ params }, 'Sending message');

        try {
            // 验证参数
            this.validateSendParams(params);

            // 规范化内容
            const segments = this.normalizeContent(params.content);

            // 获取实例（Phase 4 实现）
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }

            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }

            // 调用实例的消息发送方法
            // TODO: Phase 4 - 实际集成
            const result = await this.sendViaInstance(instance, {
                channelId: params.channelId,
                segments,
                threadId: params.threadId,
                replyTo: params.replyTo,
            });

            logger.info({
                instanceId: params.instanceId,
                channelId: params.channelId,
                messageId: result.messageId,
            }, 'Message sent');

            return result;
        } catch (error) {
            logger.error({ error, params }, 'Failed to send message');
            throw error;
        }
    }

    /**
     * 撤回消息
     */
    async recall(params: RecallMessageParams): Promise<void> {
        logger.debug({ params }, 'Recalling message');

        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }

            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }

            // 调用撤回方法
            // TODO: Phase 4 - 实际集成
            await this.recallViaInstance(instance, params.messageId);

            logger.info({
                instanceId: params.instanceId,
                messageId: params.messageId,
            }, 'Message recalled');
        } catch (error) {
            logger.error({ error, params }, 'Failed to recall message');
            throw error;
        }
    }

    /**
     * 获取消息
     */
    async get(params: GetMessageParams): Promise<MessageInfo | null> {
        logger.debug({ params }, 'Getting message');

        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }

            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }

            // 调用获取方法
            // TODO: Phase 4 - 实际集成
            const message = await this.getViaInstance(instance, params.messageId);

            if (message) {
                logger.debug({
                    instanceId: params.instanceId,
                    messageId: params.messageId,
                }, 'Message retrieved');
            }

            return message;
        } catch (error) {
            logger.error({ error, params }, 'Failed to get message');
            throw error;
        }
    }

    // === 私有方法 ===

    /**
     * 验证发送参数
     */
    private validateSendParams(params: SendMessageParams): void {
        if (!params.channelId) {
            throw new Error('channelId is required');
        }

        if (!params.content || (Array.isArray(params.content) && params.content.length === 0)) {
            throw new Error('content is required');
        }

        if (typeof params.instanceId !== 'number') {
            throw new Error('instanceId must be a number');
        }
    }

    /**
     * 规范化消息内容
     */
    private normalizeContent(content: string | MessageSegment[]): MessageSegment[] {
        if (typeof content === 'string') {
            return [{ type: 'text', data: { text: content } }];
        }

        return content;
    }

    /**
     * 通过实例发送消息（Phase 4 实现）
     */
    private async sendViaInstance(
        instance: any,
        params: {
            channelId: string;
            segments: MessageSegment[];
            threadId?: number;
            replyTo?: string;
        }
    ): Promise<SendMessageResult> {
        const target = parseChannelId(params.channelId);
        const timestamp = Date.now();

        if (target.platform === 'tg') {
            if (!instance?.tgBot) throw new Error('Telegram bot not available on instance');
            const chat = await instance.tgBot.getChat(Number(target.channelId));
            const text = segmentsToText(params.segments);
            const sendParams: any = {};
            if (params.replyTo) {
                const { chatId, messageId } = parseReplyToForPlatform(params.replyTo, 'tg');
                if (chatId && chatId !== String(target.channelId)) {
                    logger.warn({ channelId: target.channelId, replyTo: params.replyTo }, 'replyTo chatId mismatch; using messageId only');
                }
                if (messageId && /^\d+$/.test(String(messageId))) {
                    sendParams.replyTo = Number(messageId);
                }
            }
            if (params.threadId) sendParams.messageThreadId = params.threadId;
            const sent = await chat.sendMessage(text, sendParams);
            const messageId = `tg:${target.channelId}:${String((sent as any)?.id ?? '')}`;
            return { messageId, timestamp };
        }

        if (!instance?.qqClient) throw new Error('QQ client not available on instance');
        const qqClient = instance.qqClient;
        let segments = params.segments;
        if (params.replyTo && !segments.some(s => s?.type === 'reply')) {
            const { messageId } = parseReplyToForPlatform(params.replyTo, 'qq');
            if (messageId) {
                segments = [{ type: 'reply', data: { messageId: String(messageId) } } as any, ...segments];
            }
        }
        const unified: UnifiedMessage = {
            id: `plugin-${timestamp}`,
            platform: 'qq',
            sender: { id: String(qqClient.uin), name: String(qqClient.nickname || 'Bot'), isBot: true },
            chat: { id: String(target.channelId), type: target.qqType || 'group' },
            content: pluginSegmentsToUnifiedContents(segments),
            timestamp,
        };
        const receipt = await qqClient.sendMessage(String(target.channelId), unified as any);
        return { messageId: `qq:${String(receipt.messageId)}`, timestamp };
    }

    /**
     * 通过实例撤回消息（Phase 4 实现）
     */
    private async recallViaInstance(instance: any, messageId: string): Promise<void> {
        const parsed = parseMessageId(messageId);
        if (parsed.platform === 'qq') {
            if (!instance?.qqClient) throw new Error('QQ client not available on instance');
            await instance.qqClient.recallMessage(String(parsed.messageId));
            return;
        }

        if (!parsed.chatId) throw new Error('Telegram messageId must be "tg:<chatId>:<messageId>"');
        if (!instance?.tgBot) throw new Error('Telegram bot not available on instance');
        const chat = await instance.tgBot.getChat(Number(parsed.chatId));
        await chat.deleteMessages([Number(parsed.messageId)]);
    }

    /**
     * 通过实例获取消息（Phase 4 实现）
     */
    private async getViaInstance(instance: any, messageId: string): Promise<MessageInfo | null> {
        const parsed = parseMessageId(messageId);
        if (parsed.platform !== 'qq') {
            // Telegram 获取消息需要更多上下文（chatId + mtproto 权限），暂不实现
            return null;
        }

        if (!instance?.qqClient) throw new Error('QQ client not available on instance');
        const msg = await instance.qqClient.getMessage(String(parsed.messageId));
        if (!msg) return null;

        const segments: MessageSegment[] = (msg.content || []).map((c: any) => {
            if (!c) return { type: 'raw', data: { platform: 'qq', content: c } } as any;
            if (c.type === 'text') return { type: 'text', data: { text: String(c.data?.text ?? '') } };
            if (c.type === 'at') return { type: 'at', data: { userId: String(c.data?.userId ?? ''), userName: c.data?.userName } };
            return { type: 'raw', data: { platform: 'qq', content: c } } as any;
        });

        const text = (msg.content || []).filter((c: any) => c?.type === 'text').map((c: any) => String(c.data?.text ?? '')).join('');

        return {
            id: String(messageId),
            channelId: String(msg.chat?.id ?? ''),
            userId: String(msg.sender?.id ?? ''),
            text,
            segments,
            timestamp: Number(msg.timestamp || Date.now()),
        };
    }
}

/**
 * 创建消息 API 实例
 */
export function createMessageAPI(instanceResolver?: (instanceId: number) => any): MessageAPI {
    return new MessageAPIImpl(instanceResolver);
}
