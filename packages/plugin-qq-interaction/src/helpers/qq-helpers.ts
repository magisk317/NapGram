/**
 * QQ 交互 Helper 函数
 * 
 * 提供高级封装，避免插件重复实现逻辑
 */

import type { MessageEvent } from '@napgram/sdk';

export interface QQInteractionResult {
    success: boolean;
    message: string;
    data?: any;
}

/**
 * 解析目标用户
 * 优先从回复消息中提取（支持文本匹配和 RichHeader 链接解析），其次从命令参数解析
 */
export function resolveTargetUser(event: MessageEvent, args: string[]): string | undefined {
    let targetUin: string | undefined;

    // 1. 尝试从回复消息中提取
    const replySegment = event.message.segments.find((c: any) => c.type === 'reply');
    // 优先使用我们手动补全的 rawReply
    const repliedMsg = event.raw?.rawReply || event.raw?.replyToMessage;

    if (repliedMsg || replySegment) {
        // A. 尝试从文本中匹配 QQ: \d+
        const replyText = (repliedMsg as any)?.text || (replySegment as any)?.data?.text || '';

        const match = replyText.match(/\((\d+)\)/); // 放宽匹配，不一定要冒号
        if (match) {
            targetUin = match[1];
        }

        // B. 尝试从 RichHeader 链接中解析
        const entities = (repliedMsg as any)?.entities || [];

        if (!targetUin && entities.length > 0) {
            for (const entity of entities) {
                // 兼容 mtcute 的不同结构
                const type = (entity as any).type || (entity as any).kind;
                const url = (entity as any).url || (entity as any).params?.url;

                if ((type === 'text_link' || type === 'url' || url) && url) {
                    if (url.includes('/richHeader/')) {
                        const parts = url.split('/');
                        const uin = parts.pop()?.split('?')[0];
                        if (uin) {
                            targetUin = uin;
                            break;
                        }
                    }
                }
            }
        }
    }

    // 2. 尝试从命令参数提取
    if (!targetUin && args.length > 0) {
        // 参数可能是 QQ 号
        const arg = args[0];
        if (/^\d+$/.test(arg)) {
            targetUin = arg;
        }
    }

    return targetUin;
}

/**
 * 查找当前聊天绑定的 QQ 群
 */
export function findBoundQQGroup(event: MessageEvent): { qqGroupId?: string; apiKey?: string; error?: string } {
    // 只在 Telegram 端处理
    if (event.platform !== 'tg') {
        return { error: '此命令仅在 Telegram 端使用' };
    }

    // 检查 API 可用性
    if (!event.instance || !event.instance.forwardPairs) {
        return { error: 'Instance API 不可用' };
    }

    // 查找绑定
    const forwardMap = event.instance.forwardPairs;
    const pair = forwardMap.findByTG?.(event.channelId, event.threadId, true);

    if (!pair) {
        const allPairs = forwardMap.getAll?.() || [];
        const pairInfo = allPairs.slice(0, 5).map((p: any) => `[TG:${p.tgChatId}:${p.tgThreadId}]`).join(', ');
        return { error: `❌ 当前聊天未绑定任何 QQ 群 (ID: ${event.channelId}, Topic: ${event.threadId ?? 'none'})\n已加载 ${allPairs.length} 个绑定: ${pairInfo}` };
    }

    return { qqGroupId: pair.qqRoomId.toString(), apiKey: pair.apiKey };
}



/**
 * 戳一戳
 */
