import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import db from '../../../domain/models/db';
import env from '../../../domain/models/env';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('RecallCommandHandler');

/**
 * 撤回命令处理器
 */
export class RecallCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, _args: string[]): Promise<void> {
        const raw = (msg.metadata as any)?.raw as any;

        // 提取 replyToId：
        // 1. TG 消息：从 raw.replyTo 中提取
        // 2. QQ 消息：从 content 中的 reply 段提取
        let replyToId: number | undefined;

        // 先尝试 TG 结构
        replyToId = raw?.replyTo?.replyToMsgId
            || raw?.replyTo?.id
            || raw?.replyTo?.replyToTopId
            || raw?.replyToMessage?.id;

        // 如果 TG 结构没找到，尝试 QQ 结构
        if (!replyToId) {
            const replyContent = msg.content.find(c => c.type === 'reply');
            if (replyContent) {
                const replyData = replyContent.data as any;
                replyToId = Number(replyData.messageId || replyData.id || replyData.seq);
            }
        }

        const chatId = msg.chat.id;
        const senderId = msg.sender.id;
        const cmdMsgId = raw?.id || msg.id;

        if (!replyToId || !chatId) {
            await this.context.replyTG(chatId, '请回复要撤回的消息再使用 /rm');
            return;
        }

        // 根据消息平台使用不同的查询策略
        let record;
        if (msg.platform === 'qq') {
            // QQ 消息：replyToId 是 QQ 的 seq
            record = await db.message.findFirst({
                where: {
                    qqRoomId: BigInt(chatId),
                    seq: replyToId,
                    instanceId: this.context.instance.id,
                },
            });
        } else {
            // TG 消息：replyToId 是 TG 的 msgId
            record = await db.message.findFirst({
                where: {
                    tgChatId: BigInt(chatId),
                    tgMsgId: replyToId,
                    instanceId: this.context.instance.id,
                },
            });
        }

        const isAdmin = this.context.permissionChecker.isAdmin(String(senderId));
        const isSelf = record?.tgSenderId ? String(record.tgSenderId) === String(senderId) : false;

        if (!isAdmin && !isSelf) {
            await this.context.replyTG(chatId, '无权限撤回他人消息');
            return;
        }

        // 根据平台处理撤回逻辑
        if (msg.platform === 'qq') {
            // QQ 端 /rm：撤回 QQ 的原消息(replyToId) + 删除 TG 对应消息(record.tgMsgId)

            // 撤回 QQ 原消息
            try {
                await this.context.qqClient.recallMessage(String(replyToId));
                logger.info(`QQ message ${replyToId} recalled by /rm command`);
            } catch (e) {
                logger.warn(e, `撤回 QQ 消息 ${replyToId} 失败`);
            }

            // 删除对应的 TG 消息
            if (record?.tgMsgId && record?.tgChatId) {
                try {
                    const chat = await this.context.tgBot.getChat(Number(record.tgChatId));
                    await chat.deleteMessages([record.tgMsgId]);
                    logger.info(`TG message ${record.tgMsgId} deleted by QQ /rm command`);
                } catch (e) {
                    logger.warn(e, '删除 TG 消息失败');
                }
            }

        } else {
            // TG 端 /rm：删除 TG 原消息(replyToId) + 撤回 QQ 对应消息(record.seq)

            // 删除 TG 原消息
            try {
                const chat = await this.context.tgBot.getChat(Number(chatId));
                await chat.deleteMessages([replyToId]);
                logger.info(`TG message ${replyToId} deleted by /rm command`);
            } catch (e) {
                logger.warn(e, '撤回 TG 消息失败');
            }

            // 撤回对应的 QQ 消息
            if (record?.seq && env.ENABLE_AUTO_RECALL) {
                try {
                    await this.context.qqClient.recallMessage(String(record.seq));
                    logger.info(`QQ message ${record.seq} recalled by /rm command`);
                } catch (e) {
                    logger.warn(e, '撤回 QQ 消息失败');
                }
            }
        }

        // 尝试删除命令消息自身
        if (cmdMsgId) {
            try {
                const chat = await this.context.tgBot.getChat(Number(chatId));
                await chat.deleteMessages([Number(cmdMsgId)]);
            } catch (e) {
                logger.warn(e, '删除命令消息失败');
            }
        }
    }
}
