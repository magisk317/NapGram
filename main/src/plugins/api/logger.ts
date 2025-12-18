/**
 * NapGram 插件日志系统
 * 
 * 为每个插件提供独立的日志记录器，自动添加插件标识
 */

import type { PluginLogger } from '../core/interfaces';
import { getLogger } from '../../shared/logger';

/**
 * 创建插件日志记录器
 * 
 * @param pluginId 插件 ID
 * @returns 插件日志记录器
 */
export function createPluginLogger(pluginId: string): PluginLogger {
    const logger = getLogger(`Plugin:${pluginId}`);

    return {
        debug(message: string, ...args: any[]) {
            logger.debug(message, ...args);
        },

        info(message: string, ...args: any[]) {
            logger.info(message, ...args);
        },

        warn(message: string, ...args: any[]) {
            logger.warn(message, ...args);
        },

        error(message: string, ...args: any[]) {
            logger.error(message, ...args);
        },
    };
}
