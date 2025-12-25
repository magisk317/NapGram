import { describe, expect, test, vi, beforeEach } from 'vitest'
import { MessageAPIImpl } from '../../api/message'

// Mock logger
vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}))

describe('MessageAPIImpl', () => {
  let messageAPI: MessageAPIImpl

  beforeEach(() => {
    messageAPI = new MessageAPIImpl()
  })

  test('should initialize correctly', () => {
    expect(messageAPI).toBeInstanceOf(MessageAPIImpl)
  })

  test('should validate send parameters', async () => {
    const invalidParams = [
      // Missing channelId
      { instanceId: 1, content: 'test' },
      // Missing content
      { instanceId: 1, channelId: 'tg:123' },
      // Invalid instanceId
      { instanceId: 'invalid', channelId: 'tg:123', content: 'test' },
    ]

    for (const params of invalidParams) {
      await expect(messageAPI.send(params as any)).rejects.toThrow()
    }
  })

  test('should send message with text content', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: {
        getChat: vi.fn().mockReturnValue({
          sendMessage: vi.fn().mockResolvedValue({ id: '123' })
        })
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    const result = await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:123',
      content: 'Hello World',
    })

    expect(result).toBeDefined()
    expect(typeof result.messageId).toBe('string')
    expect(typeof result.timestamp).toBe('number')
  })

  test('should send message with segments', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: {
        getChat: vi.fn().mockReturnValue({
          sendMessage: vi.fn().mockResolvedValue({ id: '123' })
        })
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    const result = await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:123',
      content: [
        { type: 'text', data: { text: 'Hello' } },
        { type: 'at', data: { userId: '123', userName: 'user' } },
      ],
    })

    expect(result).toBeDefined()
  })

  test('should recall message', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: {
        getChat: vi.fn().mockReturnValue({
          deleteMessages: vi.fn().mockResolvedValue(undefined)
        })
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).resolves.toBeUndefined()
  })

  test('should get message', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        getMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', data: { text: 'Hello' } }],
          chat: { id: '123' },
          sender: { id: '456', name: 'test' },
          timestamp: '123456'
        })
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    const result = await messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })

    expect(result).toBeDefined()
  })

  test('should handle missing instance resolver', async () => {
    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'tg:123',
      content: 'test',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')
  })

  test('should handle missing instance', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue(null)
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'tg:123',
      content: 'test',
    })).rejects.toThrow('Instance 1 not found')

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).rejects.toThrow('Instance 1 not found')

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })).rejects.toThrow('Instance 1 not found')
  })

  test('should parse channelId correctly', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        uin: '123456',
        nickname: 'TestBot',
        sendMessage: vi.fn().mockResolvedValue({ messageId: 'qq123' })
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    // Test valid QQ channelId
    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'qq:123456',
      content: 'test',
    })).resolves.toBeDefined()

    // Test valid QQ private channelId
    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'qq:private:123456',
      content: 'test',
    })).resolves.toBeDefined()

    // Test invalid channelId format
    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'invalid',
      content: 'test',
    })).rejects.toThrow()
  })

  test('should handle QQ client for sending', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        uin: '123456',
        nickname: 'TestBot',
        sendMessage: vi.fn().mockResolvedValue({ messageId: 'qq123' })
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    const result = await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:group:888888',
      content: 'Test message',
    })

    expect(result).toBeDefined()
  })

  test('should handle QQ client for recall', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        recallMessage: vi.fn().mockResolvedValue(undefined)
      }
    })
    
    messageAPI = new MessageAPIImpl(mockInstanceResolver)

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'qq:123456',
    })).resolves.toBeUndefined()
  })
})

describe('createMessageAPI', () => {
  test('should create message API instance', () => {
    const api = MessageAPIImpl.prototype.constructor
    const messageAPI = new MessageAPIImpl()
    
    expect(messageAPI).toBeDefined()
    expect(messageAPI.send).toBeDefined()
    expect(messageAPI.recall).toBeDefined()
    expect(messageAPI.get).toBeDefined()
  })

  test('should create message API with instance resolver', () => {
    const instanceResolver = vi.fn()
    const messageAPI = new MessageAPIImpl(instanceResolver)
    
    expect(messageAPI).toBeDefined()
  })
})