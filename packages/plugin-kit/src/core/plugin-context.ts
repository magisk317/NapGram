/**
 * NapGram 插件上下文实现
 *
 * 为每个插件创建独立的运行上下文
 */

import type { EventBus } from './event-bus'
import type {
  CommandConfig,
  EventSubscription,
  FriendRequestEventHandler,
  GroupAPI,
  GroupRequestEventHandler,
  InstanceAPI,
  InstanceStatusEventHandler,
  MessageAPI,
  MessageEventHandler,
  NoticeEventHandler,
  PluginContext,
  PluginLogger,
  PluginReloadEventHandler,
  PluginStorage,
  UserAPI,
  WebAPI,
} from './interfaces'
import { createPluginLogger } from '../api/logger'
import { createPluginStorage } from '../api/storage'

/**
 * 插件上下文实现
 */
export class PluginContextImpl implements PluginContext {
  readonly pluginId: string
  readonly logger: PluginLogger
  readonly config: any
  readonly storage: PluginStorage
  readonly database: any

  // API 实例（将在 Phase 3 实现）
  readonly message!: MessageAPI
  readonly instance!: InstanceAPI
  readonly user!: UserAPI
  readonly group!: GroupAPI
  readonly web!: WebAPI

  /** 命令注册表 */
  private commands: Map<string, CommandConfig> = new Map()

  /** 生命周期钩子 */
  private reloadCallbacks: Array<() => void | Promise<void>> = []
  private unloadCallbacks: Array<() => void | Promise<void>> = []

  constructor(
    pluginId: string,
    config: any,
    private readonly eventBus: EventBus,
    apis?: {
      message?: MessageAPI
      instance?: InstanceAPI
      user?: UserAPI
      group?: GroupAPI
      web?: WebAPI
      database?: any
    },
  ) {
    this.pluginId = pluginId
    this.config = config
    this.logger = createPluginLogger(pluginId)
    this.storage = createPluginStorage(pluginId)
    this.database = apis?.database || null

    // 注入 API（如果提供）
    if (apis?.message) {
      (this as any).message = apis.message
    }
    if (apis?.instance) {
      (this as any).instance = apis.instance
    }
    if (apis?.user) {
      (this as any).user = apis.user
    }
    if (apis?.group) {
      (this as any).group = apis.group
    }
    if (apis?.web) {
      const web = apis.web
        ; (this as any).web = {
          registerRoutes: (register: (app: any) => void) => web.registerRoutes(register, this.pluginId),
        }
    }

    // 如果没有提供完整 API，使用懒加载的占位符
    // 实际 API 将在 Phase 4 时注入
    if (!apis?.message) {
      (this as any).message = this.createMockMessageAPI()
    }
    if (!apis?.instance) {
      (this as any).instance = this.createMockInstanceAPI()
    }
    if (!apis?.user) {
      (this as any).user = this.createMockUserAPI()
    }
    if (!apis?.group) {
      (this as any).group = this.createMockGroupAPI()
    }
    if (!apis?.web) {
      (this as any).web = this.createMockWebAPI()
    }
  }

  private createMockMessageAPI(): MessageAPI {
    const logger = this.logger
    return {
      async send() {
        logger.warn('MessageAPI not yet integrated (Phase 4)')
        return { messageId: `mock-${Date.now()}` }
      },
      async recall() {
        logger.warn('MessageAPI not yet integrated (Phase 4)')
      },
      async get() {
        logger.warn('MessageAPI not yet integrated (Phase 4)')
        return null
      },
    } as any
  }

  private createMockInstanceAPI(): InstanceAPI {
    const logger = this.logger
    return {
      async list() {
        logger.warn('InstanceAPI not yet integrated (Phase 4)')
        return []
      },
      async get() {
        logger.warn('InstanceAPI not yet integrated (Phase 4)')
        return null
      },
      async getStatus() {
        logger.warn('InstanceAPI not yet integrated (Phase 4)')
        return 'unknown' as any
      },
    } as any
  }

  private createMockUserAPI(): UserAPI {
    const logger = this.logger
    return {
      async getInfo() {
        logger.warn('UserAPI not yet integrated (Phase 4)')
        return null
      },
      async isFriend() {
        logger.warn('UserAPI not yet integrated (Phase 4)')
        return false
      },
    } as any
  }

  private createMockGroupAPI(): GroupAPI {
    const logger = this.logger
    return {
      async getInfo() {
        logger.warn('GroupAPI not yet integrated (Phase 4)')
        return null
      },
      async getMembers() {
        logger.warn('GroupAPI not yet integrated (Phase 4)')
        return []
      },
      async setAdmin() {
        logger.warn('GroupAPI not yet integrated (Phase 4)')
      },
      async muteUser() {
        logger.warn('GroupAPI not yet integrated (Phase 4)')
      },
      async kickUser() {
        logger.warn('GroupAPI not yet integrated (Phase 4)')
      },
    } as any
  }

  private createMockWebAPI(): WebAPI {
    const logger = this.logger
    return {
      registerRoutes() {
        logger.warn('WebAPI not yet integrated (Phase 3)')
      },
    }
  }

  // === 事件监听 ===

  on(event: 'message', handler: MessageEventHandler): EventSubscription
  on(event: 'friend-request', handler: FriendRequestEventHandler): EventSubscription
  on(event: 'group-request', handler: GroupRequestEventHandler): EventSubscription
  on(event: 'notice', handler: NoticeEventHandler): EventSubscription
  on(event: 'instance-status', handler: InstanceStatusEventHandler): EventSubscription
  on(event: 'plugin-reload', handler: PluginReloadEventHandler): EventSubscription
  on(event: string, handler: any): EventSubscription {
    return this.eventBus.subscribe(
      event as any,
      handler,
      undefined,
      this.pluginId,
    )
  }

  // === 命令注册 ===

  /**
   * 注册命令
   */
  command(config: CommandConfig): this {
    // 注册主命令名
    this.commands.set(config.name, config)

    // 注册别名
    if (config.aliases) {
      for (const alias of config.aliases) {
        this.commands.set(alias, config)
      }
    }

    this.logger.debug(`Command registered: ${config.name}${config.aliases ? ` (aliases: ${config.aliases.join(', ')})` : ''}`)
    return this
  }

  /**
   * 获取已注册的命令
   * @internal
   */
  getCommands(): Map<string, CommandConfig> {
    return this.commands
  }

  // === 生命周期钩子 ===

  onReload(callback: () => void | Promise<void>): void {
    this.reloadCallbacks.push(callback)
  }

  onUnload(callback: () => void | Promise<void>): void {
    this.unloadCallbacks.push(callback)
  }

  // === 内部方法（由 PluginRuntime 调用） ===

  /**
   * 触发重载钩子
   * @internal
   */
  async triggerReload(): Promise<void> {
    for (const callback of this.reloadCallbacks) {
      try {
        await callback()
      }
      catch (error) {
        this.logger.error('Error in reload callback:', error)
      }
    }
  }

  /**
   * 触发卸载钩子
   * @internal
   */
  async triggerUnload(): Promise<void> {
    for (const callback of this.unloadCallbacks) {
      try {
        await callback()
      }
      catch (error) {
        this.logger.error('Error in unload callback:', error)
      }
    }
  }

  /**
   * 清理上下文（移除所有事件订阅和命令）
   * @internal
   */
  cleanup(): void {
    this.eventBus.removePluginSubscriptions(this.pluginId)
    this.commands.clear()
    this.reloadCallbacks = []
    this.unloadCallbacks = []
  }
}
