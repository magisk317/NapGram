/**
 * NapGram 插件运行时
 *
 * 插件系统的核心引擎，管理所有插件的加载、运行和状态
 */

import type { PluginSpec } from './interfaces'
import type { PluginInstance } from './lifecycle'
import { getLogger } from '@napgram/infra-kit'
import { IPluginRuntime, setGlobalRuntime as setKitRuntime } from '@napgram/runtime-kit'
import { EventBus, globalEventBus } from './event-bus'
import { PluginLifecycleManager, PluginState } from './lifecycle'
import { PluginContextImpl } from './plugin-context'
import { PluginLoader, PluginType } from './plugin-loader'

const logger = getLogger('PluginRuntime')

/**
 * 运行时配置
 */
export interface RuntimeConfig {
  /** 事件总线（可选，默认创建新实例） */
  eventBus?: EventBus

  /** 插件加载器（可选，默认创建新实例） */
  loader?: PluginLoader

  /** 生命周期管理器（可选，默认创建新实例） */
  lifecycleManager?: PluginLifecycleManager

  /** API 注入（Phase 3 实现） */
  apis?: {
    message?: any
    instance?: any
    user?: any
    group?: any
    web?: any
    database?: any
  }
}

/**
 * 插件运行时报告
 */
export interface RuntimeReport {
  /** 是否启用 */
  enabled: boolean

  /** 已加载的插件 ID */
  loaded: string[]

  /** 已加载的插件实例（用于命令系统访问） */
  loadedPlugins?: Array<{
    id: string
    context: any
    plugin?: {
      id: string
      name: string
      version: string
      description?: string
      homepage?: string
      defaultConfig?: any
    }
  }>

  /** 加载失败的插件 */
  failed: Array<{ id: string, error: string }>

  /** 插件类型统计 */
  stats: {
    total: number
    native: number
    installed: number
    error: number
  }
}

export interface ReloadPluginResult {
  id: string
  success: boolean
  error?: string
}

/**
 * NapGram 插件运行时
 *
 * 单例模式，全局只有一个运行时实例
 */
export class PluginRuntime implements IPluginRuntime {
  /** 事件总线 */
  private eventBus: EventBus

  /** 插件加载器 */
  private loader: PluginLoader

  /** 生命周期管理器 */
  private lifecycleManager: PluginLifecycleManager

  /** 插件注册表 */
  private plugins = new Map<string, PluginInstance>()

  /** 插件类型映射 */
  private pluginTypes = new Map<string, PluginType>()

  /** 运行时状态 */
  private isRunning = false

  /** 最后一次报告 */
  private lastReport: RuntimeReport = {
    enabled: false,
    loaded: [],
    failed: [],
    stats: { total: 0, native: 0, installed: 0, error: 0 },
  }

  /** API 注入 */
  private apis?: RuntimeConfig['apis']

  constructor(config?: RuntimeConfig) {
    this.eventBus = config?.eventBus || globalEventBus
    this.loader = config?.loader || new PluginLoader()
    this.lifecycleManager = config?.lifecycleManager || new PluginLifecycleManager()
    this.apis = config?.apis

    logger.info('PluginRuntime initialized')
  }

  /**
   * 更新 API 注入（允许在首次创建后再注入）
   */
  setApis(apis?: RuntimeConfig['apis']) {
    this.apis = apis
  }

  /**
   * 获取事件总线
   */
  getEventBus(): EventBus {
    return this.eventBus
  }

  /**
   * 启动运行时并加载插件
   *
   * @param specs 插件规范列表
   */
  async start(specs: PluginSpec[]): Promise<RuntimeReport> {
    if (this.isRunning) {
      logger.warn('PluginRuntime is already running')
      return this.lastReport
    }

    logger.info({ pluginCount: specs.length, eventBus: this.eventBus === globalEventBus ? 'global' : 'private' }, 'Starting PluginRuntime')

    const report: RuntimeReport = {
      enabled: true,
      loaded: [],
      failed: [],
      stats: { total: 0, native: 0, installed: 0, error: 0 },
    }

    try {
      // 加载所有插件
      for (const spec of specs) {
        if (!spec.enabled) {
          const pluginId = spec.id || spec.module
          logger.debug({ id: pluginId }, 'Plugin disabled, skipping')
          continue
        }

        try {
          const pluginId = await this.loadPlugin(spec)
          report.loaded.push(pluginId)
        }
        catch (error) {
          const pluginId = spec.id || spec.module
          const errorMessage = (error as Error).message || String(error)
          report.failed.push({ id: pluginId, error: errorMessage })
          logger.error({ error, id: pluginId }, 'Failed to load plugin')
        }
      }

      // 安装所有已加载的插件
      const instances = Array.from(this.plugins.values())
      const installResult = await this.lifecycleManager.installAll(instances)

      // 更新报告
      report.stats = this.getStats()
      report.loadedPlugins = instances.map(inst => ({
        id: inst.id,
        context: inst.context,
        plugin: {
          id: inst.plugin.id,
          name: inst.plugin.name,
          version: inst.plugin.version,
          description: inst.plugin.description,
          homepage: inst.plugin.homepage,
          defaultConfig: (inst.plugin as any)?.defaultConfig,
        },
      }))

      this.isRunning = true
      this.lastReport = report

      logger.info({
        loaded: report.loaded.length,
        failed: report.failed.length,
        installed: installResult.succeeded.length,
      }, 'PluginRuntime started')

      return report
    }
    catch (error) {
      logger.error({ error }, 'Failed to start PluginRuntime')
      throw error
    }
  }

