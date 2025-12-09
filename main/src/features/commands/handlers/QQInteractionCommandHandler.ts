import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import ForwardMap from '../../../domain/models/ForwardMap';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('QQInteractionCommandHandler');

/**
 * QQ 交互命令处理器
 * 处理: poke, nick, mute
 */
export class QQInteractionCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
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

        const qqGroupId = pair.qqRoomId.toString();

        switch (commandName) {
            case 'poke':
                await this.handlePoke(chatId, threadId, qqGroupId, args);
                break;
            case 'nick':
                await this.handleNick(chatId, threadId, qqGroupId, args);
                break;
            case 'mute':
                await this.handleMute(chatId, threadId, qqGroupId, args);
                break;
        }
    }

    /**
     * 处理戳一戳命令
     * TODO: NapCat 需要实现发送 poke 的 API
     */
    private async handlePoke(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[]) {
        // 目标 QQ 号（可选参数）
        const targetUin = args[0];

        try {
            // NapCat 可能需要使用 send_group_poke 或类似 API
            // 当前版本暂不支持，标记为 TODO
            await this.context.replyTG(
                chatId,
                `⚠️ 戳一戳功能暂未实现\n\n需要等待 NapCat 支持发送戳一戳的 API`,
                threadId
            );
            logger.warn('Poke command not implemented: NapCat API not available');
        } catch (error) {
            logger.error('Failed to send poke:', error);
            await this.context.replyTG(chatId, '❌ 发送戳一戳失败', threadId);
        }
    }

    /**
     * 处理昵称命令
     */
    private async handleNick(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[]) {
        try {
            const botUin = this.context.qqClient.uin.toString();

            if (args.length === 0) {
                // 获取当前昵称
                const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, botUin);
                const card = memberInfo?.card || memberInfo?.nickname || '未设置';
                await this.context.replyTG(
                    chatId,
                    `📝 当前群名片: \`${card}\`\n\n使用 \`/nick 新名片\` 修改`,
                    threadId
                );
            } else {
                // 设置新昵称
                const newCard = args.join(' ');

                // TODO: NapCat 需要实现 set_group_card API
                await this.context.replyTG(
                    chatId,
                    `⚠️ 修改群名片功能暂未实现\n\n需要等待 NapCat 支持 set_group_card API`,
                    threadId
                );
                logger.warn('Set nick command not implemented: NapCat API not available');
            }
        } catch (error) {
            logger.error('Failed to handle nick command:', error);
            await this.context.replyTG(chatId, '❌ 获取/设置群名片失败', threadId);
        }
    }

    /**
     * 处理禁言命令
     */
    private async handleMute(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[]) {
        if (args.length < 2) {
            await this.context.replyTG(
                chatId,
                `用法: /mute <QQ号> <时长(秒)>\n\n示例: /mute 123456789 600 (禁言10分钟)`,
                threadId
            );
            return;
        }

        const targetUin = args[0];
        const duration = parseInt(args[1]);

        if (isNaN(duration) || duration < 0) {
            await this.context.replyTG(chatId, '❌ 时长必须是非负整数', threadId);
            return;
        }

        try {
            // TODO: NapCat 需要实现 set_group_ban API
            await this.context.replyTG(
                chatId,
                `⚠️ 禁言功能暂未实现\n\n需要等待 NapCat 支持 set_group_ban API`,
                threadId
            );
            logger.warn('Mute command not implemented: NapCat API not available');
        } catch (error) {
            logger.error('Failed to mute user:', error);
            await this.context.replyTG(chatId, '❌ 禁言操作失败', threadId);
        }
    }
}
