/**
 * NapGram 插件加载器
 * 
 * 负责加载和验证插件模块，支持：
 * - ESM 和 CJS 格式
 * - TypeScript 插件（开发模式）
 * - 插件类型检测（Native vs Koishi）
 * - 依赖解析
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { NapGramPlugin, PluginSpec } from './interfaces';
import { loadKoishiPlugin } from '../bridges/koishi/loader';
import { getLogger } from '../../shared/logger';

const logger = getLogger('PluginLoader');

/**
 * 插件类型
 */
export enum PluginType {
    /** NapGram 原生插件 */
    Native = 'native',
    /** Koishi 插件 */
    Koishi = 'koishi',
    /** 未知类型 */
    Unknown = 'unknown',
}

/**
 * 加载结果
 */
export interface LoadResult {
    /** 插件对象 */
    plugin: NapGramPlugin;
    /** 插件类型 */
    type: PluginType;
    /** 模块路径 */
    modulePath: string;
}

/**
 * 插件加载器
 */
export class PluginLoader {
    /**
     * 加载插件模块
     * 
     * @param spec 插件规范
     * @returns 加载结果
     */
    async load(spec: PluginSpec): Promise<LoadResult> {
        logger.debug({ module: spec.module }, 'Loading plugin');

        try {
            // 解析模块路径（仅用于日志/回显；实际加载优先走 spec.load）
            const modulePath = this.resolveModulePath(spec.module);

            // 加载模块（优先使用 spec.load，便于内置插件/受控加载/沙箱策略）
            const module = typeof spec.load === 'function'
                ? await spec.load()
                : await this.importModule(modulePath);

            // 检测插件类型
            const type = this.detectPluginType(module);

            // 提取插件对象
            const plugin = this.extractPlugin(module, spec, type);

            // 验证插件
            this.validatePlugin(plugin, spec.id);

            logger.info(`Plugin loaded: { id: '${spec.id}', module: '${spec.module}', type: '${type}', version: '${plugin.version}' }`);

            return { plugin, type, modulePath };
        } catch (error) {
            logger.error({ error, module: spec.module }, 'Failed to load plugin');
            throw new Error(`Failed to load plugin ${spec.id}: ${(error as Error).message}`);
        }
    }

    /**
     * 解析模块路径
     * 
     * @param modulePath 模块路径（相对或绝对）
     * @returns 绝对路径
     */
    private resolveModulePath(modulePath: string): string {
        // 如果是 npm 包（不以 . 或 / 开头），直接返回
        if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) {
            return modulePath;
        }

        // 解析为绝对路径
        const absolutePath = path.isAbsolute(modulePath)
            ? modulePath
            : path.resolve(process.cwd(), modulePath);

        return absolutePath;
    }

    /**
     * 动态导入模块
     * 
     * @param modulePath 模块路径
     * @returns 模块对象
     */
    private async importModule(modulePath: string): Promise<any> {
        try {
            // 如果是本地文件路径，转换为 file:// URL
            if (modulePath.startsWith('/') || modulePath.startsWith('.')) {
                const fileUrl = pathToFileURL(modulePath).href;
                return await import(fileUrl);
            }

            // npm 包，直接导入
            return await import(modulePath);
        } catch (error) {
            // 尝试添加常见扩展名
            const extensions = ['.js', '.mjs', '.cjs', '.ts'];

            for (const ext of extensions) {
                try {
                    const pathWithExt = modulePath + ext;
                    const fileUrl = pathToFileURL(pathWithExt).href;
                    return await import(fileUrl);
                } catch {
                    // 继续尝试下一个扩展名
                }
            }

            throw error;
        }
    }

    /**
     * 检测插件类型
     * 
     * @param module 模块对象
     * @returns 插件类型
     */
    private detectPluginType(module: any): PluginType {
        // 检查是否为 NapGram 原生插件
        if (this.isNativePlugin(module)) {
            return PluginType.Native;
        }

        // 检查是否为 Koishi 插件
        if (this.isKoishiPlugin(module)) {
            return PluginType.Koishi;
        }

        return PluginType.Unknown;
    }

    /**
     * 判断是否为 NapGram 原生插件
     * 
     * @param module 模块对象
     * @returns 是否为原生插件
     */
    private isNativePlugin(module: any): boolean {
        // 检查 default export
        const plugin = module.default || module;

        // 必须有 id, name, version, install
        return (
            typeof plugin === 'object' &&
            typeof plugin.id === 'string' &&
            typeof plugin.name === 'string' &&
            typeof plugin.version === 'string' &&
            typeof plugin.install === 'function'
        );
    }

    /**
     * 判断是否为 Koishi 插件
     * 
     * @param module 模块对象
     * @returns 是否为 Koishi 插件
     */
    private isKoishiPlugin(module: any): boolean {
        // Koishi 插件导出 apply 函数或 name + apply
        return (
            typeof module.apply === 'function' ||
            (typeof module.name === 'string' && typeof module.default?.apply === 'function')
        );
    }

    /**
   * 提取插件对象
   * 
   * @param module 模块对象
   * @param spec 插件规范
   * @param type 插件类型
   * @returns 插件对象
   */
    private extractPlugin(module: any, spec: PluginSpec, type: PluginType): NapGramPlugin {
        if (type === PluginType.Native) {
            return module.default || module;
        }

        if (type === PluginType.Koishi) {
            // 使用 Koishi 加载器包装插件
            try {
                return loadKoishiPlugin(module, spec);
            } catch (error) {
                logger.error({ error, id: spec.id }, 'Failed to load Koishi plugin');
                throw new Error(
                    `Failed to wrap Koishi plugin ${spec.id}: ${(error as Error).message}`
                );
            }
        }

        throw new Error(`Unknown plugin type for ${spec.id}`);
    }

    /**
     * 验证插件
     * 
     * @param plugin 插件对象
     * @param expectedId 期望的插件 ID
     */
    private validatePlugin(plugin: NapGramPlugin, expectedId: string): void {
        // 验证必需字段
        const requiredFields = ['id', 'name', 'version', 'install'] as const;
        for (const field of requiredFields) {
            if (!plugin[field]) {
                throw new Error(`Plugin missing required field: ${field}`);
            }
        }

        // 验证 ID 匹配
        if (plugin.id !== expectedId) {
            logger.warn(
                { expected: expectedId, actual: plugin.id },
                'Plugin ID mismatch'
            );
        }

        // 验证版本格式（简单检查）
        if (!/^\d+\.\d+\.\d+/.test(plugin.version)) {
            logger.warn(
                { version: plugin.version },
                'Plugin version may not follow semver'
            );
        }

        // 验证 install 函数
        if (typeof plugin.install !== 'function') {
            throw new Error('Plugin install must be a function');
        }
    }

    /**
     * 批量加载插件
     * 
     * @param specs 插件规范列表
     * @returns 加载结果列表
     */
    async loadAll(specs: PluginSpec[]): Promise<LoadResult[]> {
        const results: LoadResult[] = [];

        for (const spec of specs) {
            if (!spec.enabled) {
                logger.debug({ id: spec.id }, 'Plugin disabled, skipping');
                continue;
            }

            try {
                const result = await this.load(spec);
                results.push(result);
            } catch (error) {
                logger.error({ error, id: spec.id }, 'Failed to load plugin');
                // 继续加载其他插件
            }
        }

        return results;
    }
}

/**
 * 全局插件加载器实例
 */
export const pluginLoader = new PluginLoader();
