/**
 * NapGram 实例 API 实现
 * 
 * 提供插件访问实例信息的能力
 */

import type {
    InstanceAPI,
    InstanceInfo,
    InstanceStatus,
} from '../core/interfaces';
import { getLogger } from '../../shared/logger';

const logger = getLogger('InstanceAPI');

/**
 * 实例 API 实现
 */
export class InstanceAPIImpl implements InstanceAPI {
    /**
     * 实例列表访问器（Phase 4 注入）
     */
    private instancesResolver?: () => any[];

    constructor(instancesResolver?: () => any[]) {
        this.instancesResolver = instancesResolver;
    }

    /**
     * 获取所有实例
     */
    async list(): Promise<InstanceInfo[]> {
        logger.debug('Listing instances');

        try {
            if (!this.instancesResolver) {
                throw new Error('Instances resolver not configured (Phase 4)');
            }

            const instances = this.instancesResolver();

            // 转换为 InstanceInfo 格式
            const result = instances.map(instance => this.toInstanceInfo(instance));

            logger.debug({ count: result.length }, 'Instances listed');

            return result;
        } catch (error) {
            logger.error({ error }, 'Failed to list instances');
            throw error;
        }
    }

    /**
     * 获取单个实例
     */
    async get(instanceId: number): Promise<InstanceInfo | null> {
        logger.debug({ instanceId }, 'Getting instance');

        try {
            if (!this.instancesResolver) {
                throw new Error('Instances resolver not configured (Phase 4)');
            }

            const instances = this.instancesResolver();
            const instance = instances.find(i => i.id === instanceId);

            if (!instance) {
                logger.debug({ instanceId }, 'Instance not found');
                return null;
            }

            return this.toInstanceInfo(instance);
        } catch (error) {
            logger.error({ error, instanceId }, 'Failed to get instance');
            throw error;
        }
    }

    /**
     * 获取实例状态
     */
    async getStatus(instanceId: number): Promise<InstanceStatus> {
        logger.debug({ instanceId }, 'Getting instance status');

        try {
            if (!this.instancesResolver) {
                throw new Error('Instances resolver not configured (Phase 4)');
            }

            const instances = this.instancesResolver();
            const instance = instances.find(i => i.id === instanceId);

            if (!instance) {
                throw new Error(`Instance ${instanceId} not found`);
            }

            // 提取状态
            const status = this.extractStatus(instance);

            logger.debug({ instanceId, status }, 'Instance status retrieved');

            return status;
        } catch (error) {
            logger.error({ error, instanceId }, 'Failed to get instance status');
            throw error;
        }
    }

    // === 私有方法 ===

    /**
     * 转换为 InstanceInfo 格式
     */
    private toInstanceInfo(instance: any): InstanceInfo {
        return {
            id: instance.id,
            name: instance.name,
            qqAccount: instance.qqClient?.uin?.toString(),
            tgAccount: instance.tgBot?.username,
            createdAt: instance.createdAt || new Date(),
        };
    }

    /**
     * 提取实例状态
     */
    private extractStatus(instance: any): InstanceStatus {
        // Phase 4: 根据实际的 Instance 类实现
        // 目前返回简单的状态判断
        if (instance.qqClient?.isConnected && instance.tgBot?.isRunning) {
            return 'running';
        }

        if (instance.stopped) {
            return 'stopped';
        }

        return 'error';
    }
}

/**
 * 创建实例 API
 */
export function createInstanceAPI(instancesResolver?: () => any[]): InstanceAPI {
    return new InstanceAPIImpl(instancesResolver);
}
