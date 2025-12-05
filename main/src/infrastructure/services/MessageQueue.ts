import { getLogger } from '../../shared/utils/logger';
import type { UnifiedMessage } from '../../domain/message';
import { performanceMonitor } from './PerformanceMonitor';

const logger = getLogger('MessageQueue');

/**
 * 消息处理器
 */
export type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

/**
 * 队列配置
 */
export interface QueueConfig {
    batchSize?: number;
    processInterval?: number;
    maxQueueSize?: number;
    priority?: boolean;
}

/**
 * 优先级消息
 */
interface PriorityMessage {
    message: UnifiedMessage;
    priority: number;
    timestamp: number;
}

/**
 * 消息队列
 * Phase 5: 批量处理消息，提升性能
 */
export class MessageQueue {
    private queue: PriorityMessage[] = [];
    private processing = false;
    private handler: MessageHandler;
    private batchSize: number;
    private processInterval: number;
    private maxQueueSize: number;
    private enablePriority: boolean;
    private processTimer?: NodeJS.Timeout;

    constructor(handler: MessageHandler, config: QueueConfig = {}) {
        this.handler = handler;
        this.batchSize = config.batchSize || 10;
        this.processInterval = config.processInterval || 100;
        this.maxQueueSize = config.maxQueueSize || 1000;
        this.enablePriority = config.priority || false;

        logger.info(`MessageQueue initialized (batch: ${this.batchSize}, interval: ${this.processInterval}ms)`);
    }

    /**
     * 入队
     */
    async enqueue(msg: UnifiedMessage, priority = 0): Promise<void> {
        // 检查队列大小
        if (this.queue.length >= this.maxQueueSize) {
            logger.warn(`Queue is full (${this.maxQueueSize}), dropping message`);
            performanceMonitor.recordError();
            return;
        }

        this.queue.push({
            message: msg,
            priority,
            timestamp: Date.now(),
        });

        logger.trace(`Message enqueued (queue size: ${this.queue.length})`);

        // 如果未在处理，启动处理
        if (!this.processing) {
            this.startProcessing();
        }
    }

    /**
     * 开始处理
     */
    private startProcessing(): void {
        if (this.processing) return;

        this.processing = true;
        logger.debug('Started processing queue');

        this.processTimer = setInterval(async () => {
            await this.processBatch();
        }, this.processInterval);
    }

    /**
     * 停止处理
     */
    private stopProcessing(): void {
        if (!this.processing) return;

        this.processing = false;
        if (this.processTimer) {
            clearInterval(this.processTimer);
            this.processTimer = undefined;
        }

        logger.debug('Stopped processing queue');
    }

    /**
     * 处理批次
     */
    private async processBatch(): Promise<void> {
        if (this.queue.length === 0) {
            this.stopProcessing();
            return;
        }

        // 排序（如果启用优先级）
        if (this.enablePriority) {
            this.queue.sort((a, b) => b.priority - a.priority);
        }

        // 取出一批消息
        const batch = this.queue.splice(0, this.batchSize);

        logger.debug(`Processing batch of ${batch.length} messages`);

        // 并行处理
        const startTime = Date.now();

        await Promise.allSettled(
            batch.map(async (item) => {
                try {
                    await this.handler(item.message);

                    // 记录延迟
                    const latency = Date.now() - item.timestamp;
                    performanceMonitor.recordMessage(latency);
                } catch (error) {
                    logger.error(error, 'Failed to process message:');
                    performanceMonitor.recordError();
                }
            })
        );

        const batchTime = Date.now() - startTime;
        logger.trace(`Batch processed in ${batchTime}ms`);
    }

    /**
     * 获取队列状态
     */
    getStatus() {
        return {
            size: this.queue.length,
            maxSize: this.maxQueueSize,
            processing: this.processing,
            utilization: (this.queue.length / this.maxQueueSize) * 100,
        };
    }

    /**
     * 清空队列
     */
    clear(): void {
        this.queue = [];
        logger.info('Queue cleared');
    }

    /**
     * 销毁队列
     */
    destroy(): void {
        this.stopProcessing();
        this.clear();
        logger.info('MessageQueue destroyed');
    }
}
