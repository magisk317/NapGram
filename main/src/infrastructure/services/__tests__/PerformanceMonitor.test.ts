import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerformanceMonitor, performanceMonitor } from '../PerformanceMonitor'

describe('performanceMonitor', () => {
  let monitor: PerformanceMonitor

  beforeEach(() => {
    vi.useFakeTimers()
    monitor = new PerformanceMonitor()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recordMessage should track processed count and latency', () => {
    monitor.recordMessage(100)
    monitor.recordMessage(200)

    const stats = monitor.getStats()
    expect(stats.totalMessages).toBe(2)
    expect(stats.avgLatency).toBe(150)
  })

  it('recordMessage should limit history records', () => {
    for (let i = 0; i < 1100; i++) {
      monitor.recordMessage(i)
    }
    const stats = monitor.getStats()
    expect(stats.totalMessages).toBe(1100)
    // 100...1099 average is 599.5
    expect(stats.avgLatency).toBeCloseTo(599.5, 0)
  })

  it('recordError should track error count', () => {
    monitor.recordMessage(100)
    monitor.recordError()

    const stats = monitor.getStats()
    expect(stats.errorRate).toBe(1)
  })

  it('recordCacheHit and recordCacheMiss should track cache stats', () => {
    monitor.recordCacheHit()
    monitor.recordCacheHit()
    monitor.recordCacheMiss()

    const stats = monitor.getStats()
    expect(stats.cacheHitRate).toBeCloseTo(0.667, 2)
  })

  it('getStats should calculate percentiles correctly', () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    latencies.forEach(l => monitor.recordMessage(l))

    const stats = monitor.getStats()
    expect(stats.p50Latency).toBe(50)
    expect(stats.p95Latency).toBe(100)
    expect(stats.p99Latency).toBe(100)
  })

  it('getStats for empty records should return zeros', () => {
    monitor.reset()
    const stats = monitor.getStats()
    expect(stats.avgLatency).toBe(0)
    expect(stats.p50Latency).toBe(0)
    expect(stats.cacheHitRate).toBe(0)
  })

  it('printStats should log statistics', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    monitor.recordMessage(100)
    monitor.printStats()
    expect(infoSpy).toHaveBeenCalledWith('[PerformanceMonitor]', expect.stringContaining('Performance Statistics'))
    infoSpy.mockRestore()
  })

  it('reset should clear all metrics', () => {
    monitor.recordMessage(100)
    monitor.recordError()
    monitor.reset()

    const stats = monitor.getStats()
    expect(stats.totalMessages).toBe(0)
    expect(stats.errorRate).toBe(0)
  })

  it('updateMemoryUsage should call process.memoryUsage', () => {
    const spy = vi.spyOn(process, 'memoryUsage')
    monitor.updateMemoryUsage()
    expect(spy).toHaveBeenCalled()
  })

  it('singleton instance test', () => {
    expect(performanceMonitor).toBeDefined()
    expect(performanceMonitor).toBeInstanceOf(PerformanceMonitor)
  })

  it('interval updates memory usage and prints stats', async () => {
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
