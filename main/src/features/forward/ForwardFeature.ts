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
import { MessageUtils } from './utils/MessageUtils';
import { TelegramMessageHandler } from './handlers/TelegramMessageHandler';

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
    private tgMessageHandler: TelegramMessageHandler;

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
        this.tgMessageHandler = new TelegramMessageHandler(
            this.qqClient,
            this.mediaGroupHandler,
            this.replyResolver,
            this.prepareMediaForQQ.bind(this),
            this.renderContent.bind(this),
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
        this.tgBot.addNewMessageEventHandler(async (tgMsg: Message) => {
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

            await this.tgMessageHandler.handleTGMessage(tgMsg, pair);
        });
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
            await MessageUtils.populateAtDisplayNames(msg, this.qqClient);

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



    private handleModeCommand = async (msg: UnifiedMessage, args: string[]) => {
        const chatId = msg.chat.id;
        // Extract threadId from raw message
        const raw = (msg.metadata as any)?.raw;
        const threadId = raw?.replyTo?.replyToTopId
            || raw?.replyTo?.replyToMsgId
            || raw?.replyToMsgId;

        if (!MessageUtils.isAdmin(msg.sender.id, this.instance)) {
            await MessageUtils.replyTG(this.tgBot, chatId, '您没有权限执行此命令', threadId);
            return;
        }

        const type = args[0];
        const value = args[1];

        if (!type || !value || !/^[01]{2}$/.test(value)) {
            await MessageUtils.replyTG(this.tgBot, chatId, '用法：/mode <nickname|forward> <00|01|10|11>\n示例：/mode nickname 10 (QQ->TG显示昵称，TG->QQ不显示)', threadId);
            return;
        }

        if (type === 'nickname') {
            this.nicknameMode = value;
            await MessageUtils.replyTG(this.tgBot, chatId, `昵称显示模式已更新为: ${value}`, threadId);
        } else if (type === 'forward') {
            this.forwardMode = value;
            await MessageUtils.replyTG(this.tgBot, chatId, `转发模式已更新为: ${value}`, threadId);
        } else {
            await MessageUtils.replyTG(this.tgBot, chatId, '未知模式类型，请使用 nickname 或 forward', threadId);
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
        // Note: TG bot event handler cleanup is handled by bot client
        logger.info('ForwardFeature destroyed');
    }





}

export default ForwardFeature;
