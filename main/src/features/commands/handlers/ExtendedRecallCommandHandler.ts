import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import ForwardMap from '../../../domain/models/ForwardMap';
import { getLogger } from '../../../shared/logger';
import db from '../../../domain/models/db';

const logger = getLogger('ExtendedRecallCommandHandler');

/**
 * 扩展撤回命令处理器
 * 处理: rmt (仅撤回 TG), rmq (仅撤回 QQ)
 */
export class ExtendedRecallCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, _args: string[], commandName: string): Promise<void> {
        const raw = (msg.metadata as any)?.raw as any;

        // 提取 replyToId
        let replyToId: number | undefined;

        // TG 结构
        replyToId = raw?.replyTo?.replyToMsgId
            || raw?.replyTo?.id
            || raw?.replyTo?.replyToTopId
            || raw?.replyToMessage?.id;

        // QQ 结构
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
            await this.context.replyTG(chatId, `请回复要撤回的消息再使用 /${commandName}`);
            return;
        }

        // 查询消息记录
        let record;
        if (msg.platform === 'qq') {
            record = await db.message.findFirst({
                where: {
                    qqRoomId: BigInt(chatId),
                    seq: replyToId,
                    instanceId: this.context.instance.id,
                },
            });
        } else {
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

        // 根据命令类型执行不同的撤回逻辑
        if (commandName === 'rmt') {
            // 仅撤回 Telegram 端
            await this.recallTelegramOnly(msg, replyToId, record, cmdMsgId);
        } else if (commandName === 'rmq') {
            // 仅撤回 QQ 端
            await this.recallQQOnly(msg, replyToId, record, cmdMsgId);
        }
    }

    /**
     * 仅撤回 Telegram 端的消息
     */
    private async recallTelegramOnly(msg: UnifiedMessage, replyToId: number, record: any, cmdMsgId: string) {
        const chatId = msg.chat.id;

        try {
            if (msg.platform === 'qq') {
                // QQ 端发起：删除 TG 对应消息
                if (record?.tgMsgId && record?.tgChatId) {
                    const chat = await this.context.tgBot.getChat(Number(record.tgChatId));
                    await chat.deleteMessages([record.tgMsgId]);
                    logger.info(`TG message ${record.tgMsgId} deleted by QQ /rmt command`);
                } else {
                    logger.warn('未找到对应的 TG 消息');
                }
            } else {
                // TG 端发起：删除 TG 原消息
                const chat = await this.context.tgBot.getChat(Number(chatId));
                await chat.deleteMessages([replyToId]);
                logger.info(`TG message ${replyToId} deleted by /rmt command`);
            }

            // 删除命令消息
            if (cmdMsgId && msg.platform === 'telegram') {
                try {
                    const chat = await this.context.tgBot.getChat(Number(chatId));
                    await chat.deleteMessages([Number(cmdMsgId)]);
                } catch (e) {
                    logger.debug('删除命令消息失败');
                }
            }
        } catch (error) {
            logger.error('删除 TG 消息失败:', error);
            await this.context.replyTG(chatId, '❌ 删除 TG 消息失败');
        }
    }

    /**
     * 仅撤回 QQ 端的消息
     */
    private async recallQQOnly(msg: UnifiedMessage, replyToId: number, record: any, cmdMsgId: string) {
        const chatId = msg.chat.id;

        try {
            if (msg.platform === 'qq') {
                // QQ 端发起：撤回 QQ 原消息
                await this.context.qqClient.recallMessage(String(replyToId));
                logger.info(`QQ message ${replyToId} recalled by /rmq command`);
            } else {
                // TG 端发起：撤回 QQ 对应消息
                if (record?.seq) {
                    await this.context.qqClient.recallMessage(String(record.seq));
                    logger.info(`QQ message ${record.seq} recalled by TG /rmq command`);
                } else {
                    await this.context.replyTG(chatId, '❌ 未找到对应的 QQ 消息');
                    return;
                }
            }

            // 删除命令消息（如果是 TG 端发起）
            if (cmdMsgId && msg.platform === 'telegram') {
                try {
                    const chat = await this.context.tgBot.getChat(Number(chatId));
                    await chat.deleteMessages([Number(cmdMsgId)]);
                } catch (e) {
                    logger.debug('删除命令消息失败');
                }
            }
        } catch (error) {
            logger.error('撤回 QQ 消息失败:', error);
            await this.context.replyTG(chatId, '❌ 撤回 QQ 消息失败');
        }
    }
}
