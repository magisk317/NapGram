import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import ForwardMap from '../../../domain/models/ForwardMap';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('InfoCommandHandler');

/**
 * Info 命令处理器
 * 显示当前聊天的绑定信息和消息详情
 */
export class InfoCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
        // 只在 Telegram 端处理
        if (msg.platform !== 'telegram') {
            return;
        }

        const chatId = msg.chat.id;
        const threadId = this.context.extractThreadId(msg, args);

        // 查找绑定关系
        const forwardMap = this.context.instance.forwardPairs as ForwardMap;
        const pair = forwardMap.findByTG(chatId, threadId, true);

        if (!pair) {
            await this.context.replyTG(chatId, '❌ 当前聊天未绑定任何 QQ 群', threadId);
            return;
        }

        // 构建绑定信息
        let info = `📊 **绑定信息**\n\n`;
        info += `🔗 QQ 群号: \`${pair.qqRoomId}\`\n`;
        info += `🔗 TG 聊天 ID: \`${pair.tgChatId}\`\n`;
        if (pair.tgThreadId) {
            info += `🔗 TG 话题 ID: \`${pair.tgThreadId}\`\n`;
        }
        info += `\n`;

        // 转发模式
        const forwardMode = pair.forwardMode || 'normal';
        let modeText = '';
        switch (forwardMode) {
            case 'off':
                modeText = '❌ 已暂停';
                break;
            case 'qq_only':
                modeText = '⬆️ 仅 QQ → TG';
                break;
            case 'tg_only':
                modeText = '⬇️ 仅 TG → QQ';
                break;
            default:
                modeText = '✅ 双向正常';
        }
        info += `📡 转发状态: ${modeText}\n`;

        // 昵称模式
        if (pair.nicknameMode) {
            info += `👤 昵称模式: \`${pair.nicknameMode}\`\n`;
        }

        // 如果有ignore规则
        if (pair.ignoreRegex) {
            info += `🚫 忽略正则: \`${pair.ignoreRegex}\`\n`;
        }
        if (pair.ignoreSenders) {
            info += `🚫 忽略发送者: \`${pair.ignoreSenders}\`\n`;
        }

        // 检查是否回复了某条消息
        const raw = (msg.metadata as any)?.raw;
        if (raw?.replyTo) {
            info += `\n📬 **回复的消息信息**\n`;
            info += `消息 ID: \`${raw.replyTo.replyToMsgId || raw.replyTo}\`\n`;
            // 可以在这里添加更多消息详情，如果有消息映射数据库的话
        }

        await this.context.replyTG(chatId, info, threadId);
        logger.debug(`Info command executed for TG ${chatId}, thread ${threadId}`);
    }
}