export async function sendPoke(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 查找绑定的 QQ 群
    const { qqGroupId, error } = findBoundQQGroup(event);
    if (error) {
        return { success: false, message: error };
    }

    // 解析目标用户
    const targetUin = resolveTargetUser(event, args);
    if (!targetUin) {
        return {
            success: false,
            message: `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户消息：/poke\n• 直接指定：/poke 123456789`
        };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    // 执行戳一戳
    try {
        if (event.qq.sendGroupPoke) {
            await event.qq.sendGroupPoke(qqGroupId!, targetUin);
        } else if (event.qq.callApi) {
            const groupId = Number(qqGroupId);
            const userId = Number(targetUin);

            let lastError: unknown;
            for (const method of ['send_group_poke', 'group_poke']) {
                try {
                    await event.qq.callApi(method, { group_id: groupId, user_id: userId });
                    lastError = undefined;
                    break;
                } catch (error) {
                    lastError = error;
                }
            }

            if (lastError) {
                throw lastError;
            }
        } else {
            return { success: false, message: '❌ 当前QQ客户端不支持戳一戳功能' };
        }

        return {
            success: true,
            message: `👉 已戳一戳 ${targetUin}`
        };
    } catch (error: any) {
        return {
            success: false,
            message: '❌ 发送戳一戳失败'
        };
    }
}

/**
 * 获取/设置群名片
 */
export async function handleNick(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 查找绑定的 QQ 群
    const { qqGroupId, error } = findBoundQQGroup(event);
    if (error) {
        return { success: false, message: error };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    const botUin = event.qq.uin.toString();

    try {
        if (args.length === 0) {
            // 获取当前昵称
            const memberInfo = await event.qq.getGroupMemberInfo?.(qqGroupId!, botUin);
            const card = memberInfo?.card || memberInfo?.nickname || '未设置';
            return {
                success: true,
                message: `📝 当前群名片: \`${card}\`\n\n使用 \`/nick 新名片\` 修改`
            };
        } else {
            // 设置新昵称
            const newCard = args.join(' ');

            if (!event.qq.setGroupCard) {
                return { success: false, message: '❌ 当前QQ客户端不支持修改群名片' };
            }

            await event.qq.setGroupCard(qqGroupId!, botUin, newCard);

            return {
                success: true,
                message: `✅ 已修改群名片为: \`${newCard}\``
            };
        }
    } catch (error: any) {
        return {
            success: false,
            message: '❌ 获取/设置群名片失败'
        };
    }
}

/**
 * 点赞
 */
export async function sendLike(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 只在 Telegram 端处理
    if (event.platform !== 'tg') {
        return { success: false, message: '此命令仅在 Telegram 端使用' };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    // 解析参数：支持 /like QQ号 次数 或 /like 次数 QQ号
    let targetUin: string | undefined;
    let times = 1;

    // 从回复消息中提取
    const hasReply = event.raw?.rawReply || event.raw?.replyToMessage;
    if (hasReply) {
        targetUin = resolveTargetUser(event, []);
        // 第一个参数是次数
        if (args.length > 0 && /^\d+$/.test(args[0])) {
            times = Math.min(Math.max(parseInt(args[0]), 1), 10);
        }
    } else {
        // 从参数中解析
        for (const arg of args) {
            if (/^\d{5,}$/.test(arg)) {
                // 长数字是 QQ 号
                targetUin = arg;
            } else if (/^\d{1,2}$/.test(arg)) {
                // 短数字是次数
                times = Math.min(Math.max(parseInt(arg), 1), 10);
            }
        }
    }

    if (!targetUin) {
        return {
            success: false,
            message: `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/like [次数]\n• 直接指定：/like 123456789 [次数]\n• 参数顺序可互换：/like 10 123456789`
        };
    }

    // 执行点赞
    try {
        if (!event.qq.sendLike) {
            return { success: false, message: '❌ 当前QQ客户端不支持点赞功能' };
        }

        await event.qq.sendLike(targetUin, times);

        return {
            success: true,
            message: `✅ 已给 ${targetUin} 点赞 x${times}`
        };
    } catch (error: any) {
        return {
            success: false,
            message: `❌ 点赞失败：${error.message || error}`
        };
    }
}

/**
 * 群荣誉
 */
export async function getGroupHonor(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 查找绑定的 QQ 群
    const { qqGroupId, apiKey, error } = findBoundQQGroup(event);
    if (error) {
        return { success: false, message: error };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    const type = args[0] || 'all';
    const validTypes = ['talkative', 'performer', 'legend', 'strong_newbie', 'emotion', 'all'];

    if (!validTypes.includes(type)) {
        return {
            success: false,
            message: `❌ 无效的类型：${type}\n\n可用类型：${validTypes.join(', ')}`
        };
    }

    try {
        if (!event.qq.getGroupHonorInfo) {
            return { success: false, message: '❌ 当前QQ客户端不支持查询群荣誉' };
        }

        const honorInfo = await event.qq.getGroupHonorInfo(qqGroupId!, type);

        if (!honorInfo || typeof honorInfo !== 'object') {
            return { success: true, message: `🏆 群荣誉榜单\n\n暂无数据` };
        }

        const baseUrl = process.env.WEB_ENDPOINT || 'https://posts.link';
        // 调试 key
        if (!apiKey) {
            event.logger.warn(`[Honor] No apiKey found for pair. Links will fallback to /richHeader/qq/...`);
        }

        // 如果能获取到 apiKey，则使用主程序的 RichHeader 逻辑
        const getLink = (userId: string | number) => {
            if (apiKey) {
                return `${baseUrl}/richHeader/${apiKey}/${userId}`;
            }
            return `${baseUrl}/richHeader/qq/${userId}`;
        };

        let message = `🏆 **群荣誉榜单**\n\n`;

        // 龙王 (current_talkative)
        if (honorInfo.current_talkative) {
            const user = honorInfo.current_talkative;
            message += `👑 **本周龙王**\n`;
            message += `└ [${user.nickname}](${getLink(user.user_id)}) (${user.description})\n\n`;
        }

        // 龙王列表 (talkative_list)
        if (honorInfo.talkative_list && honorInfo.talkative_list.length > 0) {
            message += `💬 **历史龙王**\n`;
            honorInfo.talkative_list.slice(0, 3).forEach((user: any) => {
                message += `• [${user.nickname}](${getLink(user.user_id)}) - ${user.description}\n`;
            });
            message += `\n`;
        }

        // 表演者 (performer_list - 群聊之火)
        if (honorInfo.performer_list && honorInfo.performer_list.length > 0) {
            message += `🔥 **群聊之火**\n`;
            honorInfo.performer_list.slice(0, 3).forEach((user: any) => {
                message += `• [${user.nickname}](${getLink(user.user_id)}) - ${user.description}\n`;
            });
            message += `\n`;
        }

        // 传奇 (legend_list - 群霸)
        if (honorInfo.legend_list && honorInfo.legend_list.length > 0) {
            message += `💪 **群霸**\n`;
            honorInfo.legend_list.slice(0, 3).forEach((user: any) => {
                message += `• [${user.nickname}](${getLink(user.user_id)}) - ${user.description}\n`;
            });
            message += `\n`;
        }

        // 冒泡新人 (strong_newbie_list)
        if (honorInfo.strong_newbie_list && honorInfo.strong_newbie_list.length > 0) {
            message += `✨ **冒泡新人**\n`;
            honorInfo.strong_newbie_list.slice(0, 3).forEach((user: any) => {
                message += `• [${user.nickname}](${getLink(user.user_id)}) - ${user.description}\n`;
            });
            message += `\n`;
        }

        // 快乐源泉 (emotion_list)
        if (honorInfo.emotion_list && honorInfo.emotion_list.length > 0) {
            message += `😂 **快乐源泉**\n`;
            honorInfo.emotion_list.slice(0, 3).forEach((user: any) => {
                message += `• [${user.nickname}](${getLink(user.user_id)}) - ${user.description}\n`;
            });
            message += `\n`;
        }

        return {
            success: true,
            message,
            data: honorInfo
        };
    } catch (error: any) {
        return {
            success: false,
            message: `❌ 查询群荣誉失败：${error.message || error}`
        };
    }
}
