import type { MessageEvent, MessageSegment, NapGramPlugin, PluginContext } from '@napgram/sdk';
import type { MessageCreatedEvent, MessageSendResult, Segment } from '@napgram/gateway-kit';
import { GatewayServer } from '@napgram/gateway-kit';

type GatewayConfig = {
    enabled?: boolean;
    port?: number;
};

type GatewayTarget = {
    platform: 'qq' | 'tg';
    channelId: string;
    channelRef: string;
    threadId?: number;
};

const actionExecutors = new Map<number, GatewayActionExecutor>();
let gatewayServer: GatewayServer | null = null;
let eventSeq = 0;

class GatewayActionExecutor {
    constructor(
        private readonly ctx: PluginContext,
        private readonly instanceId: number,
    ) { }

    async execute(action: string, params: any) {
        switch (action) {
            case 'message.send':
                return await this.sendMessage(params);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    private async sendMessage(params: {
        channelId: string;
        segments: Segment[];
        reply?: string;
    }): Promise<MessageSendResult> {
        const target = parseGatewayChannelId(params.channelId);
        const replyTo = params.reply ? normalizeGatewayReplyId(params.reply) : undefined;
        const content = toPluginSegments(params.segments || []);

        const result = await this.ctx.message.send({
            instanceId: this.instanceId,
            channelId: target.channelRef,
            threadId: target.threadId,
            replyTo,
            content,
        });

        return {
            messageId: toGatewayMessageId(target.platform, result.messageId, target.channelId),
            platform: target.platform,
            timestamp: result.timestamp,
        };
    }
}

function nextSeq() {
    eventSeq += 1;
    return eventSeq;
}

function getExecutor(ctx: PluginContext, instanceId: number) {
    let executor = actionExecutors.get(instanceId);
    if (!executor) {
        executor = new GatewayActionExecutor(ctx, instanceId);
        actionExecutors.set(instanceId, executor);
    }
    return executor;
}

function parseGatewayChannelId(raw: string): GatewayTarget {
    const input = String(raw || '').trim();
    if (!input) {
        throw new Error('channelId is required');
    }

    const parts = input.split(':').filter(Boolean);
    const platform = parts[0];

    if (platform === 'qq') {
        const typeToken = parts[1];
        const type = typeToken === 'p' || typeToken === 'private' ? 'private' : 'group';
        const id = typeToken === 'p' || typeToken === 'g' || typeToken === 'private' || typeToken === 'group'
            ? parts.slice(2).join(':')
            : parts.slice(1).join(':');
        if (!id) {
            throw new Error(`Invalid qq channelId: ${input}`);
        }
        return {
            platform: 'qq',
            channelId: id,
            channelRef: `qq:${type}:${id}`,
        };
    }

    if (platform === 'tg') {
        let chatId = '';
        let threadId: number | undefined;

        if (parts[1] === 'c') {
            chatId = parts[2] || '';
            if (parts[3] === 't' && parts[4]) {
                const parsed = Number(parts[4]);
                if (Number.isFinite(parsed)) {
                    threadId = parsed;
                }
            }
        }
        else {
            chatId = parts[1] || '';
        }

        if (!chatId) {
            throw new Error(`Invalid tg channelId: ${input}`);
        }

        return {
            platform: 'tg',
            channelId: chatId,
            channelRef: `tg:${chatId}`,
            threadId,
        };
    }

    throw new Error(`Invalid channelId platform: ${input}`);
}

function normalizeGatewayReplyId(raw: string): string | undefined {
    const input = String(raw || '').trim();
    if (!input) {
        return undefined;
    }
    if (input.startsWith('qq:m:')) {
        return `qq:${input.slice('qq:m:'.length)}`;
    }
    if (input.startsWith('tg:m:')) {
        return `tg:${input.slice('tg:m:'.length)}`;
    }
    return input;
}

function toGatewayMessageId(platform: 'qq' | 'tg', raw: string, fallbackChatId: string): string {
    const input = String(raw || '').trim();
    if (!input) {
        return platform === 'tg'
            ? `tg:m:${fallbackChatId}:unknown`
            : 'qq:m:unknown';
    }
    if (platform === 'qq') {
        if (input.startsWith('qq:')) {
            return `qq:m:${input.slice('qq:'.length)}`;
        }
        return `qq:m:${input}`;
    }
    if (input.startsWith('tg:')) {
        return `tg:m:${input.slice('tg:'.length)}`;
    }
    return `tg:m:${fallbackChatId}:${input}`;
}

function toPluginSegments(segments: Segment[]): MessageSegment[] {
    return segments.map((seg) => ({
        type: seg.type as MessageSegment['type'],
        data: seg.data,
    }));
}

function toGatewaySegments(segments: MessageSegment[]): Segment[] {
    return segments.map(seg => ({
        type: seg.type as Segment['type'],
        data: seg.data,
    }));
}

function normalizeUserId(platform: 'qq' | 'tg', raw: string) {
    const value = String(raw || '').trim();
    if (!value) {
        return `${platform}:u:unknown`;
    }
    if (value.startsWith(`${platform}:`)) {
        return value;
    }
    return `${platform}:u:${value}`;
}

function buildGatewayEvent(event: MessageEvent): MessageCreatedEvent {
    const platform = event.platform;
    const channelId = platform === 'qq'
        ? `qq:${event.channelType === 'private' ? 'p' : 'g'}:${event.channelId}`
        : (event.threadId
            ? `tg:c:${event.channelId}:t:${event.threadId}`
            : `tg:c:${event.channelId}`);
    const messageId = toGatewayMessageId(platform, event.message.ref || event.message.id, event.channelId);
    const actorName = event.sender.userNick || event.sender.userName || 'Unknown';

    return {
        seq: nextSeq(),
        type: 'message.created',
        instanceId: event.instanceId,
        channelId,
        threadId: event.threadId ?? null,
        actor: {
            userId: normalizeUserId(platform, event.sender.userId),
            name: actorName,
        },
        message: {
            messageId,
            platform,
            threadId: event.threadId ?? null,
            native: (event as any).raw,
            segments: toGatewaySegments(event.message.segments || []),
            timestamp: event.message.timestamp,
        },
    };
}

const plugin: NapGramPlugin = {
    id: 'gateway',
    name: 'Gateway',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose NapGram gateway server with plugin events',

    install: async (ctx: PluginContext, config?: GatewayConfig) => {
        const enabled = config?.enabled !== false;
        if (!enabled) {
            ctx.logger.info('Gateway plugin disabled');
            return;
        }

        const port = typeof config?.port === 'number' ? config.port : 8765;
        if (!gatewayServer) {
            gatewayServer = new GatewayServer(port, {
                resolveExecutor: instanceId => getExecutor(ctx, instanceId),
                resolvePairs: () => [],
            });
        }

        ctx.on('message', async (event: MessageEvent) => {
            if (!gatewayServer) {
                return;
            }
            try {
                const gatewayEvent = buildGatewayEvent(event);
                await gatewayServer.publishEvent(event.instanceId, gatewayEvent);
            }
            catch (error) {
                ctx.logger.warn('Failed to publish gateway event', error);
            }
        });

        ctx.onUnload(async () => {
            actionExecutors.clear();
            if (gatewayServer) {
                await gatewayServer.stop();
                gatewayServer = null;
            }
        });

        ctx.logger.info(`Gateway plugin started on port ${port}`);
    },
};

export default plugin;
