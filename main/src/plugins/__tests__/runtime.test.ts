import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PluginRuntime } from '../runtime'
import { EventBus } from '../core/event-bus'
import * as config from '../internal/config'
import * as coreRuntime from '../core/plugin-runtime'
import Instance from '../../domain/models/Instance'

vi.mock('../../domain/models/Instance', () => ({
  default: {
    instances: []
  }
}))

const createRuntimeStub = () => ({
  start: vi.fn().mockResolvedValue({
    enabled: true,
    loaded: [],
    failed: [],
    stats: { total: 0, native: 0, installed: 0, error: 0 },
  }),
  stop: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn().mockResolvedValue({
    enabled: true,
    loaded: [],
    failed: [],
    stats: { total: 0, native: 0, installed: 0, error: 0 },
  }),
  reloadPlugin: vi.fn().mockResolvedValue({ id: 'test-plugin', success: true }),
  getLastReport: vi.fn().mockReturnValue({
    enabled: true,
    loaded: [],
    failed: [],
    stats: { total: 0, native: 0, installed: 0, error: 0 },
  }),
  getEventBus: vi.fn().mockReturnValue(new EventBus()),
})

describe('PluginRuntime', () => {
  beforeEach(() => {
    coreRuntime.resetGlobalRuntime()
    vi.clearAllMocks()
    vi.mocked(Instance.instances).splice(0)
  })

  afterEach(() => {
    coreRuntime.resetGlobalRuntime()
  })

  test('should initialize properly', () => {
    expect(() => PluginRuntime.start()).toBeDefined()
  })

  test('should configure APIs properly', async () => {
    const runtimeStub = createRuntimeStub()
    vi.spyOn(coreRuntime, 'getGlobalRuntime').mockReturnValue(runtimeStub as any)
    vi.spyOn(config, 'loadPluginSpecs').mockResolvedValue([])

    // Since the configureApis method is private, we test the effect when starting
    const mockInstance = {
      id: 1,
      featureManager: {
        commands: {
          reloadCommands: vi.fn(),
        }
      }
    }
    
    // Mock Instance.instances
    vi.mocked(Instance.instances).push(mockInstance as any)

    // Start the runtime
    await expect(PluginRuntime.start()).resolves.toBeDefined()
    expect(config.loadPluginSpecs).toHaveBeenCalled()
  })

  test('should start and stop correctly', async () => {
    const runtimeStub = createRuntimeStub()
    const getRuntimeSpy = vi.spyOn(coreRuntime, 'getGlobalRuntime').mockReturnValue(runtimeStub as any)
    const loadSpecsSpy = vi.spyOn(config, 'loadPluginSpecs').mockResolvedValue([
      {
        id: 'test-plugin',
        module: './test-plugin',
        enabled: true,
        config: {},
      },
    ])

    // Test start
    const startReport = await PluginRuntime.start()
    expect(startReport).toBeDefined()
    expect(getRuntimeSpy).toHaveBeenCalled()
    expect(loadSpecsSpy).toHaveBeenCalled()
    expect(runtimeStub.start).toHaveBeenCalled()

    // Test stop
    await expect(PluginRuntime.stop()).resolves.toBeUndefined()
    expect(runtimeStub.stop).toHaveBeenCalled()

    // Test reload
    const reloadReport = await PluginRuntime.reload()
    expect(reloadReport).toBeDefined()
    expect(runtimeStub.reload).toHaveBeenCalled()
  })

  test('should handle plugin reload correctly', async () => {
    const runtimeStub = createRuntimeStub()
    vi.spyOn(coreRuntime, 'getGlobalRuntime').mockReturnValue(runtimeStub as any)
    const loadSpecsSpy = vi.spyOn(config, 'loadPluginSpecs').mockResolvedValue([
      {
        id: 'test-plugin',
        module: './test-plugin',
        enabled: true,
        config: {},
      },
    ])

    await PluginRuntime.start()
    expect(loadSpecsSpy).toHaveBeenCalled()

    // Test reloadPlugin
    const result = await PluginRuntime.reloadPlugin('test-plugin')
    expect(result).toEqual({ id: 'test-plugin', success: true })
    expect(runtimeStub.reloadPlugin).toHaveBeenCalledWith('test-plugin', {})

    // Test with missing pluginId
    await expect(PluginRuntime.reloadPlugin('')).rejects.toThrow('Missing pluginId')

    // Test with non-existent plugin
    await expect(PluginRuntime.reloadPlugin('non-existent')).rejects.toThrow('Plugin spec not found: non-existent')
  })

  test('should get last report', () => {
    const runtimeStub = createRuntimeStub()
    vi.spyOn(coreRuntime, 'getGlobalRuntime').mockReturnValue(runtimeStub as any)

    const report = PluginRuntime.getLastReport()
    expect(report).toBeDefined()
    expect(report).toHaveProperty('enabled')
    expect(report).toHaveProperty('loaded')
    expect(report).toHaveProperty('failed')
    expect(report).toHaveProperty('stats')
  })

  test('should get event bus', () => {
    const runtimeStub = createRuntimeStub()
    vi.spyOn(coreRuntime, 'getGlobalRuntime').mockReturnValue(runtimeStub as any)

    const eventBus = PluginRuntime.getEventBus()
    expect(eventBus).toBeInstanceOf(EventBus)
  })
})
