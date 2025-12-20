/**
 * NapGram 插件运行时 - 公共 API
 * 
 * 重构版本：使用原生 PluginRuntime 替代 Koishi
 */

import { getGlobalRuntime } from './core/plugin-runtime';
import { loadPluginSpecs } from './internal/config';
import { getLogger } from '../shared/logger';
import Instance from '../domain/models/Instance';
import { createMessageAPI } from './api/message';
import { createInstanceAPI } from './api/instance';
import { createUserAPI } from './api/user';
import { createGroupAPI } from './api/group';

const logger = getLogger('PluginRuntimeAPI');

/**
 * 插件运行时公共 API
 */
export class PluginRuntime {
  private static configureApis() {
    const instanceResolver = (instanceId: number) => Instance.instances.find(it => it.id === instanceId);
    const instancesResolver = () => Instance.instances;

    const apis = {
      message: createMessageAPI(instanceResolver),
      instance: createInstanceAPI(instancesResolver),
      user: createUserAPI(instanceResolver),
      group: createGroupAPI(instanceResolver),
    };

    getGlobalRuntime({ apis });
  }

  /**
   * 启动插件系统
   */
  static async start(options?: { defaultInstances?: number[] }) {
    logger.info('Starting plugin runtime');

    try {
      this.configureApis();
      // 加载插件规范
      const specs = await loadPluginSpecs();

      logger.debug({ count: specs.length }, 'Plugin specs loaded');

      // 获取全局运行时
      const runtime = getGlobalRuntime();

      // 启动运行时
      const report = await runtime.start(specs);

      logger.info({
        loaded: report.loaded.length,
        failed: report.failed.length,
      }, 'Plugin runtime started');

      return report;
    } catch (error) {
      logger.error({ error }, 'Failed to start plugin runtime');
      throw error;
    }
  }

  /**
   * 停止插件系统
   */
  static async stop() {
    logger.info('Stopping plugin runtime');

    try {
      const runtime = getGlobalRuntime();
      await runtime.stop();

      logger.info('Plugin runtime stopped');
    } catch (error) {
      logger.error({ error }, 'Failed to stop plugin runtime');
      throw error;
    }
  }

  /**
   * 重载插件系统
   */
  static async reload(options?: { defaultInstances?: number[] }) {
    logger.info('Reloading plugin runtime');

    try {
      this.configureApis();
      // 加载插件规范
      const specs = await loadPluginSpecs();

      // 获取全局运行时
      const runtime = getGlobalRuntime();

      // 重载运行时
      const report = await runtime.reload(specs);

      logger.info({
        loaded: report.loaded.length,
        failed: report.failed.length,
      }, 'Plugin runtime reloaded');

      return report;
    } catch (error) {
      logger.error({ error }, 'Failed to reload plugin runtime');
      throw error;
    }
  }

  /**
   * 重载单个插件（不重启整个运行时）
   */
  static async reloadPlugin(pluginId: string) {
    const id = String(pluginId || '').trim();
    if (!id) throw new Error('Missing pluginId');

    this.configureApis();

    const specs = await loadPluginSpecs();
    const spec = specs.find(s => s.id === id);
    if (!spec) {
      throw new Error(`Plugin spec not found: ${id}`);
    }

    const runtime = getGlobalRuntime();
    return await runtime.reloadPlugin(id, spec.config ?? {});
  }

  /**
   * 获取最后一次报告
   */
  static getLastReport() {
    const runtime = getGlobalRuntime();
    return runtime.getLastReport();
  }

  /**
   * 获取事件总线（用于事件发布）
   */
  static getEventBus() {
    const runtime = getGlobalRuntime();
    return runtime.getEventBus();
  }
}

// 导出 getGlobalRuntime 供其他模块使用（如 CommandsFeature）
export { getGlobalRuntime };
