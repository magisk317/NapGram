import { describe, expect, test, vi, beforeEach } from 'vitest'
import { PluginContextImpl } from '../plugin-context'
import { EventBus } from '../event-bus'

const mocks = vi.hoisted(() => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
    storage: {}
}))

vi.mock('../api/logger', () => ({
    createPluginLogger: vi.fn(() => mocks.logger),
}))

vi.mock('../api/storage', () => ({
    createPluginStorage: vi.fn(() => mocks.storage),
}))

describe('PluginContextImpl', () => {
    let eventBus: EventBus
    let context: PluginContextImpl
    const pluginId = 'test-plugin'
    const config = { key: 'value' }

    beforeEach(() => {
        vi.clearAllMocks()
        eventBus = new EventBus()
        context = new PluginContextImpl(pluginId, config, eventBus)
    })

    test('initialization', () => {
        expect(context.pluginId).toBe(pluginId)
        expect(context.config).toEqual(config)
        expect(context.logger).toBeDefined()
        expect(context.storage).toBeDefined()
    })

    test('api injection', () => {
        const mockMessageAPI = { send: vi.fn() } as any
        const customContext = new PluginContextImpl(pluginId, config, eventBus, { message: mockMessageAPI })
        expect(customContext.message).toBe(mockMessageAPI)
    })

    test('mock apis work when not provided', async () => {
        const warnSpy = vi.spyOn(context.logger, 'warn')

        await context.message.send({} as any)
        await context.instance.list()
        await context.user.getInfo('123')
        await context.group.getInfo('123')
        await context.group.getMembers?.('123')
        await context.group.setAdmin?.('123', '456', true)
        await context.group.muteUser?.('123', '456', 60)
        await context.group.kickUser?.('123', '456')

        expect(warnSpy).toHaveBeenCalled()
    })

    test('on subscribes to eventBus', () => {
        const handler = vi.fn()
        const spy = vi.spyOn(eventBus, 'subscribe')
        context.on('message', handler)
        expect(spy).toHaveBeenCalledWith('message', handler, undefined, pluginId)
    })

    test('command registration', () => {
        const cmd = { name: 'test', aliases: ['t'], handler: vi.fn() }
        context.command(cmd)
        const commands = context.getCommands()
        expect(commands.get('test')).toBe(cmd)
        expect(commands.get('t')).toBe(cmd)
    })

    test('lifecycle hooks handles errors', async () => {
        const error = new Error('bail')
        const badCallback = () => { throw error }
        const errSpy = vi.spyOn(context.logger, 'error')

        context.onReload(badCallback)
        context.onUnload(badCallback)

        await context.triggerReload()
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('reload'), error)

        await context.triggerUnload()
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('unload'), error)
    })

    test('cleanup', () => {
        const spy = vi.spyOn(eventBus, 'removePluginSubscriptions')
        context.cleanup()
        expect(spy).toHaveBeenCalledWith(pluginId)
        expect(context.getCommands().size).toBe(0)
    })
})
