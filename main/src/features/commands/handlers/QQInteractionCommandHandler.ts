import type { UnifiedMessage } from '../../../domain/message';
import { CommandContext } from './CommandContext';
import ForwardMap from '../../../domain/models/ForwardMap';
import db from '../../../domain/models/db'; // Import DB for message lookup
import { getLogger } from '../../../shared/logger';

const logger = getLogger('QQInteractionCommandHandler');

/**
 * QQ 交互命令处理器
 * 处理: poke, nick, mute
 */
export class QQInteractionCommandHandler {
    constructor(private readonly context: CommandContext) { }

    async execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void> {
        // QQ 端也支持 poke 命令
        // if (msg.platform !== 'telegram') { ... }

        const chatId = msg.chat.id;
        const threadId = this.context.extractThreadId(msg, args);

        const forwardMap = this.context.instance.forwardPairs as ForwardMap;
        // 注意：如果是 QQ 端的命令，chatId 本身就是 QQ 群号，查找逻辑可能不同
        // 但目前 ForwardMap 主要用于 TG->QQ 查找。
        // 如果是 QQ 端，我们需要反向查找或者直接使用 chatId。

        let pair;
        let qqGroupId = '';

        if (msg.platform === 'telegram') {
            pair = forwardMap.findByTG(chatId, threadId, true);
            if (!pair) {
                await this.context.replyTG(chatId, '❌ 当前聊天未绑定任何 QQ 群', threadId);
                return;
            }
            qqGroupId = pair.qqRoomId.toString();
        } else {
            // QQ 端直接使用当前群号
            qqGroupId = chatId.toString();
        }

        switch (commandName) {
            case 'poke':
                await this.handlePoke(chatId, threadId, qqGroupId, args, msg);
                break;
            case 'nick':
                await this.handleNick(chatId, threadId, qqGroupId, args, msg);
                break;
            case 'mute':
                await this.handleMute(chatId, threadId, qqGroupId, args, msg);
                break;
        }
    }

    /**
     * 尝试解析目标 QQ 号
     * 1. 从参数获取 (args[0] 是数字)
     * 2. 从引用回复获取 (TG: 回复的消息是 QQ 转发消息; QQ: 回复的消息发送者)
     */
    private async resolveTargetUin(chatId: string, args: string[], msg: UnifiedMessage): Promise<string | undefined> {
        // 1. 优先尝试从第一个参数获取 (如果是纯数字)
        if (args.length > 0 && /^\d+$/.test(args[0])) {
            return args[0];
        }

        // 2. 尝试从回复消息解析
        if (msg.platform === 'telegram') {
            const rawMsg = (msg.metadata as any)?.raw;
            const replyTo = rawMsg?.replyToMessage;

            if (replyTo) {
                // 尝试查找数据库映射
                try {
                    let mapping = await db.message.findFirst({
                        where: {
                            tgMsgId: replyTo.id,
                            tgChatId: BigInt(chatId)
                        }
                    });

                    if (mapping && mapping.qqSenderId) {
                        return mapping.qqSenderId.toString();
                    }
                } catch (e) {
                    logger.warn('Failed to resolve QQ ID from DB:', e);
                }
            }
        } else {
            // QQ 端: 检查 content 中的 reply 节点
            const replyNode = msg.content.find(c => c.type === 'reply');
            if (replyNode && replyNode.data.messageId) {
                // 获取被回复的消息详情以拿到 sender
                try {
                    const repliedMsg = await this.context.qqClient.getMessage(replyNode.data.messageId);
                    if (repliedMsg) {
                        return repliedMsg.sender.id;
                    }
                } catch (e) {
                    logger.warn('Failed to get replied message info:', e);
                }
            }
        }

        return undefined;
    }

    /**
     * 处理戳一戳命令
     */
    private async handlePoke(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[], msg: UnifiedMessage) {
        // 尝试解析目标 QQ
        // 如果是 QQ 端执行，resolveTargetUin 需要适配 QQ 的 reply 结构
        const targetUin = await this.resolveTargetUin(chatId, args, msg);

        if (!targetUin) {
            await this.context.reply(msg, '❌ 请指定目标QQ号: /poke <QQ号> 或直接回复转发消息');
            return;
        }

        try {
            const success = await this.context.qqClient.sendGroupPoke(qqGroupId, targetUin);
            if (success) {
                // 成功反馈
                if (msg.platform === 'telegram') {
                    await this.context.reply(msg, `👉 已戳一戳 QQ 用户 ${targetUin}`);
                } else {
                    // QQ 端可以不回复，或者回复一下
                    // await this.context.reply(msg, `👉 戳了你一下`);
                }
            } else {
                await this.context.reply(msg, '⚠️ 发送戳一戳可能有误 (NapCat 兼容性)');
            }
        } catch (error) {
            logger.error('Failed to send poke:', error);
            await this.context.reply(msg, '❌ 发送戳一戳失败');
        }
    }

