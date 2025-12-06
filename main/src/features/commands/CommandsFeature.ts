import { getLogger } from '../../shared/logger';
import type { IQQClient } from '../../infrastructure/clients/qq';
import type { UnifiedMessage } from '../../domain/message';
import type Telegram from '../../infrastructure/clients/telegram/client';
import { Message } from '@mtcute/core';
import type Instance from '../../domain/models/Instance';
import ForwardMap from '../../domain/models/ForwardMap';
import env from '../../domain/models/env';
import db from '../../domain/models/db';

const logger = getLogger('CommandsFeature');

/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>;

/**
 * 命令定义
 */
export interface Command {
    name: string;
    aliases?: string[];
    description: string;
    usage?: string;
    handler: CommandHandler;
    adminOnly?: boolean;
}

/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export class CommandsFeature {
    private commands = new Map<string, Command>();
    private readonly commandPrefix = '/';

    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
    ) {
        this.registerDefaultCommands();
        this.setupListeners();
        logger.info('CommandsFeature initialized');
    }

    /**
     * 注册默认命令
     */
    private registerDefaultCommands() {
        // 帮助命令
        this.registerCommand({
            name: 'help',
            aliases: ['h', '帮助'],
            description: '显示帮助信息',
            handler: this.handleHelp,
        });

        // 状态命令
        this.registerCommand({
            name: 'status',
            aliases: ['状态'],
            description: '显示机器人状态',
            handler: this.handleStatus,
        });

        // 绑定命令
        this.registerCommand({
            name: 'bind',
            aliases: ['绑定'],
            description: '绑定指定 QQ 群到当前 TG 聊天',
            usage: '/bind <qq_group_id> [thread_id]',
            handler: this.handleBind,
            adminOnly: true,
        });

        // 解绑命令
        this.registerCommand({
            name: 'unbind',
            aliases: ['解绑'],
            description: '解绑当前 TG 聊天关联的 QQ 群',
            usage: '/unbind [qq_group_id] [thread_id]',
            handler: this.handleUnbind,
            adminOnly: true,
        });

        // 撤回命令
        this.registerCommand({
            name: 'rm',
            aliases: ['撤回'],
            description: '撤回指定消息（回复触发），默认撤回自己，管理员可撤回所有',
            usage: '/rm (请回复要撤回的消息)',
            handler: this.handleRecall,
            adminOnly: false,
        });


        logger.debug(`Registered ${this.getUniqueCommandCount()} commands (${this.commands.size} including aliases)`);
    }

    /**
     * 注册命令
     */
    registerCommand(command: Command) {
        this.commands.set(command.name, command);

        // 注册别名
        if (command.aliases) {
            for (const alias of command.aliases) {
                this.commands.set(alias, command);
            }
        }

        logger.debug(`Registered command: ${command.name}`);
    }

    /**
     * 计算不含别名的命令数量
     */
    private getUniqueCommandCount() {
        return new Set(this.commands.values()).size;
    }

    /**
     * 设置事件监听器
     */
    private setupListeners() {
        // 监听 TG 侧消息
        logger.info('CommandsFeature listening Telegram messages for commands');
        this.tgBot.addNewMessageEventHandler(this.handleTgMessage);

        // 监听 QQ 侧消息
        logger.info('CommandsFeature listening QQ messages for commands');
        this.qqClient.on('message', this.handleQqMessage);
    }

    /**
     * 对外暴露的处理函数，便于其他模块手动调用
     * 返回 true 表示命令已处理，外部可中断后续逻辑
     */
    public processTgMessage = async (tgMsg: any): Promise<boolean> => {
        return await this.handleTgMessage(tgMsg);
    };

    private handleTgMessage = async (tgMsg: Message): Promise<boolean> => {
        try {
            const text = tgMsg.text || '';

            const chatId = tgMsg.chat.id;
            const senderId = tgMsg.sender.id;

            // 记录所有到达的 TG 文本，方便排查是否收不到事件
            logger.info('[Commands] TG message', {
                id: tgMsg.id,
                chatId,
                senderId,
                text: (text || '').slice(0, 200),
            });

            if (!text || !text.startsWith(this.commandPrefix)) return false;
            if (!chatId) return false;

            const senderName = tgMsg.sender.displayName || `${senderId}`;

            // 兼容 /cmd@bot 的写法
            const parts = text.slice(this.commandPrefix.length).split(/\s+/);
            if (parts[0].includes('@')) {
                parts[0] = parts[0].split('@')[0];
            }
            const commandName = parts[0].toLowerCase();
            const args = parts.slice(1);

            const command = this.commands.get(commandName);
            if (!command) {
                logger.debug(`Unknown command: ${commandName}`);
                return false;
            }

            if (command.adminOnly && !this.isAdmin(String(senderId))) {
                logger.warn(`Non-admin user ${senderId} tried to use admin command: ${commandName}`);
                await this.replyTG(chatId, '无权限执行该命令');
                return true;
            }

            logger.info(`Executing command: ${commandName} by ${senderName}`);
            await command.handler({
                id: String(tgMsg.id),
                platform: 'telegram',
                sender: { id: String(senderId), name: senderName },
                chat: { id: String(chatId), type: 'group' },
                content: [{ type: 'text', data: { text } }],
                timestamp: tgMsg.date.getTime(),
                metadata: { raw: tgMsg },
            } as UnifiedMessage, args);
            return true;

        } catch (error) {
            logger.error('Failed to handle command:', error);
            return false;
        }
    };

    private handleQqMessage = async (qqMsg: UnifiedMessage): Promise<void> => {
        try {
            // 提取所有文本内容并合并
            const textContents = qqMsg.content.filter(c => c.type === 'text');
            if (textContents.length === 0) return;

            const text = textContents.map(c => c.data.text || '').join('').trim();
            if (!text || !text.startsWith(this.commandPrefix)) return;

            const chatId = qqMsg.chat.id;
            const senderId = qqMsg.sender.id;

            logger.info('[Commands] QQ message', {
                id: qqMsg.id,
                chatId,
                senderId,
                text: text.slice(0, 200),
            });

            const senderName = qqMsg.sender.name || `${senderId}`;

            // 解析命令
            const parts = text.slice(this.commandPrefix.length).split(/\s+/);
            const commandName = parts[0].toLowerCase();
            const args = parts.slice(1);

            const command = this.commands.get(commandName);
            if (!command) {
                logger.debug(`Unknown QQ command: ${commandName}`);
                return;
            }

            // QQ 侧不检查管理员权限（由 handleRecall 内部的 isSelf 检查控制）

            logger.info(`Executing QQ command: ${commandName} by ${senderName}`);

            // 执行命令
            await command.handler(qqMsg, args);

            // 命令执行成功后，尝试撤回命令消息本身
            if (command.name === 'rm') {
                try {
                    await this.qqClient.recallMessage(qqMsg.id);
                    logger.info(`QQ command message ${qqMsg.id} recalled`);
                } catch (e) {
                    logger.warn(e, 'Failed to recall QQ command message');
                }
            }

        } catch (error) {
            logger.error('Failed to handle QQ command:', error);
        }
    };

    /**
     * 检查是否是管理员
     */
    private isAdmin(userId: string): boolean {
        const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null;
        const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null;
        return userId === String(this.instance.owner)
            || (envAdminQQ && userId === envAdminQQ)
            || (envAdminTG && userId === envAdminTG);
    }

    private extractThreadId(msg: UnifiedMessage, args: string[]) {
        const arg = args[1];
        if (arg && /^\d+$/.test(arg)) return Number(arg);

        const raw = (msg.metadata as any)?.raw as any;
        const replyTo = raw?.replyTo;
        const candidates = [
            replyTo?.replyToTopId,
            replyTo?.replyToMsgId,
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'number') return candidate;
        }

        return undefined;
    }

    /**
     * 撤回命令处理器
     */
    private handleRecall = async (msg: UnifiedMessage, _args: string[]) => {
        const raw = (msg.metadata as any)?.raw as any;

        // Debug: 打印 raw 结构
        logger.debug(`[handleRecall] raw.replyTo structure:`, {
            hasReplyTo: !!raw?.replyTo,
            replyToKeys: raw?.replyTo ? Object.keys(raw.replyTo) : [],
            replyToMsgId: raw?.replyTo?.replyToMsgId,
            replyTo_id: raw?.replyTo?.id,
            replyTo_replyToTopId: raw?.replyTo?.replyToTopId,
        });

        // 尝试多种可能的字段名
        const replyToId = raw?.replyTo?.replyToMsgId
            || raw?.replyTo?.id
            || raw?.replyTo?.replyToTopId
            || raw?.replyToMessage?.id;
        const chatId = msg.chat.id;
        const senderId = msg.sender.id;
        const cmdMsgId = raw?.id || msg.id;

        logger.debug(`[handleRecall] Start: chatId=${chatId}, replyToId=${replyToId}, senderId=${senderId}`);

        if (!replyToId || !chatId) {
            logger.debug(`[handleRecall] Missing replyToId or chatId, sending error`);
            await this.replyTG(chatId, '请回复要撤回的消息再使用 /rm');
            return;
        }

        logger.debug(`[handleRecall] Querying database for tgMsgId=${replyToId}`);
        const record = await db.message.findFirst({
            where: {
                tgChatId: BigInt(chatId),
                tgMsgId: replyToId,
                instanceId: this.instance.id,
            },
        });

        logger.debug(`[handleRecall] Database record:`, record ? {
            id: record.id,
            seq: record.seq,
            tgSenderId: record.tgSenderId
        } : null);

        const isAdmin = this.isAdmin(String(senderId));
        const isSelf = record?.tgSenderId ? String(record.tgSenderId) === String(senderId) : false;

        logger.debug(`[handleRecall] Permission check: isAdmin=${isAdmin}, isSelf=${isSelf}`);

        if (!isAdmin && !isSelf) {
            logger.warn(`[handleRecall] Permission denied for user ${senderId}`);
            await this.replyTG(chatId, '无权限撤回他人消息');
            return;
        }

        // 撤回 TG 消息
        logger.info(`[handleRecall] Attempting to delete TG message ${replyToId}`);
        try {
            const chat = await this.tgBot.getChat(Number(chatId));
            await chat.deleteMessages([replyToId]);
            logger.info(`TG message ${replyToId} deleted by /rm command`);
        } catch (e) {
            logger.warn(e, '撤回 TG 消息失败');
        }

        // 撤回对应的 QQ 消息（如果启用自动撤回）
        if (record?.seq) {
            logger.debug(`[handleRecall] Found QQ seq=${record.seq}, checking ENABLE_AUTO_RECALL`);
            if (!env.ENABLE_AUTO_RECALL) {
                logger.debug('Auto recall disabled, skipping QQ message recall');
            } else {
                logger.info(`[handleRecall] Attempting to recall QQ message seq=${record.seq}`);
                try {
                    await this.qqClient.recallMessage(String(record.seq));
                    logger.info(`QQ message ${record.seq} recalled by /rm command`);
                } catch (e) {
                    logger.warn(e, '撤回 QQ 消息失败');
                }
            }
        } else {
            logger.debug('No QQ message seq found for TG message', { tgMsgId: replyToId });
        }

        // 尝试删除命令消息自身
        if (cmdMsgId) {
            logger.debug(`[handleRecall] Attempting to delete command message ${cmdMsgId}`);
            try {
                const chat = await this.tgBot.getChat(Number(chatId));
                await chat.deleteMessages([Number(cmdMsgId)]);
                logger.debug(`[handleRecall] Command message ${cmdMsgId} deleted`);
            } catch (e) {
                logger.warn(e, '删除命令消息失败');
            }
        }

        logger.debug(`[handleRecall] Complete`);
    };

    /**
     * 帮助命令处理器
     */
    private handleHelp = async (msg: UnifiedMessage, args: string[]) => {
        const commandList: string[] = [];
        const processedCommands = new Set<string>();

        for (const [name, command] of this.commands) {
            // 跳过别名
            if (name !== command.name) continue;
            if (processedCommands.has(command.name)) continue;

            processedCommands.add(command.name);

            let line = `${this.commandPrefix}${command.name}`;
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
            await this.replyTG(msg.chat.id, helpText, this.extractThreadId(msg, []));
        } catch (e) {
            logger.warn('发送帮助信息失败', e);
        }
        logger.info('Help command executed');
    };

    /**
     * 状态命令处理器
     */
    private handleStatus = async (msg: UnifiedMessage, args: string[]) => {
        const isOnline = await this.qqClient.isOnline();
        const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.qqClient.uin}
