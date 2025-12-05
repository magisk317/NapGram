import { getLogger } from '../../../shared/utils/logger';
import type { UnifiedMessage } from '../../../domain/message';
import type { CommandHandler } from '../types';
import type { IQQClient } from '../../../infrastructure/clients/qq';
import { TelegramReply } from '../utils/TelegramReply';

const logger = getLogger('StatusHandler');

/**
 * 状态命令处理器
 */
export class StatusHandler {
    constructor(
        private readonly qqClient: IQQClient,
        private readonly telegramReply: TelegramReply,
    ) { }

    /**
     * 处理状态命令
     */
    handle: CommandHandler = async (msg: UnifiedMessage, args: string[]) => {
        const isOnline = await this.qqClient.isOnline();
        const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.qqClient.uin}
- 昵称: ${this.qqClient.nickname}
- 客户端类型: ${this.qqClient.clientType}
        `.trim();

        await this.telegramReply.send(msg.chat.id, status);
        logger.info('Status command executed');
    };
}
