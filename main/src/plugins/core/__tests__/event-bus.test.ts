import { describe, expect, test, vi, beforeEach } from 'vitest'
import { EventBus } from '../event-bus'
import { getLogger } from '../../../shared/logger'

vi.mock('../../../shared/logger', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
}))

describe('EventBus', () => {
    let eventBus: EventBus

    beforeEach(() => {
        vi.clearAllMocks()
        eventBus = new EventBus()
    })

    test('subscribe and unsubscribe', () => {
        const handler = vi.fn()
        const subscription = eventBus.subscribe('message', handler)

        expect(eventBus.getSubscriptionCount('message')).toBe(1)

        subscription.unsubscribe()
        subscription.unsubscribe()
        expect(eventBus.getSubscriptionCount('message')).toBe(0)
    })

    test('once', async () => {
        const handler = vi.fn()
        eventBus.once('message', handler)

        expect(eventBus.getSubscriptionCount('message')).toBe(1)

        await eventBus.publish('message', { id: '1' } as any)
        expect(handler).toHaveBeenCalledTimes(1)
        expect(eventBus.getSubscriptionCount('message')).toBe(0)
    })

    test('publish calls all handlers', async () => {
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

    test('publish with filter', async () => {
        const handler = vi.fn()
        const filter = (event: any) => event.id === '1'
        eventBus.subscribe('message', handler, filter)

        await eventBus.publish('message', { id: '2' } as any)
        expect(handler).not.toHaveBeenCalled()

        await eventBus.publish('message', { id: '1' } as any)
        expect(handler).toHaveBeenCalledWith({ id: '1' })
    })

    test('publish handles error in handler', async () => {
        const handler1 = vi.fn(() => { throw new Error('fail') })
        const handler2 = vi.fn()
        eventBus.subscribe('message', handler1)
        eventBus.subscribe('message', handler2)

        await eventBus.publish('message', { id: '1' } as any)

        expect(handler2).toHaveBeenCalled()
        expect(eventBus.getStats().errors).toBe(1)
    })

    test('publishSync', () => {
        const handler = vi.fn()
        eventBus.subscribe('message', handler)

        eventBus.publishSync('message', { id: '1' } as any)
        // publishSync is async internally but we can check the stats eventually or use a mock with delay
        expect(eventBus.getStats().published).toBe(1)
    })

    test('publishSync logs errors from publish', async () => {
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

    test('removePluginSubscriptions', () => {
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

    test('getStats and resetStats', async () => {
        eventBus.subscribe('message', vi.fn())
        await eventBus.publish('message', {} as any)

        expect(eventBus.getStats().published).toBe(1)

        eventBus.resetStats()
        expect(eventBus.getStats().published).toBe(0)
        expect(eventBus.getStats().activeSubscriptions).toBe(1)
    })

    test('clear', () => {
        eventBus.subscribe('message', vi.fn())
        eventBus.subscribe('notice', vi.fn())

        expect(eventBus.getSubscriptionCount()).toBe(2)
        eventBus.clear()
        expect(eventBus.getSubscriptionCount()).toBe(0)
    })

    test('getEventTypes', () => {
        eventBus.subscribe('message', vi.fn())
        eventBus.subscribe('notice', vi.fn())

        expect(eventBus.getEventTypes()).toContain('message')
        expect(eventBus.getEventTypes()).toContain('notice')
    })
})
