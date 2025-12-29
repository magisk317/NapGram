import { getInfraLogger } from './deps'
import { performanceMonitor } from './PerformanceMonitor'

const logger = getInfraLogger('MessageQueue')

export type MessageHandler<T = unknown> = (msg: T) => Promise<void>

export interface QueueConfig {
  batchSize?: number
  processInterval?: number
  maxQueueSize?: number
  priority?: boolean
}

interface PriorityMessage<T> {
  message: T
  priority: number
  timestamp: number
}

export class MessageQueue<T = unknown> {
  private queue: PriorityMessage<T>[] = []
  private processing = false
  private handler: MessageHandler<T>
  private batchSize: number
  private processInterval: number
  private maxQueueSize: number
  private enablePriority: boolean
  private processTimer?: NodeJS.Timeout

  constructor(handler: MessageHandler<T>, config: QueueConfig = {}) {
    this.handler = handler
    this.batchSize = config.batchSize || 10
    this.processInterval = config.processInterval || 100
    this.maxQueueSize = config.maxQueueSize || 1000
    this.enablePriority = config.priority || false

    logger.info(`MessageQueue ✓ 初始化完成（批量大小: ${this.batchSize}, 间隔: ${this.processInterval}ms）`)
  }

  async enqueue(msg: T, priority = 0): Promise<void> {
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn(`Queue is full (${this.maxQueueSize}), dropping message`)
      performanceMonitor.recordError()
      return
    }

    this.queue.push({
      message: msg,
      priority,
      timestamp: Date.now(),
    })

    logger.trace(`Message enqueued (queue size: ${this.queue.length})`)

    if (!this.processing) {
      this.startProcessing()
    }
  }

  private startProcessing(): void {
    if (this.processing)
      return

    this.processing = true
    logger.debug('Started processing queue')

    this.processTimer = setInterval(async () => {
      await this.processBatch()
    }, this.processInterval)
  }

  private stopProcessing(): void {
    if (!this.processing)
      return

    this.processing = false
    if (this.processTimer) {
      clearInterval(this.processTimer)
      this.processTimer = undefined
    }

    logger.debug('Stopped processing queue')
  }

  private async processBatch(): Promise<void> {
    if (this.queue.length === 0) {
      this.stopProcessing()
      return
    }

    if (this.enablePriority) {
      this.queue.sort((a, b) => b.priority - a.priority)
    }

    const batch = this.queue.splice(0, this.batchSize)

    logger.debug(`Processing batch of ${batch.length} messages`)

    const startTime = Date.now()

    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          await this.handler(item.message)

          const latency = Date.now() - item.timestamp
          performanceMonitor.recordMessage(latency)
        }
        catch (error) {
          logger.error(error, 'Failed to process message:')
          performanceMonitor.recordError()
        }
      }),
    )

    const batchTime = Date.now() - startTime
    logger.trace(`Batch processed in ${batchTime}ms`)
  }

  getStatus() {
    return {
      size: this.queue.length,
      maxSize: this.maxQueueSize,
      processing: this.processing,
      utilization: (this.queue.length / this.maxQueueSize) * 100,
    }
  }

  clear(): void {
    this.queue = []
    logger.info('Queue cleared')
  }

  destroy(): void {
    this.stopProcessing()
    this.clear()
    logger.info('MessageQueue destroyed')
  }
}