- 昵称: ${this.qqClient.nickname}
- 客户端类型: ${this.qqClient.clientType}
        `.trim();

        await this.replyTG(msg.chat.id, status);
        logger.info('Status command executed');
    };

    /**
     * 绑定命令处理器
     */
    private handleBind = async (msg: UnifiedMessage, args: string[]) => {
        if (args.length < 1) {
            await this.replyTG(msg.chat.id, '用法：/bind <qq_group_id> [thread_id]');
            return;
        }

        const qqGroupId = args[0];
        if (!/^-?\d+$/.test(qqGroupId)) {
            await this.replyTG(msg.chat.id, 'qq_group_id 必须是数字');
            return;
        }

        const threadId = this.extractThreadId(msg, args);
        const forwardMap = this.instance.forwardPairs as ForwardMap;

        // 如果 TG 话题已被其他 QQ 占用，拒绝绑定
        const tgOccupied = forwardMap.findByTG(msg.chat.id, threadId, false);
        if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
            await this.replyTG(msg.chat.id, '该 TG 话题已绑定到其他 QQ 群');
            return;
        }

        // add 会在已存在该 QQ 时更新 tgThreadId
        const rec = await forwardMap.add(qqGroupId, msg.chat.id, threadId);
        if (rec && rec.qqRoomId.toString() !== qqGroupId) {
            await this.replyTG(msg.chat.id, '绑定失败：检测到冲突，请检查现有绑定');
            return;
        }

        const threadInfo = threadId ? ` (话题 ${threadId})` : '';
        await this.replyTG(msg.chat.id, `绑定成功：QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`, threadId);
        logger.info(`Bind command: QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`);
    };

    /**
     * 解绑命令处理器
     */
    private handleUnbind = async (msg: UnifiedMessage, args: string[]) => {
        const qqGroupId = args[0];
        const chatId = msg.chat.id;
        const forwardMap = this.instance.forwardPairs as ForwardMap;
        const threadId = this.extractThreadId(msg, args);

        const target = qqGroupId && /^-?\d+$/.test(qqGroupId)
            ? forwardMap.findByQQ(qqGroupId)
            : forwardMap.findByTG(chatId, threadId, threadId ? false : true);

        if (!target) {
            await this.replyTG(chatId, '未找到绑定关系');
            return;
        }

        await forwardMap.remove(target.qqRoomId);
        const threadInfo = target.tgThreadId ? ` (话题 ${target.tgThreadId})` : '';
        await this.replyTG(chatId, `已解绑：QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`, threadId || target.tgThreadId || undefined);
        logger.info(`Unbind command: QQ ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`);
    };

    private async replyTG(chatId: string | number, text: string, threadId?: number) {
        try {
            const chat = await this.tgBot.getChat(Number(chatId));
            const params: any = { linkPreview: { disable: true } };
            if (threadId) params.replyTo = threadId;
            await chat.sendMessage(text, params);
        } catch (error) {
            logger.warn('Failed to send reply:', error);
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        this.tgBot.removeNewMessageEventHandler(this.handleTgMessage);
        this.qqClient.off('message', this.handleQqMessage);
        this.commands.clear();
        logger.info('CommandsFeature destroyed');
    }
}
