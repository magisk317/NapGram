import type { UnifiedMessage } from '../../../domain/message'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue } from '../MessageQueue'
import * as performanceMonitorModule from '../PerformanceMonitor'

describe('messageQueue', () => {
  let mockHandler: vi.Mock
  let mockMessage: UnifiedMessage

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(performanceMonitorModule.performanceMonitor, 'recordMessage')
    vi.spyOn(performanceMonitorModule.performanceMonitor, 'recordError')

    mockHandler = vi.fn().mockResolvedValue(undefined)
    mockMessage = {
      id: 'test-message-1',
      platform: 'qq',
      segments: [],
    } as UnifiedMessage
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const queue = new MessageQueue(mockHandler)
      const status = queue.getStatus()

      expect(status.maxSize).toBe(1000)
      expect(status.size).toBe(0)
      expect(status.processing).toBe(false)
    })

    it('should initialize with custom config', () => {
      const queue = new MessageQueue(mockHandler, {
        batchSize: 5,
        processInterval: 50,
        maxQueueSize: 100,
        priority: true,
      })

      const status = queue.getStatus()
      expect(status.maxSize).toBe(100)
    })
  })

  describe('enqueue', () => {
    it('should add message to queue', async () => {
      const queue = new MessageQueue(mockHandler)

      await queue.enqueue(mockMessage)

      const status = queue.getStatus()
      expect(status.size).toBe(1)
    })

    it('should start processing when first message is enqueued', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)

      const status = queue.getStatus()
      expect(status.processing).toBe(true)
    })

    it('should drop message when queue is full', async () => {
      const queue = new MessageQueue(mockHandler, { maxQueueSize: 2 })

      await queue.enqueue(mockMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-2' } as UnifiedMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-3' } as UnifiedMessage)

      const status = queue.getStatus()
      expect(status.size).toBe(2)
      expect(performanceMonitorModule.performanceMonitor.recordError).toHaveBeenCalled()
    })

    it('should handle priority messages', async () => {
      const queue = new MessageQueue(mockHandler, { priority: true, processInterval: 100 })

      const lowPriorityMsg = { ...mockMessage, id: 'low' } as UnifiedMessage
      const highPriorityMsg = { ...mockMessage, id: 'high' } as UnifiedMessage

      await queue.enqueue(lowPriorityMsg, 0)
      await queue.enqueue(highPriorityMsg, 10)

      const status = queue.getStatus()
      expect(status.size).toBe(2)
    })
  })

  describe('processBatch', () => {
    it('should process messages in batch', async () => {
      const queue = new MessageQueue(mockHandler, {
        batchSize: 2,
        processInterval: 100,
      })

      await queue.enqueue(mockMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-2' } as UnifiedMessage)

      // Advance timer to trigger processing
      await vi.advanceTimersByTimeAsync(100)

      expect(mockHandler).toHaveBeenCalledTimes(2)
    })

    it('should stop processing when queue is empty', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)

      // First interval processes the message
      await vi.advanceTimersByTimeAsync(100)

      // Wait for another interval to allow stopProcessing to be called
      await vi.advanceTimersByTimeAsync(100)

      const status = queue.getStatus()
      expect(status.size).toBe(0)
      expect(status.processing).toBe(false)
    })

    it('should sort by priority when enabled', async () => {
      const callOrder: string[] = []
      const priorityHandler = vi.fn(async (msg: UnifiedMessage) => {
        callOrder.push(msg.id)
      })

      const queue = new MessageQueue(priorityHandler, {
        priority: true,
        processInterval: 100,
        batchSize: 10,
      })

      await queue.enqueue({ ...mockMessage, id: 'low' } as UnifiedMessage, 1)
      await queue.enqueue({ ...mockMessage, id: 'high' } as UnifiedMessage, 10)
      await queue.enqueue({ ...mockMessage, id: 'medium' } as UnifiedMessage, 5)

      await vi.advanceTimersByTimeAsync(100)

      // High priority should be processed first
      expect(callOrder[0]).toBe('high')
      expect(callOrder[1]).toBe('medium')
      expect(callOrder[2]).toBe('low')
    })

    it('should handle message processing errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Processing failed'))
      const queue = new MessageQueue(errorHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)

      await vi.advanceTimersByTimeAsync(100)

      expect(performanceMonitorModule.performanceMonitor.recordError).toHaveBeenCalled()
    })

    it('should record message latency', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)

      // Simulate some time passing
      await vi.advanceTimersByTimeAsync(50)

      await vi.advanceTimersByTimeAsync(100)

      expect(performanceMonitorModule.performanceMonitor.recordMessage).toHaveBeenCalled()
    })

    it('should process multiple batches', async () => {
      const queue = new MessageQueue(mockHandler, {
        batchSize: 2,
        processInterval: 100,
      })

      // Add 5 messages
      for (let i = 0; i < 5; i++) {
        await queue.enqueue({ ...mockMessage, id: `msg-${i}` } as UnifiedMessage)
      }

      // First batch (2 messages)
      await vi.advanceTimersByTimeAsync(100)
      expect(mockHandler).toHaveBeenCalledTimes(2)

      // Second batch (2 messages)
      await vi.advanceTimersByTimeAsync(100)
      expect(mockHandler).toHaveBeenCalledTimes(4)

      // Third batch (1 message)
      await vi.advanceTimersByTimeAsync(100)
      expect(mockHandler).toHaveBeenCalledTimes(5)
    })
  })

  describe('getStatus', () => {
    it('should return correct queue status', async () => {
      const queue = new MessageQueue(mockHandler, { maxQueueSize: 100 })

      await queue.enqueue(mockMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-2' } as UnifiedMessage)

      const status = queue.getStatus()

      expect(status.size).toBe(2)
      expect(status.maxSize).toBe(100)
      expect(status.processing).toBe(true)
      expect(status.utilization).toBe(2)
    })

    it('should calculate utilization correctly', () => {
      const queue = new MessageQueue(mockHandler, { maxQueueSize: 50 })

      const status = queue.getStatus()
      expect(status.utilization).toBe(0)
    })
  })

  describe('clear', () => {
    it('should clear all messages from queue', async () => {
      const queue = new MessageQueue(mockHandler)

      await queue.enqueue(mockMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-2' } as UnifiedMessage)

      queue.clear()

      const status = queue.getStatus()
      expect(status.size).toBe(0)
    })
  })

  describe('destroy', () => {
    it('should stop processing and clear queue', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)

      queue.destroy()

      const status = queue.getStatus()
      expect(status.size).toBe(0)
      expect(status.processing).toBe(false)
    })

    it('should handle destroy before processing starts', () => {
      const queue = new MessageQueue(mockHandler)

      queue.destroy()

      const status = queue.getStatus()
      expect(status.processing).toBe(false)
      expect(status.size).toBe(0)
    })

    it('should prevent further processing after destroy', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)
      queue.destroy()

      // Try to advance timer
      await vi.advanceTimersByTimeAsync(200)

      // Handler should not be called after destroy
      expect(mockHandler).not.toHaveBeenCalled()
    })
  })

  describe('edge Cases', () => {
    it('should handle rapid consecutive enqueues', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      // Enqueue many messages rapidly
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(queue.enqueue({ ...mockMessage, id: `msg-${i}` } as UnifiedMessage))
      }

      await Promise.all(promises)

      const status = queue.getStatus()
      expect(status.size).toBe(100)
    })

    it('should handle handler that takes time to process', async () => {
      const slowHandler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      const queue = new MessageQueue(slowHandler, {
        processInterval: 100,
        batchSize: 1,
      })

      await queue.enqueue(mockMessage)

      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(50) // Wait for handler to complete

      expect(slowHandler).toHaveBeenCalled()
    })

    it('should ignore repeated startProcessing calls', () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })
      const queueInternal = queue as unknown as {
        startProcessing: () => void
        stopProcessing: () => void
        processing: boolean
        processTimer?: NodeJS.Timeout
      }

      queueInternal.startProcessing()
      queueInternal.startProcessing()
      expect(queue.getStatus().processing).toBe(true)

      queueInternal.stopProcessing()
      queueInternal.processing = true
      queueInternal.processTimer = undefined
      queueInternal.stopProcessing()

      queue.destroy()
    })

    it('should not start multiple processing timers', async () => {
      const queue = new MessageQueue(mockHandler, { processInterval: 100 })

      await queue.enqueue(mockMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-2' } as UnifiedMessage)
      await queue.enqueue({ ...mockMessage, id: 'msg-3' } as UnifiedMessage)

      const status = queue.getStatus()
      expect(status.processing).toBe(true)

      // Should only have one timer running
      await vi.advanceTimersByTimeAsync(100)
      expect(mockHandler).toHaveBeenCalled()
    })
  })
})
