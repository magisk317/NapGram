import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'

// Mock dependencies
vi.mock('../services/CommandRegistry', () => {
  return {
    CommandRegistry: vi.fn(function CommandRegistryMock() {
      return {
        register: vi.fn(),
        unregister: vi.fn(),
        getCommand: vi.fn(),
        get: vi.fn(),
        clear: vi.fn(),
        getAll: vi.fn().mockReturnValue(new Map()),
        getUniqueCommandCount: vi.fn().mockReturnValue(0),
        prefix: '/',
      }
    }),
  }
})

vi.mock('../services/PermissionChecker', () => {
  return {
    PermissionChecker: vi.fn(function PermissionCheckerMock() {
      return {
        check: vi.fn().mockReturnValue(true),
        isAdmin: vi.fn().mockReturnValue(true),
      }
    }),
  }
})

vi.mock('../services/InteractiveStateManager', () => {
  return {
    InteractiveStateManager: vi.fn(function InteractiveStateManagerMock() {
      return {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        getBindingState: vi.fn(),
        isTimeout: vi.fn(),
        deleteBindingState: vi.fn(),
      }
    }),
  }
})

vi.mock('../handlers/CommandContext', () => {
  return {
    CommandContext: vi.fn(function CommandContextMock() {
      return {
        extractThreadId: vi.fn().mockReturnValue(undefined),
        replyTG: vi.fn().mockResolvedValue({}),
        replyQQ: vi.fn().mockResolvedValue({}),
        replenish: vi.fn().mockImplementation((msg: any) => msg),
      }
    }),
  }
})

// Mock all handlers
const mockHandler = { execute: vi.fn() }
vi.mock('../handlers/InfoCommandHandler', () => ({
  InfoCommandHandler: vi.fn(function InfoCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/HelpCommandHandler', () => ({
  HelpCommandHandler: vi.fn(function HelpCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/StatusCommandHandler', () => ({
  StatusCommandHandler: vi.fn(function StatusCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/BindCommandHandler', () => ({
  BindCommandHandler: vi.fn(function BindCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/UnbindCommandHandler', () => ({
  UnbindCommandHandler: vi.fn(function UnbindCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/RecallCommandHandler', () => ({
  RecallCommandHandler: vi.fn(function RecallCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/ForwardControlCommandHandler', () => ({
  ForwardControlCommandHandler: vi.fn(function ForwardControlCommandHandlerMock() {
    return mockHandler
  }),
}))

vi.mock('@napgram/message-kit', () => {
  return {
    messageConverter: {
      fromTelegram: vi.fn().mockReturnValue({
        metadata: {},
        sender: { userId: 'tg:u:456', userName: 'User', name: 'User' },
        text: '/help',
        content: [{ type: 'text', data: { text: '/help' } }],
      }),
      fromQQ: vi.fn().mockReturnValue({}),
    },
  }
})

vi.mock('@napgram/plugin-kit', () => ({
  getEventPublisher: vi.fn().mockReturnValue({
    publishMessage: vi.fn(),
    eventBus: {},
    publishFriendRequest: vi.fn(),
    publishGroupRequest: vi.fn(),
    publishNotice: vi.fn(),
    publishInstanceStatus: vi.fn(),
  }),
}))

vi.mock('../services/ThreadIdExtractor', () => ({
  ThreadIdExtractor: vi.fn(function ThreadIdExtractorMock() {
    return {
      extractFromRaw: vi.fn().mockReturnValue(undefined),
    }
  }),
}))

vi.mock('@napgram/plugin-kit', async (importOriginal: () => Promise<any>) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getGlobalRuntime: vi.fn().mockReturnValue({
      getLastReport: vi.fn().mockReturnValue({ loadedPlugins: [] }),
    }),
    getEventPublisher: vi.fn().mockReturnValue({
      publishMessage: vi.fn(),
      eventBus: {},
      publishFriendRequest: vi.fn(),
      publishGroupRequest: vi.fn(),
      publishNotice: vi.fn(),
      publishInstanceStatus: vi.fn(),
    }),
  }
})

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@napgram/infra-kit', () => ({
  db: {
    message: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    forwardPair: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    forwardMultiple: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    qqRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn()
  },
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080'
  },
  hashing: { md5Hex: vi.fn((value: string) => value) },
  temp: { TEMP_PATH: '/tmp', createTempFile: vi.fn(() => ({ path: '/tmp/test', cleanup: vi.fn() })) },
  getLogger: vi.fn(() => mockLogger), // Use hoisted mockLogger
  configureInfraKit: vi.fn(),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
}))

