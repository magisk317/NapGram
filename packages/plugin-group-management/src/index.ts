import type { NapGramPlugin, PluginContext, MessageEvent, QQClientAPI, ReplySegment } from '@napgram/sdk';

const DEFAULT_BAN_DURATION = 30 * 60;
const MAX_BAN_DURATION = 30 * 86400;

const isValidUin = (value: string): boolean => /^\d{5,11}$/.test(value);

const parseDuration = (input: string): number => {
    const match = input.trim().match(/^(\d+)([mhd])$/i);
    if (!match) {
        throw new Error(`无效的时长格式: "${input}"\n支持格式: 1m (分钟), 1h (小时), 1d (天)`);
    }
    const value = Number.parseInt(match[1], 10);
    if (value <= 0) {
        throw new Error('时长必须大于0');
    }
    const unit = match[2].toLowerCase();
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
    throw new Error(`未知的时间单位: ${unit}`);
};

const formatDuration = (seconds: number): string => {
    if (seconds === 0) return '0秒';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分钟`);
    if (secs > 0) parts.push(`${secs}秒`);
    return parts.join('');
};

const extractReplySenderId = (event: MessageEvent): string | null => {
    const raw = event.raw || {};
    const replyMsg = raw.replyToMessage || raw.replyTo || raw.rawReply;
    if (replyMsg) {
        const candidate = replyMsg.senderId || replyMsg.userId || replyMsg.from?.id || replyMsg.sender?.id;
        if (candidate !== undefined && candidate !== null) {
            return String(candidate);
        }
    }
    const segments = Array.isArray(event.message?.segments) ? event.message.segments : [];
    const replySegment = segments.find((seg): seg is ReplySegment => !!seg && seg.type === 'reply');
    const replyData = replySegment?.data;
    if (replyData?.senderId) return String(replyData.senderId);
    if (replyData?.userId) return String(replyData.userId);
    return null;
};

const hasReplyMessage = (event: MessageEvent): boolean => {
    const raw = event.raw || {};
    if (raw.replyToMessage && raw.replyToMessage.id && !raw.replyToMessage.isForumTopic) {
        if (raw.replyToMessage.sender || raw.replyToMessage.chat) return true;
    }
    if (raw.replyTo && raw.replyTo.replyToMsgId) return true;
    if (raw.rawReply) return true;
    const segments = Array.isArray(event.message?.segments) ? event.message.segments : [];
    return segments.some((seg: any) => seg && seg.type === 'reply');
};

const parseAction = (value: string): 'on' | 'off' | 'toggle' => {
    const lower = value.toLowerCase();
    if (lower === 'on' || lower === '开') return 'on';
    if (lower === 'off' || lower === '关') return 'off';
    return 'toggle';
};

const parseUserAction = (args: string[], event: MessageEvent, hasReply: boolean) => {
    let uin: string | null = null;
    let action: 'on' | 'off' | 'toggle' = 'toggle';

    if (hasReply) {
        uin = extractReplySenderId(event);
        if (args.length > 0) action = parseAction(args[0]);
    } else {
        for (const arg of args) {
            const parsedAction = parseAction(arg);
            if (parsedAction !== 'toggle') {
                action = parsedAction;
            } else if (isValidUin(arg)) {
                uin = arg;
            }
        }
    }

    return { uin, action };
};

const parseUserContent = (args: string[], event: MessageEvent, hasReply: boolean) => {
    let uin: string | null = null;
    let contentParts: string[] = [];

    if (hasReply) {
        uin = extractReplySenderId(event);
        contentParts = args;
    } else {
        const uinIndex = args.findIndex(arg => isValidUin(arg));
        if (uinIndex !== -1) {
            uin = args[uinIndex];
            contentParts = [...args.slice(0, uinIndex), ...args.slice(uinIndex + 1)];
        } else {
            contentParts = args;
        }
    }

    return { uin, content: contentParts.join(' ') };
};

const getMemberInfoSafe = async (qqClient: QQClientAPI, groupId: string, userId: string) => {
    try {
        return await qqClient.getGroupMemberInfo?.(groupId, userId);
    } catch {
        return null;
    }
};

const isGroupAdmin = async (qqClient: QQClientAPI, groupId: string, userId: string): Promise<boolean> => {
    const memberInfo = await getMemberInfoSafe(qqClient, groupId, userId);
    if (!memberInfo) return false;
    return memberInfo.role === 'admin' || memberInfo.role === 'owner';
};

const isGroupOwner = async (qqClient: QQClientAPI, groupId: string, userId: string): Promise<boolean> => {
    const memberInfo = await getMemberInfoSafe(qqClient, groupId, userId);
    if (!memberInfo) return false;
    return memberInfo.role === 'owner';
};

const canManageUser = async (qqClient: QQClientAPI, groupId: string, operatorId: string, targetId: string) => {
    const operatorInfo = await getMemberInfoSafe(qqClient, groupId, operatorId);
    const targetInfo = await getMemberInfoSafe(qqClient, groupId, targetId);

    if (!operatorInfo) return { canManage: false, reason: '无法获取操作者信息' };
    if (!targetInfo) return { canManage: false, reason: '目标用户不在群内' };

    const operatorRole = operatorInfo.role;
    const targetRole = targetInfo.role;

    if (operatorRole === 'owner') return { canManage: true };
    if (operatorRole === 'admin' && targetRole === 'member') return { canManage: true };
    if (operatorRole === 'member') return { canManage: false, reason: '权限不足：需要管理员或群主权限' };

    return { canManage: false, reason: '权限不足：无法管理群主或其他管理员' };
};

const plugin: NapGramPlugin = {
    id: 'group-management',
    name: 'Group Management',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Group management commands for QQ groups',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Group management plugin installed');

        const ensureTelegram = (event: MessageEvent): boolean => event.platform === 'tg';

        const resolveBinding = async (event: MessageEvent) => {
            const instance = (event as any).instance;
            const forwardPairs = instance?.forwardPairs;
            if (!forwardPairs || typeof forwardPairs.findByTG !== 'function') {
                await event.reply('❌ 当前实例未提供群管理所需的转发表');
                return null;
            }
            const pair = forwardPairs.findByTG(event.channelId, event.threadId, true);
            if (!pair) {
                await event.reply('❌ 当前聊天未绑定任何 QQ 群');
                return null;
            }
            return { qqGroupId: String(pair.qqRoomId) };
        };

        const ensureTargetUin = (event: MessageEvent, args: string[], argIndex: number) => {
            const replyUin = extractReplySenderId(event);
            if (replyUin) return replyUin;
            const arg = args[argIndex];
            if (arg && /^\d+$/.test(arg)) return arg;
            return null;
        };

        const handleBan = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const targetUin = ensureTargetUin(event, args, 0);
            if (!targetUin) {
                await event.reply(
                    '❌ 无法识别目标用户\n\n请使用以下方式指定用户：\n• 回复目标用户的消息\n• 直接输入QQ号：/ban 123456789 [时长]',
                );
                return;
            }

            let duration = DEFAULT_BAN_DURATION;
            const durationArg = args[1] || args[0];
            if (durationArg && durationArg !== targetUin) {
                try {
                    duration = parseDuration(durationArg);
                    if (duration > MAX_BAN_DURATION) {
                        await event.reply('❌ 禁言时长不能超过30天');
                        return;
                    }
                } catch (error: any) {
                    await event.reply(`❌ ${error.message}`);
                    return;
                }
            }

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const canManage = await canManageUser(qqClient, binding.qqGroupId, botUin, targetUin);
            if (!canManage.canManage) {
                await event.reply(`❌ ${canManage.reason}`);
                return;
            }

            if (!qqClient.banUser) {
                await event.reply('❌ 当前QQ客户端不支持禁言功能');
                return;
            }

            await qqClient.banUser(binding.qqGroupId, targetUin, duration);

            const memberInfo = await getMemberInfoSafe(qqClient, binding.qqGroupId, targetUin);
            const userName = memberInfo?.card || memberInfo?.nickname || targetUin;
            await event.reply(`✅ 已禁言 ${userName}(${targetUin})\n时长：${formatDuration(duration)}`);
        };

        const handleUnban = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const targetUin = ensureTargetUin(event, args, 0);
            if (!targetUin) {
                await event.reply(
                    '❌ 无法识别目标用户\n\n请使用以下方式指定用户：\n• 回复目标用户的消息\n• 直接输入QQ号：/unban 123456789',
                );
                return;
            }

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const canManage = await canManageUser(qqClient, binding.qqGroupId, botUin, targetUin);
            if (!canManage.canManage) {
                await event.reply(`❌ ${canManage.reason}`);
                return;
            }

            if (!qqClient.unbanUser) {
                await event.reply('❌ 当前QQ客户端不支持解禁功能');
                return;
            }

            await qqClient.unbanUser(binding.qqGroupId, targetUin);

            const memberInfo = await getMemberInfoSafe(qqClient, binding.qqGroupId, targetUin);
            const userName = memberInfo?.card || memberInfo?.nickname || targetUin;
            await event.reply(`✅ 已解除 ${userName}(${targetUin}) 的禁言`);
        };

        const handleKick = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const targetUin = ensureTargetUin(event, args, 0);
            if (!targetUin) {
                await event.reply(
                    '❌ 无法识别目标用户\n\n请使用以下方式指定用户：\n• 回复目标用户的消息\n• 直接输入QQ号：/kick 123456789',
                );
                return;
            }

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const canManage = await canManageUser(qqClient, binding.qqGroupId, botUin, targetUin);
            if (!canManage.canManage) {
                await event.reply(`❌ ${canManage.reason}`);
                return;
            }

            if (!qqClient.kickUser) {
                await event.reply('❌ 当前QQ客户端不支持踢人功能');
                return;
            }

            const memberInfo = await getMemberInfoSafe(qqClient, binding.qqGroupId, targetUin);
            const userName = memberInfo?.card || memberInfo?.nickname || targetUin;

            await qqClient.kickUser(binding.qqGroupId, targetUin, false);
            await event.reply(`✅ 已将 ${userName}(${targetUin}) 移出群聊`);
        };

        const handleCard = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const hasReply = hasReplyMessage(event);
            const { uin: targetUin, content: newCard } = parseUserContent(args, event, hasReply);

            if (!targetUin) {
                await event.reply(
                    '❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/card 新名片\n• 直接指定：/card 123456789 新名片\n• 参数可互换：/card 新名片 123456789',
                );
                return;
            }

            if (!newCard || newCard.trim() === '') {
                await event.reply('❌ 请输入新的群名片');
                return;
            }

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const isAdmin = await isGroupAdmin(qqClient, binding.qqGroupId, botUin);
            if (!isAdmin) {
                await event.reply('❌ 权限不足：需要管理员或群主权限');
                return;
            }

            if (!qqClient.setGroupCard) {
                await event.reply('❌ 当前QQ客户端不支持设置群名片功能');
                return;
            }

            await qqClient.setGroupCard(binding.qqGroupId, targetUin, newCard);
            await event.reply(`✅ 已将 ${targetUin} 的群名片设置为：${newCard}`);
        };

        const handleMuteAll = async (event: MessageEvent, args: string[], commandName: string) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const isOwner = await isGroupOwner(qqClient, binding.qqGroupId, botUin);
            if (!isOwner) {
                await event.reply('❌ 权限不足：此操作仅限群主使用');
                return;
            }

            let enable: boolean;
            const action = args[0]?.toLowerCase();
            if (action === 'on' || action === '开') {
                enable = true;
            } else if (action === 'off' || action === '关') {
                enable = false;
            } else {
                enable = commandName !== 'unmuteall';
            }

            if (!qqClient.setGroupWholeBan) {
                await event.reply('❌ 当前QQ客户端不支持全员禁言功能');
                return;
            }

            await qqClient.setGroupWholeBan(binding.qqGroupId, enable);

            if (enable) {
                await event.reply('✅ 已开启全员禁言\n管理员和群主不受影响');
            } else {
                await event.reply('✅ 已关闭全员禁言\n所有成员可正常发言');
            }
        };

        const handleAdmin = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const isOwner = await isGroupOwner(qqClient, binding.qqGroupId, botUin);
            if (!isOwner) {
                await event.reply('❌ 权限不足：此操作仅限群主使用');
                return;
            }

            const hasReply = hasReplyMessage(event);
            const { uin: targetUin, action } = parseUserAction(args, event, hasReply);
            if (!targetUin) {
                await event.reply(
                    '❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/admin [on|off]\n• 直接指定：/admin 123456789 [on|off]\n• 参数可互换：/admin on 123456789\n• 无参数切换状态',
                );
                return;
            }

            if (action === 'toggle') {
                await event.reply('❌ 暂不支持状态切换，请明确指定 on 或 off');
                return;
            }

            if (!qqClient.setGroupAdmin) {
                await event.reply('❌ 当前QQ客户端不支持设置管理员功能');
                return;
            }

            await qqClient.setGroupAdmin(binding.qqGroupId, targetUin, action === 'on');

            const memberInfo = await getMemberInfoSafe(qqClient, binding.qqGroupId, targetUin);
            const userName = memberInfo?.card || memberInfo?.nickname || targetUin;
            if (action === 'on') {
                await event.reply(`✅ 已将 ${userName}(${targetUin}) 设置为管理员`);
            } else {
                await event.reply(`✅ 已取消 ${userName}(${targetUin}) 的管理员身份`);
            }
        };

        const handleGroupName = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const isAdmin = await isGroupAdmin(qqClient, binding.qqGroupId, botUin);
            if (!isAdmin) {
                await event.reply('❌ 权限不足：需要管理员或群主权限');
                return;
            }

            const newGroupName = args.join(' ');
            if (!newGroupName || newGroupName.trim() === '') {
                await event.reply('❌ 请输入新的群名称\n\n使用方式：/groupname 新群名');
                return;
            }

            if (!qqClient.setGroupName) {
                await event.reply('❌ 当前QQ客户端不支持修改群名功能');
                return;
            }

            await qqClient.setGroupName(binding.qqGroupId, newGroupName);
            await event.reply(`✅ 群名称已更新为：${newGroupName}`);
        };

        const handleTitle = async (event: MessageEvent, args: string[]) => {
            const binding = await resolveBinding(event);
            if (!binding) return;

            const qqClient = event.qq as QQClientAPI | undefined;
            if (!qqClient) {
                await event.reply('❌ 当前QQ客户端不可用');
                return;
            }

            const botUin = String(qqClient.uin || '');
            const isOwner = await isGroupOwner(qqClient, binding.qqGroupId, botUin);
            if (!isOwner) {
                await event.reply('❌ 权限不足：此操作仅限群主使用');
                return;
            }

            const hasReply = hasReplyMessage(event);
            const { uin: targetUin, content: title } = parseUserContent(args, event, hasReply);
            if (!targetUin) {
                await event.reply(
                    '❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/title 头衔内容\n• 直接指定：/title 123456789 头衔内容\n• 参数可互换：/title 头衔 123456789',
                );
                return;
            }

            if (!title || title.trim() === '') {
                await event.reply('❌ 请输入头衔内容');
                return;
            }

            if (!qqClient.setGroupSpecialTitle) {
                await event.reply('❌ 当前QQ客户端不支持设置专属头衔功能');
                return;
            }

            await qqClient.setGroupSpecialTitle(binding.qqGroupId, targetUin, title, -1);

            const memberInfo = await getMemberInfoSafe(qqClient, binding.qqGroupId, targetUin);
            const userName = memberInfo?.card || memberInfo?.nickname || targetUin;
            await event.reply(`✅ 已为 ${userName}(${targetUin}) 设置专属头衔：${title}`);
        };

        ctx.command({
            name: 'ban',
            aliases: ['mute', '禁言'],
            description: '禁言群成员',
            usage: '/ban <QQ号/回复消息> [时长: 1m/30m/1h/1d]',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleBan(event, args);
            },
        });

        ctx.command({
            name: 'unban',
            description: '解除群成员禁言',
            usage: '/unban <QQ号/回复消息>',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleUnban(event, args);
            },
        });

        ctx.command({
            name: 'kick',
            description: '踢出群成员',
            usage: '/kick <QQ号/回复消息>',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleKick(event, args);
            },
        });

        ctx.command({
            name: 'card',
            description: '设置群成员名片',
            usage: '/card <QQ号/回复消息> <新名片>',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleCard(event, args);
            },
        });

        ctx.command({
            name: 'muteall',
            aliases: ['全员禁言'],
            description: '开启或关闭全员禁言（仅群主）',
            usage: '/muteall [on|off|开|关]',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleMuteAll(event, args, 'muteall');
            },
        });

        ctx.command({
            name: 'unmuteall',
            description: '关闭全员禁言（仅群主）',
            usage: '/unmuteall',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleMuteAll(event, args, 'unmuteall');
            },
        });

        ctx.command({
            name: 'admin',
            description: '设置或取消群管理员（仅群主）',
            usage: '/admin <QQ号> <on|off> 或回复消息 /admin <on|off>',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleAdmin(event, args);
            },
        });

        ctx.command({
            name: 'groupname',
            aliases: ['改群名'],
            description: '修改群名称',
            usage: '/groupname <新群名>',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleGroupName(event, args);
            },
        });

        ctx.command({
            name: 'title',
            aliases: ['头衔'],
            description: '设置群成员专属头衔（仅群主）',
            usage: '/title <QQ号> <头衔> 或回复消息 /title <头衔>',
            adminOnly: true,
            handler: async (event, args) => {
                if (!ensureTelegram(event)) return;
                await handleTitle(event, args);
            },
        });
    },

    uninstall: async () => {},
};

export default plugin;
