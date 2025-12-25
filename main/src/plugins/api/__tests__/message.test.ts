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

  test('should reject empty channelId in sendViaInstance', async () => {
    await expect((messageAPI as any).sendViaInstance({}, {
      channelId: ' ',
      segments: [],
    })).rejects.toThrow('channelId is required')
  })

  test('should reject QQ channelId without id in sendViaInstance', async () => {
    await expect((messageAPI as any).sendViaInstance({}, {
      channelId: 'qq:group:',
      segments: [],
    })).rejects.toThrow('Invalid channelId')
  })

  test('should reject empty messageId in recall', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: '',
    })).rejects.toThrow('messageId is required')
  })

  test('should recall legacy QQ messageId without prefix', async () => {
    const recallMessage = vi.fn().mockResolvedValue(undefined)
    messageAPI = new MessageAPIImpl(() => ({
      qqClient: { recallMessage },
    }))

    await messageAPI.recall({
      instanceId: 1,
      messageId: '987654',
    })

    expect(recallMessage).toHaveBeenCalledWith('987654')
  })

  test('should build TG text from segments and ignore empty replyTo', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 111 })
    messageAPI = new MessageAPIImpl(() => ({
      tgBot: {
        getChat: vi.fn().mockResolvedValue({ sendMessage }),
      },
    }))

    const result = await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: [
        null as any,
        { type: 'text', data: { text: 'Hello' } },
        { type: 'at', data: { userName: 'Alice' } },
        { type: 'at', data: {} },
        { type: 'unknown', data: {} },
      ],
      replyTo: ' ',
    })

    expect(result.messageId).toContain('tg:100:')
    expect(sendMessage).toHaveBeenCalledWith('Hello@Alice@', {})
  })

  test('should set replyTo for numeric TG replyTo', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 222 })
    messageAPI = new MessageAPIImpl(() => ({
      tgBot: {
        getChat: vi.fn().mockResolvedValue({ sendMessage }),
      },
    }))

    await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: 'hi',
      replyTo: '123',
    })

    expect(sendMessage).toHaveBeenCalledWith('hi', { replyTo: 123 })
  })

  test('should reject replyTo platform mismatch for TG send', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 333 })
    messageAPI = new MessageAPIImpl(() => ({
      tgBot: {
        getChat: vi.fn().mockResolvedValue({ sendMessage }),
      },
    }))

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: 'hi',
      replyTo: 'qq:123',
    })).rejects.toThrow('replyTo platform mismatch')
  })

  test('should keep replyTo messageId when chatId mismatches and include threadId', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 444 })
    messageAPI = new MessageAPIImpl(() => ({
      tgBot: {
        getChat: vi.fn().mockResolvedValue({ sendMessage }),
      },
    }))

    await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: 'hi',
      replyTo: 'tg:999:456',
      threadId: 77,
    })

    expect(sendMessage).toHaveBeenCalledWith('hi', { replyTo: 456, messageThreadId: 77 })
  })

  test('should reject when TG bot is missing', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: 'hi',
    })).rejects.toThrow('Telegram bot not available on instance')
  })

  test('should reject when QQ client is missing for send', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'qq:100',
      content: 'hi',
    })).rejects.toThrow('QQ client not available on instance')
  })

  test('should convert plugin segments for QQ send', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq123' })
    const qqClient = {
      uin: '123456',
      nickname: 'TestBot',
      sendMessage,
    }
    messageAPI = new MessageAPIImpl(() => ({ qqClient }))

    await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:group:888888',
      content: [
        null as any,
        { type: 'text', data: { text: 'Hello' } },
        { type: 'at', data: { userId: '42', userName: 'User' } },
        { type: 'reply', data: { messageId: '777' } },
        { type: 'image', data: { url: 'http://img' } },
        { type: 'video', data: { file: 'video.mp4' } },
        { type: 'audio', data: { url: 'http://audio' } },
        { type: 'file', data: { file: 'file.bin', name: 'file.txt' } },
        { type: 'unknown', data: {} },
      ],
    })

    expect(sendMessage).toHaveBeenCalled()
  })

  test('should prepend reply segment for QQ replyTo', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq456' })
    const qqClient = {
      uin: '123456',
      nickname: 'TestBot',
      sendMessage,
    }
    messageAPI = new MessageAPIImpl(() => ({ qqClient }))

    await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:group:888888',
      content: [{ type: 'text', data: { text: 'Hello' } }],
      replyTo: '123',
    })

    const sentMessage = sendMessage.mock.calls[0][1]
    expect(sentMessage.content[0].type).toBe('reply')
    expect(sentMessage.content[0].data.messageId).toBe('123')
  })

  test('should reject recall when QQ client is missing', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'qq:123456',
    })).rejects.toThrow('QQ client not available on instance')
  })

  test('should reject recall when TG bot is missing', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).rejects.toThrow('Telegram bot not available on instance')
  })

  test('should return null for TG message get', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).resolves.toBeNull()
  })

  test('should reject get when QQ client is missing', async () => {
    messageAPI = new MessageAPIImpl(() => ({}))

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })).rejects.toThrow('QQ client not available on instance')
  })

  test('should return null when QQ message is missing', async () => {
    messageAPI = new MessageAPIImpl(() => ({
      qqClient: { getMessage: vi.fn().mockResolvedValue(null) },
    }))

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })).resolves.toBeNull()
  })

  test('should map QQ message segments', async () => {
    messageAPI = new MessageAPIImpl(() => ({
      qqClient: {
        getMessage: vi.fn().mockResolvedValue({
          content: [
            null,
            { type: 'text', data: { text: 'Hello' } },
            { type: 'at', data: { userId: '42', userName: 'User' } },
            { type: 'unknown', data: { foo: 'bar' } },
          ],
          chat: { id: '888888' },
          sender: { id: '999999' },
          timestamp: 123456,
        }),
      },
    }))

    const result = await messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })

    expect(result?.segments[0].type).toBe('raw')
    expect(result?.segments[1].type).toBe('text')
    expect(result?.segments[2].type).toBe('at')
    expect(result?.segments[3].type).toBe('raw')
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
