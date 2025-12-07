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
import { ForwardMediaPreparer } from './senders/MediaPreparer';
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
    private mediaPreparer: ForwardMediaPreparer;

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
        this.mediaPreparer = new ForwardMediaPreparer(instance, media);
        this.mediaGroupHandler = new MediaGroupHandler(
            this.qqClient,
            (msg) => this.mediaPreparer.prepareMediaForQQ(msg),
            () => this.nicknameMode,
        );
        this.tgMessageHandler = new TelegramMessageHandler(
            this.qqClient,
            this.mediaGroupHandler,
            this.replyResolver,
            (msg) => this.mediaPreparer.prepareMediaForQQ(msg),
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
