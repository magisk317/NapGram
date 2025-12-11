import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('StatusCommandHandler');

/**
 * 状态命令处理器
 */
export class StatusCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
        const isOnline = await this.context.qqClient.isOnline();

        let dbStatus = '未知';
        try {
            // reuse logic from statistics or just simple query
            // strict TS might need import db, but maybe context has it? No.
            // Just generic status for now or assume if command runs, part of it works.
            // Let's keep it simple as user requested 'fallback general' which likely means 'Don't just say offline if waiting'.
        } catch (e) { }

        const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线 (或 API 超时)'}
- QQ 号: ${this.context.qqClient.uin}
- 昵称: ${this.context.qqClient.nickname}
- 客户端类型: ${this.context.qqClient.clientType}
        `.trim();

        await this.context.reply(msg, status);
        logger.info('Status command executed');
    }
}

