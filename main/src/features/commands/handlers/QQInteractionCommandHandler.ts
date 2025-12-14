import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import ForwardMap from '../../../domain/models/ForwardMap';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('QQInteractionCommandHandler');

/**
 * QQ 交互命令处理器
 * 处理: poke, nick, mute, like, honor
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
            case 'like':
            case '点赞':
                await this.handleLike(chatId, threadId, qqGroupId, msg, args);
                break;
            case 'honor':
            case '群荣誉':
                await this.handleGroupHonor(chatId, threadId, qqGroupId, args);
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

    /**
     * 处理点赞命令
     * Phase 3: /like <QQ号/回复消息> [次数]
     */
    private async handleLike(
        chatId: string,
        threadId: number | undefined,
        qqGroupId: string,
        msg: UnifiedMessage,
        args: string[]
    ) {
        try {
            // 解析目标用户
            const targetUin = await this.resolveTargetUser(msg, args, 0);
            if (!targetUin) {
                await this.context.replyTG(
                    chatId,
                    `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/like [次数]\n• 直接指定：/like 123456789 [次数]`,
                    threadId
                );
                return;
            }

            // 解析点赞次数
            const hasReply = this.hasReplyMessage(msg);
            const timesArg = hasReply ? args[0] : args[1];
            let times = 1;

            if (timesArg) {
                times = parseInt(timesArg);
                if (isNaN(times) || times < 1 || times > 10) {
                    await this.context.replyTG(chatId, '❌ 点赞次数必须在1-10之间', threadId);
                    return;
                }
            }

            // 执行点赞
            const sendLike = this.context.qqClient.sendLike;
            if (!sendLike) {
                await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持点赞功能', threadId);
                return;
            }

            await sendLike.call(this.context.qqClient, targetUin, times);

            await this.context.replyTG(
                chatId,
                `✅ 已给 ${targetUin} 点赞 x${times}`,
                threadId
            );

            logger.info(`Sent like to ${targetUin} x${times}`);
        } catch (error: any) {
            logger.error('Failed to send like:', error);
            await this.context.replyTG(chatId, `❌ 点赞失败：${error.message || error}`, threadId);
        }
    }

    /**
     * 处理群荣誉命令
     * Phase 3: /honor [类型]
     */
    private async handleGroupHonor(
        chatId: string,
        threadId: number | undefined,
        qqGroupId: string,
        args: string[]
    ) {
        try {
            const type = args[0] || 'all';
            const validTypes = ['talkative', 'performer', 'legend', 'strong_newbie', 'emotion', 'all'];

            if (!validTypes.includes(type)) {
                await this.context.replyTG(
                    chatId,
                    `❌ 无效的类型\n\n有效类型：talkative(龙王), performer(群聊之火), legend(快乐源泉), strong_newbie(冲高之星), emotion(一笔当先), all(全部)`,
                    threadId
                );
                return;
            }

            const getGroupHonorInfo = this.context.qqClient.getGroupHonorInfo;
            if (!getGroupHonorInfo) {
                await this.context.replyTG(chatId, '❌ 当前QQ客户端不支持群荣誉功能', threadId);
                return;
            }

            const result = await getGroupHonorInfo.call(this.context.qqClient, qqGroupId, type as any);

            // 格式化结果
            let message = `🏆 群荣誉榜单\n\n`;

            if (type === 'all' && result) {
                const types = ['talkative', 'performer', 'legend', 'strong_newbie', 'emotion'];
                const typeNames: any = {
                    talkative: '🐉 龙王',
                    performer: '🔥 群聊之火',
                    legend: '😄 快乐源泉',
                    strong_newbie: '⭐ 冲高之星',
                    emotion: '✍️ 一笔当先',
                };

                for (const t of types) {
                    const list = result[`${t}_list`];
                    if (list && list.length > 0) {
                        message += `${typeNames[t]}\n`;
                        list.slice(0, 3).forEach((item: any, i: number) => {
                            message += `  ${i + 1}. ${item.nickname || item.uin} (${item.uin})\n`;
                        });
                        message += '\n';
                    }
                }
            } else {
                message += JSON.stringify(result, null, 2);
            }

            await this.context.replyTG(chatId, message, threadId);
            logger.info(`Retrieved group honor info for ${qqGroupId}: ${type}`);
        } catch (error: any) {
            logger.error('Failed to get group honor:', error);
            await this.context.replyTG(chatId, `❌ 获取群荣誉失败：${error.message || error}`, threadId);
        }
    }

    /**
     * 解析目标用户ID
     */
    private async resolveTargetUser(
        msg: UnifiedMessage,
        args: string[],
        argIndex: number
    ): Promise<string | null> {
        const raw = (msg.metadata as any)?.raw as any;

        if (raw?.replyToMessage || raw?.replyTo) {
            const replyMsg = raw.replyToMessage || raw.replyTo;
            if (replyMsg?.senderId) {
                return String(replyMsg.senderId);
            }
        }

        const replyContent = msg.content.find(c => c.type === 'reply');
        if (replyContent) {
            const replyData = replyContent.data as any;
            if (replyData.senderId) {
                return String(replyData.senderId);
            }
        }

        const arg = args[argIndex];
        if (arg && /^\d+$/.test(arg)) {
            return arg;
        }

        return null;
    }

    /**
     * 检查消息是否为回复消息
     */
    private hasReplyMessage(msg: UnifiedMessage): boolean {
        const raw = (msg.metadata as any)?.raw as any;
        if (raw?.replyToMessage || raw?.replyTo) {
            return true;
        }
        return msg.content.some(c => c.type === 'reply');
    }
}
