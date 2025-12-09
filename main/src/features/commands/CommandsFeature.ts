import { getLogger } from '../../shared/logger';
import type { IQQClient } from '../../infrastructure/clients/qq';
import type { UnifiedMessage } from '../../domain/message';
import type Telegram from '../../infrastructure/clients/telegram/client';
import { Message } from '@mtcute/core';
import type Instance from '../../domain/models/Instance';
import ForwardMap from '../../domain/models/ForwardMap';
import env from '../../domain/models/env';
import db from '../../domain/models/db';
import { CommandRegistry, type Command } from './services/CommandRegistry';
import { PermissionChecker } from './services/PermissionChecker';
import { InteractiveStateManager } from './services/InteractiveStateManager';
import { ThreadIdExtractor } from './services/ThreadIdExtractor';
import { CommandContext } from './handlers/CommandContext';
import { HelpCommandHandler } from './handlers/HelpCommandHandler';
import { StatusCommandHandler } from './handlers/StatusCommandHandler';
import { BindCommandHandler } from './handlers/BindCommandHandler';
import { UnbindCommandHandler } from './handlers/UnbindCommandHandler';
import { RecallCommandHandler } from './handlers/RecallCommandHandler';
import { ForwardControlCommandHandler } from './handlers/ForwardControlCommandHandler';
import { InfoCommandHandler } from './handlers/InfoCommandHandler';
import { ExtendedRecallCommandHandler } from './handlers/ExtendedRecallCommandHandler';
import { QQInteractionCommandHandler } from './handlers/QQInteractionCommandHandler';
import { RefreshCommandHandler } from './handlers/RefreshCommandHandler';
import { FlagsCommandHandler } from './handlers/FlagsCommandHandler';
import { QuotLyCommandHandler } from './handlers/QuotLyCommandHandler';

const logger = getLogger('CommandsFeature');

/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>;
export type { Command } from './services/CommandRegistry';

