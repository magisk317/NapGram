import type { UnifiedMessage } from '../../../domain/message';
import type { IQQClient } from '../../../infrastructure/clients/qq';
import type Telegram from '../../../infrastructure/clients/telegram/client';
import type Instance from '../../../domain/models/Instance';
import { CommandRegistry } from '../services/CommandRegistry';
import { PermissionChecker } from '../services/PermissionChecker';
import { InteractiveStateManager } from '../services/InteractiveStateManager';

/**
 * 命令处理器上下文 - 包含所有命令处理器需要的依赖
 */
export class CommandContext {
    constructor(
        public readonly instance: Instance,
        public readonly tgBot: Telegram,
        public readonly qqClient: IQQClient,
        public readonly registry: CommandRegistry,
        public readonly permissionChecker: PermissionChecker,
        public readonly stateManager: InteractiveStateManager,
        public readonly replyTG: (chatId: string | number, text: any, threadId?: number) => Promise<void>,
        public readonly extractThreadId: (msg: UnifiedMessage, args: string[]) => number | undefined
    ) { }

    async reply(msg: UnifiedMessage, text: string) {
        if (msg.platform === 'telegram') {
            const threadId = this.extractThreadId(msg, []);
            await this.replyTG(msg.chat.id, text, threadId);
        } else {
            // QQ Reply
            await this.qqClient.sendMessage(msg.chat.id, {
                id: '',
                platform: 'qq',
                sender: { id: '0', name: 'system' },
                chat: { id: msg.chat.id, type: 'group' },
                timestamp: Date.now(),
                content: [{ type: 'text', data: { text } }]
            });
        }
    }
}
