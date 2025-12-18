/**
 * NapGram 事件总线
 * 
 * 提供高性能的事件发布订阅机制，支持：
 * - 类型安全的事件订阅
 * - 事件过滤
 * - 错误隔离
 * - 订阅管理
 */

import type {
    MessageEvent,
    FriendRequestEvent,
    GroupRequestEvent,
    NoticeEvent,
    InstanceStatusEvent,
    PluginReloadEvent,
    EventSubscription,
} from './interfaces';
import { getLogger } from '../../shared/logger';

const logger = getLogger('EventBus');

/**
 * 事件类型映射
 */
type EventMap = {
    'message': MessageEvent;
    'friend-request': FriendRequestEvent;
    'group-request': GroupRequestEvent;
    'notice': NoticeEvent;
    'instance-status': InstanceStatusEvent;
    'plugin-reload': PluginReloadEvent;
};

/**
 * 事件处理器
 */
type EventHandler<T = any> = (event: T) => void | Promise<void>;

/**
 * 事件过滤器
 */
type EventFilter<T = any> = (event: T) => boolean;

/**
 * 订阅配置
 */
interface SubscriptionConfig<T = any> {
    handler: EventHandler<T>;
    filter?: EventFilter<T>;
    pluginId?: string;
    once?: boolean;
}

/**
 * 内部订阅记录
 */
interface InternalSubscription {
    id: string;
    config: SubscriptionConfig;
    unsubscribe: () => void;
}

/**
 * 事件总线
 */
export class EventBus {
    /** 订阅表：事件类型 -> 订阅列表 */
    private subscriptions = new Map<string, Set<InternalSubscription>>();

    /** 订阅计数器（用于生成唯一 ID） */
    private subscriptionIdCounter = 0;

    /** 事件统计 */
    private stats = {
        published: 0,
        handled: 0,
        errors: 0,
    };

    /**
     * 订阅事件
     * 
     * @param eventType 事件类型
     * @param handler 事件处理器
     * @param filter 事件过滤器（可选）
     * @param pluginId 插件 ID（用于日志）
     * @returns 事件订阅句柄
     */
    subscribe<K extends keyof EventMap>(
        eventType: K,
        handler: EventHandler<EventMap[K]>,
        filter?: EventFilter<EventMap[K]>,
        pluginId?: string
    ): EventSubscription {
        const subscriptionId = `sub-${++this.subscriptionIdCounter}`;

        const subscription: InternalSubscription = {
            id: subscriptionId,
            config: {
                handler,
                filter,
                pluginId,
            },
            unsubscribe: () => this.unsubscribe(eventType, subscriptionId),
        };

        // 添加到订阅表
        if (!this.subscriptions.has(eventType)) {
            this.subscriptions.set(eventType, new Set());
        }
        this.subscriptions.get(eventType)!.add(subscription);

        logger.debug(`Subscription added: ${eventType} (${subscriptionId}) ${pluginId ? `[${pluginId}]` : ''}`);

        return {
            unsubscribe: subscription.unsubscribe,
        };
    }

    /**
     * 订阅一次性事件
     * 
     * @param eventType 事件类型
     * @param handler 事件处理器
     * @param filter 事件过滤器（可选）
     * @param pluginId 插件 ID
     * @returns 事件订阅句柄
     */
    once<K extends keyof EventMap>(
        eventType: K,
        handler: EventHandler<EventMap[K]>,
        filter?: EventFilter<EventMap[K]>,
        pluginId?: string
    ): EventSubscription {
        const subscription = this.subscribe(
            eventType,
            async (event) => {
                await handler(event);
                subscription.unsubscribe();
            },
            filter,
            pluginId
        );
        return subscription;
    }

    /**
     * 取消订阅
     * 
     * @param eventType 事件类型
     * @param subscriptionId 订阅 ID
     */
    private unsubscribe(eventType: string, subscriptionId: string): void {
        const subs = this.subscriptions.get(eventType);
        if (!subs) return;

        for (const sub of subs) {
            if (sub.id === subscriptionId) {
                subs.delete(sub);
                logger.debug(`Subscription removed: ${eventType} (${subscriptionId})`);
                break;
            }
        }

        // 清理空的订阅集合
        if (subs.size === 0) {
            this.subscriptions.delete(eventType);
        }
    }

