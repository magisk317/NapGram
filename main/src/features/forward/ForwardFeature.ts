import { getLogger } from '../../shared/logger';
import type { IQQClient } from '../../infrastructure/clients/qq';
import type { UnifiedMessage, MessageContent, ImageContent, VideoContent, AudioContent, FileContent } from '../../domain/message';
import { messageConverter } from '../../domain/message';
import type Telegram from '../../infrastructure/clients/telegram/client';
import type Instance from '../../domain/models/Instance';
import ForwardMap from '../../domain/models/ForwardMap';
import { MediaFeature } from '../media/MediaFeature';
import { CommandsFeature } from '../commands/CommandsFeature';
import env from '../../domain/models/env';
import sharp from 'sharp';
import db from '../../domain/models/db';
import flags from '../../domain/constants/flags';
import { Message } from '@mtcute/core';
import path from 'path';
import fs from 'fs';
import { md5Hex } from '../../shared/utils/hashing';
import silk from '../../shared/encoding/silk';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { fileTypeFromBuffer } from 'file-type';
import convert from '../../shared/helpers/convert';

import { TelegramSender } from './senders/TelegramSender';
import { ThreadIdExtractor } from '../commands/services/ThreadIdExtractor';
import { ForwardMapper } from './services/MessageMapper';
import { ReplyResolver } from './services/ReplyResolver';
import { MediaGroupHandler } from './handlers/MediaGroupHandler';

const logger = getLogger('ForwardFeature');
const execFileAsync = promisify(execFile);

/**
 * 基于新架构的简化转发实现（NapCat <-> Telegram）。
 */
