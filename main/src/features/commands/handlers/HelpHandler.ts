import { getLogger } from '../../../shared/utils/logger';
import type { UnifiedMessage } from '../../../domain/message';
import type { Command, CommandHandler } from '../types';
import { TelegramReply } from '../utils/TelegramReply';
import { ThreadIdExtractor } from '../services/ThreadIdExtractor';

const logger = getLogger('HelpHandler');

/**
 * 帮助命令处理器
 */
export class HelpHandler {
    constructor(
        private readonly telegramReply: TelegramReply,
        private readonly threadExtractor: ThreadIdExtractor,
        private readonly commands: Map<string, Command>,
    ) { }

    /**
     * 处理帮助命令
     */
    handle: CommandHandler = async (msg: UnifiedMessage, args: string[]) => {
        const commandList: string[] = [];
        const processedCommands = new Set<string>();

        for (const [name, command] of this.commands) {
            // 跳过别名
            if (name !== command.name) continue;
            if (processedCommands.has(command.name)) continue;

            processedCommands.add(command.name);

            let line = `/${command.name}`;
            if (command.aliases && command.aliases.length > 0) {
                line += ` (${command.aliases.join(', ')})`;
            }
            line += ` - ${command.description}`;
            if (command.adminOnly) {
                line += ' [管理员]';
            }

            commandList.push(line);
        }

        const helpText = `可用命令:\n${commandList.join('\n')}`;

        try {
            await this.telegramReply.send(
                msg.chat.id,
                helpText,
                this.threadExtractor.extract(msg, []),
            );
        } catch (e) {
            logger.warn(e, '发送帮助信息失败');
        }
        logger.info('Help command executed');
    };
}