    /**
     * 发布事件
     * 
     * @param eventType 事件类型
     * @param event 事件数据
     */
    async publish<K extends keyof EventMap>(
        eventType: K,
        event: EventMap[K]
    ): Promise<void> {
        this.stats.published++;

        const subs = this.subscriptions.get(eventType);
        if (!subs || subs.size === 0) {
            logger.debug(`No subscribers for event: ${eventType}`);
            return;
        }

        logger.debug(`Publishing event: ${eventType} (${subs.size} subscribers)`);

        // 并发执行所有处理器
        const promises: Promise<void>[] = [];

        for (const sub of subs) {
            // 应用过滤器
            if (sub.config.filter && !sub.config.filter(event)) {
                continue;
            }

            // 执行处理器（包装错误处理）
            const promise = this.executeHandler(
                sub.config.handler,
                event,
                eventType,
                sub.config.pluginId
            );

            promises.push(promise);
        }

        // 等待所有处理器完成
        await Promise.allSettled(promises);
    }

    /**
     * 同步发布事件（立即返回，不等待处理器完成）
     * 
     * @param eventType 事件类型
     * @param event 事件数据
     */
    publishSync<K extends keyof EventMap>(
        eventType: K,
        event: EventMap[K]
    ): void {
        this.publish(eventType, event).catch((error) => {
            logger.error({ error, eventType }, 'Error in publishSync');
        });
    }

    /**
     * 执行事件处理器（带错误处理）
     * 
     * @param handler 处理器函数
     * @param event 事件数据
     * @param eventType 事件类型
     * @param pluginId 插件 ID
     */
    private async executeHandler(
        handler: EventHandler,
        event: any,
        eventType: string,
        pluginId?: string
    ): Promise<void> {
        try {
            await handler(event);
            this.stats.handled++;
        } catch (error) {
            this.stats.errors++;

            const context = pluginId ? `[${pluginId}]` : '';
            logger.error(
                { error, eventType, pluginId },
                `Event handler error ${context}: ${eventType}`
            );

            // 错误不会传播，避免影响其他订阅者
        }
    }

    /**
     * 移除插件的所有订阅
     * 
     * @param pluginId 插件 ID
     */
    removePluginSubscriptions(pluginId: string): void {
        let removed = 0;

        for (const [eventType, subs] of this.subscriptions.entries()) {
            const toRemove: InternalSubscription[] = [];

            for (const sub of subs) {
                if (sub.config.pluginId === pluginId) {
                    toRemove.push(sub);
                }
            }

            for (const sub of toRemove) {
                subs.delete(sub);
                removed++;
            }

            // 清理空的订阅集合
            if (subs.size === 0) {
                this.subscriptions.delete(eventType);
            }
        }

        logger.info(`Removed ${removed} subscriptions for plugin: ${pluginId}`);
    }

    /**
     * 获取事件订阅数
     * 
     * @param eventType 事件类型（可选）
     * @returns 订阅数
     */
    getSubscriptionCount(eventType?: keyof EventMap): number {
        if (eventType) {
            return this.subscriptions.get(eventType)?.size || 0;
        }

        let total = 0;
        for (const subs of this.subscriptions.values()) {
            total += subs.size;
        }
        return total;
    }

    /**
     * 获取所有订阅的事件类型
     * 
     * @returns 事件类型列表
     */
    getEventTypes(): string[] {
        return Array.from(this.subscriptions.keys());
    }

    /**
     * 获取插件的订阅数
     * 
     * @param pluginId 插件 ID
     * @returns 订阅数
     */
    getPluginSubscriptionCount(pluginId: string): number {
        let count = 0;

        for (const subs of this.subscriptions.values()) {
            for (const sub of subs) {
                if (sub.config.pluginId === pluginId) {
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * 获取统计信息
     * 
     * @returns 统计数据
     */
    getStats() {
        return {
            ...this.stats,
            activeSubscriptions: this.getSubscriptionCount(),
            eventTypes: this.getEventTypes().length,
        };
    }

    /**
     * 重置统计信息
     */
    resetStats(): void {
        this.stats = {
            published: 0,
            handled: 0,
            errors: 0,
        };
    }

    /**
     * 清空所有订阅
     */
    clear(): void {
        const totalSubs = this.getSubscriptionCount();
        this.subscriptions.clear();
        logger.info(`Cleared ${totalSubs} subscriptions`);
    }
}

/**
 * 全局事件总线实例
 */
export const globalEventBus = new EventBus();
