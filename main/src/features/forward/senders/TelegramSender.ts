import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileTypeFromBuffer } from 'file-type';
import env from '../../../domain/models/env';
import flags from '../../../domain/constants/flags';
import { md5Hex } from '../../../shared/utils/hashing';
import type Instance from '../../../domain/models/Instance';
import type { MessageContent, UnifiedMessage } from '../../../domain/message';
import type { MediaFeature } from '../../media/MediaFeature';
import { getLogger } from '../../../shared/logger';
import { renderContent } from '../utils/render';
import db from '../../../domain/models/db';
import { InputText } from '@mtcute/core';
import { html } from '@mtcute/node';
import silk from '../../../shared/utils/encoding/silk';

type NormalizedFile = {
    fileName: string;
    data: Buffer;
    fileMime?: string;
};

const ALLOWED_TELEGRAM_DICE = new Set(['🎲', '🎯', '🏀', '⚽️', '🎳', '🎰']);

const execFileAsync = promisify(execFile);

export class TelegramSender {
    private readonly logger = getLogger('ForwardFeature');

    constructor(
        private readonly instance: Instance,
        private readonly media?: MediaFeature,
        private readonly contentRenderer: (content: MessageContent) => string = renderContent,
    ) { }

    async sendToTelegram(chat: any, msg: UnifiedMessage, pair: any, replyToMsgId: number | undefined, nicknameMode: string) {
        this.logger.debug(`Forwarding message to TG (sendToTelegram):\n${JSON.stringify(msg, null, 2)}`);
        const showQQToTGNickname = nicknameMode[0] === '1';
        let header = showQQToTGNickname ? `${msg.sender.name}:\n` : '';
        // 保存原始header供媒体消息使用（媒体需要caption，即使启用了富头）
        const originalHeader = header;
        let textParts: string[] = [];

        let richHeaderUsed = false;

        const disableFlag = pair ? ((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) : 0;
        const useRichHeader = pair && env.WEB_ENDPOINT && !disableFlag && showQQToTGNickname;

        let richHeaderUrl: string | undefined = undefined;
        if (useRichHeader) {
            richHeaderUrl = this.generateRichHeaderUrl(pair.apiKey, msg.sender.id, showQQToTGNickname ? (msg.sender.name || '') : ' ');
            richHeaderUsed = true;
            // Rich Header已包含用户信息，文本消息不再重复显示 Header
            // 但保留 originalHeader 给媒体消息使用
            header = '';
        }

        const effectiveReplyTo = replyToMsgId || pair?.tgThreadId;
        const replyTo = this.buildReplyTo(pair, effectiveReplyTo);
        const messageThreadId = pair?.tgThreadId ? Number(pair.tgThreadId) : undefined;
        if (messageThreadId) {
            this.logger.info(`Sending to thread: ${messageThreadId}`);
        } else {
            this.logger.info('Sending to General (no thread ID)');
        }

        let lastSent: any = null;
        // Media batching for Media Group支持
        const mediaBatch: MessageContent[] = [];
        let batchCaption: string[] = [];

        const flushMediaBatch = async () => {
            if (mediaBatch.length > 0) {
                const captionStr = batchCaption.join('');
                lastSent = await this.sendMediaGroup(
                    chat,
                    mediaBatch,
                    captionStr,
                    replyToMsgId,
                    pair,
                    originalHeader,  // Use original header for media
                    richHeaderUsed,
                    richHeaderUrl,
                    msg.id
                ) || lastSent;

                mediaBatch.length = 0;
                batchCaption.length = 0;
                richHeaderUsed = false;  // Consumed by media
                header = '';
            }
        };

        for (const content of msg.content) {
            switch (content.type) {
                case 'reply':
                    if (!replyToMsgId) {
                        textParts.push(this.contentRenderer(content));
                    }
                    break;

                case 'text':
                case 'at':
                case 'face':
                    if (content.type === 'text' && content.data.text) {
                        const text = content.data.text.trim();
                        if (text === '[图片]' || text === '[视频]' || text === '[语音]') {
                            break;
                        }
                    }

                    // If we're collecting media, add text to batch caption
                    if (mediaBatch.length > 0) {
                        batchCaption.push(this.contentRenderer(content));
                    } else {
                        textParts.push(this.contentRenderer(content));
                    }
                    break;

                case 'image':
                case 'video':
                    // Send any pending text first
                    if (textParts.length > 0) {
                        const { text, params } = this.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined);
                        params.replyTo = replyTo;
                        if (messageThreadId) params.messageThreadId = messageThreadId;

                        await chat.sendMessage(text, params);
                        textParts = [];
                        richHeaderUsed = false;
                        header = '';
                    }

                    // Add to media batch
                    mediaBatch.push(content);
                    break;

                case 'audio':
                case 'file':
                    // These can't be in Media Group, flush batch first
                    await flushMediaBatch();

                    if (textParts.length > 0) {
                        const { text, params } = this.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined);
                        params.replyTo = replyTo;
                        if (messageThreadId) params.messageThreadId = messageThreadId;

                        await chat.sendMessage(text, params);
                        textParts = [];
                        richHeaderUsed = false;
                        header = '';
                    }

                    // Rich Header logic for non-groupable media
                    if (richHeaderUsed) {
                        let actionText = '';
                        switch (content.type) {
                            case 'audio': actionText = '发来一条语音'; break;
                            case 'file': actionText = '发来一个文件'; break;
                            default: actionText = '发来一条消息'; break;
                        }
                        const headerText = actionText;

                        const { text, params } = this.applyRichHeader(headerText, richHeaderUrl);
                        params.replyTo = replyTo;
                        if (messageThreadId) params.messageThreadId = messageThreadId;

                        try {
                            await chat.sendMessage(text, params);
                        } catch (e) {
                            this.logger.warn(e, 'Failed to send separate Rich Header message:');
                        }
                        richHeaderUsed = false;
                    }

                    lastSent = await this.sendMediaToTG(chat, header, content, replyToMsgId, pair, richHeaderUsed, richHeaderUrl, msg.id) || lastSent;
                    richHeaderUsed = false;
                    header = '';
                    break;

                case 'forward':
                    await flushMediaBatch();

                    if (textParts.length > 0) {
                        const { text, params } = this.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined);
                        params.replyTo = replyTo;
                        if (messageThreadId) params.messageThreadId = messageThreadId;

                        await chat.sendMessage(text, params);
                        textParts = [];
                        richHeaderUsed = false;
                        header = '';
                    }
                    lastSent = await this.sendForwardToTG(chat, content, pair, replyToMsgId, header, richHeaderUsed) || lastSent;
                    break;

                case 'location':
                    await flushMediaBatch();

                    if (textParts.length > 0) {
                        const { text, params } = this.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined);
                        params.replyTo = replyTo;
                        if (messageThreadId) params.messageThreadId = messageThreadId;

                        await chat.sendMessage(text, params);
                        textParts = [];
                        richHeaderUsed = false;
                        header = '';
                    }