describe('commandsFeature', () => {
  let CommandsFeature: any
  let commandsFeature: any
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules() // Important to reload modules

    // Import module under test dynamically
    const mod = await import('../CommandsFeature')
    CommandsFeature = mod.CommandsFeature

    mockInstance = {
      id: 1,
      forwardPairs: {
        getPairs: vi.fn().mockReturnValue([]),
        findByTG: vi.fn(),
        add: vi.fn(),
      },
      config: {
        adminUsers: ['123'],
      },
    }
    mockTgBot = {
      addNewMessageEventHandler: vi.fn(),
      removeNewMessageEventHandler: vi.fn(),
      me: { id: 999, username: 'bot' },
      client: {
        getMessages: vi.fn(),
      },
      getChat: vi.fn(),
    }
    mockQqClient = {
      on: vi.fn(),
      off: vi.fn(),
      recallMessage: vi.fn(),
    }
    commandsFeature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
  })

  it('check for initialization errors', async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const logger = (await import('@napgram/infra-kit')).getLogger('CommandsFeature')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('reloads commands', async () => {
    const registry = (commandsFeature as any).registry
      ; (commandsFeature as any).loadPluginCommands = vi.fn().mockResolvedValue(new Set())
    await commandsFeature.reloadCommands()
    expect(registry.clear).toHaveBeenCalled()
    expect(registry.register).toHaveBeenCalled()
  })

  it('extracts mentioned bot usernames from parts and entities', () => {
    const parts = ['@MyBot', 'hello@OtherBot', 'notbot', '@Alice', '', '@']
    const tgMsg: any = {
      entities: [
        { kind: 'mention', text: '@ThirdBot' },
        { kind: 'bot_command', text: '/help@FourthBot' },
        { kind: 'mention', text: '@Alice' },
      ],
    }

    const mentioned = (commandsFeature as any).extractMentionedBotUsernames(tgMsg, parts)

    expect(Array.from(mentioned).sort()).toEqual(['fourthbot', 'mybot', 'otherbot', 'thirdbot'])
  })

  it('extracts thread id from args or raw metadata', async () => {
    const msgWithRaw: any = { metadata: { raw: { replyTo: { replyToTopId: 99 } } } }

    const fromArgs = (commandsFeature as any).extractThreadId(msgWithRaw, ['cmd', '123'])
    expect(fromArgs).toBe(123)

    const { ThreadIdExtractor } = await import('../services/ThreadIdExtractor')
    vi.mocked(ThreadIdExtractor).mockImplementationOnce(function ThreadIdExtractorMock() {
      return {
        extractFromRaw: vi.fn().mockReturnValue(456),
      } as any
    })
    const fromRaw = (commandsFeature as any).extractThreadId(msgWithRaw, ['cmd'])
    expect(fromRaw).toBe(456)

    const noThread = (commandsFeature as any).extractThreadId({ metadata: {} }, ['cmd'])
    expect(noThread).toBeUndefined()
  })

  it('destroys and clears listeners', () => {
    const registry = (commandsFeature as any).registry

    commandsFeature.destroy()

    expect(mockTgBot.removeNewMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
    expect(mockQqClient.off).toHaveBeenCalledWith('message', expect.any(Function))
    expect(registry.clear).toHaveBeenCalled()
  })

  describe('tG command handling', () => {
    it('sets up TG message listener', () => {
      expect(mockTgBot.addNewMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
    })

    it('ignores non-command TG messages', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({ text: 'not a command', chat: { id: 123 }, sender: { id: 456, isBot: false } })
      expect(result).toBe(false)
      expect(registry.get).not.toHaveBeenCalled()
    })

    it('executes command when authorized', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }

      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'
      checker.isAdmin.mockReturnValue(true)

      const msg = {
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      }
      const result = await handler(msg)

      expect(result).toBe(true)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('returns false when command handler throws', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: vi.fn().mockRejectedValue(new Error('boom')), adminOnly: false }

      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'
      checker.isAdmin.mockReturnValue(true)

      const msg = {
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      }
      const result = await handler(msg)

      expect(result).toBe(false)
    })

    it('publishes plugin event helpers for TG commands', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      let capturedEvent: any
      const publishMessage = vi.fn((event: any) => {
        capturedEvent = event
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      vi.mocked(getEventPublisher).mockReturnValue({
        publishMessage,
        eventBus: {},
        publishFriendRequest: vi.fn(),
        publishGroupRequest: vi.fn(),
        publishNotice: vi.fn(),
        publishInstanceStatus: vi.fn(),
      } as any)

      const sendMessage = vi.fn().mockResolvedValue({ id: 321 })
      const deleteMessages = vi.fn().mockResolvedValue(undefined)
      mockTgBot.getChat.mockResolvedValue({ sendMessage, deleteMessages })

      const { ThreadIdExtractor } = await import('../services/ThreadIdExtractor')
      vi.mocked(ThreadIdExtractor).mockImplementationOnce(function ThreadIdExtractorMock() {
        return {
          extractFromRaw: vi.fn().mockReturnValue(888),
        } as any
      })

      const result = await handler({
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      expect(result).toBe(true)
      expect(publishMessage).toHaveBeenCalled()

      await capturedEvent.reply([
        null,
        { type: 'at', data: {} },
        { type: 'text', data: { text: 'hi' } },
        { type: 'unknown' },
      ])
      await capturedEvent.send('plain')
      await capturedEvent.recall()

      expect(sendMessage).toHaveBeenCalledWith('@hi', expect.objectContaining({ replyTo: 99999, messageThreadId: 888 }))
      expect(sendMessage).toHaveBeenCalledWith('plain', expect.objectContaining({ messageThreadId: 888 }))
      expect(deleteMessages).toHaveBeenCalledWith([99999])
    })

    it('swallows publishMessage failures', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      const publishMessage = vi.fn(() => {
        throw new Error('boom')
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      vi.mocked(getEventPublisher).mockReturnValue({
        publishMessage,
        eventBus: {},
        publishFriendRequest: vi.fn(),
        publishGroupRequest: vi.fn(),
        publishNotice: vi.fn(),
        publishInstanceStatus: vi.fn(),
      } as any)

      const result = await handler({
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      expect(result).toBe(true)
    })

    it('denies admin command for non-admin', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'bind', handler: vi.fn(), adminOnly: true }
      registry.get.mockReturnValue(mockCmd)
      checker.isAdmin.mockReturnValue(false)

      const result = await handler({
        text: '/bind 123',
        chat: { id: 123 },
        sender: { id: 789, isBot: false },
      })

      expect(result).toBe(true)
      expect(mockCmd.handler).not.toHaveBeenCalled()
    })

    it('ignores command if explicitly targeting other bot', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({
        text: '/help@otherbot',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
        entities: [{ type: 'mention', offset: 5, length: 9 }], // @otherbot
      })
      expect(result).toBe(false)
    })

    it('handles command addressed to me with @bot suffix', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      const result = await handler({
        text: '/help@bot',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })
      expect(result).toBe(true)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('ignores bot/self messages', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({
        text: '/help',
        chat: { id: 123 },
        sender: { id: 999, isBot: true },
      })
      expect(result).toBe(false)
    })

    it('handles interactive binding timeout', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: 0 })
      stateManager.isTimeout.mockReturnValue(true)

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
      expect(stateManager.isTimeout).toHaveBeenCalled()
    })

    it('handles interactive binding with invalid input', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: Date.now() })
      stateManager.isTimeout.mockReturnValue(false)

      const result = await handler({
        text: 'not-a-number',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
    })

    it('handles interactive binding conflict', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager
      const forwardPairs = mockInstance.forwardPairs

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: Date.now() })
      stateManager.isTimeout.mockReturnValue(false)
      forwardPairs.findByTG.mockReturnValue({ qqRoomId: '999' })

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
    })

    it('handles interactive binding success', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager
      const forwardPairs = mockInstance.forwardPairs

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: Date.now() })
      stateManager.isTimeout.mockReturnValue(false)
      forwardPairs.findByTG.mockReturnValue(null)
      forwardPairs.add.mockResolvedValue({ qqRoomId: BigInt(123456) })

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(forwardPairs.add).toHaveBeenCalledWith('123456', 123, 9)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
    })
  })

  describe('qQ command handling', () => {
    it('recalls QQ /rm command message after handling', async () => {
      const command = { name: 'rm', handler: vi.fn().mockResolvedValue(undefined) }
      const registry = (commandsFeature as any).registry
      registry.get.mockReturnValue(command)
      registry.prefix = '/'

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-1',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/rm' } }],
        timestamp: Date.now(),
      })

      expect(command.handler).toHaveBeenCalled()
      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('qq-1')
    })

    it('logs when QQ recall fails', async () => {
      const command = { name: 'rm', handler: vi.fn().mockResolvedValue(undefined) }
      const registry = (commandsFeature as any).registry
      registry.get.mockReturnValue(command)
      registry.prefix = '/'
      mockQqClient.recallMessage.mockRejectedValue(new Error('fail'))

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-1',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/rm' } }],
        timestamp: Date.now(),
      })

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(Error), 'Failed to recall QQ command message')
    })

    it('ignores QQ messages without text content', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-2',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'image', data: { url: 'u' } }],
        timestamp: Date.now(),
      })

      expect(registry.get).not.toHaveBeenCalled()
    })

    it('logs and swallows errors from QQ command handlers', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'
      registry.get.mockReturnValue({
        name: 'help',
        handler: vi.fn().mockRejectedValue(new Error('boom')),
      })

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-3',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/help' } }],
        timestamp: Date.now(),
      })

      expect(registry.get).toHaveBeenCalled()
    })
  })

  describe('convertToMessageEvent', () => {
    it('routes reply and send for QQ messages', async () => {
      const event = (commandsFeature as any).convertToMessageEvent({
        id: '1',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: 'hello' } }],
        timestamp: Date.now(),
        metadata: {},
      })

      await event.reply([{ type: 'text', data: { text: 'ok' } }])
      await event.send([{ type: 'text', data: { text: 'send' } }])

      const commandContext = (commandsFeature as any).commandContext
      expect(commandContext.replyQQ).toHaveBeenCalledWith('777', 'ok')
      expect(commandContext.replyQQ).toHaveBeenCalledWith('777', 'send')
    })

    it('throws for recall in plugin event', async () => {
      const event = (commandsFeature as any).convertToMessageEvent({
        id: '2',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: 'hello' } }],
        timestamp: Date.now(),
        metadata: {},
      })

      await expect(event.recall()).rejects.toThrow('recall() not yet implemented')
    })
  })

  describe('extractMentionedBotUsernames', () => {
    it('identifies bot mentions in parts', () => {
      const mentioned = (commandsFeature as any).extractMentionedBotUsernames({}, ['help@somebot', '@anotherbot', 'text'])
      expect(mentioned.has('somebot')).toBe(true)
      expect(mentioned.has('anotherbot')).toBe(true)
      expect(mentioned.size).toBe(2)
    })

    it('identifies bot mentions in entities', () => {
      const mentioned = (commandsFeature as any).extractMentionedBotUsernames(
        { entities: [{ kind: 'mention', text: '@mybot' }] },
        [],
      )
      expect(mentioned.has('mybot')).toBe(true)
    })
  })
})
