import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogger } from '@napgram/infra-kit'
import { EventBus } from '../event-bus'

vi.mock('@napgram/infra-kit', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  hashing: { md5Hex: vi.fn((value: string) => value) },
}))

describe('eventBus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    vi.clearAllMocks()
    eventBus = new EventBus()
  })

  it('subscribe and unsubscribe', () => {
    const handler = vi.fn()
    const subscription = eventBus.subscribe('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    subscription.unsubscribe()
    subscription.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
  })

  it('once', async () => {
    const handler = vi.fn()
    eventBus.once('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    await eventBus.publish('message', { id: '1' } as any)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
  })

  it('publish calls all handlers', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    eventBus.subscribe('message', handler1)
    eventBus.subscribe('message', handler2)

    await eventBus.publish('message', { id: '1' } as any)

    expect(handler1).toHaveBeenCalledWith({ id: '1' })
    expect(handler2).toHaveBeenCalledWith({ id: '1' })
    expect(eventBus.getStats().published).toBe(1)
    expect(eventBus.getStats().handled).toBe(2)
  })

  it('publish with filter', async () => {
    const handler = vi.fn()
    const filter = (event: any) => event.id === '1'
    eventBus.subscribe('message', handler, filter)

    await eventBus.publish('message', { id: '2' } as any)
    expect(handler).not.toHaveBeenCalled()

    await eventBus.publish('message', { id: '1' } as any)
    expect(handler).toHaveBeenCalledWith({ id: '1' })
  })

  it('publish handles error in handler', async () => {
    const handler1 = vi.fn(() => {
      throw new Error('fail')
    })
    const handler2 = vi.fn()
    eventBus.subscribe('message', handler1)
    eventBus.subscribe('message', handler2)

    await eventBus.publish('message', { id: '1' } as any)

    expect(handler2).toHaveBeenCalled()
    expect(eventBus.getStats().errors).toBe(1)
  })

  it('publishSync', () => {
    const handler = vi.fn()
    eventBus.subscribe('message', handler)

    eventBus.publishSync('message', { id: '1' } as any)
    // publishSync is async internally but we can check the stats eventually or use a mock with delay
    expect(eventBus.getStats().published).toBe(1)
  })

  it('publishSync logs errors from publish', async () => {
    vi.resetModules()
    const loggerInstance = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }
    vi.mocked(getLogger).mockReturnValue(loggerInstance as any)

    const { EventBus: FreshEventBus } = await import('../event-bus')
    const freshBus = new FreshEventBus()
    vi.spyOn(freshBus, 'publish').mockRejectedValueOnce(new Error('boom'))

    freshBus.publishSync('message', { id: '1' } as any)

    await Promise.resolve()

    expect(loggerInstance.error).toHaveBeenCalled()
  })

  it('removePluginSubscriptions', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    eventBus.subscribe('message', handler1, undefined, 'plugin1')
    eventBus.subscribe('message', handler2, undefined, 'plugin2')
    eventBus.subscribe('notice', handler1, undefined, 'plugin1')

    expect(eventBus.getSubscriptionCount()).toBe(3)
    expect(eventBus.getPluginSubscriptionCount('plugin1')).toBe(2)

    eventBus.removePluginSubscriptions('plugin1')
    expect(eventBus.getSubscriptionCount()).toBe(1)
    expect(eventBus.getSubscriptionCount('message')).toBe(1)
    expect(eventBus.getPluginSubscriptionCount('plugin1')).toBe(0)
  })

  it('getStats and resetStats', async () => {
    eventBus.subscribe('message', vi.fn())
    await eventBus.publish('message', {} as any)

    expect(eventBus.getStats().published).toBe(1)

    eventBus.resetStats()
    expect(eventBus.getStats().published).toBe(0)
    expect(eventBus.getStats().activeSubscriptions).toBe(1)
  })

  it('clear', () => {
    eventBus.subscribe('message', vi.fn())
    eventBus.subscribe('notice', vi.fn())

    expect(eventBus.getSubscriptionCount()).toBe(2)
    eventBus.clear()
    expect(eventBus.getSubscriptionCount()).toBe(0)
  })

  it('getEventTypes', () => {
    eventBus.subscribe('message', vi.fn())
    eventBus.subscribe('notice', vi.fn())

    expect(eventBus.getEventTypes()).toContain('message')
    expect(eventBus.getEventTypes()).toContain('notice')
  })

  it('should clean up empty subscription set after unsubscribe', () => {
    // Test coverage for lines 161-169 (unsubscribe loop and cleanup)
    const handler = vi.fn()
    const sub1 = eventBus.subscribe('message', handler)
    const sub2 = eventBus.subscribe('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(2)

    // Unsubscribe one
    sub1.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    // Unsubscribe the last one - this should clean up the empty Set (line 169-170)
    sub2.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
    expect(eventBus.getEventTypes()).not.toContain('message')
  })

  it('should unsubscribe specific subscription when multiple exist', () => {
    // Test coverage for line 161 (loop iteration finding specific ID)
    const handler = vi.fn()
    const sub1 = eventBus.subscribe('message', handler)
    const sub2 = eventBus.subscribe('message', handler)
    const sub3 = eventBus.subscribe('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(3)

    // Unsubscribe middle one - ensures loop visits sub1 (no match) then sub2 (match)
    sub2.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(2)

    // Unsubscribe last one
    sub3.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    // Unsubscribe first one
    sub1.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
  })

  it('should handle error without pluginId context', async () => {
    // Test coverage for line 254 (context without pluginId)
    const handler = vi.fn(() => {
      throw new Error('test error')
    })

    // Subscribe without pluginId
    eventBus.subscribe('message', handler)

    await eventBus.publish('message', { id: '1' } as any)

    expect(eventBus.getStats().errors).toBe(1)
  })

  it('should handle error with pluginId context', async () => {
    // Test coverage for line 254 (context with pluginId)
    const handler = vi.fn(() => {
      throw new Error('test error')
    })

    // Subscribe with pluginId
    eventBus.subscribe('message', handler, undefined, 'my-plugin')

    await eventBus.publish('message', { id: '1' } as any)

    expect(eventBus.getStats().errors).toBe(1)
  })
})
