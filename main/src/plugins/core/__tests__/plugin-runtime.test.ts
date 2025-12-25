import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { PluginRuntime, getGlobalRuntime, resetGlobalRuntime, RuntimeReport } from '../../core/plugin-runtime'
import { EventBus } from '../../core/event-bus'
import { PluginLifecycleManager } from '../../core/lifecycle'
import { PluginLoader } from '../../core/plugin-loader'

// Mock plugin for testing
const mockPlugin = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  install: vi.fn(),
}

describe('PluginRuntime Core', () => {
  let pluginRuntime: PluginRuntime

  beforeEach(() => {
    resetGlobalRuntime()
    pluginRuntime = new PluginRuntime()
  })

  afterEach(() => {
    resetGlobalRuntime()
  })

  test('should initialize with default config', () => {
    expect(pluginRuntime).toBeInstanceOf(PluginRuntime)
    expect(pluginRuntime.isActive()).toBe(false)
  })

  test('should initialize with custom config', () => {
    const eventBus = new EventBus()
    const loader = new PluginLoader()
    const lifecycleManager = new PluginLifecycleManager()
    const apis = { message: {}, instance: {}, user: {}, group: {} }

    const customRuntime = new PluginRuntime({
      eventBus,
      loader,
      lifecycleManager,
      apis
    })

    expect(customRuntime).toBeInstanceOf(PluginRuntime)
  })

  test('should start and stop runtime correctly', async () => {
    // Mock plugin specs
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {}
    }]

    // Mock loader to return test plugin
    vi.spyOn(pluginRuntime['loader'], 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const
    })

    // Mock lifecycle manager
    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'uninstallAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    // Test start
    const report: RuntimeReport = await pluginRuntime.start(specs)
    expect(report).toBeDefined()
    expect(report.enabled).toBe(true)
    expect(pluginRuntime.isActive()).toBe(true)

    // Test stop
    await pluginRuntime.stop()
    expect(pluginRuntime.isActive()).toBe(false)
  })

  test('should handle plugin loading failure gracefully', async () => {
    const specs = [
      {
        id: 'working-plugin',
        module: './working-plugin',
        enabled: true,
        config: {}
      },
      {
        id: 'failing-plugin',
        module: './failing-plugin',
        enabled: true,
        config: {}
      }
    ]

    // Mock loader to return one working and one failing plugin
    const loadSpy = vi.spyOn(pluginRuntime['loader'], 'load')
    loadSpy.mockImplementation(async (spec: any) => {
      if (spec.id === 'working-plugin') {
        return { plugin: mockPlugin, type: 'native' as const }
      } else {
        throw new Error('Failed to load plugin')
      }
    })

    // Mock lifecycle manager
    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    const report: RuntimeReport = await pluginRuntime.start(specs)
    expect(report.loaded.length).toBe(1)
    expect(report.failed.length).toBe(1)
    expect(report.failed[0].id).toBe('failing-plugin')
  })

  test('should reload runtime correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {}
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime['loader'], 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'uninstallAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    // Start and then reload
    await pluginRuntime.start(specs)
    expect(pluginRuntime.isActive()).toBe(true)

    const reloadReport = await pluginRuntime.reload(specs)
    expect(reloadReport).toBeDefined()
    expect(pluginRuntime.isActive()).toBe(true)
  })

  test('should handle reload plugin correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {}
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime['loader'], 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'reload').mockResolvedValue({
      success: true
    })

    // Start runtime first
    await pluginRuntime.start(specs)

    // Test reloadPlugin
    const result = await pluginRuntime.reloadPlugin('test-plugin', { newConfig: true })
    expect(result).toEqual({ id: 'test-plugin', success: true })
  })

  test('should handle reload plugin failure when runtime is not active', async () => {
    const result = await pluginRuntime.reloadPlugin('test-plugin', { newConfig: true })
    expect(result).toEqual({ 
      id: 'test-plugin', 
      success: false, 
      error: 'PluginRuntime is not running' 
    })
  })

  test('should handle reload plugin failure when plugin not found', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {}
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime['loader'], 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    // Start runtime (but don't actually store the plugin)
    await pluginRuntime.start(specs)

    // Try to reload a non-existent plugin
    const result = await pluginRuntime.reloadPlugin('non-existent-plugin')
    expect(result).toEqual({ 
      id: 'non-existent-plugin', 
      success: false, 
      error: 'Plugin not loaded: non-existent-plugin' 
    })
  })

  test('should manage plugins correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {}
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime['loader'], 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    // Start runtime
    await pluginRuntime.start(specs)

    // Check that plugin is registered
    const pluginInstance = pluginRuntime.getPlugin('test-plugin')
    expect(pluginInstance).toBeDefined()
    expect(pluginInstance!.id).toBe('test-plugin')

    // Check all plugins
    const allPlugins = pluginRuntime.getAllPlugins()
    expect(allPlugins.length).toBe(1)

    // Check plugin type
    const pluginType = pluginRuntime.getPluginType('test-plugin')
    expect(pluginType).toBe('native')

    // Check stats
    const stats = pluginRuntime.getStats()
    expect(stats.total).toBe(1)
    expect(stats.native).toBe(1)
  })

  test('should unload plugin correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {}
    }]

    // Mock loader, lifecycle, and uninstall
    vi.spyOn(pluginRuntime['loader'], 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'installAll').mockResolvedValue({
      succeeded: [],
      failed: []
    })

    vi.spyOn(pluginRuntime['lifecycleManager'], 'uninstall').mockResolvedValue(undefined)

    // Start runtime
    await pluginRuntime.start(specs)

    // Check plugin exists
    expect(pluginRuntime.getPlugin('test-plugin')).toBeDefined()

    // Unload plugin
    await pluginRuntime.unloadPlugin('test-plugin')

    // Check plugin is removed
    expect(pluginRuntime.getPlugin('test-plugin')).toBeUndefined()
  })

  test('should handle unload failure for non-existent plugin', async () => {
    await expect(pluginRuntime.unloadPlugin('non-existent')).rejects.toThrow('Plugin non-existent not found')
  })

  test('should get last report', () => {
    const report = pluginRuntime.getLastReport()
    expect(report).toBeDefined()
    expect(report).toHaveProperty('enabled')
    expect(report).toHaveProperty('loaded')
    expect(report).toHaveProperty('failed')
    expect(report).toHaveProperty('stats')
  })

  test('should get event bus', () => {
    const eventBus = pluginRuntime.getEventBus()
    expect(eventBus).toBeInstanceOf(EventBus)
  })

  test('should set APIs correctly', () => {
    const newApis = { message: { send: vi.fn() } }
    pluginRuntime.setApis(newApis)
    
    // This is a bit tricky to test since setApis is a private method in PluginRuntime
    // But it should at least not throw
    expect(() => pluginRuntime.setApis(newApis)).not.toThrow()
  })
})

describe('Global Runtime', () => {
  beforeEach(() => {
    resetGlobalRuntime()
  })

  afterEach(() => {
    resetGlobalRuntime()
  })

  test('should create and return global runtime instance', () => {
    const runtime1 = getGlobalRuntime()
    const runtime2 = getGlobalRuntime()
    
    expect(runtime1).toBe(runtime2) // Should return the same instance
  })

  test('should accept config on first call only', () => {
    const apis = { message: {}, instance: {} }
    const runtime1 = getGlobalRuntime({ apis })
    const runtime2 = getGlobalRuntime({ apis: { user: {} } }) // This config should be ignored
    
    expect(runtime1).toBe(runtime2) 
  })
})