  /**
   * 停止运行时并卸载所有插件
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('PluginRuntime is not running')
      return
    }

    logger.info('Stopping PluginRuntime')

    try {
      // 卸载所有插件
      const instances = Array.from(this.plugins.values())
      await this.lifecycleManager.uninstallAll(instances)

      // 清理
      this.plugins.clear()
      this.pluginTypes.clear()
      this.eventBus.clear()

      this.isRunning = false

      logger.info('PluginRuntime stopped')
    }
    catch (error) {
      logger.error({ error }, 'Failed to stop PluginRuntime')
      throw error
    }
  }

  /**
   * 重载运行时
   *
   * @param specs 插件规范列表
   */
  async reload(options?: any): Promise<RuntimeReport> {
    const specs: PluginSpec[] = Array.isArray(options) ? options : []
    logger.info('Reloading PluginRuntime')

    await this.stop()
    return await this.start(specs)
  }

  /**
   * 重载单个插件（不重启整个运行时）
   *
   * 适用场景：
   * - 仅更新插件配置
   * - 插件自带 reload() 逻辑或可卸载-重装
   *
   * 不适用：
   * - 模块文件变更且依赖 ESM import cache 刷新（此类场景建议全量 reload）
   */
  async reloadPlugin(pluginId: string, newConfig?: any): Promise<ReloadPluginResult> {
    if (!this.isRunning) {
      return { id: pluginId, success: false, error: 'PluginRuntime is not running' }
    }

    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return { id: pluginId, success: false, error: `Plugin not loaded: ${pluginId}` }
    }

    const result = await this.lifecycleManager.reload(instance, newConfig)
    if (!result.success) {
      return { id: pluginId, success: false, error: result.error?.message || 'Unknown error' }
    }

    this.eventBus.publishSync('plugin-reload', { pluginId, timestamp: Date.now() })
    return { id: pluginId, success: true }
  }

  /**
   * 加载单个插件
   *
   * @param spec 插件规范
   * @returns 插件 ID
   */
  private async loadPlugin(spec: PluginSpec): Promise<string> {
    // 加载插件模块
    const loadResult = await this.loader.load(spec)

    // 使用 spec.id 作为运行时插件 ID（便于配置/管理一致性）
    const pluginId = spec.id || loadResult.plugin.id
    if (!pluginId) {
      throw new Error(`Plugin id is required (module: ${spec.module})`)
    }

    // 保障 plugin.id 与运行时 ID 一致（插件内部若依赖 ctx.pluginId / storage 目录）
    if (loadResult.plugin.id !== pluginId) {
      logger.warn({ expected: pluginId, actual: loadResult.plugin.id }, 'Plugin ID mismatch; overriding plugin.id with spec.id');
      (loadResult.plugin as any).id = pluginId
    }

    // 检查是否已加载
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is already loaded`)
    }

    // 创建插件上下文
    const context = new PluginContextImpl(
      pluginId,
      spec.config || {},
      this.eventBus,
      this.apis,
    )

    // 创建插件实例
    const instance: PluginInstance = {
      id: pluginId,
      plugin: loadResult.plugin,
      context,
      config: spec.config || {},
      state: PluginState.Uninitialized,
    }

    // 注册插件
    this.plugins.set(pluginId, instance)
    this.pluginTypes.set(pluginId, loadResult.type)

    if (loadResult.plugin.drizzleSchema) {
      logger.debug({ id: pluginId }, 'Plugin Drizzle schema detected')
    }

    logger.debug({ id: pluginId, type: loadResult.type }, 'Plugin loaded')

    return pluginId
  }

  /**
   * 获取插件实例
   *
   * @param id 插件 ID
   * @returns 插件实例（如果存在）
   */
  getPlugin(id: string): PluginInstance | undefined {
    return this.plugins.get(id)
  }

  /**
   * 获取所有插件实例
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /**
   * 获取插件类型
   *
   * @param id 插件 ID
   * @returns 插件类型（如果存在）
   */
  getPluginType(id: string): PluginType | undefined {
    return this.pluginTypes.get(id)
  }

  /**
   * 卸载单个插件
   *
   * @param id 插件 ID
   */
  async unloadPlugin(id: string): Promise<void> {
    const instance = this.plugins.get(id)

    if (!instance) {
      throw new Error(`Plugin ${id} not found`)
    }

    await this.lifecycleManager.uninstall(instance)
    this.plugins.delete(id)
    this.pluginTypes.delete(id)

    logger.info({ id }, 'Plugin unloaded')
  }

  /**
   * 获取统计信息
   */
  getStats(): RuntimeReport['stats'] {
    const instances = Array.from(this.plugins.values())

    return {
      total: instances.length,
      native: Array.from(this.pluginTypes.values()).filter(t => t === PluginType.Native).length,
      installed: instances.filter(i => i.state === PluginState.Installed).length,
      error: instances.filter(i => i.state === PluginState.Error).length,
    }
  }

  /**
   * 获取最后一次报告
   */
  getLastReport(): RuntimeReport {
    return this.lastReport
  }

  /**
   * 检查运行时是否正在运行
   */
  isActive(): boolean {
    return this.isRunning
  }
}

/**
 * 全局插件运行时实例
 */
let globalRuntime: PluginRuntime | null = null

/**
 * 获取或创建全局运行时实例
 *
 * @param config 运行时配置（仅在首次创建时使用）
 * @returns 全局运行时实例
 */
export function getGlobalRuntime(config?: RuntimeConfig): PluginRuntime {
  if (!globalRuntime) {
    globalRuntime = new PluginRuntime(config)
  }
  if (config?.apis) {
    globalRuntime.setApis(config.apis)
  }
  return globalRuntime
}

/**
 * 重置全局运行时（用于测试）
 */
export function resetGlobalRuntime(): void {
  globalRuntime = null
}