                    lastSent = await this.sendLocationToTG(chat, content, replyTo, messageThreadId, header, richHeaderUsed, richHeaderUrl) || lastSent;
                    richHeaderUsed = false;
                    header = '';
                    break;

                case 'dice':
                    await flushMediaBatch();

                    if (textParts.length > 0) {
                        const { text, params } = this.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined);
                        params.replyTo = replyTo;
                        if (messageThreadId) params.messageThreadId = messageThreadId;

                        await chat.sendMessage(text, params);
                        textParts = [];
                        richHeaderUsed = false;
                        header = '';
                    }

                    lastSent = await this.sendDiceToTG(chat, content, replyTo, messageThreadId, header, richHeaderUsed, richHeaderUrl, pair) || lastSent;
                    richHeaderUsed = false;
                    header = '';
                    break;

                default:
                    textParts.push(this.contentRenderer(content));
                    break;
            }
        }

        // Flush any remaining media batch
        await flushMediaBatch();

        if (textParts.length > 0) {
            const { text, params } = this.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined);
            if (replyTo) params.replyTo = replyTo;
            if (messageThreadId) params.messageThreadId = messageThreadId;

            try {
                lastSent = await chat.sendMessage(text, params);
                return lastSent;
            } catch (e: any) {
                throw e;
            }
        }
        return lastSent;
    }

    private async sendMediaToTG(chat: any, header: string, content: MessageContent, replyToMsgId?: number, pair?: any, richHeaderUsed?: boolean, richHeaderUrl?: string, qqMsgId?: string) {
        let fileSrc: any;

        try {
            fileSrc = await this.resolveMediaInput(content);
        } catch (err) {
            this.logger.warn(err, 'Failed to process media, fallback to placeholder:');
            fileSrc = (content as any).data?.file || (content as any).data?.url;
        }

        if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
            this.logger.debug(`Using local file path for mtcute: ${fileSrc}`);
            const fileName = path.basename(fileSrc);
            (content as any).data.fileName = fileName;
        }


        const commonParams: any = {
            replyTo: this.buildReplyTo(pair, replyToMsgId),
        };
        if (pair?.tgThreadId) {
            commonParams.messageThreadId = Number(pair.tgThreadId);
        }

        // 准备 caption - 将 header（昵称/头像）作为媒体说明
        let captionText: any = undefined;
        let formattingParams: any = {};

        if (header) {
            const { text, params } = this.applyRichHeader(header, richHeaderUsed ? richHeaderUrl : undefined);
            // mtcute InputText check: if string and empty, or TextWithEntities and text empty
            const isEmpty = typeof text === 'string' ? !text.trim() : !text.text.trim();
            if (!isEmpty) {
                captionText = text;
                formattingParams = params;
                this.logger.debug(`Using header as media caption: ${typeof text === 'string' ? text : text.text}`);
            } else {
                this.logger.debug('Header is empty, skipping caption');
            }
        }

        try {
            let mediaInput: any;

            if (content.type === 'image') {
                const fileName = (content as any).data.fileName || (typeof (content as any).data.file === 'string' ? path.basename((content as any).data.file) : 'image.jpg');
                const normalized = await this.normalizeInputFile(fileSrc, fileName || 'image.jpg');
                if (!normalized) throw new Error('Image source not available');
                const asGif = this.isGifMedia(normalized);
                mediaInput = {
                    type: asGif ? 'animation' : 'photo',
                    file: normalized.data,
                    fileName: normalized.fileName,
                };
            } else if (content.type === 'video') {
                const fileName = (content as any).data.fileName || (typeof (content as any).data.file === 'string' ? path.basename((content as any).data.file) : 'video.mp4');
                const normalized = await this.normalizeInputFile(fileSrc, fileName || 'video.mp4');
                if (!normalized) throw new Error('Video source not available');
                mediaInput = {
                    type: 'video',
                    file: normalized.data,
                    fileName: normalized.fileName,
                };
            } else if (content.type === 'audio') {
                const fileName = (content as any).data.fileName
                    || (typeof (content as any).data.file === 'string' ? path.basename((content as any).data.file).replace(/\.amr$/, '.ogg') : 'audio.ogg');
                const normalized = await this.normalizeInputFile(fileSrc, fileName || 'audio.ogg');
                if (!normalized) throw new Error('Audio source not available');
                mediaInput = await this.prepareVoiceMedia(normalized);
            } else if (content.type === 'file') {
                const filename = (content as any).data.filename;
                const normalized = await this.normalizeInputFile(fileSrc, filename || 'file');
                if (!normalized) throw new Error('File source not available');
                mediaInput = {
                    type: 'document',
                    file: normalized.data,
                    fileName: normalized.fileName,
                };
            } else if (content.type === 'location') {
                const loc = (content as any).data;
                const isVenue = Boolean((loc.title && loc.title.trim()) || (loc.address && loc.address.trim()));
                mediaInput = isVenue
                    ? {
                        type: 'venue',
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        title: loc.title || '位置',
                        address: loc.address || '',
                        source: { provider: 'qq', id: '', type: '' },
                    }
                    : {
                        type: 'geo',
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                    };
            } else if (content.type === 'dice') {
                const emoji = (content as any).data.emoji || '🎲';
                const value = (content as any).data.value;
                if (!ALLOWED_TELEGRAM_DICE.has(emoji)) {
                    // 不支持的 emoji，退回文本
                    const { text, params } = this.applyRichHeader(header + `${emoji}${value ? ' ' + value : ''}`, richHeaderUsed ? richHeaderUrl : undefined);
                    params.replyTo = this.buildReplyTo(pair, replyToMsgId);
                    if (pair?.tgThreadId) params.messageThreadId = Number(pair.tgThreadId);
                    try {
                        return await chat.sendMessage(text, params);
                    } catch (e) {
                        this.logger.error(e, 'Failed to send fallback text for dice:');
                        throw e;
                    }
                }
                mediaInput = {
                    type: 'dice',
                    emoji,
                };
            }

            if (mediaInput) {
                const params: any = {
                    ...commonParams,
                    ...formattingParams,
                    caption: captionText  // 使用 caption 传递 header
                };
                if (!params.replyTo) delete params.replyTo;
                if (!params.messageThreadId) delete params.messageThreadId;

                // mtcute handles string (path) and Buffer automatically
                const sentMsg = await chat.client.sendMedia(chat.id, mediaInput, params);
                this.logger.info(`[Forward] QQ message ${qqMsgId || ''} -> TG ${chat.id} (id: ${sentMsg.id})${captionText ? ' with caption' : ''}`);
                return sentMsg;  // Return the sent message
            }
        } catch (e) {
            this.logger.error(e, 'Failed to send media to TG:');
        }
        return null;
    }

    /**
     * Send multiple images/videos as a Telegram Media Group
     * @param chat - Telegram chat object
     * @param mediaItems - Array of image/video MessageContent
     * @param caption - Caption text for the first media
     * @param replyToMsgId - Message ID to reply to
     * @param pair - Pair object
     * @param header - Header text (usually nickname)
     * @param richHeaderUsed - Whether rich header is used
     * @param richHeaderUrl - Rich header URL
     * @param qqMsgId - QQ message ID for logging
     */
    private async sendMediaGroup(
        chat: any,
        mediaItems: MessageContent[],
        caption: string,
        replyToMsgId?: number,
        pair?: any,
        header?: string,
        richHeaderUsed?: boolean,
        richHeaderUrl?: string,
        qqMsgId?: string
    ) {
        if (mediaItems.length === 0) return null;

        // Single media: use existing sendMediaToTG
        if (mediaItems.length === 1) {
            return await this.sendMediaToTG(
                chat, header || '', mediaItems[0],
                replyToMsgId, pair, richHeaderUsed, richHeaderUrl, qqMsgId
            );
        }

        // Multiple media: build Media Group
        this.logger.info(`Sending Media Group with ${mediaItems.length} items`);

        // Send separate Rich Header message before Media Group
        if (richHeaderUsed && richHeaderUrl) {
            const actionText = '发来一组图文消息：';
            const { text, params } = this.applyRichHeader(actionText, richHeaderUrl);
            params.replyTo = this.buildReplyTo(pair, replyToMsgId);
            if (pair?.tgThreadId) {
                params.messageThreadId = Number(pair.tgThreadId);
            }

            try {
                await chat.sendMessage(text, params);
                this.logger.info('[Forward] Sent Rich Header before Media Group');
                richHeaderUsed = false;  // Mark as consumed
            } catch (e) {
                this.logger.warn(e, 'Failed to send Rich Header before Media Group:');
            }
        }

        const mediaInputs: any[] = [];

        for (const media of mediaItems) {
            try {
                const fileSrc = await this.resolveMediaInput(media);
                const fileName = (media as any).data.fileName ||
                    (typeof (media as any).data.file === 'string' ? path.basename((media as any).data.file) :
                        media.type === 'video' ? 'video.mp4' : 'image.jpg');
                const normalized = await this.normalizeInputFile(fileSrc, fileName);

                if (!normalized) {
                    this.logger.warn(`Skipping media in group: normalization failed`);
                    continue;
                }

                const isGif = this.isGifMedia(normalized);
                mediaInputs.push({
                    type: media.type === 'video' ? 'video' : (isGif ? 'animation' : 'photo'),
                    file: normalized.data,
                    fileName: normalized.fileName,
                });
            } catch (err) {
                this.logger.warn(err, `Failed to process media item in group:`);
            }
        }

        if (mediaInputs.length === 0) {
            this.logger.warn('No valid media in group, skipping');
            return null;
        }

        // Combine header + caption for Media Group
        // Do NOT use Rich Header URL (already sent separately)
        let fullCaption = '';
        if (header && !richHeaderUsed) {
            // Only use text header if Rich Header was not sent separately
            fullCaption += header;
        }
        if (caption) {
            fullCaption += caption;
        }

        // Use plain text caption (no Rich Header link preview)
        if (fullCaption && mediaInputs[0]) {
            mediaInputs[0].caption = fullCaption;
            mediaInputs[0].parseMode = 'html';
        }

        // Build send parameters
        const sendParams: any = {
            replyTo: this.buildReplyTo(pair, replyToMsgId),
        };
        if (pair?.tgThreadId) {
            sendParams.messageThreadId = Number(pair.tgThreadId);
        }
        if (!sendParams.replyTo) delete sendParams.replyTo;

        try {
            const sentMessages = await chat.client.sendMediaGroup(chat.id, mediaInputs, sendParams);
            this.logger.info(`[Forward] QQ message ${qqMsgId || ''} -> TG Media Group (${sentMessages.length} items)${fullCaption ? ' with caption' : ''}`);
            return sentMessages[0];  // Return first message for consistency
        } catch (err) {
            this.logger.error(err, 'Failed to send Media Group:');
            return null;
        }
    }

    private async sendLocationToTG(chat: any, content: MessageContent, replyTo?: number, messageThreadId?: number, header?: string, richHeaderUsed?: boolean, richHeaderUrl?: string) {
        const loc = (content as any).data || {};
        if (loc.latitude == null || loc.longitude == null) {
            return null;
        }

        const isVenue = Boolean((loc.title && loc.title.trim()) || (loc.address && loc.address.trim()));
        const mediaInput = isVenue
            ? {
                type: 'venue',
                latitude: loc.latitude,
                longitude: loc.longitude,
                title: loc.title || '位置',
                address: loc.address || '',
                source: { provider: 'qq', id: '', type: '' },
            }
            : {
                type: 'geo',
                latitude: loc.latitude,
                longitude: loc.longitude,
            };

        const captionText = header && header.trim() ? header : undefined;
        const sendParams: any = {
            replyTo,
            caption: captionText,
        };
        if (messageThreadId) sendParams.messageThreadId = messageThreadId;
        if (!sendParams.replyTo) delete sendParams.replyTo;
        if (!captionText) delete sendParams.caption;

        return await chat.client.sendMedia(chat.id, mediaInput, sendParams);
    }

    private async sendDiceToTG(chat: any, content: MessageContent, replyTo?: number, messageThreadId?: number, header?: string, richHeaderUsed?: boolean, richHeaderUrl?: string, pair?: any) {
        const dice = (content as any).data || {};
        const emoji = dice.emoji || '🎲';
        const value = dice.value;

        // Telegram 仅支持固定骰子 emoji，猜拳类（✊✋✌️）走文本兜底
        if (!ALLOWED_TELEGRAM_DICE.has(emoji)) {
            // 以实际观察为准：1=布，2=剪刀，3=石头
            const rpsMap: Record<number, string> = {
                1: '✋ 布',
                2: '✌️ 剪刀',
                3: '✊ 石头',
            };
            const choice = value && rpsMap[value] ? rpsMap[value] : `${emoji}`;
            const text = `发来一个石头剪刀布：${choice}`;
            const { text: msgText, params } = this.applyRichHeader(header ? `${header}${text}` : text, richHeaderUsed ? richHeaderUrl : undefined);
            params.replyTo = replyTo;
            if (messageThreadId) params.messageThreadId = messageThreadId;
            return await chat.sendMessage(msgText, params);
        }

        const params: any = {
            replyTo,
        };
        if (messageThreadId) params.messageThreadId = messageThreadId;
        if (!params.replyTo) delete params.replyTo;

        return await chat.client.sendMedia(chat.id, { type: 'dice', emoji }, params);
    }

    private async resolveMediaInput(content: MessageContent): Promise<any> {
        const mediaHelper = this.media;
        if (!mediaHelper) return (content as any).data?.file || (content as any).data?.url;

        let fileSrc: any;

        if (content.type === 'image') {
            fileSrc = await mediaHelper.processImage(content as any);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'jpg');
        } else if (content.type === 'video') {
            fileSrc = await mediaHelper.processVideo(content as any);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'mp4');
        } else if (content.type === 'audio') {
            fileSrc = await mediaHelper.processAudio(content as any);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'amr');
        } else if (content.type === 'file') {
            const file = content as any;
            if (file.data.file) {
                fileSrc = file.data.file;
            } else if (file.data.url) {
                fileSrc = await mediaHelper.downloadMedia(file.data.url);
            }
            if (fileSrc instanceof Readable) {
                fileSrc = { fileName: file.data.filename || 'file', data: fileSrc };
            }
        } else {
            fileSrc = (content as any).data?.file || (content as any).data?.url;
        }

        return fileSrc;
    }

    private async handleLocalOrMtcuteMedia(fileSrc: any, defaultExt: string) {
        if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
            try {
                fileSrc = await fs.promises.readFile(fileSrc);
            } catch (e) {
                this.logger.warn(e, 'Failed to read local image file, keeping as path:');
            }
        }

        if (fileSrc && typeof fileSrc === 'object' && 'type' in fileSrc && !Buffer.isBuffer(fileSrc) && !(fileSrc instanceof Readable)) {
            try {
                this.logger.debug(`Detected mtcute Media object (type=${fileSrc.type}), downloading...`);
                const buffer = await this.instance.tgBot.downloadMedia(fileSrc);
                if (buffer && buffer.length > 0) {
                    fileSrc = buffer as Buffer;
                    this.logger.debug(`Downloaded media buffer size: ${buffer.length}`);
                } else {
                    this.logger.warn('Downloaded buffer is empty');
                    fileSrc = undefined;
                }
            } catch (e) {
                this.logger.warn(e, 'Failed to download mtcute Media object:');
                fileSrc = undefined;
            }
        }

        if (fileSrc instanceof Readable) {
            fileSrc = { fileName: `media.${defaultExt}`, data: fileSrc };
        } else if (Buffer.isBuffer(fileSrc)) {
            let ext = defaultExt;
            if (defaultExt === 'jpg') {
                const type = await fileTypeFromBuffer(fileSrc);
                ext = type?.ext || 'jpg';
                this.logger.debug(`Detected image type: ${ext}, mime: ${type?.mime}`);
            }
            fileSrc = { fileName: `media.${ext}`, data: fileSrc };
        }

        return fileSrc;
    }

    private async normalizeInputFile(src: any, fallbackName: string): Promise<NormalizedFile | undefined> {
        if (!src) return undefined;

        let data: Buffer | undefined;
        let fileName = path.basename(fallbackName || 'file') || 'file';
        let fileMime: string | undefined;

        if ((src as any).data && (src as any).fileName) {
            fileName = path.basename((src as any).fileName || fileName);
            if (Buffer.isBuffer((src as any).data)) {
                data = (src as any).data;
            } else if ((src as any).data instanceof Readable) {
                data = await this.streamToBuffer((src as any).data as Readable);
            }
        } else if (Buffer.isBuffer(src)) {
            data = src;
        } else if (typeof src === 'string') {
            if (src.startsWith('/')) {
                try {
                    data = await fs.promises.readFile(src);
                    fileName = path.basename(src) || fileName;
                } catch (err) {
                    this.logger.warn(err, `Local media not accessible: ${src}`);
                    return undefined;
                }
            } else if (/^https?:\/\//.test(src) && this.media) {
                try {
                    data = await this.media.downloadMedia(src);
                } catch (err) {
                    this.logger.warn(err, 'Failed to download media from url:');
                    return undefined;
                }
            }
        } else if (src instanceof Readable) {
            data = await this.streamToBuffer(src);
        }

        if (!data) return undefined;

        try {
            const type = await fileTypeFromBuffer(data);
            if (type?.ext) {
                const base = path.parse(fileName).name || 'file';
                fileName = `${base}.${type.ext}`;
            }
            fileMime = type?.mime;
        } catch (err) {
            this.logger.debug(err, 'File type detection failed:');
        }

        return { fileName, data, fileMime };
    }

    private async prepareVoiceMedia(file: NormalizedFile) {
        const ogg = await this.convertAudioToOgg(file);
        if (ogg) {
            return { type: 'voice', file: ogg.data, fileName: ogg.fileName, fileMime: 'audio/ogg' };
        }

        this.logger.warn('Audio conversion failed, fallback to document upload for Telegram');
        return {
            type: 'document',
            file: file.data,
            fileName: file.fileName,
            ...(file.fileMime ? { fileMime: file.fileMime } : {}),
        };
    }

    private async convertAudioToOgg(file: NormalizedFile): Promise<NormalizedFile | undefined> {
        const alreadyOgg = file.fileMime === 'audio/ogg' || file.fileName.toLowerCase().endsWith('.ogg');
        if (alreadyOgg) {
            return { ...file, fileName: this.ensureOggFileName(file.fileName), fileMime: 'audio/ogg' };
        }

        const header = file.data.subarray(0, 10).toString('utf8');
        const isSilk = header.includes('SILK_V3');

        const oggBuffer = await this.transcodeToOgg(file.data, file.fileName, isSilk);
        if (!oggBuffer) return undefined;

        return {
            fileName: this.ensureOggFileName(file.fileName),
            data: oggBuffer,
            fileMime: 'audio/ogg',
        };
    }

    private ensureOggFileName(name: string) {
        const parsed = path.parse(name || 'audio');
        const base = parsed.name || 'audio';
        return `${base}.ogg`;
    }

    private async transcodeToOgg(data: Buffer, sourceName: string, preferSilk?: boolean) {
        const tempDir = path.join(env.DATA_DIR, 'temp');
        await fs.promises.mkdir(tempDir, { recursive: true });

        const inputPath = path.join(tempDir, `tg-audio-${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(sourceName) || '.tmp'}`);
        const outputPath = path.join(tempDir, `tg-audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`);

        await fs.promises.writeFile(inputPath, data);

        try {
            if (preferSilk) {
                try {
                    await silk.decode(data, outputPath);
                    return await fs.promises.readFile(outputPath);
                } catch (err) {
                    this.logger.warn(err, 'Silk decode failed, fallback to ffmpeg');
                }
            }

            await execFileAsync('ffmpeg', [
                '-y',
                '-i', inputPath,
                '-c:a', 'libopus',
                '-b:a', '32k',
                '-ar', '48000',
                '-ac', '1',
                outputPath,
            ]);
            return await fs.promises.readFile(outputPath);
        } catch (err) {
            this.logger.error(err, 'Audio transcode failed:');
            return undefined;
        } finally {
            fs.promises.unlink(inputPath).catch(() => { });
            fs.promises.unlink(outputPath).catch(() => { });
        }
    }

    private isGifMedia(file: NormalizedFile) {
        return file.fileMime === 'image/gif' || file.fileName.toLowerCase().endsWith('.gif');
    }

    private async streamToBuffer(stream: Readable): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    private async sendForwardToTG(chat: any, content: MessageContent, pair: any, replyToMsgId?: number, header: string = '', richHeaderUsed?: boolean) {
        if (content.type !== 'forward' || !content.data.id) {
            return await chat.sendMessage(this.contentRenderer(content).replace(/\\n/g, '\n'), {
                replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
            });
        }

        try {
            const entry = await db.forwardMultiple.create({
                data: {
                    resId: String(content.data.id),
                    fileName: 'Forwarded Message',
                    fromPairId: pair.id,
                }
            });

            const baseUrl = env.WEB_ENDPOINT;
            let messageText = richHeaderUsed ? '[转发消息]' : `${header}[转发消息]`;

            if (baseUrl) {
                const webAppUrl = `${baseUrl}/ui/chatRecord?tgWebAppStartParam=${entry.id}&uuid=${entry.id}`;
                // mtcute 期望 { type: 'inline', buttons: [[{_: 'keyboardButtonUrl', ...}]] }
                const buttons = [[{ _: 'keyboardButtonUrl', text: '查看合并转发', url: webAppUrl }]];
                return await chat.sendMessage(messageText, {
                    replyMarkup: { type: 'inline', buttons },
                    replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
                    disableWebPreview: true,
                });
            } else {
                this.logger.warn('WEB_ENDPOINT is not set, sending forward link as plain text.');
                messageText += '\n(未配置 WEB_ENDPOINT，无法生成查看按钮)';
                return await chat.sendMessage(messageText, {
                    replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
                    disableWebPreview: true,
                });
            }
        } catch (e) {
            this.logger.error(e, 'Failed to send forward message:');
            return await chat.sendMessage(this.contentRenderer(content).replace(/\\n/g, '\n'), {
                replyTo: this.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
            });
        }
    }

    private buildReplyTo(pair?: any, replyToMsgId?: number) {
        const topId = pair?.tgThreadId;
        const replyId = replyToMsgId || topId;
        if (!replyId) return undefined;
        return replyId;
    }

    private escapeHtml(text: string) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private generateRichHeaderUrl(apiKey: string, userId: string, messageHeader: string) {
        const url = new URL(`${env.WEB_ENDPOINT}/richHeader/${apiKey}/${userId}`);
        if (messageHeader) {
            url.searchParams.set('hash', md5Hex(messageHeader).substring(0, 10));
        }
        url.searchParams.set('v', '1');
        return url.toString();
    }

    private applyRichHeader(text: string, richHeaderUrl?: string): { text: string | InputText, params: any } {
        const params: any = {};

        if (richHeaderUrl) {
            // HTML Mode with Rich Header
            // Use mtcute html tag to avoid manual character escaping and ensure TextWithEntities is returned
            // text arg originates from this.contentRenderer() which returns raw text

            // \u200b is zero-width space
            // NOTE: html tag automatic escaping handles & in url and text content

            // We use the `html` tag from @mtcute/core
            const messageText = html`<a href="${richHeaderUrl}">\u200b</a>${text.replace(/\\n/g, '\n')}`;

            params.invertMedia = true;
            params.disableWebPreview = false;

            return { text: messageText, params };
        } else {
            // Plain text mode
            let messageText = text.replace(/\\n/g, '\n');
            params.disableWebPreview = true;
            return { text: messageText, params };
        }
    }
}
