import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messageConverter } from '../../domain/message'
import { FeatureManager } from '../FeatureManager'

vi.mock('../../domain/message', () => ({
  messageConverter: {
    setInstance: vi.fn(),
  },
}))

describe('featureManager', () => {
  const mockInstance = { id: 1 } as any
  const mockTgBot = {} as any
  const mockQqClient = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockInstance.mediaFeature = undefined
    mockInstance.commandsFeature = undefined
    mockInstance.recallFeature = undefined
    mockInstance.forwardFeature = undefined
  })

  it('should initialize all features', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    const status = manager.getFeatureStatus()
    expect(status).toEqual({})
  })

  it('should use plugin-provided forward feature', async () => {
    const forwardFeature = { destroy: vi.fn() }
    const instanceWithForward = { id: 1, forwardFeature } as any
    const manager = new FeatureManager(instanceWithForward, mockTgBot, mockQqClient)

    await manager.initialize()

    expect(manager.forward).toBe(forwardFeature)
    const status = manager.getFeatureStatus()
    expect(status).toEqual({
      forward: true,
    })
  })

  it('should use plugin-provided commands feature', async () => {
    const commandsFeature = { destroy: vi.fn() }
    const instanceWithCommands = { id: 1, commandsFeature } as any
    const manager = new FeatureManager(instanceWithCommands, mockTgBot, mockQqClient)

    await manager.initialize()

    expect(manager.commands).toBe(commandsFeature)
    const status = manager.getFeatureStatus()
    expect(status.commands).toBe(true)
  })

  it('should enable and disable features', async () => {
    const instanceWithMedia = { id: 1, mediaFeature: { destroy: vi.fn() } } as any
    const manager = new FeatureManager(instanceWithMedia, mockTgBot, mockQqClient)
    await manager.initialize()

    expect(manager.enableFeature('media')).toBe(true)
    expect(manager.disableFeature('media')).toBe(true)

    expect(manager.enableFeature('unknown')).toBe(false)
    expect(manager.disableFeature('unknown')).toBe(false)
  })

  it('should handle errors during initialization', async () => {
    vi.mocked(messageConverter.setInstance).mockImplementationOnce(() => {
      throw new Error('Init error')
    })
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await expect(manager.initialize()).rejects.toThrow('Init error')
  })

  it('should destroy all features', async () => {
    const mockDestroy = vi.fn()
    const instanceWithFeatures = {
      id: 1,
      mediaFeature: { destroy: mockDestroy },
      commandsFeature: { destroy: mockDestroy },
      recallFeature: { destroy: mockDestroy },
    } as any
    const manager = new FeatureManager(instanceWithFeatures, mockTgBot, mockQqClient)
    await manager.initialize()

    await manager.destroy()
    expect(mockDestroy).toHaveBeenCalledTimes(3)
  })

  it('should skip non-function destroy handlers', async () => {
    const mockDestroy = vi.fn()
    const instanceWithFeatures = {
      id: 1,
      mediaFeature: { destroy: mockDestroy },
      commandsFeature: { destroy: 'noop' as any },
      recallFeature: { destroy: mockDestroy },
    } as any
    const manager = new FeatureManager(instanceWithFeatures, mockTgBot, mockQqClient)
    await manager.initialize()

    await manager.destroy()
    expect(mockDestroy).toHaveBeenCalledTimes(2)
  })

  it('should handle errors during destroy', async () => {
    const failingDestroy = vi.fn().mockImplementation(() => {
      throw new Error('Destroy failed')
    })
    const workingDestroy = vi.fn()

    const instanceWithFeatures = {
      id: 1,
      mediaFeature: { destroy: failingDestroy },
      commandsFeature: { destroy: workingDestroy },
    } as any
    const manager = new FeatureManager(instanceWithFeatures, mockTgBot, mockQqClient)
    await manager.initialize()

    await manager.destroy()
    expect(workingDestroy).toHaveBeenCalled()
    expect(failingDestroy).toHaveBeenCalled()
  })

  it('should return false when registering invalid or duplicate features', () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)

    // Invalid feature
    expect(manager.registerFeature('media', undefined)).toBe(false)

    const feat = { destroy: vi.fn() }
    expect(manager.registerFeature('media', feat as any)).toBe(true)

    // Duplicate
    expect(manager.registerFeature('media', {} as any)).toBe(false)
  })

  it('should log update when registering feature after initialization', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    const feat = { destroy: vi.fn() }
    // This triggers "FeatureManager 已更新" log branch
    expect(manager.registerFeature('media', feat as any)).toBe(true)
  })
})
