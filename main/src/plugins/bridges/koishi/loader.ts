/**
 * Koishi 插件加载器
 * 
 * 扩展 PluginLoader 以支持 Koishi 插件
 */

import type { NapGramPlugin, PluginSpec } from '../../core/interfaces';
import { wrapKoishiPlugin, type KoishiPlugin } from './wrapper';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('KoishiLoader');

/**
 * 检测是否为 Koishi 插件
 */
export function isKoishiPlugin(module: any): boolean {
    // Koishi 插件导出 apply 函数或 { name, apply }
    return (
        typeof module.apply === 'function' ||
        (typeof module.name === 'string' && typeof module.default?.apply === 'function')
    );
}

/**
 * 从模块中提取 Koishi 插件
 */
export function extractKoishiPlugin(module: any): KoishiPlugin {
    if (typeof module.apply === 'function') {
        return {
            name: module.name,
            apply: module.apply,
        };
    }

    if (module.default && typeof module.default.apply === 'function') {
        return {
            name: module.default.name || module.name,
            apply: module.default.apply,
        };
    }

    throw new Error('Invalid Koishi plugin: apply function not found');
}

/**
 * 加载 Koishi 插件并包装为 NapGram 插件
 */
export function loadKoishiPlugin(
    module: any,
    spec: PluginSpec
): NapGramPlugin {
    logger.debug({ id: spec.id }, 'Loading Koishi plugin');

    // 提取 Koishi 插件
    const koishiPlugin = extractKoishiPlugin(module);

    // 包装为 NapGram 插件
    const napgramPlugin = wrapKoishiPlugin(koishiPlugin, spec.id, spec.config);

    logger.info({ id: spec.id, name: koishiPlugin.name }, 'Koishi plugin loaded and wrapped');

    return napgramPlugin;
}
