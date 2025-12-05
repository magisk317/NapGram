import { getLogger } from '../../../shared/utils/logger';
import type { UnifiedMessage } from '../../../domain/message';
import type { CommandHandler } from '../types';
import type Instance from '../../../domain/models/Instance';
import type { IQQClient } from '../../../infrastructure/clients/qq';
import type Telegram from '../../../infrastructure/clients/telegram/client';
import db from '../../../domain/models/db';
import { TelegramReply } from '../utils/TelegramReply';
import { PermissionService } from '../services/PermissionService';

const logger = getLogger('RecallHandler');

/**
 * 撤回命令处理器
 */
export class RecallHandler {
    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
        private readonly telegramReply: TelegramReply,
        private readonly permissionService: PermissionService,
    ) { }

    /**
     * 处理撤回命令
     */
    handle: CommandHandler = async (msg: UnifiedMessage, _args: string[]) => {
        const raw = (msg.metadata as any)?.raw as any;
        const replyToId = raw?.replyTo?.replyToMsgId;
        const chatId = msg.chat.id;
        const senderId = msg.sender.id;
        const cmdMsgId = raw?.id || msg.id;

        if (!replyToId || !chatId) {
            await this.telegramReply.send(chatId, '请回复要撤回的消息再使用 /rm');
            return;
        }

        const record = await db.message.findFirst({
            where: {
                tgChatId: BigInt(chatId),
                tgMsgId: replyToId,
                instanceId: this.instance.id,
            },
        });

        const isAdmin = this.permissionService.isAdmin(String(senderId));
        const isSelf = record?.tgSenderId ? String(record.tgSenderId) === String(senderId) : false;

        if (!isAdmin && !isSelf) {
            await this.telegramReply.send(chatId, '无权限撤回他人消息');
            return;
        }

        try {
            const chat = await this.tgBot.getChat(chatId as any);
            await chat.deleteMessages([replyToId]);
        } catch (e) {
            logger.warn(e, '撤回 TG 消息失败');
        }

        if (record?.seq) {
            try {
                await this.qqClient.recallMessage(String(record.seq));
            } catch (e) {
                logger.warn(e, '撤回 QQ 消息失败');
            }
        }

        // 尝试删除命令消息自身
        if (cmdMsgId) {
            try {
                const chat = await this.tgBot.getChat(chatId as any);
                await chat.deleteMessages([Number(cmdMsgId)]);
            } catch (e) {
                logger.warn(e, '删除命令消息失败');
            }
        }
    };
}
