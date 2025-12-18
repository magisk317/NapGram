/**
 * NapGram 用户 API 实现
 * 
 * 提供插件访问用户信息的能力
 */

import type {
    UserAPI,
    GetUserParams,
    UserInfo,
} from '../core/interfaces';
import { getLogger } from '../../shared/logger';

const logger = getLogger('UserAPI');

/**
 * 用户 API 实现
 */
export class UserAPIImpl implements UserAPI {
    /**
     * 实例访问器（Phase 4 注入）
     */
    private instanceResolver?: (instanceId: number) => any;

    constructor(instanceResolver?: (instanceId: number) => any) {
        this.instanceResolver = instanceResolver;
    }

    /**
     * 获取用户信息
     */
    async getInfo(params: GetUserParams): Promise<UserInfo | null> {
        logger.debug({ params }, 'Getting user info');

        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }

            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }

            // 解析用户 ID
            const { platform, id } = this.parseUserId(params.userId);

            // 根据平台获取用户信息
            let userInfo: UserInfo | null = null;

            if (platform === 'qq') {
                userInfo = await this.getQQUserInfo(instance, id);
            } else if (platform === 'tg') {
                userInfo = await this.getTGUserInfo(instance, id);
            } else {
                throw new Error(`Unknown platform: ${platform}`);
            }

            if (userInfo) {
                logger.debug({ params, userInfo }, 'User info retrieved');
            }

            return userInfo;
        } catch (error) {
            logger.error({ error, params }, 'Failed to get user info');
            throw error;
        }
    }

    /**
     * 检查是否为好友
     */
    async isFriend(params: GetUserParams): Promise<boolean> {
        logger.debug({ params }, 'Checking if friend');

        try {
            // 获取实例
            if (!this.instanceResolver) {
                throw new Error('Instance resolver not configured (Phase 4)');
            }

            const instance = this.instanceResolver(params.instanceId);
            if (!instance) {
                throw new Error(`Instance ${params.instanceId} not found`);
            }

            // 解析用户 ID
            const { platform, id } = this.parseUserId(params.userId);

            // 根据平台检查好友关系
            let isFriend = false;

            if (platform === 'qq') {
                isFriend = await this.isQQFriend(instance, id);
            } else if (platform === 'tg') {
                // Telegram 没有好友概念，返回 false
                isFriend = false;
            }

            logger.debug({ params, isFriend }, 'Friend check completed');

            return isFriend;
        } catch (error) {
            logger.error({ error, params }, 'Failed to check friend status');
            throw error;
        }
    }

    // === 私有方法 ===

    /**
     * 解析用户 ID
     */
    private parseUserId(userId: string): { platform: 'qq' | 'tg'; id: string } {
        // 格式: qq:u:123456 或 tg:u:123456
        const parts = userId.split(':');

        if (parts.length < 3) {
            throw new Error(`Invalid userId format: ${userId}`);
        }

        const platform = parts[0] as 'qq' | 'tg';
        const id = parts.slice(2).join(':'); // 处理 id 中可能包含的 ':'

        return { platform, id };
    }

    /**
     * 获取 QQ 用户信息（Phase 4 实现）
     */
    private async getQQUserInfo(instance: any, uin: string): Promise<UserInfo | null> {
        // Phase 4: 调用 instance.qqClient.getUserInfo()
        // 目前返回模拟数据
        return null;
    }

    /**
     * 获取 TG 用户信息（Phase 4 实现）
     */
    private async getTGUserInfo(instance: any, userId: string): Promise<UserInfo | null> {
        // Phase 4: 调用 instance.tgBot.getUser()
        // 目前返回模拟数据
        return null;
    }

    /**
     * 检查是否为 QQ 好友（Phase 4 实现）
     */
    private async isQQFriend(instance: any, uin: string): Promise<boolean> {
        // Phase 4: 调用 instance.qqClient.isFriend()
        return false;
    }
}

/**
 * 创建用户 API
 */
export function createUserAPI(instanceResolver?: (instanceId: number) => any): UserAPI {
    return new UserAPIImpl(instanceResolver);
}