export class ForwardFeature {
    private forwardMap: ForwardMap;
    private telegramSender: TelegramSender;
    private mapper: ForwardMapper;
    private replyResolver: ReplyResolver;
    private mediaGroupHandler: MediaGroupHandler;

    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
        private readonly media?: MediaFeature,
        private readonly commands?: CommandsFeature,
    ) {
        const pairs = instance.forwardPairs;
        const isForwardMap = pairs && typeof (pairs as any).findByQQ === 'function' && typeof (pairs as any).findByTG === 'function';
        if (!isForwardMap) {
            throw new Error('Forward map is not initialized for NapCat pipeline.');
        }
        this.forwardMap = pairs as ForwardMap;
        this.telegramSender = new TelegramSender(instance, media);
        this.mapper = new ForwardMapper();
        this.replyResolver = new ReplyResolver(this.mapper);
        this.mediaGroupHandler = new MediaGroupHandler(
            this.qqClient,
            this.prepareMediaForQQ.bind(this),
            () => this.nicknameMode,
        );
        this.setupListeners();
        logger.info('ForwardFeature initialized');

        // Register commands
        if (this.commands) {
            this.commands.registerCommand({
                name: 'mode',
                aliases: ['模式'],
                description: '控制昵称显示和转发开关 (QQ->TG/TG->QQ)',
                usage: '/mode <nickname|forward> <00|01|10|11>',
                handler: this.handleModeCommand,
                adminOnly: true,
            });
        }
    }

    private setupListeners() {
        this.qqClient.on('message', this.handleQQMessage);
        this.tgBot.addNewMessageEventHandler(this.handleTGMessage);
        logger.debug('[ForwardFeature] listeners attached');
    }

    public nicknameMode: string = env.SHOW_NICKNAME_MODE;
    public forwardMode: string = env.FORWARD_MODE;

    private handleQQMessage = async (msg: UnifiedMessage) => {
        // Check forward mode (QQ -> TG is index 0)
        if (this.forwardMode[0] === '0') {
            return;
        }

        try {
            const pair = this.forwardMap.findByQQ(msg.chat.id);
            if (!pair) {
                logger.debug(`No TG mapping for QQ chat ${msg.chat.id}`);
                return;
            }
            logger.info('[Forward][QQ->TG] incoming', {
                qqMsgId: msg.id,
                qqRoomId: msg.chat.id,
                tgChatId: pair.tgChatId,
            });

            // Sender Blocklist Filter
            if (pair.ignoreSenders) {
                const senders = pair.ignoreSenders.split(',').map(s => s.trim());
                // Check if current sender is in the blocklist
                // Provide fallback for msg.sender.id (though it should exist)
                const senderId = String(msg.sender?.id || '');
                if (senders.includes(senderId)) {
                    logger.info(`Ignored QQ message ${msg.id} from sender ${senderId} (in blocklist)`);
                    return;
                }
            }

            // Regex Deduplication Filter
            if (pair.ignoreRegex) {
                try {
                    const regex = new RegExp(pair.ignoreRegex);
                    // Extract text content for matching
                    const textContent = msg.content
                        .filter(c => c.type === 'text')
                        .map(c => (c.data as any).text || '')
                        .join('');

                    if (regex.test(textContent)) {
                        logger.info(`Ignored QQ message ${msg.id} matched regex: ${pair.ignoreRegex}`);
                        return;
                    }
                } catch (e) {
                    logger.warn(`Invalid ignoreRegex for pair ${pair.id}: ${pair.ignoreRegex}`, e);
                }
            }

            // 填充 @ 提及的展示名称：优先群名片，其次昵称，最后 QQ 号
            await this.populateAtDisplayNames(msg);

            const tgChatId = Number(pair.tgChatId);
            const chat = await this.instance.tgBot.getChat(tgChatId);

            // 处理回复 - 使用 ReplyResolver
            const replyToMsgId = await this.replyResolver.resolveQQReply(msg, pair.instanceId, pair.qqRoomId);

            const sentMsg = await this.telegramSender.sendToTelegram(chat, msg, pair, replyToMsgId, this.nicknameMode);

            if (sentMsg) {
                await this.mapper.saveMessage(msg, sentMsg, pair.instanceId, pair.qqRoomId, BigInt(tgChatId));
                logger.info(`[Forward][QQ->TG] message ${msg.id} -> TG ${tgChatId} (id: ${sentMsg.id})`);
            }
        } catch (error) {
            logger.error('Failed to forward QQ message:', error);
        }
    };

    private async populateAtDisplayNames(msg: UnifiedMessage) {
        if (msg.chat.type !== 'group') {
            return;
        }

        const nameCache = new Map<string, string>();
        for (const content of msg.content) {
            if (content.type !== 'at') {
                continue;
            }

            const userId = String(content.data?.userId ?? '');
            if (!userId || userId === 'all') {
                continue;
            }

            const cached = nameCache.get(userId);
            if (cached) {
                content.data.userName = cached;
                continue;
            }

            const providedName = (content.data?.userName || '').trim();
            if (providedName && providedName !== userId) {
                nameCache.set(userId, providedName);
                content.data.userName = providedName;
                continue;
            }

            try {
                const memberInfo = await this.qqClient.getGroupMemberInfo(msg.chat.id, userId);
                const card = memberInfo?.card?.trim();
                const nickname = memberInfo?.nickname?.trim();
                const resolvedName = card || nickname || userId;

                content.data.userName = resolvedName;
                nameCache.set(userId, resolvedName);
            } catch (error) {
                logger.warn(error, `Failed to resolve @ mention name for ${userId} in group ${msg.chat.id}`);
                content.data.userName = providedName || userId;
                nameCache.set(userId, content.data.userName);
            }
        }
    }

    private handleModeCommand = async (msg: UnifiedMessage, args: string[]) => {
        const chatId = msg.chat.id;
        // Extract threadId from raw message
        const raw = (msg.metadata as any)?.raw;
        const threadId = raw?.replyTo?.replyToTopId
            || raw?.replyTo?.replyToMsgId
            || raw?.replyToMsgId;

        const type = args[0];
        const value = args[1];

        if (!type || !value || !/^[01]{2}$/.test(value)) {
            await this.replyTG(chatId, '用法：/mode <nickname|forward> <00|01|10|11>\n示例：/mode nickname 10 (QQ->TG显示昵称，TG->QQ不显示)', threadId);
            return;
        }

        if (type === 'nickname') {
            this.nicknameMode = value;
            await this.replyTG(chatId, `昵称显示模式已更新为: ${value}`, threadId);
        } else if (type === 'forward') {
            this.forwardMode = value;
            await this.replyTG(chatId, `转发模式已更新为: ${value}`, threadId);
        } else {
            await this.replyTG(chatId, '未知模式类型，请使用 nickname 或 forward', threadId);
        }
    };

    private handleTGMessage = async (tgMsg: Message) => {
        try {
            const rawText = tgMsg.text || '';
            logger.info('[Forward][TG->QQ] incoming', {
                id: tgMsg.id,
                chatId: tgMsg.chat.id,
                text: rawText.slice(0, 100),
            });

            // 跳过命令消息，避免转发到 QQ
            if (rawText.startsWith('/')) {
                logger.debug(`[Forward] Skipping command message: ${rawText.slice(0, 20)}`);
                return;
            }


            // Use ThreadIdExtractor to get threadId from raw message or wrapper
            const threadId = new ThreadIdExtractor().extractFromRaw((tgMsg as any).raw || tgMsg);

            // Check forward mode (TG -> QQ is index 1)
            if (this.forwardMode[1] === '0') {
                return;
            }

            const pair = this.forwardMap.findByTG(
                tgMsg.chat.id,
                threadId,
                !threadId, // 如果有 threadId，禁用 fallback，避免落到 general
            );
            if (!pair) {
                logger.debug(`No QQ mapping for TG chat ${tgMsg.chat.id} thread ${threadId || 'none'}`);
                return;
            }
            logger.info('[Forward][TG->QQ] resolved', {
                tgMsgId: tgMsg.id,
                tgChatId: tgMsg.chat.id,
                threadId,
                qqRoomId: pair.qqRoomId,
            });

            // Check if this is a Media Group message
            const isMediaGroup = await this.mediaGroupHandler.handleMediaGroup(tgMsg, pair);
            if (isMediaGroup) {
                // Message is buffered, skip normal processing
                return;
            }

            const unified = messageConverter.fromTelegram(tgMsg as any);
            await this.prepareMediaForQQ(unified);

            // 如果是回复，尝试找到对应的 QQ 消息 ID，构造 QQ 的 reply 段


            const qqReply = await this.replyResolver.resolveTGReply(
                tgMsg as any,
                pair.instanceId,
                Number(pair.tgChatId)
            );



            const replySegment = qqReply ? [{
                type: 'reply' as const,
                data: {
                    id: String(qqReply.seq),
                    seq: qqReply.seq,
                    time: qqReply.time,
                    senderUin: qqReply.senderUin,
                    peer: {
                        chatType: 2,  // Group chat
                        peerUid: String(qqReply.qqRoomId),
                    }
                }
            }] : [];



            // CRITICAL: Remove TG reply segments (contain TG message IDs like 637)
            // We'll add our own QQ reply segment with QQ message ID instead
            unified.content = unified.content.filter(c => c.type !== 'at' && c.type !== 'reply');

            // Strip explicit @mention from the beginning of the text if present
            const firstTextIndex = unified.content.findIndex(c => c.type === 'text');
            if (firstTextIndex !== -1) {
                const textData = unified.content[firstTextIndex].data as any;
                if (textData.text) {
                    const originalText = textData.text;
                    // Remove @username or @userid at the start, allowing for whitespace
                    textData.text = textData.text.replace(/^\s*@\S+\s*/, '');
                    if (originalText !== textData.text) {
                        logger.debug(`Stripped mention from text: "${originalText}" -> "${textData.text}"`);
                    }
                }
            }

            const hasMedia = unified.content.some(c => ['video', 'file'].includes(c.type));
            const hasSplitMedia = unified.content.some(c => ['audio', 'image'].includes(c.type));
            const showTGToQQNickname = this.nicknameMode[1] === '1';

            let receipt;

            if (hasMedia) {
                // 使用合并转发 (Video, File)
                const segments = await messageConverter.toNapCat(unified);

                // Reply will be added to NapCat segments directly, not to unified.content

                const mediaSegments = [
                    ...replySegment.map(r => ({ type: r.type, data: r.data })),
                    ...(await messageConverter.toNapCat(unified))
                ];

                const node = {
                    type: 'node',
                    data: {
                        name: showTGToQQNickname ? unified.sender.name : 'Anonymous', // 控制节点名称
                        uin: this.qqClient.uin, // 使用 Bot 的 UIN，但显示 TG 用户名
                        content: mediaSegments
                    }
                };

                receipt = await this.qqClient.sendGroupForwardMsg(String(pair.qqRoomId), [node]);

            } else if (hasSplitMedia) {
                // 语音和图片消息特殊处理：分两次调用 API 发送
                const headerText = showTGToQQNickname ? `${unified.sender.name}:\n` : '';
                const textSegments = unified.content.filter(c =>
                    !['audio', 'image'].includes(c.type) &&
                    !(c.type === 'text' && !c.data.text)
                );

                const hasContentToSend = headerText || textSegments.length > 0 || replySegment.length > 0;

                if (hasContentToSend) {
                    // Convert text segments to NapCat format first
                    const textNapCatSegments = await messageConverter.toNapCat({
                        ...unified,
                        content: textSegments
                    });

                    // Build final segments with reply
                    const headerSegments = [
                        ...replySegment.map(r => ({ type: r.type, data: r.data })),
                        { type: 'text', data: { text: headerText } },
                        ...textNapCatSegments
                    ];

                    const headerMsg: UnifiedMessage = {
                        ...unified,
                        content: headerSegments as any
                    };
                    // Mark as pre-converted to skip toNapCat in sendMessage
                    (headerMsg as any).__napCatSegments = true;

                    // 发送 Header
                    await this.qqClient.sendMessage(String(pair.qqRoomId), headerMsg);
                }

                // 2. 发送媒体 (Audio, Image)
                const mediaSegments = unified.content.filter(c => ['audio', 'image'].includes(c.type));
                const mediaMsg: UnifiedMessage = {
                    ...unified,
                    content: mediaSegments
                };

                receipt = await this.qqClient.sendMessage(String(pair.qqRoomId), mediaMsg);

            } else {
                // 普通文本消息，保持原样
                const headerText = showTGToQQNickname ? `${unified.sender.name}:\n` : '';
                // Convert to NapCat segments first, then add reply
                const baseSegments = await messageConverter.toNapCat(unified);

                logger.debug('[Debug] replySegment before map:', JSON.stringify(replySegment, null, 2));

                const segments = [
                    ...replySegment.map(r => ({ type: r.type, data: r.data })),
                    { type: 'text', data: { text: headerText } },
                    ...baseSegments
                ];

                // Create message with NapCat segments 
                unified.content = segments as any;
                // Mark as pre-converted to skip toNapCat conversion in sendMessage
                (unified as any).__napCatSegments = true;

                unified.chat.id = String(pair.qqRoomId);
                unified.chat.type = 'group';

                receipt = await this.qqClient.sendMessage(String(pair.qqRoomId), unified);
            }

            if (receipt.success) {
                const msgId = receipt.messageId || (receipt as any).data?.message_id || (receipt as any).id;
                logger.info(`[Forward] TG message ${tgMsg.id} -> QQ ${pair.qqRoomId} (seq: ${msgId})`);
                if (msgId) {
                    // Save mapping for reply lookup (QQ -> TG reply)
                    try {
                        await db.message.create({
                            data: {
                                qqRoomId: pair.qqRoomId,
                                qqSenderId: BigInt(0), // Self sent
                                time: Math.floor(Date.now() / 1000),
                                seq: Number(msgId), // Store message_id as seq
                                rand: BigInt(0),
                                pktnum: 0,
                                tgChatId: BigInt(pair.tgChatId),
                                tgMsgId: tgMsg.id,
                                tgSenderId: BigInt(tgMsg.sender.id || 0),
                                instanceId: pair.instanceId,
                                brief: unified.content.map(c => this.renderContent(c)).join(' ').slice(0, 50),
                            }
                        });
                        logger.debug(`Saved TG->QQ mapping: seq=${msgId} <-> tgMsgId=${tgMsg.id}`);
                    } catch (e) {
                        logger.warn('Failed to save TG->QQ message mapping:', e);
                    }
                } else {
                    logger.warn('TG->QQ forwarded but no messageId in receipt, cannot save mapping.');
                }
            } else if (receipt.error) {
                logger.warn(`TG message ${tgMsg.id} forwarded to QQ ${pair.qqRoomId} failed: ${receipt.error}`);
            }
        } catch (error) {
            logger.error('Failed to forward TG message:', error);
        }
    };

    /**
     * 为 QQ 侧填充媒体 Buffer/URL，提升兼容性。
     */
    private async prepareMediaForQQ(msg: UnifiedMessage) {
        if (!this.media) return;

        await Promise.all(msg.content.map(async (content) => {
            try {
                if (content.type === 'image') {
                    const img = content as ImageContent;
                    const bufferOrPath = await this.ensureBufferOrPath(img);
                    let targetFile: Buffer | string | undefined = bufferOrPath;
                    let targetExt = '.jpg';

                    if (Buffer.isBuffer(bufferOrPath)) {
                        let detected;
                        try {
                            detected = await fileTypeFromBuffer(bufferOrPath);
                        } catch (e) {
                            logger.debug('fileTypeFromBuffer failed in prepareMediaForQQ', e);
                        }

                        if (img.data.isSticker) {
                            if (img.data.mimeType?.includes('tgsticker') || detected?.ext === 'gz') {
                                logger.debug('Preparing TG animated sticker for QQ (tgs->gif)');
                                try {
                                    const key = `tgsticker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                                    const gifPath = await convert.tgs2gif(key, () => Promise.resolve(bufferOrPath));
                                    const gifBuffer = await fs.promises.readFile(gifPath);
                                    targetFile = gifBuffer;
                                    targetExt = '.gif';
                                    logger.debug('TGS converted to gif for QQ', { gifPath, size: gifBuffer.length });
                                } catch (e) {
                                    logger.warn('TGS convert failed, fallback to text', e);
                                    content.type = 'text';
                                    (content as any).data = { text: '[贴纸]' };
                                    return;
                                }
                            }
                            else {
                                logger.debug('Preparing QQ sticker image', {
                                    mimeType: img.data.mimeType,
                                    detectedExt: detected?.ext,
                                });
                                try {
                                    targetFile = await sharp(bufferOrPath).png().toBuffer();
                                    targetExt = '.png';
                                } catch (e) {
                                    logger.warn('Sticker convert to png failed, fallback raw buffer', e);
                                    targetFile = bufferOrPath;
                                    targetExt = detected?.ext ? `.${detected.ext}` : '.jpg';
                                }
                            }

                        } else {
                            if (img.data.mimeType) {
                                if (img.data.mimeType.includes('webp')) targetExt = '.webp';
                                else if (img.data.mimeType.includes('png')) targetExt = '.png';
                            } else if (detected?.ext) {
                                targetExt = `.${detected.ext}`;
                            }
                        }

                        logger.debug('Saving media for QQ', {
                            isSticker: img.data.isSticker,
                            mimeType: img.data.mimeType,
                            detectedExt: detected?.ext,
                            targetExt,
                        });
                    }

                    content.data.file = await this.ensureFilePath(targetFile, targetExt);
                } else if (content.type === 'video') {
                    // 使用可外网访问的 URL，NapCat 发送视频需要 URL 而非本地路径
                    content.data.file = await this.ensureFilePath(await this.ensureBufferOrPath(content as VideoContent), '.mp4', false);
                } else if (content.type === 'audio') {
                    const oggPath = await this.ensureFilePath(await this.ensureBufferOrPath(content as AudioContent, true), '.ogg', true);
                    if (oggPath) {
                        try {
                            // QQ 语音需要 silk，避免 NapCat 报“语音转换失败”
                            const silkBuffer = await silk.encode(oggPath);
                            logger.debug(`Encoded silk buffer size: ${silkBuffer?.length}`);
                            // 保存 silk 文件并获取 URL (forceLocal=false)，以便 NapCat 可以下载
                            content.data.file = await this.ensureFilePath(silkBuffer, '.silk', false);
                        } catch (err) {
                            // 转码失败则改为普通文件发送，至少保证可收到
                            logger.warn('Audio silk encode failed, fallback to file', err);
                            content.type = 'file';
                            content.data = {
                                file: oggPath,
                                filename: path.basename(oggPath),
                            } as any;
                        }
                    } else {
                        content.data.file = undefined;
                    }
                } else if (content.type === 'file') {
                    const file = content as FileContent;
                    content.data.file = await this.ensureFilePath(await this.ensureBufferOrPath(file), undefined);
                }
            } catch (err) {
                logger.warn('Prepare media for QQ failed, skip media content:', err);
                content.type = 'text';
                (content as any).data = { text: this.renderContent(content) };
            }
        }));
    }

    private async ensureBufferOrPath(content: ImageContent | VideoContent | AudioContent | FileContent, forceDownload?: boolean): Promise<Buffer | string | undefined> {
        if (content.data.file) {
            if (Buffer.isBuffer(content.data.file)) return content.data.file;
            if (typeof content.data.file === 'string') {
                // NapCat 下可能给的是本地绝对路径（record/image 等），如果可访问直接用；否则尝试下载
                if (!forceDownload && !/^https?:\/\//.test(content.data.file)) {
                    try {
                        logger.debug(`Processing media:\n${JSON.stringify(content, null, 2)}`);
                        await fs.promises.access(content.data.file);
                        logger.debug(`Media file exists locally: ${content.data.file}`);
                        return content.data.file;
                    } catch {
                        logger.debug(`Local media file not found or accessible, falling back to download: ${content.data.file}`);
                        // fallback to download below
                    }
                }
                try {
                    return await this.media?.downloadMedia(content.data.file);
                } catch (e) {
                    logger.warn('Failed to download media by url', e);
                }
            }
            // Assume it is a Telegram Media Object
            try {
                const mediaObj = content.data.file as any;
                // logger.debug(`Downloading TG media: type=${mediaObj?.className}, id=${mediaObj?.id}, accessHash=${mediaObj?.accessHash}, dcId=${mediaObj?.dcId}, size=${mediaObj?.size}`);
                const buffer = await this.instance.tgBot.downloadMedia(mediaObj);
                logger.debug(`Downloaded media buffer size: ${buffer?.length}`);

                if (!buffer || buffer.length === 0) {
                    logger.warn('Downloaded buffer is empty, treating as failure');
                    return undefined;
                }
                return buffer as Buffer;
            } catch (e) {
                logger.warn('Failed to download media from TG object:', e);
            }
        }
        if (content.data.url && this.media) {
            return await this.media.downloadMedia(content.data.url);
        }
        return undefined;
    }

    private async ensureFilePath(file: Buffer | string | undefined, ext?: string, forceLocal?: boolean) {
        if (!file) return undefined;
        if (Buffer.isBuffer(file)) {
            const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext || ''}`;
            const tempDir = path.join(env.DATA_DIR, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const tempPath = path.join(tempDir, filename);
            await fs.promises.writeFile(tempPath, file);

            if (!forceLocal) {
                // 1. Try INTERNAL_WEB_ENDPOINT (For Docker Network)
                if (env.INTERNAL_WEB_ENDPOINT) {
                    return `${env.INTERNAL_WEB_ENDPOINT}/temp/${filename}`;
                }
                // 2. Try WEB_ENDPOINT (Public URL)
                if (env.WEB_ENDPOINT) {
                    return `${env.WEB_ENDPOINT}/temp/${filename}`;
                }

                // 2. Fallback to Docker Host IP (Bridge Gateway)
                // If running in Docker, we usually map 8082 -> 8080.
                // NapCat (external container) -> Host (172.17.0.1) -> Port 8082
                // If running locally, you might need to adjust this or set WEB_ENDPOINT.
                return `http://172.17.0.1:8082/temp/${filename}`;
            }
            return tempPath;
        }
        return file;
    }



    private renderContent(content: MessageContent): string {
        switch (content.type) {
            case 'text':
                // NapCat 上报的文本有时会把换行编码为字面 "\n"，这里还原为真实换行
                return (content.data.text || '').replace(/\\n/g, '\n');
            case 'image':
                return '[图片]';
            case 'video':
                return '[视频]';
            case 'audio':
                return '[语音]';
            case 'file':
                return `[文件:${content.data.filename || '文件'}]`;
            case 'at':
                return `@${content.data.userName || content.data.userId}`;
            case 'face':
                return content.data.text || '[表情]';
            case 'reply':
                return `(回复 ${content.data.messageId}${content.data.text ? ':' + content.data.text : ''})`;
            case 'forward':
                return `[转发消息x${content.data.messages?.length ?? 0}]`;
            case 'location':
                return `[位置:${content.data.title ?? ''} ${content.data.latitude},${content.data.longitude}]`;

            default:
                return `[${content.type}]`;
        }
    }


    destroy() {
        this.mediaGroupHandler.destroy();
        this.qqClient.removeListener('message', this.handleQQMessage);
        this.tgBot.removeNewMessageEventHandler(this.handleTGMessage);
        logger.info('ForwardFeature destroyed');
    }

    private isAdmin(userId: string): boolean {
        const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null;
        const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null;
        return userId === String(this.instance.owner)
            || (envAdminQQ && userId === envAdminQQ)
            || (envAdminTG && userId === envAdminTG);
    }

    private async replyTG(chatId: string | number, text: string, replyTo?: any) {
        try {
            const chat = await this.tgBot.getChat(chatId as any);
            const params: any = { linkPreview: { disable: true } };
            if (replyTo) params.replyTo = replyTo;
            await chat.sendMessage(text, params);
        } catch (error) {
            logger.warn('Failed to send TG reply:', error);
        }
    }



}

export default ForwardFeature;