    /**
     * 处理昵称命令
     */
    private async handleNick(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[], msg: UnifiedMessage) {
        try {
            let targetUin = await this.resolveTargetUin(chatId, args, msg);
            let newCard = '';

            // 如果 args[0] 是数字且被 resolveTargetUin 识别为目标 QQ，则剩余参数为昵称
            if (targetUin && args.length > 0 && args[0] === targetUin) {
                newCard = args.slice(1).join(' ');
            } else if (targetUin) {
                // 如果是从回复中解析出的 targetUin，所有 args 都是昵称
                newCard = args.join(' ');
            } else {
                // 没有解析出目标，默认为 Bot 自身
                targetUin = this.context.qqClient.uin.toString();
                newCard = args.join(' ');
            }

            if (!newCard) {
                // 获取当前昵称 (查询 targetUin)
                const memberInfo = await this.context.qqClient.getGroupMemberInfo(qqGroupId, targetUin);
                const card = memberInfo?.card || memberInfo?.nickname || '未设置';
                const targetName = targetUin === this.context.qqClient.uin.toString() ? '当前' : `QQ:${targetUin}`;

                await this.context.replyTG(
                    chatId,
                    `📝 ${targetName} 群名片: \`${card}\`\n\n使用 \`/nick 新名片\` 修改`,
                    threadId
                );
            } else {
                // 设置新昵称
                const success = await this.context.qqClient.setGroupCard(qqGroupId, targetUin, newCard);

                if (success) {
                    await this.context.replyTG(chatId, `✅ 已修改 QQ:${targetUin} 群名片为: ${newCard}`, threadId);
                } else {
                    await this.context.replyTG(chatId, '❌ 修改群名片失败 (权限不足或API错误)', threadId);
                }
            }
        } catch (error) {
            logger.error('Failed to handle nick command:', error);
            await this.context.replyTG(chatId, '❌ 获取/设置群名片失败', threadId);
        }
    }

    /**
     * 处理禁言命令
     */
    private async handleMute(chatId: string, threadId: number | undefined, qqGroupId: string, args: string[], msg: UnifiedMessage) {
        let duration = 600; // 默认10分钟
        let isTgMute = false;
        let tgUserId: string | undefined;
        let targetUin: string | undefined;

        // 尝试解析参数中的时间
        // 如果 args[0] 是 QQ 号，args[1] 是时间
        // 如果回复了消息，args[0] 是时间

        const possibleResult = await this.resolveTargetUin(chatId, args, msg);
        if (possibleResult) {
            targetUin = possibleResult;
            // 如果 args[0] 就是 targetUin，说明是显式指定的，时间在 args[1]
            if (args.length >= 2 && args[0] === targetUin) {
                duration = parseInt(args[1]);
            } else if (args.length > 0 && args[0] !== targetUin) {
                // 隐式指定的（回复）， args[0] 是时间
                duration = parseInt(args[0]);
            }
        } else {
            // 解析不到 QQ，检查是否回复了真的 TG 用户
            const rawMsg = (msg.metadata as any)?.raw;
            const replyTo = rawMsg?.replyToMessage;
            if (replyTo) {
                const selfId = String(this.context.tgBot.me?.id || 0);
                const replySenderId = String(replyTo.sender?.id || 0);
                if (replySenderId !== selfId) {
                    isTgMute = true;
                    tgUserId = replySenderId;
                    if (args.length > 0) duration = parseInt(args[0]);
                }
            }
        }

        if (!targetUin && !isTgMute) {
            await this.context.replyTG(
                chatId,
                `用法:\n1. 回复消息: /mute [秒数]\n2. 指定QQ: /mute <QQ号> <秒数>`,
                threadId
            );
            return;
        }

        if (isNaN(duration) || duration < 0) {
            await this.context.replyTG(chatId, '❌ 时长必须是非负整数', threadId);
            return;
        }

        // 执行禁言
        if (isTgMute && tgUserId) {
            // TG 禁言
            try {
                // untilDate is unix timestamp in seconds
                const untilDate = Math.floor(Date.now() / 1000) + duration;
                await this.context.tgBot.client.restrictChatMember({
                    chatId: Number(chatId),
                    userId: Number(tgUserId),
                    until: untilDate,
                    restrictions: {
                        sendMessages: true,
                        sendMedia: true,
                        sendStickers: true,
                        sendGifs: true,
                        sendGames: true,
                        sendInline: true,
                        embedLinks: true,
                        sendPolls: true,
                        changeInfo: true,
                        inviteUsers: true,
                        pinMessages: true
                    }
                });
                await this.context.replyTG(chatId, `🚫 已禁言 TG 用户 ${tgUserId} ${duration}秒`, threadId);
            } catch (e) {
                logger.error('Failed to mute TG user:', e);
                await this.context.replyTG(chatId, '❌ TG 禁言失败 (权限不足?)', threadId);
            }
        } else if (targetUin) {
            // QQ 禁言
            const success = await this.context.qqClient.setGroupBan(qqGroupId, targetUin, duration);
            if (success) {
                await this.context.replyTG(chatId, `🚫 已禁言 QQ 用户 ${targetUin} ${duration}秒`, threadId);
            } else {
                await this.context.replyTG(chatId, '❌ QQ 禁言失败 (非管理员?)', threadId);
            }
        }
    }
}