/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export class CommandsFeature {
    private readonly registry: CommandRegistry;
    private readonly permissionChecker: PermissionChecker;
    private readonly stateManager: InteractiveStateManager;
    private readonly commandContext: CommandContext;

    // Command handlers
    private readonly helpHandler: HelpCommandHandler;
    private readonly statusHandler: StatusCommandHandler;
    private readonly bindHandler: BindCommandHandler;
    private readonly unbindHandler: UnbindCommandHandler;
    private readonly recallHandler: RecallCommandHandler;
    private readonly forwardControlHandler: ForwardControlCommandHandler;
    private readonly infoHandler: InfoCommandHandler;
    private readonly extendedRecallHandler: ExtendedRecallCommandHandler;
    private readonly qqInteractionHandler: QQInteractionCommandHandler;
    private readonly refreshHandler: RefreshCommandHandler;
    private readonly flagsHandler: FlagsCommandHandler;
    private readonly quotlyHandler: QuotLyCommandHandler;

    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
    ) {
        this.registry = new CommandRegistry();
        this.permissionChecker = new PermissionChecker(instance);
        this.stateManager = new InteractiveStateManager();

        // Create command context
        this.commandContext = new CommandContext(
            instance,
            tgBot,
            qqClient,
            this.registry,
            this.permissionChecker,
            this.stateManager,
            this.replyTG.bind(this),
            this.extractThreadId.bind(this)
        );

        // Initialize handlers
        this.helpHandler = new HelpCommandHandler(this.commandContext);
        this.statusHandler = new StatusCommandHandler(this.commandContext);
        this.bindHandler = new BindCommandHandler(this.commandContext);
        this.unbindHandler = new UnbindCommandHandler(this.commandContext);
        this.recallHandler = new RecallCommandHandler(this.commandContext);
        this.forwardControlHandler = new ForwardControlCommandHandler(this.commandContext);
        this.infoHandler = new InfoCommandHandler(this.commandContext);
        this.extendedRecallHandler = new ExtendedRecallCommandHandler(this.commandContext);
        this.qqInteractionHandler = new QQInteractionCommandHandler(this.commandContext);
        this.refreshHandler = new RefreshCommandHandler(this.commandContext);
        this.flagsHandler = new FlagsCommandHandler(this.commandContext);
        this.quotlyHandler = new QuotLyCommandHandler(this.commandContext);

        this.registerDefaultCommands();
        this.setupListeners();
        logger.info('CommandsFeature initialized');
    }

    /**
     * 注册默认命令
     */
    private registerDefaultCommands() {
        // TODO: 旧版 constants/commands.ts 中有更细分的指令清单（preSetup/group/private 等），后续可按需合并： 
        // setup/login/flags/alive/add/addfriend/addgroup/refresh_all/newinstance/info/q/rm/rmt/rmq/forwardoff/forwardon/disable_qq_forward/enable_qq_forward/disable_tg_forward/enable_tg_forward/refresh/poke/nick/mute 等。

        // 帮助命令
        this.registerCommand({
            name: 'help',
            aliases: ['h', '帮助'],
            description: '显示帮助信息',
            handler: (msg, args) => this.helpHandler.execute(msg, args),
        });

        // 状态命令
        this.registerCommand({
            name: 'status',
            aliases: ['状态'],
            description: '显示机器人状态',
            handler: (msg, args) => this.statusHandler.execute(msg, args),
        });

        // 绑定命令
        this.registerCommand({
            name: 'bind',
            aliases: ['绑定'],
            description: '绑定指定 QQ 群到当前 TG 聊天',
            usage: '/bind <qq_group_id> [thread_id]',
            handler: (msg, args) => this.bindHandler.execute(msg, args),
            adminOnly: true,
        });

        // 解绑命令
        this.registerCommand({
            name: 'unbind',
            aliases: ['解绑'],
            description: '解绑当前 TG 聊天关联的 QQ 群',
            usage: '/unbind [qq_group_id] [thread_id]',
            handler: (msg, args) => this.unbindHandler.execute(msg, args),
            adminOnly: true,
        });

        // 撤回命令
        this.registerCommand({
            name: 'rm',
            aliases: ['撤回'],
            description: '撤回指定消息（回复触发），默认撤回自己，管理员可撤回所有',
            usage: '/rm (请回复要撤回的消息)',
            handler: (msg, args) => this.recallHandler.execute(msg, args),
            adminOnly: false,
        });

        // 扩展撤回命令
        this.registerCommand({
            name: 'rmt',
            description: '仅在 Telegram 端撤回消息',
            usage: '/rmt (请回复要撤回的消息)',
            handler: (msg, args) => this.extendedRecallHandler.execute(msg, args, 'rmt'),
            adminOnly: false,
        });

        this.registerCommand({
            name: 'rmq',
            description: '仅在 QQ 端撤回消息',
            usage: '/rmq (请回复要撤回的消息)',
            handler: (msg, args) => this.extendedRecallHandler.execute(msg, args, 'rmq'),
            adminOnly: false,
        });

        // 转发控制命令
        this.registerCommand({
            name: 'forwardoff',
            description: '暂停双向转发',
            handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardoff'),
            adminOnly: true,
        });

        this.registerCommand({
            name: 'forwardon',
            description: '恢复双向转发',
            handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardon'),
            adminOnly: true,
        });

        this.registerCommand({
            name: 'disable_qq_forward',
            description: '停止 QQ → TG 的转发',
            handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_qq_forward'),
            adminOnly: true,
        });

        this.registerCommand({
            name: 'enable_qq_forward',
            description: '恢复 QQ → TG 的转发',
            handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_qq_forward'),
            adminOnly: true,
        });

        this.registerCommand({
            name: 'disable_tg_forward',
            description: '停止 TG → QQ 的转发',
            handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_tg_forward'),
            adminOnly: true,
        });

        this.registerCommand({
            name: 'enable_tg_forward',
            description: '恢复 TG → QQ 的转发',
            handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_tg_forward'),
            adminOnly: true,
        });

        // Info 命令
        this.registerCommand({
            name: 'info',
            aliases: ['信息'],
            description: '查看本群或选定消息的详情',
            handler: (msg, args) => this.infoHandler.execute(msg, args),
        });

        // QQ 交互命令
        this.registerCommand({
            name: 'poke',
            aliases: ['戳一戳'],
            description: '戳一戳（需要 NapCat API 支持）',
            handler: (msg, args) => this.qqInteractionHandler.execute(msg, args, 'poke'),
        });

        this.registerCommand({
            name: 'nick',
            aliases: ['群名片'],
            description: '获取/设置 QQ 群名片',
            usage: '/nick [新名片]',
            handler: (msg, args) => this.qqInteractionHandler.execute(msg, args, 'nick'),
        });

        this.registerCommand({
            name: 'mute',
            aliases: ['禁言'],
            description: '禁言 QQ 群成员',
            usage: '/mute <QQ号> <秒数>',
            handler: (msg, args) => this.qqInteractionHandler.execute(msg, args, 'mute'),
            adminOnly: true,
        });

        // 刷新命令
        this.registerCommand({
            name: 'refresh',
            aliases: ['刷新'],
            description: '刷新当前群组的头像和简介',
            handler: (msg, args) => this.refreshHandler.execute(msg, args, 'refresh'),
            adminOnly: true,
        });

        this.registerCommand({
            name: 'refresh_all',
            description: '刷新所有群组的头像和简介',
            handler: (msg, args) => this.refreshHandler.execute(msg, args, 'refresh_all'),
            adminOnly: true,
        });

        // Flags 命令
        this.registerCommand({
            name: 'flags',
            description: '管理实验性功能标志',
            usage: '/flags [list|enable|disable] [flag_name]',
            handler: (msg, args) => this.flagsHandler.execute(msg, args),
            adminOnly: true,
        });

        // QuotLy 命令
        this.registerCommand({
            name: 'q',
            description: '生成 QuotLy 引用图片（开发中）',
            usage: '/q (请回复要引用的消息)',
            handler: (msg, args) => this.quotlyHandler.execute(msg, args),
        });

        logger.debug(`Registered ${this.registry.getUniqueCommandCount()} commands (${this.registry.getAll().size} including aliases)`);
    }

    /**
     * 注册命令
     */
    registerCommand(command: Command) {
        this.registry.register(command);
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
            const text = tgMsg.text;
            const chatId = tgMsg.chat.id;
            const senderId = tgMsg.sender.id;
            const myUsername = this.tgBot.me?.username?.toLowerCase();
            const myId = this.tgBot.me?.id;

            // 记录所有到达的 TG 文本，方便排查是否收不到事件
            logger.debug('[Commands] TG message', {
                id: tgMsg.id,
                chatId,
                senderId,
                text: (text || '').slice(0, 200),
            });

            // 忽略由 Bot 发送的消息（包含自身），避免被其他转发 Bot 再次触发命令导致重复回复
            const senderPeer = tgMsg.sender as any;
            if (senderPeer?.isBot || (myId !== undefined && senderId === myId)) {
                logger.debug(`Ignored bot/self message for command handling: ${senderId}`);
                return false;
            }

            // 检查是否有正在进行的绑定操作
            const bindingState = this.stateManager.getBindingState(String(chatId), String(senderId));

            // 如果有等待输入的绑定状态，且消息不是命令（防止命令嵌套）
            if (bindingState && text && !text.startsWith(this.registry.prefix)) {
                // 检查是否超时
                if (this.stateManager.isTimeout(bindingState)) {
                    this.stateManager.deleteBindingState(String(chatId), String(senderId));
                    await this.replyTG(chatId, '绑定操作已超时，请重新开始', bindingState.threadId);
                    return true; // 即使超时也视为已处理（防止误触其他逻辑）
                }

                // 尝试解析 QQ 群号
                if (/^-?\d+$/.test(text.trim())) {
                    const qqGroupId = text.trim();
                    const threadId = bindingState.threadId;

                    // 执行绑定逻辑
                    const forwardMap = this.instance.forwardPairs as ForwardMap;

                    // 检查冲突
                    const tgOccupied = forwardMap.findByTG(chatId, threadId, false);
                    if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
                        await this.replyTG(chatId, `绑定失败：该 TG 话题已绑定到其他 QQ 群 (${tgOccupied.qqRoomId})`, threadId);
                        this.stateManager.deleteBindingState(String(chatId), String(senderId));
                        return true;
                    }

                    try {
                        const rec = await forwardMap.add(qqGroupId, chatId, threadId);
                        if (rec && rec.qqRoomId.toString() !== qqGroupId) {
                            await this.replyTG(chatId, '绑定失败：检测到冲突，请检查现有绑定', threadId);
                        } else {
                            const threadInfo = threadId ? ` (话题 ${threadId})` : '';
                            await this.replyTG(chatId, `绑定成功：QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`, threadId);
                            logger.info(`Interactive Bind: QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`);
                        }
                    } catch (e) {
                        logger.error('Interactive bind failed:', e);
                        await this.replyTG(chatId, '绑定过程中发生错误', threadId);
                    }

                    this.stateManager.deleteBindingState(String(chatId), String(senderId));
                    return true;
                } else {
                    // 输入非数字，视为取消
                    await this.replyTG(chatId, '输入格式错误或已取消绑定操作', bindingState.threadId);
                    this.stateManager.deleteBindingState(String(chatId), String(senderId));
                    return true;
                }
            }

            if (!text || !text.startsWith(this.registry.prefix)) return false;
            if (!chatId) return false;

            const senderName = tgMsg.sender.displayName || `${senderId}`;
            const parts = text.slice(this.registry.prefix.length).split(/\s+/);

            // 如果命令里显式 @ 了其他 bot，则忽略，避免多个 bot 同时回复
            const mentionedBots = this.extractMentionedBotUsernames(tgMsg, parts);
            if (mentionedBots.size > 0) {
                if (!myUsername) {
                    logger.debug('Bot username unavailable, skip explicitly-targeted command');
                    return false;
                }
                if (!mentionedBots.has(myUsername)) {
                    logger.debug(`Ignored command for other bot(s): ${Array.from(mentionedBots).join(',')}`);
                    return false;
                }
            }

            // 兼容 /cmd@bot 的写法，以及 /cmd @bot (空格分隔) 的写法
            let commandName = parts[0];
            let shiftArgs = 0;

            // Scenario 1: /cmd@bot
            if (commandName.includes('@')) {
                const [cmd, targetBot] = commandName.split('@');

                // 如果指定了 bot 但不是我，则忽略该命令
                if (targetBot && myUsername && targetBot.toLowerCase() !== myUsername) {
                    logger.debug(`Ignored command for other bot (suffix): ${targetBot}`);
                    return false;
                }
                commandName = cmd;
            }
            // Scenario 2: /cmd ... @bot (check ALL arguments for @mentions)
            else {
                // Find any @mention in the arguments (skip parts[0] which is the command)
                const botMentionIndex = parts.findIndex((part, idx) => idx > 0 && part.startsWith('@'));

                if (botMentionIndex > 0) {
                    const targetBot = parts[botMentionIndex].slice(1);

                    if (myUsername && targetBot.toLowerCase() !== myUsername) {
                        // Addressed to another bot, ignore this command
                        logger.debug(`Ignored command for other bot at position ${botMentionIndex}: ${targetBot}`);
                        return false;
                    } else if (myUsername && targetBot.toLowerCase() === myUsername) {
                        // Addressed to me explicitly, remove the @mention from args
                        parts.splice(botMentionIndex, 1);
                    }
                }
            }

            commandName = commandName.toLowerCase();
            const args = parts.slice(1 + shiftArgs);

            const command = this.registry.get(commandName);
            if (!command) {
                logger.debug(`Unknown command: ${commandName}`);
                return false;
            }

            if (command.adminOnly && !this.permissionChecker.isAdmin(String(senderId))) {
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
            if (!text || !text.startsWith(this.registry.prefix)) return;

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
            const parts = text.slice(this.registry.prefix.length).split(/\s+/);
            const commandName = parts[0].toLowerCase();
            const args = parts.slice(1);

            const command = this.registry.get(commandName);
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



    private extractThreadId(msg: UnifiedMessage, args: string[]) {
        // 1. 优先从命令参数获取（显式指定）
        const arg = args[1];
        if (arg && /^\d+$/.test(arg)) {
            logger.info(`[extractThreadId] From arg: ${arg}`);
            return Number(arg);
        }

        // 2. 使用 ThreadIdExtractor 从消息元数据中提取
        const raw = (msg.metadata as any)?.raw;
        if (raw) {
            const threadId = new ThreadIdExtractor().extractFromRaw(raw);
            logger.info(`[extractThreadId] From raw: ${threadId}, raw keys: ${Object.keys(raw).join(',')}`);
            if (threadId) return threadId;
        }

        // 3. 回退：无 thread
        logger.info(`[extractThreadId] No thread ID found`);
        return undefined;
    }

    private async replyTG(chatId: string | number, text: string, threadId?: number) {
        try {
            const chat = await this.tgBot.getChat(Number(chatId));
            const params: any = { linkPreview: { disable: true } };
            if (threadId) {
                params.replyTo = threadId;
                params.messageThreadId = threadId;
            }
            await chat.sendMessage(text, params);
        } catch (error) {
            logger.warn(`Failed to send reply to ${chatId}: ${error}`);
        }
    }

    /**
     * 提取消息中显式 @ 的 Bot 名称（只识别以 bot 结尾的用户名）
     */
    private extractMentionedBotUsernames(tgMsg: Message, parts: string[]): Set<string> {
        const mentioned = new Set<string>();
        const tryAdd = (raw?: string) => {
            if (!raw) return;
            const normalized = raw.trim().toLowerCase();
            if (normalized.endsWith('bot')) {
                mentioned.add(normalized);
            }
        };

        // 1) 文本拆分片段
        for (const part of parts) {
            if (!part) continue;
            if (part.startsWith('@')) {
                tryAdd(part.slice(1));
            } else if (part.includes('@')) {
                const [, bot] = part.split('@');
                tryAdd(bot);
            }
        }

        // 2) Telegram entities（更准确地获取 bot_command/mention）
        for (const entity of tgMsg.entities || []) {
            if (entity.kind === 'mention' || entity.kind === 'bot_command') {
                const match = entity.text?.match(/@([A-Za-z0-9_]+)/);
                if (match?.[1]) {
                    tryAdd(match[1]);
                }
            }
        }

        return mentioned;
    }

    /**
     * 清理资源
     */
    destroy() {
        this.tgBot.removeNewMessageEventHandler(this.handleTgMessage);
        this.qqClient.off('message', this.handleQqMessage);
        this.registry.clear();
        logger.info('CommandsFeature destroyed');
    }
}
