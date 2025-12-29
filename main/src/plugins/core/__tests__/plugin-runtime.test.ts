import type { RuntimeReport } from '../../core/plugin-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../core/event-bus'
import { PluginLifecycleManager } from '../../core/lifecycle'
import { PluginLoader } from '../../core/plugin-loader'
import { getGlobalRuntime, PluginRuntime, resetGlobalRuntime } from '../../core/plugin-runtime'

// Mock plugin for testing
const mockPlugin = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  install: vi.fn(),
}

describe('pluginRuntime Core', () => {
  let pluginRuntime: PluginRuntime

  beforeEach(() => {
    resetGlobalRuntime()
    pluginRuntime = new PluginRuntime()
  })

  afterEach(() => {
    resetGlobalRuntime()
  })

  it('should initialize with default config', () => {
    expect(pluginRuntime).toBeInstanceOf(PluginRuntime)
    expect(pluginRuntime.isActive()).toBe(false)
  })

  it('should initialize with custom config', () => {
    const eventBus = new EventBus()
    const loader = new PluginLoader()
    const lifecycleManager = new PluginLifecycleManager()
    const apis = { message: {}, instance: {}, user: {}, group: {} }

    const customRuntime = new PluginRuntime({
      eventBus,
      loader,
      lifecycleManager,
      apis,
    })

    expect(customRuntime).toBeInstanceOf(PluginRuntime)
  })

  it('should start and stop runtime correctly', async () => {
    // Mock plugin specs
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    // Mock loader to return test plugin
    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    // Mock lifecycle manager
    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'uninstallAll').mockResolvedValue({
      succeeded: [],
      failed: [],
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

  it('should return last report when already running', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    const loadSpy = vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    const firstReport = await pluginRuntime.start(specs)
    const secondReport = await pluginRuntime.start(specs)

    expect(secondReport).toBe(firstReport)
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('should skip disabled plugins', async () => {
    const specs = [{
      id: 'disabled-plugin',
      module: './disabled-plugin',
      enabled: false,
      config: {},
    }]

    const loadSpy = vi.spyOn(pluginRuntime.loader, 'load')
    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    const report = await pluginRuntime.start(specs)

    expect(loadSpy).not.toHaveBeenCalled()
    expect(report.loaded).toHaveLength(0)
  })

  it('should skip disabled plugin without id', async () => {
    const specs = [{
      module: './disabled-plugin',
      enabled: false,
      config: {},
    }] as any

    const loadSpy = vi.spyOn(pluginRuntime.loader, 'load')
    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    const report = await pluginRuntime.start(specs)

    expect(loadSpy).not.toHaveBeenCalled()
    expect(report.loaded).toHaveLength(0)
  })

  it('should surface start failures from installAll', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockRejectedValue(new Error('install failed'))

    await expect(pluginRuntime.start(specs)).rejects.toThrow('install failed')
  })

  it('should handle plugin loading failure gracefully', async () => {
    const specs = [
      {
        id: 'working-plugin',
        module: './working-plugin',
        enabled: true,
        config: {},
      },
      {
        id: 'failing-plugin',
        module: './failing-plugin',
        enabled: true,
        config: {},
      },
    ]

    // Mock loader to return one working and one failing plugin
    const loadSpy = vi.spyOn(pluginRuntime.loader, 'load')
    loadSpy.mockImplementation(async (spec: any) => {
      if (spec.id === 'working-plugin') {
        return { plugin: mockPlugin, type: 'native' as const }
      }
      else {
        throw new Error('Failed to load plugin')
      }
    })

    // Mock lifecycle manager
    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    const report: RuntimeReport = await pluginRuntime.start(specs)
    expect(report.loaded.length).toBe(1)
    expect(report.failed.length).toBe(1)
    expect(report.failed[0].id).toBe('failing-plugin')
  })

  it('should reload runtime correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'uninstallAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    // Start and then reload
    await pluginRuntime.start(specs)
    expect(pluginRuntime.isActive()).toBe(true)

    const reloadReport = await pluginRuntime.reload(specs)
    expect(reloadReport).toBeDefined()
    expect(pluginRuntime.isActive()).toBe(true)
  })

  it('should handle reload plugin correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'reload').mockResolvedValue({
      success: true,
    })

    // Start runtime first
    await pluginRuntime.start(specs)

    // Test reloadPlugin
    const result = await pluginRuntime.reloadPlugin('test-plugin', { newConfig: true })
    expect(result).toEqual({ id: 'test-plugin', success: true })
  })

  it('should return error when reload fails', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'reload').mockResolvedValue({
      success: false,
      error: new Error('Reload failed'),
    })

    await pluginRuntime.start(specs)

    const result = await pluginRuntime.reloadPlugin('test-plugin')
    expect(result).toEqual({ id: 'test-plugin', success: false, error: 'Reload failed' })
  })

  it('should return unknown error when reload fails without details', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'reload').mockResolvedValue({
      success: false,
    })

    await pluginRuntime.start(specs)

    const result = await pluginRuntime.reloadPlugin('test-plugin')
    expect(result).toEqual({ id: 'test-plugin', success: false, error: 'Unknown error' })
  })

  it('should handle reload plugin failure when runtime is not active', async () => {
    const result = await pluginRuntime.reloadPlugin('test-plugin', { newConfig: true })
    expect(result).toEqual({
      id: 'test-plugin',
      success: false,
      error: 'PluginRuntime is not running',
    })
  })

  it('should handle reload plugin failure when plugin not found', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    // Start runtime (but don't actually store the plugin)
    await pluginRuntime.start(specs)

    // Try to reload a non-existent plugin
    const result = await pluginRuntime.reloadPlugin('non-existent-plugin')
    expect(result).toEqual({
      id: 'non-existent-plugin',
      success: false,
      error: 'Plugin not loaded: non-existent-plugin',
    })
  })

  it('should manage plugins correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    // Mock loader and lifecycle
    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
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

  it('should warn when stopping a non-running runtime', async () => {
    const uninstallSpy = vi.spyOn(pluginRuntime.lifecycleManager, 'uninstallAll')

    await expect(pluginRuntime.stop()).resolves.toBeUndefined()
    expect(uninstallSpy).not.toHaveBeenCalled()
  })

  it('should throw when stop fails', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'uninstallAll').mockRejectedValue(new Error('stop failed'))

    await pluginRuntime.start(specs)

    await expect(pluginRuntime.stop()).rejects.toThrow('stop failed')
  })

  it('should unload plugin correctly', async () => {
    const specs = [{
      id: 'test-plugin',
      module: './test-plugin',
      enabled: true,
      config: {},
    }]

    // Mock loader, lifecycle, and uninstall
    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: mockPlugin,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'uninstall').mockResolvedValue(undefined)

    // Start runtime
    await pluginRuntime.start(specs)

    // Check plugin exists
    expect(pluginRuntime.getPlugin('test-plugin')).toBeDefined()

    // Unload plugin
    await pluginRuntime.unloadPlugin('test-plugin')

    // Check plugin is removed
    expect(pluginRuntime.getPlugin('test-plugin')).toBeUndefined()
  })

  it('should handle unload failure for non-existent plugin', async () => {
    await expect(pluginRuntime.unloadPlugin('non-existent')).rejects.toThrow('Plugin non-existent not found')
  })

  it('should report missing plugin id', async () => {
    const specs = [{
      module: './no-id-plugin',
      enabled: true,
      config: {},
    }] as any

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: { name: 'NoIdPlugin' },
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    const report = await pluginRuntime.start(specs)
    expect(report.failed[0].error).toContain('Plugin id is required')
  })

  it('should report duplicate plugin ids', async () => {
    const specs = [
      {
        id: 'dup-plugin',
        module: './dup-plugin',
        enabled: true,
        config: {},
      },
      {
        id: 'dup-plugin',
        module: './dup-plugin-2',
        enabled: true,
        config: {},
      },
    ]

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: { ...mockPlugin, id: 'dup-plugin' },
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({
      succeeded: [],
      failed: [],
    })

    const report = await pluginRuntime.start(specs)
    expect(report.failed[0].error).toContain('already loaded')
  })

  it('should get last report', () => {
    const report = pluginRuntime.getLastReport()
    expect(report).toBeDefined()
    expect(report).toHaveProperty('enabled')
    expect(report).toHaveProperty('loaded')
    expect(report).toHaveProperty('failed')
    expect(report).toHaveProperty('stats')
  })

  it('should get event bus', () => {
    const eventBus = pluginRuntime.getEventBus()
    expect(eventBus).toBeInstanceOf(EventBus)
  })

  it('should set APIs correctly', () => {
    const newApis = { message: { send: vi.fn() } }
    pluginRuntime.setApis(newApis)

    // This is a bit tricky to test since setApis is a private method in PluginRuntime
    // But it should at least not throw
    expect(() => pluginRuntime.setApis(newApis)).not.toThrow()
  })

  it('should handle plugin ID mismatch (line 290)', async () => {
    const specs = [{
      id: 'spec-id',
      module: './mismatch-plugin',
      enabled: true,
      config: {},
    }]

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: { id: 'plugin-id', install: vi.fn() } as any,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({ succeeded: [], failed: [] })

    await pluginRuntime.start(specs)
    const instance = pluginRuntime.getPlugin('spec-id')
    expect(instance?.plugin.id).toBe('spec-id')
  })

  it('should handle non-Error object in start failure (line 166)', async () => {
    const specs = [{
      id: 'fail-plugin',
      module: './fail-plugin',
      enabled: true,
      config: {},
    }]

    vi.spyOn(pluginRuntime.loader, 'load').mockRejectedValue('string error')
    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({ succeeded: [], failed: [] })

    const report = await pluginRuntime.start(specs)
    expect(report.failed[0].error).toBe('string error')
  })

  it('should handle missing config in spec (line 302, 312)', async () => {
    const specs = [{
      id: 'no-config-plugin',
      module: './no-config-plugin',
      enabled: true,
      // config is missing
    }] as any

    vi.spyOn(pluginRuntime.loader, 'load').mockResolvedValue({
      plugin: { id: 'no-config-plugin', install: vi.fn() } as any,
      type: 'native' as const,
    })

    vi.spyOn(pluginRuntime.lifecycleManager, 'installAll').mockResolvedValue({ succeeded: [], failed: [] })

    await pluginRuntime.start(specs)
    const instance = pluginRuntime.getPlugin('no-config-plugin')
    expect(instance?.config).toEqual({})
  })
})

describe('global Runtime', () => {
  beforeEach(() => {
    resetGlobalRuntime()
  })

  afterEach(() => {
    resetGlobalRuntime()
  })

  it('should create and return global runtime instance', () => {
    const runtime1 = getGlobalRuntime()
    const runtime2 = getGlobalRuntime()

    expect(runtime1).toBe(runtime2) // Should return the same instance
  })

  it('should accept config on first call only', () => {
    const apis = { message: {}, instance: {} }
    const runtime1 = getGlobalRuntime({ apis })
    const runtime2 = getGlobalRuntime({ apis: { user: {} } }) // This config should be ignored

    expect(runtime1).toBe(runtime2)
  })
})
