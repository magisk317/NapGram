import { getLogger } from '../../../shared/utils/logger';
import type { UnifiedMessage } from '../../../domain/message';
import type Instance from '../../../domain/models/Instance';
import type ForwardMap from '../../../domain/models/ForwardMap';
import type { ForwardModeService } from '../services/ForwardModeService';
import type { ForwardMapper } from '../services/MessageMapper';
import type { ReplyResolver } from '../services/ReplyResolver';
import type { TelegramSender } from '../senders/TelegramSender';

const logger = getLogger('QQMessageHandler');

/**
 * QQ 消息处理器
 * 负责处理从 QQ 到 Telegram 的消息转发
 */
export class QQMessageHandler {
    constructor(
        private readonly instance: Instance,
        private readonly forwardMap: ForwardMap,
        private readonly modeService: ForwardModeService,
        private readonly mapper: ForwardMapper,
        private readonly replyResolver: ReplyResolver,
        private readonly telegramSender: TelegramSender,
    ) { }

    /**
     * 处理 QQ 消息
     */
    async handle(msg: UnifiedMessage): Promise<void> {
        // Check forward mode (QQ -> TG is index 0)
        if (!this.modeService.isQQToTGEnabled()) {
            return;
        }

        try {
            const pair = this.forwardMap.findByQQ(msg.chat.id);
            if (!pair) {
                logger.debug(`No TG mapping for QQ chat ${msg.chat.id}`);
                return;
            }

            const tgChatId = Number(pair.tgChatId);
            console.log(`[DEBUG] Forwarding using pair: QQ=${pair.qqRoomId} -> TG=${pair.tgChatId}, Thread=${pair.tgThreadId}`);
            logger.info(`Forwarding using pair: QQ=${pair.qqRoomId} -> TG=${pair.tgChatId}, Thread=${pair.tgThreadId}`);
            const chat = await this.instance.tgBot.getChat(tgChatId);

            // 处理回复
            const replyToMsgId = await this.replyResolver.resolveQQReply(msg, pair.instanceId, pair.qqRoomId);

            const sentMsg = await this.telegramSender.sendToTelegram(chat, msg, pair, replyToMsgId, this.modeService.nicknameMode);

            if (sentMsg) {
                await this.mapper.saveMessage(msg, sentMsg, pair.instanceId, pair.qqRoomId, BigInt(tgChatId));
                logger.info(`QQ message ${msg.id} forwarded to TG ${tgChatId} (TG ID: ${sentMsg.id})`);
            }
        } catch (error) {
            logger.error(error, 'Failed to forward QQ message:');
        }
    }
}
