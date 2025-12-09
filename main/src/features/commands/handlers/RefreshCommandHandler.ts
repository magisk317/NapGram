import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import ForwardMap from '../../../domain/models/ForwardMap';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('RefreshCommandHandler');

/**
 * 刷新命令处理器
 * 处理: refresh, refresh_all
 */
export class RefreshCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
        // 只在 Telegram 端处理
        if (msg.platform !== 'telegram') {
            return;
        }

        const chatId = msg.chat.id;
        const threadId = this.context.extractThreadId(msg, args);

        if (commandName === 'refresh') {
            await this.handleRefresh(chatId, threadId);
        } else if (commandName === 'refresh_all') {
            await this.handleRefreshAll(chatId, threadId);
        }
    }

    /**
     * 刷新当前群组的头像和描述
     */
    private async handleRefresh(chatId: string, threadId: number | undefined) {
        const forwardMap = this.context.instance.forwardPairs as ForwardMap;
        const pair = forwardMap.findByTG(chatId, threadId, true);

        if (!pair) {
            await this.context.replyTG(chatId, '❌ 当前聊天未绑定任何 QQ 群', threadId);
            return;
        }

        const qqGroupId = pair.qqRoomId.toString();

        try {
            await this.context.replyTG(chatId, '🔄 正在刷新群组信息...', threadId);

            // 获取 QQ 群信息
            const groupInfo = await this.context.qqClient.getGroupInfo(qqGroupId);
            if (!groupInfo) {
                await this.context.replyTG(chatId, '❌ 获取 QQ 群信息失败', threadId);
                return;
            }

            // 获取 TG 聊天对象
            const tgChat = await this.context.tgBot.getChat(Number(chatId));

            // 更新群组名称
            if (groupInfo.name) {
                try {
                    await tgChat.editTitle(groupInfo.name);
                    logger.info(`Updated TG chat title to: ${groupInfo.name}`);
                } catch (error) {
                    logger.warn('Failed to update chat title:', error);
                }
            }

            // TODO: 更新群组头像
            // 需要实现从 QQ 获取群头像的逻辑
            // const avatarUrl = await this.getGroupAvatar(qqGroupId);
            // if (avatarUrl) {
            //     const avatarBuffer = await fetch(avatarUrl).then(r => r.arrayBuffer());
            //     await tgChat.setProfilePhoto(Buffer.from(avatarBuffer));
            // }

            // TODO: 更新群组描述
            // NapCat 可能没有获取群公告的 API
            // const description = await this.getGroupDescription(qqGroupId);
            // if (description) {
            //     await tgChat.editAbout(description);
            // }

            await this.context.replyTG(
                chatId,
                `✅ 已刷新群组信息\n\n群名: ${groupInfo.name}\n\n⚠️ 头像和描述刷新功能待完善`,
                threadId
            );
        } catch (error) {
            logger.error('Failed to refresh group info:', error);
            await this.context.replyTG(chatId, '❌ 刷新失败，请查看日志', threadId);
        }
    }

    /**
     * 刷新所有绑定群组的信息
     */
    private async handleRefreshAll(chatId: string, threadId: number | undefined) {
        try {
            await this.context.replyTG(chatId, '🔄 正在刷新所有绑定群组信息...', threadId);

            const forwardMap = this.context.instance.forwardPairs as ForwardMap;
            const allPairs = forwardMap.getAll();

            let successCount = 0;
            let failCount = 0;

            for (const pair of allPairs) {
                try {
                    const qqGroupId = pair.qqRoomId.toString();
                    const tgChatId = pair.tgChatId.toString();

                    // 获取 QQ 群信息
                    const groupInfo = await this.context.qqClient.getGroupInfo(qqGroupId);
                    if (!groupInfo) {
                        failCount++;
                        continue;
                    }

                    // 获取 TG 聊天对象
                    const tgChat = await this.context.tgBot.getChat(Number(tgChatId));

                    // 更新群组名称
                    if (groupInfo.name) {
                        await tgChat.editTitle(groupInfo.name);
                    }

                    successCount++;
                    logger.info(`Refreshed ${qqGroupId} -> ${tgChatId}`);
                } catch (error) {
                    failCount++;
                    logger.warn(`Failed to refresh pair ${pair.id}:`, error);
                }
            }

            await this.context.replyTG(
                chatId,
                `✅ 刷新完成\n\n成功: ${successCount}\n失败: ${failCount}\n总计: ${allPairs.length}`,
                threadId
            );
        } catch (error) {
            logger.error('Failed to refresh all groups:', error);
            await this.context.replyTG(chatId, '❌ 批量刷新失败，请查看日志', threadId);
        }
    }
}
