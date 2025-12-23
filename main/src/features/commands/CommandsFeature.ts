import type { Message } from '@mtcute/core'
import type { UnifiedMessage } from '../../domain/message'
import type ForwardMap from '../../domain/models/ForwardMap'
import type Instance from '../../domain/models/Instance'
import type { IQQClient } from '../../infrastructure/clients/qq'
import type Telegram from '../../infrastructure/clients/telegram/client'
import type { Command } from './services/CommandRegistry'
import { md } from '@mtcute/markdown-parser'
import { messageConverter } from '../../domain/message/converter'
import { getEventPublisher } from '../../plugins/core/event-publisher'
import { getLogger } from '../../shared/logger'
import { AdvancedGroupManagementCommandHandler } from './handlers/AdvancedGroupManagementCommandHandler'
import { BindCommandHandler } from './handlers/BindCommandHandler'
import { CommandContext } from './handlers/CommandContext'
import { FlagsCommandHandler } from './handlers/FlagsCommandHandler'
import { ForwardControlCommandHandler } from './handlers/ForwardControlCommandHandler'
import { GroupManagementCommandHandler } from './handlers/GroupManagementCommandHandler'
import { HelpCommandHandler } from './handlers/HelpCommandHandler'
import { InfoCommandHandler } from './handlers/InfoCommandHandler'
import { QQInteractionCommandHandler } from './handlers/QQInteractionCommandHandler'
import { RecallCommandHandler } from './handlers/RecallCommandHandler'
import { RefreshCommandHandler } from './handlers/RefreshCommandHandler'
import { RequestManagementCommandHandler } from './handlers/RequestManagementCommandHandler'
import { StatusCommandHandler } from './handlers/StatusCommandHandler'
import { UnbindCommandHandler } from './handlers/UnbindCommandHandler'
import { CommandRegistry } from './services/CommandRegistry'
import { InteractiveStateManager } from './services/InteractiveStateManager'
import { PermissionChecker } from './services/PermissionChecker'
import { ThreadIdExtractor } from './services/ThreadIdExtractor'

const logger = getLogger('CommandsFeature')

/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>
export type { Command } from './services/CommandRegistry'

