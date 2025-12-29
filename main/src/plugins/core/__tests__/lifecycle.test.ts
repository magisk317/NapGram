import type { PluginInstance } from '../../core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginLifecycleManager, PluginState } from '../../core/lifecycle'

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

describe('pluginLifecycleManager', () => {
  let lifecycleManager: PluginLifecycleManager

  beforeEach(() => {
    lifecycleManager = new PluginLifecycleManager()
    vi.clearAllMocks()
  })

  it('should initialize', () => {
    expect(lifecycleManager).toBeInstanceOf(PluginLifecycleManager)
  })

  it('should install plugin correctly', async () => {
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

  it('should fail install when already installed', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: mockPlugin,
      context: pluginContext,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.install(pluginInstance)

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('already installed')
    expect(pluginInstance.state).toBe(PluginState.Error)
  })

  it('should handle install failure', async () => {
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

  it('should uninstall plugin correctly', async () => {
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

  it('should return early when plugin is already uninstalled', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, uninstall: vi.fn() },
      context: pluginContext,
      config: {},
      state: PluginState.Uninstalled,
    }

    const result = await lifecycleManager.uninstall(pluginInstance)

    expect(result.success).toBe(true)
    expect(result.duration).toBe(0)
    expect(pluginInstance.state).toBe(PluginState.Uninstalled)
    expect(pluginContext.triggerUnload).not.toHaveBeenCalled()
  })

  it('should handle uninstall failure', async () => {
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

  it('should reload plugin correctly', async () => {
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

  it('should reload plugin via uninstall/install when no reload hook', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: undefined },
      context: pluginContext,
      config: { oldConfig: true },
      state: PluginState.Installed,
    }

    const uninstallSpy = vi.spyOn(lifecycleManager, 'uninstall').mockResolvedValue({
      success: true,
      duration: 1,
    })
    const installSpy = vi.spyOn(lifecycleManager, 'install').mockResolvedValue({
      success: true,
      duration: 1,
    })

    const newConfig = { newConfig: true }
    const result = await lifecycleManager.reload(pluginInstance, newConfig)

    expect(result.success).toBe(true)
    expect(uninstallSpy).toHaveBeenCalledTimes(1)
    expect(installSpy).toHaveBeenCalledTimes(1)
    expect(pluginContext.triggerReload).toHaveBeenCalled()
    expect(pluginInstance.config).toEqual(newConfig)
    expect((pluginInstance.context as any).config).toEqual(newConfig)
    expect(pluginInstance.state).toBe(PluginState.Uninitialized)
  })

  it('should handle reload failure', async () => {
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

  it('should install all plugins', async () => {
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
      },
    ]

    const result = await lifecycleManager.installAll(pluginInstances)

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(pluginInstances[0].state).toBe(PluginState.Installed)
    expect(pluginInstances[1].state).toBe(PluginState.Installed)
  })

  it('should handle installAll with some failures', async () => {
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
      },
    ]

    const result = await lifecycleManager.installAll(pluginInstances)

    expect(result.succeeded).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe('plugin-2')
    expect(pluginInstances[0].state).toBe(PluginState.Installed)
    expect(pluginInstances[1].state).toBe(PluginState.Error)
  })

  it('should uninstall all plugins', async () => {
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
      },
    ]

    const result = await lifecycleManager.uninstallAll(pluginInstances)

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(pluginInstances[0].state).toBe(PluginState.Uninstalled)
    expect(pluginInstances[1].state).toBe(PluginState.Uninstalled)
  })

  it('should handle uninstallAll with some failures', async () => {
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
      },
    ]

    const result = await lifecycleManager.uninstallAll(pluginInstances)

    expect(result.succeeded).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].id).toBe('plugin-2')
    expect(pluginInstances[0].state).toBe(PluginState.Uninstalled)
    expect(pluginInstances[1].state).toBe(PluginState.Error)
  })

  it('should update config during reload with custom reload hook (line 202)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: vi.fn().mockResolvedValue(undefined) },
      context: pluginContext,
      config: { old: true },
      state: PluginState.Installed,
    }

    const newConfig = { new: true }
    await lifecycleManager.reload(pluginInstance, newConfig)

    expect(pluginInstance.config).toEqual(newConfig)
    expect((pluginInstance.context as any).config).toEqual(newConfig)
  })

  it('should update config during reload via uninstall/install (line 190)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: undefined },
      context: pluginContext,
      config: { old: true },
      state: PluginState.Installed,
    }

    // Ensure uninstall/install succeed
    vi.spyOn(lifecycleManager, 'uninstall').mockResolvedValue({ success: true, duration: 1 })
    vi.spyOn(lifecycleManager, 'install').mockResolvedValue({ success: true, duration: 1 })

    const newConfig = { new: true }
    await lifecycleManager.reload(pluginInstance, newConfig)

    expect(pluginInstance.config).toEqual(newConfig)
    expect((pluginInstance.context as any).config).toEqual(newConfig)
  })

  it('should report health and stats', () => {
    const healthyInstance: PluginInstance = {
      id: 'healthy',
      plugin: mockPlugin,
      context: createMockPluginContext(),
      config: {},
      state: PluginState.Installed,
    }
    const errorInstance: PluginInstance = {
      id: 'error',
      plugin: mockPlugin,
      context: createMockPluginContext(),
      config: {},
      state: PluginState.Error,
      error: new Error('fail'),
    }
    const uninstalledInstance: PluginInstance = {
      id: 'uninstalled',
      plugin: mockPlugin,
      context: createMockPluginContext(),
      config: {},
      state: PluginState.Uninstalled,
    }

    expect(lifecycleManager.isHealthy(healthyInstance)).toBe(true)
    expect(lifecycleManager.isHealthy(errorInstance)).toBe(false)

    const stats = lifecycleManager.getStats([healthyInstance, errorInstance, uninstalledInstance])
    expect(stats).toEqual({
      total: 3,
      installed: 1,
      error: 1,
      uninstalled: 1,
    })
  })

  it('should reload plugin without newConfig', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, reload: vi.fn() },
      context: pluginContext,
      config: { old: true },
      state: PluginState.Installed,
    }

    await lifecycleManager.reload(pluginInstance)
    expect(pluginInstance.config).toEqual({ old: true })
  })

  it('should uninstall plugin without uninstall hook', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin',
      plugin: { ...mockPlugin, uninstall: undefined },
      context: pluginContext,
      config: {},
      state: PluginState.Installed,
    }

    const result = await lifecycleManager.uninstall(pluginInstance)
    expect(result.success).toBe(true)
  })

  it('should handle empty lists for batch operations', async () => {
    const installResult = await lifecycleManager.installAll([])
    expect(installResult.succeeded).toHaveLength(0)
    expect(installResult.failed).toHaveLength(0)

    const uninstallResult = await lifecycleManager.uninstallAll([])
    expect(uninstallResult.succeeded).toHaveLength(0)
    expect(uninstallResult.failed).toHaveLength(0)
  })

  it('should reload plugin via uninstall/install without new config (line 190)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance: PluginInstance = {
      id: 'test-plugin-no-config-reload',
      plugin: { ...mockPlugin, reload: undefined },
      context: pluginContext,
      config: { existing: true },
      state: PluginState.Installed,
    }

    vi.spyOn(lifecycleManager, 'uninstall').mockResolvedValue({ success: true, duration: 1 })
    vi.spyOn(lifecycleManager, 'install').mockResolvedValue({ success: true, duration: 1 })

    // Call reload without newConfig
    await lifecycleManager.reload(pluginInstance)

    // Config should remain unchanged
    expect(pluginInstance.config).toEqual({ existing: true })
    // Verify uninstall/install cycle happen
    expect(lifecycleManager.uninstall).toHaveBeenCalled()
    expect(lifecycleManager.install).toHaveBeenCalled()
  })

  it('should handle installAll/uninstallAll with malformed results (lines 241, 276)', async () => {
    const pluginContext = createMockPluginContext()
    const pluginInstance = {
      id: 'p1',
      plugin: mockPlugin,
      context: pluginContext,
      config: {},
      state: PluginState.Uninitialized,
    } as PluginInstance

    // Mock install to return success: false but no error (should trigger implicit else)
    vi.spyOn(lifecycleManager, 'install').mockResolvedValue({ success: false, duration: 0 } as any)
    const installRes = await lifecycleManager.installAll([pluginInstance])
    expect(installRes.succeeded).toHaveLength(0)
    expect(installRes.failed).toHaveLength(0)

    // Mock uninstall to return success: false but no error
    vi.spyOn(lifecycleManager, 'uninstall').mockResolvedValue({ success: false, duration: 0 } as any)
    const uninstallRes = await lifecycleManager.uninstallAll([pluginInstance])
    expect(uninstallRes.succeeded).toHaveLength(0)
    expect(uninstallRes.failed).toHaveLength(0)
  })
})
