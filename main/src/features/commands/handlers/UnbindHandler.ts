import { getLogger } from '../../../shared/utils/logger';
import type { UnifiedMessage } from '../../../domain/message';
import type { CommandHandler } from '../types';
import type Instance from '../../../domain/models/Instance';
import ForwardMap from '../../../domain/models/ForwardMap';
import { TelegramReply } from '../utils/TelegramReply';
import { ThreadIdExtractor } from '../services/ThreadIdExtractor';
import { InteractionManager } from '../services/InteractionManager';

const logger = getLogger('UnbindHandler');

/**
 * 解绑命令处理器
 */
export class UnbindHandler {
    constructor(
        private readonly instance: Instance,
        private readonly telegramReply: TelegramReply,
        private readonly threadExtractor: ThreadIdExtractor,
        private readonly interactionManager: InteractionManager,
    ) { }

    /**
     * 处理解绑命令
     */
    handle: CommandHandler = async (msg: UnifiedMessage, args: string[]) => {
        const chatId = msg.chat.id;
        const forwardMap = this.instance.forwardPairs as ForwardMap;
        const threadId = this.threadExtractor.extract(msg, args);
        const qqGroupId = args[0];

        // 无参数：默认解绑当前频道（或当前话题）；如果找不到，再进入交互模式
        if (!qqGroupId) {
            const targetByChat = forwardMap.findByTG(chatId, threadId, threadId ? false : true);
            if (targetByChat) {
                await forwardMap.remove(targetByChat.qqRoomId);
                const threadInfo = targetByChat.tgThreadId ? ` (话题 ${targetByChat.tgThreadId})` : '';
                await this.telegramReply.send(
                    chatId,
                    `已解绑：QQ ${targetByChat.qqRoomId} <-> TG ${targetByChat.tgChatId}${threadInfo}`,
                    threadId || targetByChat.tgThreadId || undefined,
                    (msg.metadata as any)?.raw,
                );
                logger.info(`Unbind command: QQ ${targetByChat.qqRoomId} <-> TG ${targetByChat.tgChatId}${threadInfo}`);
                return;
            }
            this.interactionManager.setPending(chatId, msg.sender.id, { action: 'unbind', threadId });
            await this.telegramReply.send(
                chatId,
                '未找到绑定关系，请输入要解绑的 QQ 群号',
                threadId,
                (msg.metadata as any)?.raw,
            );
            return;
        }

        const target = /^-?\d+$/.test(qqGroupId)
            ? forwardMap.findByQQ(qqGroupId)
            : forwardMap.findByTG(chatId, threadId, threadId ? false : true);

        if (!target) {
            await this.telegramReply.send(chatId, '未找到绑定关系', threadId, (msg.metadata as any)?.raw);
            return;
        }

        await forwardMap.remove(target.qqRoomId);
        const threadInfo = target.tgThreadId ? ` (话题 ${target.tgThreadId})` : '';
        await this.telegramReply.send(
            chatId,
            `已解绑：QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`,
            threadId || target.tgThreadId || undefined,
            (msg.metadata as any)?.raw,
        );
        logger.info(`Unbind command: QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`);
    };
}
