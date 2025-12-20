import type { NapGramPlugin, PluginContext, MessageEvent } from './types/napgram.js';

const DEFAULT_ENDPOINT = 'https://quotly.netorare.codes/generate';
const DEFAULT_TIMEOUT_MS = 15000;

const extractReplyMessage = (raw: any) => {
    return raw?.rawReply || raw?.replyToMessage || null;
};

const resolveSenderName = (msg: any) => {
    const sender = msg?.sender;
    const name =
        sender?.displayName ||
        sender?.firstName ||
        sender?.username ||
        sender?.title ||
        sender?.name ||
        sender?.id;
    return String(name || 'Unknown').trim() || 'Unknown';
};

const resolveMessageText = (msg: any) => {
    const text = String(
        msg?.text ||
        msg?.message ||
        msg?.caption ||
        ''
    ).trim();
    if (text) return text;
    if (msg?.media) return '[非文本消息]';
    return '[空消息]';
};

const buildQuotePayload = (name: string, text: string, options: { format: string; backgroundColor?: string; width?: number; height?: number; scale?: number }) => {
    const payload: any = {
        type: 'quote',
        format: options.format,
        messages: [
            {
                avatar: false,
                from: { id: 1, name },
                text,
            },
        ],
    };
    if (options.backgroundColor) payload.backgroundColor = options.backgroundColor;
    if (options.width) payload.width = options.width;
    if (options.height) payload.height = options.height;
    if (options.scale) payload.scale = options.scale;
    return payload;
};

const fetchQuoteImage = async (endpoint: string, payload: any, timeoutMs: number): Promise<Buffer> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Quotly API error: ${res.status} ${res.statusText} ${text}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const json: any = await res.json();
            const base64 =
                json?.result?.image ||
                json?.image ||
                json?.result ||
                json?.data?.image;
            if (typeof base64 === 'string' && base64.trim()) {
                return Buffer.from(base64, 'base64');
            }
            const url = json?.result?.url || json?.url;
            if (typeof url === 'string' && url.trim()) {
                const imgRes = await fetch(url);
                if (!imgRes.ok) throw new Error(`Quotly image fetch failed: ${imgRes.status}`);
                return Buffer.from(await imgRes.arrayBuffer());
            }
            throw new Error('Quotly API response missing image data');
        }
        return Buffer.from(await res.arrayBuffer());
    } finally {
        clearTimeout(timer);
    }
};

const plugin: NapGramPlugin = {
    id: 'quotly',
    name: 'Quotly Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Generates Quotly-style quote images',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Quotly plugin installed');

        ctx.command({
            name: 'q',
            description: '生成 QuotLy 引用图片',
            handler: async (event: MessageEvent, args: string[]) => {
                ctx.logger.info(`Quotly command received from ${event.sender.userName}`);

                // 只在 Telegram 端处理
                if (event.platform !== 'tg') {
                    await event.reply('❌ 此命令目前仅支持 Telegram 端');
                    return;
                }

                const raw = event.raw as any;
                const repliedMsg = extractReplyMessage(raw);
                const replyToId = repliedMsg?.id;

                if (!replyToId) {
                    await event.reply('👉 请回复要生成 QuotLy 图片的消息再使用 /q 命令');
                    return;
                }

                try {
                    await event.reply('🎨 正在生成 QuotLy 图片...');

                    const name = resolveSenderName(repliedMsg);
                    const text = resolveMessageText(repliedMsg);

                    const config = ctx.config || {};
                    const endpoint = String(config.endpoint || DEFAULT_ENDPOINT).trim();
                    const format = String(config.format || 'png').trim();
                    const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);
                    const payload = buildQuotePayload(name, text, {
                        format,
                        backgroundColor: typeof config.backgroundColor === 'string' ? config.backgroundColor : undefined,
                        width: typeof config.width === 'number' ? config.width : undefined,
                        height: typeof config.height === 'number' ? config.height : undefined,
                        scale: typeof config.scale === 'number' ? config.scale : undefined,
                    });

                    const image = await fetchQuoteImage(endpoint, payload, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

                    const tg = event.tg as any;
                    if (!tg?.getChat) {
                        await event.reply('❌ Telegram 客户端不可用，无法发送图片');
                        return;
                    }

                    const chat = await tg.getChat(Number(event.channelId));
                    const params: any = {};
                    if (event.threadId) params.messageThreadId = event.threadId;
                    if (replyToId) params.replyTo = replyToId;

                    await chat.client.sendMedia(chat.id, {
                        type: 'photo',
                        file: image,
                        fileName: `quotly.${format}`,
                    }, params);
                } catch (error) {
                    ctx.logger.error('Failed to handle Quotly command:', error);
                    const name = resolveSenderName(repliedMsg);
                    const text = resolveMessageText(repliedMsg);
                    const fallback = `> ${text.replace(/\n/g, '\n> ')}\n— ${name}`;
                    await event.reply(`❌ 生成 QuotLy 图片失败，已回退为文本引用\n\n${fallback}`);
                }
            },
        });

        ctx.logger.info('Quotly plugin: All commands registered');
    },

    uninstall: async () => {
    },
};

export default plugin;
