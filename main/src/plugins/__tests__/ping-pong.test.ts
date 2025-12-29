import type { MessageEvent, PluginContext } from '../core/interfaces'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import plugin from '../../../../packages/plugin-ping-pong/src/index'

describe('pingPongPlugin', () => {
  let mockContext: PluginContext
  let messageHandler: ((event: MessageEvent) => Promise<void>) | undefined
  let unloadHandler: (() => void) | undefined

  beforeEach(() => {
    messageHandler = undefined
    unloadHandler = undefined

    mockContext = {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      on: vi.fn((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler
        }
      }),
      onUnload: vi.fn((handler: () => void) => {
        unloadHandler = handler
      }),
    } as any
  })

  it('has correct metadata', () => {
    expect(plugin.id).toBe('ping-pong')
    expect(plugin.name).toBe('Ping Pong Plugin')
    expect(plugin.version).toBe('1.0.0')
    expect(plugin.author).toBe('NapGram Team')
    expect(plugin.description).toContain('ping')
  })

  it('installs and registers message handler', async () => {
    await plugin.install(mockContext)

    expect(mockContext.logger.info).toHaveBeenCalledWith('Ping Pong plugin installed')
    expect(mockContext.on).toHaveBeenCalledWith('message', expect.any(Function))
    expect(mockContext.onUnload).toHaveBeenCalledWith(expect.any(Function))
    expect(messageHandler).toBeDefined()
  })

  it('replies "pong!" to messages containing "ping"', async () => {
    await plugin.install(mockContext)

    const mockReply = vi.fn()
    const mockEvent: MessageEvent = {
      message: {
        text: 'hello ping world',
      },
      sender: {
        userName: 'TestUser',
      },
      channelId: 'test-channel',
      reply: mockReply,
    } as any

    await messageHandler!(mockEvent)

    expect(mockReply).toHaveBeenCalledWith('pong!')
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Replied to TestUser'),
    )
  })

  it('ignores messages without "ping"', async () => {
    await plugin.install(mockContext)

    const mockReply = vi.fn()
    const mockEvent: MessageEvent = {
      message: {
        text: 'hello world',
      },
      sender: {
        userName: 'TestUser',
      },
      channelId: 'test-channel',
      reply: mockReply,
    } as any

    await messageHandler!(mockEvent)

    expect(mockReply).not.toHaveBeenCalled()
  })

  it('handles uppercase "PING"', async () => {
    await plugin.install(mockContext)

    const mockReply = vi.fn()
    const mockEvent: MessageEvent = {
      message: {
        text: 'PING',
      },
      sender: {
        userName: 'TestUser',
      },
      channelId: 'test-channel',
      reply: mockReply,
    } as any

    await messageHandler!(mockEvent)

    expect(mockReply).toHaveBeenCalledWith('pong!')
  })

  it('calls unload handler on unload', async () => {
    await plugin.install(mockContext)

    expect(unloadHandler).toBeDefined()
    unloadHandler!()

    expect(mockContext.logger.info).toHaveBeenCalledWith('Ping Pong plugin unloaded')
  })
})
