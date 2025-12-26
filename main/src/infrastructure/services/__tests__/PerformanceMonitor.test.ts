import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceMonitor, performanceMonitor } from '../PerformanceMonitor'

const { mockLoggerInstance } = vi.hoisted(() => ({
    mockLoggerInstance: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}))

vi.mock('../../../shared/logger', () => ({
    getLogger: vi.fn(() => mockLoggerInstance),
}))

describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor

    beforeEach(() => {
        vi.useFakeTimers()
        monitor = new PerformanceMonitor()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    test('recordMessage should track processed count and latency', () => {
        monitor.recordMessage(100)
        monitor.recordMessage(200)

        const stats = monitor.getStats()
        expect(stats.totalMessages).toBe(2)
        expect(stats.avgLatency).toBe(150)
    })

    test('recordMessage should limit history records', () => {
        for (let i = 0; i < 1100; i++) {
            monitor.recordMessage(i)
        }
        const stats = monitor.getStats()
        expect(stats.totalMessages).toBe(1100)
        // 100...1099 average is 599.5
        expect(stats.avgLatency).toBeCloseTo(599.5, 0)
    })

    test('recordError should track error count', () => {
        monitor.recordMessage(100)
        monitor.recordError()

        const stats = monitor.getStats()
        expect(stats.errorRate).toBe(1)
    })

    test('recordCacheHit and recordCacheMiss should track cache stats', () => {
        monitor.recordCacheHit()
        monitor.recordCacheHit()
        monitor.recordCacheMiss()

        const stats = monitor.getStats()
        expect(stats.cacheHitRate).toBeCloseTo(0.667, 2)
    })

    test('getStats should calculate percentiles correctly', () => {
        const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        latencies.forEach(l => monitor.recordMessage(l))

        const stats = monitor.getStats()
        expect(stats.p50Latency).toBe(50)
        expect(stats.p95Latency).toBe(100)
        expect(stats.p99Latency).toBe(100)
    })

    test('getStats for empty records should return zeros', () => {
        monitor.reset()
        const stats = monitor.getStats()
        expect(stats.avgLatency).toBe(0)
        expect(stats.p50Latency).toBe(0)
        expect(stats.cacheHitRate).toBe(0)
    })

    test('printStats should log statistics', () => {
        monitor.recordMessage(100)
        monitor.printStats()
        expect(mockLoggerInstance.info).toHaveBeenCalledWith(expect.stringContaining('Performance Statistics'))
    })

    test('reset should clear all metrics', () => {
        monitor.recordMessage(100)
        monitor.recordError()
        monitor.reset()

        const stats = monitor.getStats()
        expect(stats.totalMessages).toBe(0)
        expect(stats.errorRate).toBe(0)
    })

    test('updateMemoryUsage should call process.memoryUsage', () => {
        const spy = vi.spyOn(process, 'memoryUsage')
        monitor.updateMemoryUsage()
        expect(spy).toHaveBeenCalled()
    })

    test('singleton instance test', () => {
        expect(performanceMonitor).toBeDefined()
        expect(performanceMonitor).toBeInstanceOf(PerformanceMonitor)
    })

    test('interval updates memory usage and prints stats', async () => {
        vi.resetModules()
        const module = await import('../PerformanceMonitor')
        const monitor = module.performanceMonitor

        const updateSpy = vi.spyOn(monitor, 'updateMemoryUsage')
        const printSpy = vi.spyOn(monitor, 'printStats')

        await vi.advanceTimersByTimeAsync(300000)

        expect(updateSpy).toHaveBeenCalled()
        expect(printSpy).toHaveBeenCalled()
        vi.clearAllTimers()
    })
})
