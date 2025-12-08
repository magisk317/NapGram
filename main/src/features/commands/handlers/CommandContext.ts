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
        public readonly replyTG: (chatId: string | number, text: string, threadId?: number) => Promise<void>,
        public readonly extractThreadId: (msg: UnifiedMessage, args: string[]) => number | undefined
    ) { }
}
