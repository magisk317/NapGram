/**
 * NapGram 插件日志系统
 *
 * 为每个插件提供独立的日志记录器，自动添加插件标识
 */

import type { PluginLogger } from '../core/interfaces'
import { getLogger } from '../../shared/logger'

/**
 * 创建插件日志记录器
 *
 * @param pluginId 插件 ID
 * @returns 插件日志记录器
 */
export function createPluginLogger(pluginId: string): PluginLogger {
  const logger = getLogger('Plugin')

  return {
    debug(message: any, ...args: any[]) {
      if (typeof message === 'string')
        logger.debug(`[${pluginId}] ${message}`, ...args)
      else
        logger.debug(`[${pluginId}]`, message, ...args)
    },

    info(message: any, ...args: any[]) {
      if (typeof message === 'string')
        logger.info(`[${pluginId}] ${message}`, ...args)
      else
        logger.info(`[${pluginId}]`, message, ...args)
    },

    warn(message: any, ...args: any[]) {
      if (typeof message === 'string')
        logger.warn(`[${pluginId}] ${message}`, ...args)
      else
        logger.warn(`[${pluginId}]`, message, ...args)
    },

    error(message: any, ...args: any[]) {
      if (typeof message === 'string')
        logger.error(`[${pluginId}] ${message}`, ...args)
      else
        logger.error(`[${pluginId}]`, message, ...args)
    },
  }
}
