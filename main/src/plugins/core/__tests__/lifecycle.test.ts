import { describe, expect, test, vi, beforeEach } from 'vitest'
import { PluginLifecycleManager, PluginState } from '../../core/lifecycle'
import type { PluginInstance } from '../../core/lifecycle'

// Mock plugin for testing
const mockPlugin = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  install: vi.fn(),
  uninstall: vi.fn(),
  reload: vi.fn(),
}

// Create a properly mocked plugin context
function createMockPluginContext() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    on: vi.fn(),
    onUnload: vi.fn(),
    triggerUnload: vi.fn(),
    triggerReload: vi.fn(),
    pluginId: 'test-plugin',
    config: {},
    apis: {},
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: vi.fn() },
    eventBus: { on: vi.fn(), off: vi.fn(), publish: vi.fn(), publishSync: vi.fn() },
    cleanup: vi.fn(),
  }
}

describe('PluginLifecycleManager', () => {
  let lifecycleManager: PluginLifecycleManager

  beforeEach(() => {
    lifecycleManager = new PluginLifecycleManager()
    vi.clearAllMocks()
  })

  test('should initialize', () => {
    expect(lifecycleManager).toBeInstanceOf(PluginLifecycleManager)
  })

  test('should install plugin correctly', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: mockPlugin,
      context: pluginContext,
      config: {},
      state: PluginState.Uninitialized,
    }

    await lifecycleManager.install(pluginInstance)

    expect(pluginInstance.state).toBe(PluginState.Installed)
    expect(mockPlugin.install).toHaveBeenCalled()
  })

  test('should handle install failure', async () => {
    const failingPlugin = {
      ...mockPlugin,
      install: vi.fn().mockRejectedValue(new Error('Install failed')),
    }
    
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'failing-plugin',
      plugin: failingPlugin,
      context: pluginContext,
      config: {},
      state: PluginState.Uninitialized,
    }

    const result = await lifecycleManager.install(pluginInstance)
    
    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(pluginInstance.state).toBe(PluginState.Error)
    expect(failingPlugin.install).toHaveBeenCalled()
  })

  test('should uninstall plugin correctly', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, uninstall: vi.fn() },
      context: pluginContext,
      config: {},
      state: PluginState.Installed,
    }

    await lifecycleManager.uninstall(pluginInstance)

    expect(pluginInstance.state).toBe(PluginState.Uninstalled)
    expect(pluginContext.triggerUnload).toHaveBeenCalled()
  })

  test('should handle uninstall failure', async () => {
    const pluginContext = {
      ...createMockPluginContext(),
      triggerUnload: vi.fn().mockRejectedValue(new Error('Unload failed')),
    }
    
    const pluginInstance: PluginInstance = {
      id: 'failing-plugin',
      plugin: { ...mockPlugin, uninstall: vi.fn() },
      context: pluginContext,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.uninstall(pluginInstance)
    
    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(pluginInstance.state).toBe(PluginState.Error)
  })

  test('should reload plugin correctly', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: vi.fn() },
      context: pluginContext,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.reload(pluginInstance, { newConfig: true })

    expect(result.success).toBe(true)
    expect(pluginInstance.config).toEqual({ newConfig: true })
    expect(pluginContext.triggerReload).toHaveBeenCalled()
  })

  test('should handle reload failure', async () => {
    const pluginContext = {
      ...createMockPluginContext(),
      triggerReload: vi.fn().mockRejectedValue(new Error('Reload failed')),
    }
    
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: vi.fn() },
      context: pluginContext,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.reload(pluginInstance)

    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
  })

  test('should install all plugins', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = createMockPluginContext()
    
    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: mockPlugin,
        context: pluginContext1,
        config: {},
        state: PluginState.Uninitialized,
      },
      {
        id: 'plugin-2',
        plugin: { ...mockPlugin, id: 'plugin-2' },
        context: pluginContext2,
        config: {},
        state: PluginState.Uninitialized,
      }
    ]

    const result = await lifecycleManager.installAll(pluginInstances)

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(pluginInstances[0].state).toBe(PluginState.Installed)
    expect(pluginInstances[1].state).toBe(PluginState.Installed)
  })

  test('should handle installAll with some failures', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = createMockPluginContext()
    
    const failingPlugin = {
      ...mockPlugin,
      id: 'plugin-2',
      install: vi.fn().mockRejectedValue(new Error('Install failed')),
    }
    
    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: mockPlugin,
        context: pluginContext1,
        config: {},
        state: PluginState.Uninitialized,
      },
      {
        id: 'plugin-2',
        plugin: failingPlugin,
        context: pluginContext2,
        config: {},
        state: PluginState.Uninitialized,
      }
    ]

    const result = await lifecycleManager.installAll(pluginInstances)

    expect(result.succeeded).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe('plugin-2')
    expect(pluginInstances[0].state).toBe(PluginState.Installed)
    expect(pluginInstances[1].state).toBe(PluginState.Error)
  })

  test('should uninstall all plugins', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = createMockPluginContext()
    
    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: { ...mockPlugin, uninstall: vi.fn() },
        context: pluginContext1,
        config: {},
        state: PluginState.Installed,
      },
      {
        id: 'plugin-2',
        plugin: { ...mockPlugin, id: 'plugin-2', uninstall: vi.fn() },
        context: pluginContext2,
        config: {},
        state: PluginState.Installed,
      }
    ]

    const result = await lifecycleManager.uninstallAll(pluginInstances)

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(pluginInstances[0].state).toBe(PluginState.Uninstalled)
    expect(pluginInstances[1].state).toBe(PluginState.Uninstalled)
  })

  test('should handle uninstallAll with some failures', async () => {
    const pluginContext1 = createMockPluginContext()
    const pluginContext2 = {
      ...createMockPluginContext(),
      triggerUnload: vi.fn().mockRejectedValue(new Error('Unload failed')),
    }
    
    const pluginInstances: PluginInstance[] = [
      {
        id: 'plugin-1',
        plugin: { ...mockPlugin, uninstall: vi.fn() },
        context: pluginContext1,
        config: {},
        state: PluginState.Installed,
      },
      {
        id: 'plugin-2',
        plugin: { ...mockPlugin, id: 'plugin-2', uninstall: vi.fn() },
        context: pluginContext2,
        config: {},
        state: PluginState.Installed,
      }
    ]

    const result = await lifecycleManager.uninstallAll(pluginInstances)

    expect(result.succeeded).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe('plugin-2')
    expect(pluginInstances[0].state).toBe(PluginState.Uninstalled)
    expect(pluginInstances[1].state).toBe(PluginState.Error)
  })
})