/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export class CommandsFeature {
  private readonly registry: CommandRegistry
  private readonly permissionChecker: PermissionChecker
  private readonly stateManager: InteractiveStateManager
  private readonly commandContext: CommandContext

  // Command handlers
  private readonly helpHandler: HelpCommandHandler
  private readonly statusHandler: StatusCommandHandler
  private readonly bindHandler: BindCommandHandler
  private readonly unbindHandler: UnbindCommandHandler
  private readonly recallHandler: RecallCommandHandler
  private readonly forwardControlHandler: ForwardControlCommandHandler
  private readonly infoHandler: InfoCommandHandler
  private readonly qqInteractionHandler: QQInteractionCommandHandler
  private readonly refreshHandler: RefreshCommandHandler
  private readonly flagsHandler: FlagsCommandHandler
  private readonly groupManagementHandler: GroupManagementCommandHandler
  private readonly advancedGroupManagementHandler: AdvancedGroupManagementCommandHandler
  private readonly requestManagementHandler: RequestManagementCommandHandler

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
  ) {
    this.registry = new CommandRegistry()
    this.permissionChecker = new PermissionChecker(instance)
    this.stateManager = new InteractiveStateManager()

    // Create command context
    this.commandContext = new CommandContext(
      instance,
      tgBot,
      qqClient,
      this.registry,
      this.permissionChecker,
      this.stateManager,
      this.replyTG.bind(this),
      this.extractThreadId.bind(this),
    )

    // Initialize handlers
    this.helpHandler = new HelpCommandHandler(this.commandContext)
    this.statusHandler = new StatusCommandHandler(this.commandContext)
    this.bindHandler = new BindCommandHandler(this.commandContext)
    this.unbindHandler = new UnbindCommandHandler(this.commandContext)
    this.recallHandler = new RecallCommandHandler(this.commandContext)
    this.forwardControlHandler = new ForwardControlCommandHandler(this.commandContext)
    this.infoHandler = new InfoCommandHandler(this.commandContext)
    this.qqInteractionHandler = new QQInteractionCommandHandler(this.commandContext)
    this.refreshHandler = new RefreshCommandHandler(this.commandContext)
    this.flagsHandler = new FlagsCommandHandler(this.commandContext)
    this.groupManagementHandler = new GroupManagementCommandHandler(this.commandContext)
    this.advancedGroupManagementHandler = new AdvancedGroupManagementCommandHandler(this.commandContext)
    this.requestManagementHandler = new RequestManagementCommandHandler(this.commandContext)

    // 异步注册命令（包括从插件加载）
    this.registerDefaultCommands().catch((err) => {
      logger.error('Failed to register default commands:', err)
    })
    this.setupListeners()
    logger.info('CommandsFeature ✓ 初始化完成')
  }

  /**
   * 重新加载命令（用于插件重载后刷新命令处理器）
   */
  async reloadCommands() {
    this.registry.clear()
    await this.registerDefaultCommands()
    logger.info('CommandsFeature commands reloaded')
  }

  /**
   * 注册默认命令
   */
  private async registerDefaultCommands() {
    // === 从插件系统加载命令（双轨并行策略） ===
    const pluginCommands = await this.loadPluginCommands()

    // TODO: 旧版 constants/commands.ts 中有更细分的指令清单（preSetup/group/private 等），后续可按需合并：
    // setup/login/flags/alive/add/addfriend/addgroup/refresh_all/newinstance/info/q/rm/rmt/rmq/forwardoff/forwardon/disable_qq_forward/enable_qq_forward/disable_tg_forward/enable_tg_forward/refresh/poke/nick/mute 等。

    // 帮助命令
    this.registerCommand({
      name: 'help',
      aliases: ['h', '帮助'],
      description: '显示帮助信息',
      handler: (msg, args) => this.helpHandler.execute(msg, args),
    })

    // 状态命令
    this.registerCommand({
      name: 'status',
      aliases: ['状态'],
      description: '显示机器人状态',
      handler: (msg, args) => this.statusHandler.execute(msg, args),
    })

    // 绑定命令
    this.registerCommand({
      name: 'bind',
      aliases: ['绑定'],
      description: '绑定指定 QQ 群到当前 TG 聊天',
      usage: '/bind <qq_group_id> [thread_id]',
      handler: (msg, args) => this.bindHandler.execute(msg, args),
      adminOnly: true,
    })

    // 解绑命令
    this.registerCommand({
      name: 'unbind',
      aliases: ['解绑'],
      description: '解绑当前 TG 聊天关联的 QQ 群',
      usage: '/unbind [qq_group_id] [thread_id]',
      handler: (msg, args) => this.unbindHandler.execute(msg, args),
      adminOnly: true,
    })

    // 撤回命令（支持双向同步和批量撤回）
    this.registerCommand({
      name: 'rm',
      aliases: ['撤回'],
      description: '撤回消息（双向同步）。回复消息撤回单条，或使用 /rm 数字 批量撤回',
      usage: '/rm [数字] 或回复消息使用 /rm',
      handler: (msg, args) => this.recallHandler.execute(msg, args),
      adminOnly: false,
    })

    // 转发控制命令
    this.registerCommand({
      name: 'forwardoff',
      description: '暂停双向转发',
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardoff'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'forwardon',
      description: '恢复双向转发',
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardon'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'disable_qq_forward',
      description: '停止 QQ → TG 的转发',
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_qq_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'enable_qq_forward',
      description: '恢复 QQ → TG 的转发',
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_qq_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'disable_tg_forward',
      description: '停止 TG → QQ 的转发',
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_tg_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'enable_tg_forward',
      description: '恢复 TG → QQ 的转发',
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_tg_forward'),
      adminOnly: true,
    })

    // Info 命令
    this.registerCommand({
      name: 'info',
      aliases: ['信息'],
      description: '查看本群或选定消息的详情',
      handler: (msg, args) => this.infoHandler.execute(msg, args),
    })

    // QQ 交互命令
    // TODO: Remove after plugin-qq-interaction is stable
    if (!pluginCommands.has('poke')) {
      this.registerCommand({
        name: 'poke',
        aliases: ['戳一戳'],
        description: '戳一戳（需要 NapCat API 支持）',
        handler: (msg, args) => this.qqInteractionHandler.execute(msg, args, 'poke'),
      })
    }

    // TODO: Remove after plugin-qq-interaction is stable
    if (!pluginCommands.has('nick')) {
      this.registerCommand({
        name: 'nick',
        aliases: ['群名片'],
        description: '获取/设置 QQ 群名片',
        usage: '/nick [新名片]',
        handler: (msg, args) => this.qqInteractionHandler.execute(msg, args, 'nick'),
      })
    }

    // 群组管理命令（新实现）
    this.registerCommand({
      name: 'ban',
      aliases: ['mute', '禁言'],
      description: '禁言群成员',
      usage: '/ban <QQ号/回复消息> [时长: 1m/30m/1h/1d]',
      handler: (msg, args) => this.groupManagementHandler.execute(msg, args, 'ban'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'unban',
      description: '解除群成员禁言',
      usage: '/unban <QQ号/回复消息>',
      handler: (msg, args) => this.groupManagementHandler.execute(msg, args, 'unban'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'kick',
      description: '踢出群成员',
      usage: '/kick <QQ号/回复消息>',
      handler: (msg, args) => this.groupManagementHandler.execute(msg, args, 'kick'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'card',
      description: '设置群成员名片',
      usage: '/card <QQ号/回复消息> <新名片>',
      handler: (msg, args) => this.groupManagementHandler.execute(msg, args, 'card'),
      adminOnly: true,
    })

    // 刷新命令
    // TODO: Remove after plugin-refresh is stable
    if (!pluginCommands.has('refresh')) {
      this.registerCommand({
        name: 'refresh',
        aliases: ['刷新'],
        description: '刷新当前群组的头像和简介',
        handler: (msg, args) => this.refreshHandler.execute(msg, args, 'refresh'),
        adminOnly: true,
      })
    }

    // TODO: Remove after plugin-refresh is stable
    if (!pluginCommands.has('refresh_all')) {
      this.registerCommand({
        name: 'refresh_all',
        description: '刷新所有群组的头像和简介',
        handler: (msg, args) => this.refreshHandler.execute(msg, args, 'refresh_all'),
        adminOnly: true,
      })
    }

    // Flags 命令
    // TODO: Remove after plugin-flags is stable
    if (!pluginCommands.has('flags')) {
      this.registerCommand({
        name: 'flags',
        description: '管理实验性功能标志',
        usage: '/flags [list|enable|disable] [flag_name]',
        handler: (msg, args) => this.flagsHandler.execute(msg, args),
        adminOnly: true,
      })
    }

    // ============ Phase 2: 高级群组管理命令 ============

    // 全员禁言
    this.registerCommand({
      name: 'muteall',
      aliases: ['全员禁言'],
      description: '开启或关闭全员禁言（仅群主）',
      usage: '/muteall [on|off|开|关]',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, 'muteall'),
      adminOnly: true,
    })

    // 解除全员禁言（独立命令）
    this.registerCommand({
      name: 'unmuteall',
      description: '关闭全员禁言（仅群主）',
      usage: '/unmuteall',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, 'unmuteall'),
      adminOnly: true,
    })

    // 设置管理员
    this.registerCommand({
      name: 'admin',
      description: '设置或取消群管理员（仅群主）',
      usage: '/admin <QQ号> <on|off> 或回复消息 /admin <on|off>',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, 'admin'),
      adminOnly: true,
    })

    // 修改群名
    this.registerCommand({
      name: 'groupname',
      description: '修改群名称',
      usage: '/groupname <新群名>',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, 'groupname'),
      adminOnly: true,
    })

    this.registerCommand({
      name: '改群名',
      description: '修改群名称',
      usage: '/改群名 <新群名>',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, '改群名'),
      adminOnly: true,
    })

    // 设置专属头衔
    this.registerCommand({
      name: 'title',
      description: '设置群成员专属头衔（仅群主）',
      usage: '/title <QQ号> <头衔> 或回复消息 /title <头衔>',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, 'title'),
      adminOnly: true,
    })

    this.registerCommand({
      name: '头衔',
      description: '设置群成员专属头衔（仅群主）',
      usage: '/头衔 <QQ号> <头衔> 或回复消息 /头衔 <头衔>',
      handler: (msg, args) => this.advancedGroupManagementHandler.execute(msg, args, '头衔'),
      adminOnly: true,
    })

    // ============ Phase 3: 请求管理命令 ============

    this.registerCommand({
      name: 'pending',
      aliases: ['待处理'],
      description: '查看待处理的好友/加群申请',
      usage: '/pending [friend|group]',
      handler: (msg, args) => this.requestManagementHandler.execute(msg, args, 'pending'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'approve',
      aliases: ['同意', '通过'],
      description: '批准好友/加群申请',
      usage: '/approve <flag>',
      handler: (msg, args) => this.requestManagementHandler.execute(msg, args, 'approve'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'reject',
      aliases: ['拒绝'],
      description: '拒绝好友/加群申请',
      usage: '/reject <flag> [理由]',
      handler: (msg, args) => this.requestManagementHandler.execute(msg, args, 'reject'),
      adminOnly: true,
    })

    // ============ Phase 3: QQ交互增强 ============
    // Note: like and honor commands are now exclusively provided by plugin-qq-interaction
    // They will only be available when the plugin is enabled

    // ============ Phase 4: 请求统计与批量操作 ============

    this.registerCommand({
      name: 'reqstats',
      aliases: ['请求统计', '统计'],
      description: '查看请求统计数据',
      usage: '/reqstats [today|week|month|all]',
      handler: (msg, args) => this.requestManagementHandler.execute(msg, args, 'reqstats'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'approveall',
      aliases: ['批量批准'],
      description: '批量批准待处理请求',
      usage: '/approveall [friend|group]',
      handler: (msg, args) => this.requestManagementHandler.execute(msg, args, 'approveall'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'rejectall',
      aliases: ['批量拒绝'],
      description: '批量拒绝待处理请求',
      usage: '/rejectall [friend|group] [reason]',
      handler: (msg, args) => this.requestManagementHandler.execute(msg, args, 'rejectall'),
      adminOnly: true,
    })

    logger.debug(`Registered ${this.registry.getUniqueCommandCount()} commands (${this.registry.getAll().size} including aliases)`)
  }

  /**
   * 注册命令
   */
  registerCommand(command: Command) {
    this.registry.register(command)
  }

  /**
   * 从插件系统加载命令
   * @returns 已加载的命令名集合
   */
  private async loadPluginCommands(): Promise<Set<string>> {
    const loadedCommands = new Set<string>()

    try {
      // 动态导入 plugin runtime（避免循环依赖，ESM 兼容）
      const { getGlobalRuntime } = await import('../../plugins/runtime.js')
      const runtime = getGlobalRuntime()

      if (!runtime) {
        logger.debug('Plugin runtime not initialized, skipping plugin command loading')
        return loadedCommands
      }

      const report = runtime.getLastReport()
      const loadedPlugins = report?.loadedPlugins || []

      logger.debug(`Loading commands from ${loadedPlugins.length} plugins`)

      for (const pluginInfo of loadedPlugins) {
        try {
          const context = (pluginInfo as any).context

          if (!context || typeof context.getCommands !== 'function') {
            continue
          }

          const commands = context.getCommands()
          logger.debug(`Plugin ${pluginInfo.id}: found ${commands.size} command(s)`)

          for (const [, config] of commands) {
            // 将插件命令注册到 CommandsFeature
            this.registerCommand({
              name: config.name,
              aliases: config.aliases,
              description: config.description,
              usage: config.usage,
              adminOnly: config.adminOnly,
              handler: async (msg, args) => {
                // 将 UnifiedMessage 转换为 MessageEvent
                const event = this.convertToMessageEvent(msg, (context as any).logger)
                await config.handler(event, args)
              },
            })

            loadedCommands.add(config.name)
            if (config.aliases) {
              config.aliases.forEach(alias => loadedCommands.add(alias))
            }

            logger.debug(`  ✓ Loaded command: /${config.name}${config.aliases ? ` (aliases: ${config.aliases.join(', ')})` : ''} from plugin ${pluginInfo.id}`)
          }
        }
        catch (error) {
          logger.warn(`Failed to load commands from plugin ${pluginInfo.id}:`, error)
        }
      }

      if (loadedCommands.size > 0) {
        logger.info(`✓ Loaded ${loadedCommands.size} command(s) from plugins`)
      }
    }
    catch (error) {
      logger.warn('Failed to load plugin commands:', error)
    }

    return loadedCommands
  }

  /**
   * 将 UnifiedMessage 转换为 MessageEvent（用于插件命令处理）
   */
  private convertToMessageEvent(msg: UnifiedMessage, pluginLogger?: any) {
    // 捕获 commandContext 供闭包使用
    const commandContext = this.commandContext
    const eventLogger = pluginLogger || logger
    const segmentsToText = (segments: any[]): string => {
      if (!Array.isArray(segments))
        return ''
      return segments
        .map((seg) => {
          if (!seg || typeof seg !== 'object')
            return ''
          switch (seg.type) {
            case 'text':
              return String(seg.data?.text ?? '')
            case 'at':
              return seg.data?.userName ? `@${seg.data.userName}` : '@'
            case 'image':
              return '[图片]'
            case 'video':
              return '[视频]'
            case 'audio':
              return '[语音]'
            case 'file':
              return seg.data?.name ? `[文件:${seg.data.name}]` : '[文件]'
            default:
              return ''
          }
        })
        .filter(Boolean)
        .join('')
    }

    const platform = msg.platform === 'telegram' ? 'tg' : 'qq'
    const senderId = msg.sender.id
    const senderUserId = platform === 'tg' ? `tg:u:${senderId}` : `qq:u:${senderId}`

    return {
      eventId: msg.id,
      instanceId: this.instance.id,
      platform,
      channelId: msg.chat.id,
      threadId: commandContext.extractThreadId(msg, []),
      channelType: msg.chat.type as any,
      sender: {
        userId: senderUserId,
        userName: msg.sender.name,
      },
      message: {
        id: msg.id,
        text: msg.content.find(c => c.type === 'text')?.data.text || '',
        segments: msg.content as any[],
        timestamp: msg.timestamp,
      },
      logger: eventLogger,
      raw: {
        ...msg.metadata?.raw,
        rawReply: msg.metadata?.rawReply,
      },
      // 便捷方法（使用 CommandContext 的方法）
      reply: async (content: string | any[]) => {
        const text = typeof content === 'string' ? content : segmentsToText(content)
        if (msg.platform === 'telegram') {
          const chatId = msg.chat.id
          const threadId = commandContext.extractThreadId(msg, [])
          await commandContext.replyTG(chatId, text, threadId)
        }
        else {
          const chatId = msg.chat.id
          await commandContext.replyQQ(chatId, text)
        }
      },
      send: async (content: string | any[]) => {
        // send 与 reply 相同（暂时没有独立的 send API）
        const text = typeof content === 'string' ? content : segmentsToText(content)
        if (msg.platform === 'telegram') {
          const chatId = msg.chat.id
          const threadId = commandContext.extractThreadId(msg, [])
          await commandContext.replyTG(chatId, text, threadId)
        }
        else {
          const chatId = msg.chat.id
          await commandContext.replyQQ(chatId, text)
        }
      },
      recall: async () => {
        // recall 功能暂不实现
        throw new Error('recall() not yet implemented')
      },
      // API 访问
      qq: this.qqClient,
      tg: this.tgBot,
      instance: this.instance,
    }
  }

  /**
   * 设置事件监听器
   */
  private setupListeners() {
    // 监听 TG 侧消息
    logger.info('CommandsFeature listening Telegram messages for commands')
    this.tgBot.addNewMessageEventHandler(this.handleTgMessage)

    // 监听 QQ 侧消息
    logger.info('CommandsFeature listening QQ messages for commands')
    this.qqClient.on('message', this.handleQqMessage)
  }

  /**
   * 对外暴露的处理函数，便于其他模块手动调用
   * 返回 true 表示命令已处理，外部可中断后续逻辑
   */
  public processTgMessage = async (tgMsg: any): Promise<boolean> => {
    return await this.handleTgMessage(tgMsg)
  }

  private handleTgMessage = async (tgMsg: Message): Promise<boolean> => {
    try {
      const text = tgMsg.text
      const chatId = tgMsg.chat.id
      const senderId = tgMsg.sender.id
      const myUsername = this.tgBot.me?.username?.toLowerCase()
      const myId = this.tgBot.me?.id

      // 记录所有到达的 TG 文本，方便排查是否收不到事件
      logger.debug('[Commands] TG message', {
        id: tgMsg.id,
        chatId,
        senderId,
        text: (text || '').slice(0, 200),
      })

      // 忽略由 Bot 发送的消息（包含自身），避免被其他转发 Bot 再次触发命令导致重复回复
      const senderPeer = tgMsg.sender as any
      if (senderPeer?.isBot || (myId !== undefined && senderId === myId)) {
        logger.debug(`Ignored bot/self message for command handling: ${senderId}`)
        return false
      }

      // 检查是否有正在进行的绑定操作
      const bindingState = this.stateManager.getBindingState(String(chatId), String(senderId))

      // 如果有等待输入的绑定状态，且消息不是命令（防止命令嵌套）
      if (bindingState && text && !text.startsWith(this.registry.prefix)) {
        // 检查是否超时
        if (this.stateManager.isTimeout(bindingState)) {
          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          await this.replyTG(chatId, '绑定操作已超时，请重新开始', bindingState.threadId)
          return true // 即使超时也视为已处理（防止误触其他逻辑）
        }

        // 尝试解析 QQ 群号
        if (/^-?\d+$/.test(text.trim())) {
          const qqGroupId = text.trim()
          const threadId = bindingState.threadId

          // 执行绑定逻辑
          const forwardMap = this.instance.forwardPairs as ForwardMap

          // 检查冲突
          const tgOccupied = forwardMap.findByTG(chatId, threadId, false)
          if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
            await this.replyTG(chatId, `绑定失败：该 TG 话题已绑定到其他 QQ 群 (${tgOccupied.qqRoomId})`, threadId)
            this.stateManager.deleteBindingState(String(chatId), String(senderId))
            return true
          }

          try {
            const rec = await forwardMap.add(qqGroupId, chatId, threadId)
            if (rec && rec.qqRoomId.toString() !== qqGroupId) {
              await this.replyTG(chatId, '绑定失败：检测到冲突，请检查现有绑定', threadId)
            }
            else {
              const threadInfo = threadId ? ` (话题 ${threadId})` : ''
              await this.replyTG(chatId, `绑定成功：QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`, threadId)
              logger.info(`Interactive Bind: QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`)
            }
          }
          catch (e) {
            logger.error('Interactive bind failed:', e)
            await this.replyTG(chatId, '绑定过程中发生错误', threadId)
          }

          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          return true
        }
        else {
          // 输入非数字，视为取消
          await this.replyTG(chatId, '输入格式错误或已取消绑定操作', bindingState.threadId)
          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          return true
        }
      }

      if (!text || !text.startsWith(this.registry.prefix))
        return false
      if (!chatId)
        return false

      const senderName = tgMsg.sender.displayName || `${senderId}`
      const parts = text.slice(this.registry.prefix.length).split(/\s+/)

      // 如果命令里显式 @ 了其他 bot，则忽略，避免多个 bot 同时回复
      const mentionedBots = this.extractMentionedBotUsernames(tgMsg, parts)
      if (mentionedBots.size > 0) {
        if (!myUsername) {
          logger.debug('Bot username unavailable, skip explicitly-targeted command')
          return false
        }
        if (!mentionedBots.has(myUsername)) {
          logger.debug(`Ignored command for other bot(s): ${Array.from(mentionedBots).join(',')}`)
          return false
        }
      }

      // 兼容 /cmd@bot 的写法，以及 /cmd @bot (空格分隔) 的写法
      let commandName = parts[0]
      const shiftArgs = 0

      // Scenario 1: /cmd@bot
      if (commandName.includes('@')) {
        const [cmd, targetBot] = commandName.split('@')

        // 如果指定了 bot 但不是我，则忽略该命令
        if (targetBot && myUsername && targetBot.toLowerCase() !== myUsername) {
          logger.debug(`Ignored command for other bot (suffix): ${targetBot}`)
          return false
        }
        commandName = cmd
      }
      // Scenario 2: /cmd ... @bot (check ALL arguments for @mentions)
      else {
        // Find any @mention in the arguments (skip parts[0] which is the command)
        const botMentionIndex = parts.findIndex((part, idx) => idx > 0 && part.startsWith('@'))

        if (botMentionIndex > 0) {
          const targetBot = parts[botMentionIndex].slice(1)

          if (myUsername && targetBot.toLowerCase() !== myUsername) {
            // Addressed to another bot, ignore this command
            logger.debug(`Ignored command for other bot at position ${botMentionIndex}: ${targetBot}`)
            return false
          }
          else if (myUsername && targetBot.toLowerCase() === myUsername) {
            // Addressed to me explicitly, remove the @mention from args
            parts.splice(botMentionIndex, 1)
          }
        }
      }

      commandName = commandName.toLowerCase()
      const args = parts.slice(1 + shiftArgs)

      const command = this.registry.get(commandName)
      if (!command) {
        logger.debug(`Unknown command: ${commandName}`)
        return false
      }

      if (command.adminOnly && !this.permissionChecker.isAdmin(String(senderId))) {
        logger.warn(`Non-admin user ${senderId} tried to use admin command: ${commandName}`)
        await this.replyTG(chatId, '无权限执行该命令')
        return true
      }

      logger.info(`Executing command: ${commandName} by ${senderName}`)

      // 如果有回复但回复对象不完整，尝试获取完整消息
      let replenishedReply: Message | undefined
      const replyToId = ((tgMsg as any).replyTo as any)?.messageId || (tgMsg.replyToMessage as any)?.id

      if (replyToId && (!tgMsg.replyToMessage || !(tgMsg.replyToMessage as any).text)) {
        try {
          const repliedMsg = await this.tgBot.client.getMessages(tgMsg.chat.id, [replyToId])
          if (repliedMsg[0]) {
            replenishedReply = repliedMsg[0]
            logger.debug(`Fetched full replenished replied message for ${tgMsg.id}`)
          }
        }
        catch (e) {
          logger.warn(`Failed to fetch replied message for ${tgMsg.id}:`, e)
        }
      }

      const unifiedMsg = messageConverter.fromTelegram(tgMsg, replenishedReply)
      if (replenishedReply) {
        unifiedMsg.metadata = { ...unifiedMsg.metadata, rawReply: replenishedReply }
        logger.debug(`Added rawReply to metadata for msg ${tgMsg.id}`)
      }

      try {
        const eventPublisher = getEventPublisher()
        const threadId = new ThreadIdExtractor().extractFromRaw((tgMsg as any).raw || tgMsg)
        const channelType = (tgMsg.chat as any)?.type === 'private' ? 'private' : 'group'
        const contentToText = (content: string | any[]) => {
          if (typeof content === 'string')
            return content
          if (!Array.isArray(content))
            return String(content ?? '')
          return content
            .map((seg: any) => {
              if (!seg)
                return ''
              if (typeof seg === 'string')
                return seg
              if (seg.type === 'text')
                return String(seg.data?.text ?? '')
              if (seg.type === 'at')
                return seg.data?.userName ? `@${seg.data.userName}` : '@'
              return ''
            })
            .filter(Boolean)
            .join('')
        }

        eventPublisher.publishMessage({
          instanceId: this.instance.id,
          platform: 'tg',
          channelId: String(tgMsg.chat.id),
          channelType,
          threadId,
          sender: {
            userId: `tg:u:${tgMsg.sender?.id || 0}`,
            userName: tgMsg.sender?.displayName || tgMsg.sender?.username || 'Unknown',
          },
          message: {
            id: String(tgMsg.id),
            text: text || '',
            segments: [{ type: 'text', data: { text: text || '' } }],
            timestamp: tgMsg.date ? (typeof tgMsg.date === 'number' ? tgMsg.date : tgMsg.date.getTime()) : Date.now(),
          },
          raw: tgMsg,
          reply: async (content) => {
            const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
            const textContent = contentToText(content)
            const params: any = { replyTo: tgMsg.id }
            if (threadId)
              params.messageThreadId = threadId
            const sent = await chat.sendMessage(textContent, params)
            return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}` }
          },
          send: async (content) => {
            const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
            const textContent = contentToText(content)
            const params: any = {}
            if (threadId)
              params.messageThreadId = threadId
            const sent = await chat.sendMessage(textContent, params)
            return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}` }
          },
          recall: async () => {
            const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
            await chat.deleteMessages([tgMsg.id])
          },
        })
      }
      catch (error) {
        logger.debug(error, '[Commands] publishMessage (TG command) failed')
      }

      await command.handler(unifiedMsg, args)
      return true
    }
    catch (error) {
      logger.error('Failed to handle command:', error)
      return false
    }
  }

  private handleQqMessage = async (qqMsg: UnifiedMessage): Promise<void> => {
    try {
      // 提取所有文本内容并合并
      const textContents = qqMsg.content.filter(c => c.type === 'text')
      if (textContents.length === 0)
        return

      const text = textContents.map(c => c.data.text || '').join('').trim()
      if (!text || !text.startsWith(this.registry.prefix))
        return

      const chatId = qqMsg.chat.id
      const senderId = qqMsg.sender.id

      logger.info('[Commands] QQ message', {
        id: qqMsg.id,
        chatId,
        senderId,
        text: text.slice(0, 200),
      })

      const senderName = qqMsg.sender.name || `${senderId}`

      // 解析命令
      const parts = text.slice(this.registry.prefix.length).split(/\s+/)
      const commandName = parts[0].toLowerCase()
      const args = parts.slice(1)

      const command = this.registry.get(commandName)
      if (!command) {
        logger.debug(`Unknown QQ command: ${commandName}`)
        return
      }

      // QQ 侧不检查管理员权限（由 handleRecall 内部的 isSelf 检查控制）

      logger.info(`Executing QQ command: ${commandName} by ${senderName}`)

      // 执行命令
      await command.handler(qqMsg, args)

      // 命令执行成功后，尝试撤回命令消息本身
      if (command.name === 'rm') {
        try {
          await this.qqClient.recallMessage(qqMsg.id)
          logger.info(`QQ command message ${qqMsg.id} recalled`)
        }
        catch (e) {
          logger.warn(e, 'Failed to recall QQ command message')
        }
      }
    }
    catch (error) {
      logger.error('Failed to handle QQ command:', error)
    }
  }

  private extractThreadId(msg: UnifiedMessage, args: string[]) {
    // 1. 优先从命令参数获取（显式指定）
    const arg = args[1]
    if (arg && /^\d+$/.test(arg)) {
      logger.info(`[extractThreadId] From arg: ${arg}`)
      return Number(arg)
    }

    // 2. 使用 ThreadIdExtractor 从消息元数据中提取
    const raw = (msg.metadata as any)?.raw
    if (raw) {
      const threadId = new ThreadIdExtractor().extractFromRaw(raw)
      logger.info(`[extractThreadId] From raw: ${threadId}, raw keys: ${Object.keys(raw).join(',')}`)
      if (threadId)
        return threadId
    }

    // 3. 回退：无 thread
    logger.info(`[extractThreadId] No thread ID found`)
    return undefined
  }

  private async replyTG(chatId: string | number, text: any, threadId?: number) {
    try {
      const chat = await this.tgBot.getChat(Number(chatId))
      const params: any = {
        linkPreview: { disable: true },
      }
      if (threadId) {
        params.replyTo = threadId
        params.messageThreadId = threadId
      }

      // 使用 parseMode: 'markdown' 并不稳定，我们直接使用 mtcute 的 md 解析器
      // 能够将包含 markdown 语法的动态字符串解析为 InputText
      let msgContent = text
      if (typeof text === 'string') {
        const parts: any = [text]
        parts.raw = [text]
        msgContent = md(parts as TemplateStringsArray)
      }

      await chat.sendMessage(msgContent, params)
    }
    catch (error) {
      logger.warn(`Failed to send reply to ${chatId}: ${error}`)
    }
  }

  /**
   * 提取消息中显式 @ 的 Bot 名称（只识别以 bot 结尾的用户名）
   */
  private extractMentionedBotUsernames(tgMsg: Message, parts: string[]): Set<string> {
    const mentioned = new Set<string>()
    const tryAdd = (raw?: string) => {
      if (!raw)
        return
      const normalized = raw.trim().toLowerCase()
      if (normalized.endsWith('bot')) {
        mentioned.add(normalized)
      }
    }

    // 1) 文本拆分片段
    for (const part of parts) {
      if (!part)
        continue
      if (part.startsWith('@')) {
        tryAdd(part.slice(1))
      }
      else if (part.includes('@')) {
        const [, bot] = part.split('@')
        tryAdd(bot)
      }
    }

    // 2) Telegram entities（更准确地获取 bot_command/mention）
    for (const entity of tgMsg.entities || []) {
      if (entity.kind === 'mention' || entity.kind === 'bot_command') {
        const match = entity.text?.match(/@(\w+)/)
        if (match?.[1]) {
          tryAdd(match[1])
        }
      }
    }

    return mentioned
  }

  /**
   * 清理资源
   */
  destroy() {
    this.tgBot.removeNewMessageEventHandler(this.handleTgMessage)
    this.qqClient.off('message', this.handleQqMessage)
    this.registry.clear()
    logger.info('CommandsFeature destroyed')
  }
}
