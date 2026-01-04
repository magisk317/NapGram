import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageAPIImpl } from '../../api/message'

// Mock logger
vi.mock('@napgram/infra-kit', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  hashing: { md5Hex: vi.fn((value: string) => value) },
}))

describe('messageAPIImpl', () => {
  let messageAPI: MessageAPIImpl

  beforeEach(() => {
    messageAPI = new (MessageAPIImpl as any)()
  })

  it('should initialize correctly', () => {
    expect(messageAPI).toBeInstanceOf(MessageAPIImpl)
  })

  it('should validate send parameters', async () => {
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

  it('should send message with text content', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: {
        getChat: vi.fn().mockReturnValue({
          sendMessage: vi.fn().mockResolvedValue({ id: '123' }),
        }),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    const result = await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:123',
      content: 'Hello World',
    })

    expect(result).toBeDefined()
    expect(typeof result.messageId).toBe('string')
    expect(typeof result.timestamp).toBe('number')
  })

  it('should send message with segments', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: {
        getChat: vi.fn().mockReturnValue({
          sendMessage: vi.fn().mockResolvedValue({ id: '123' }),
        }),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

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

  it('should recall message', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: {
        getChat: vi.fn().mockReturnValue({
          deleteMessages: vi.fn().mockResolvedValue(undefined),
        }),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).resolves.toBeUndefined()
  })

  it('should get message', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        getMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', data: { text: 'Hello' } }],
          chat: { id: '123' },
          sender: { id: '456', name: 'test' },
          timestamp: '123456',
        }),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    const result = await messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })

    expect(result).toBeDefined()
  })

  it('should handle missing instance resolver', async () => {
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

  it('should handle missing instance', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue(null)
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

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

  it('should parse channelId correctly', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        uin: '123456',
        nickname: 'TestBot',
        sendMessage: vi.fn().mockResolvedValue({ messageId: 'qq123' }),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

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

  it('should handle QQ client for sending', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        uin: '123456',
        nickname: 'TestBot',
        sendMessage: vi.fn().mockResolvedValue({ messageId: 'qq123' }),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    const result = await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:group:888888',
      content: 'Test message',
    })

    expect(result).toBeDefined()
  })

  it('should handle QQ client for recall', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        recallMessage: vi.fn().mockResolvedValue(undefined),
      },
    })

    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'qq:123456',
    })).resolves.toBeUndefined()
  })

  it('should reject empty channelId in sendViaInstance', async () => {
    await expect((messageAPI as any).sendViaInstance({}, {
      channelId: ' ',
      segments: [],
    })).rejects.toThrow('channelId is required')
  })

  it('should reject QQ channelId without id in sendViaInstance', async () => {
    await expect((messageAPI as any).sendViaInstance({}, {
      channelId: 'qq:group:',
      segments: [],
    })).rejects.toThrow('Invalid channelId')
  })

  it('should reject empty messageId in recall', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: '',
    })).rejects.toThrow('messageId is required')
  })

  it('should recall legacy QQ messageId without prefix', async () => {
    const recallMessage = vi.fn().mockResolvedValue(undefined)
    messageAPI = new (MessageAPIImpl as any)(() => ({
      qqClient: { recallMessage },
    }))

    await messageAPI.recall({
      instanceId: 1,
      messageId: '987654',
    })

    expect(recallMessage).toHaveBeenCalledWith('987654')
  })

  it('should build TG text from segments and ignore empty replyTo', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 111 })
    messageAPI = new (MessageAPIImpl as any)(() => ({
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
        { type: 'unknown' as any, data: {} },
      ],
      replyTo: ' ',
    })

    expect(result.messageId).toContain('tg:100:')
    expect(sendMessage).toHaveBeenCalledWith('Hello@Alice@', {})
  })

  it('should set replyTo for numeric TG replyTo', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 222 })
    messageAPI = new (MessageAPIImpl as any)(() => ({
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

  it('should reject replyTo platform mismatch for TG send', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 333 })
    messageAPI = new (MessageAPIImpl as any)(() => ({
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

  it('should keep replyTo messageId when chatId mismatches and include threadId', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 444 })
    messageAPI = new (MessageAPIImpl as any)(() => ({
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

  it('should reject when TG bot is missing', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: 'hi',
    })).rejects.toThrow('Telegram bot not available on instance')
  })

  it('should reject when QQ client is missing for send', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: 'qq:100',
      content: 'hi',
    })).rejects.toThrow('QQ client not available on instance')
  })

  it('should convert plugin segments for QQ send', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq123' })
    const qqClient = {
      uin: '123456',
      nickname: 'TestBot',
      sendMessage,
    }
    messageAPI = new (MessageAPIImpl as any)(() => ({ qqClient }))

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
        { type: 'unknown' as any, data: {} },
      ],
    })

    expect(sendMessage).toHaveBeenCalled()
  })

  it('should prepend reply segment for QQ replyTo', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq456' })
    const qqClient = {
      uin: '123456',
      nickname: 'TestBot',
      sendMessage,
    }
    messageAPI = new (MessageAPIImpl as any)(() => ({ qqClient }))

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

  it('should reject recall when QQ client is missing', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'qq:123456',
    })).rejects.toThrow('QQ client not available on instance')
  })

  it('should reject recall when TG bot is missing', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).rejects.toThrow('Telegram bot not available on instance')
  })

  it('should return null for TG message get', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'tg:123:456',
    })).resolves.toBeNull()
  })

  it('should map segments in segmentsToText (including nulls and numeric names)', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 888 })
    messageAPI = new (MessageAPIImpl as any)(() => ({
      tgBot: { getChat: vi.fn().mockResolvedValue({ sendMessage }) },
    }))

    await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:100',
      content: [
        { type: 'text', data: { text: 'T' } },
        { type: 'at', data: { userName: 12345 as any } }, // numeric name edge case
        null as any,
        { type: 'at', data: {} as any },
      ],
    })

    expect(sendMessage).toHaveBeenCalledWith('T@12345@', expect.any(Object))
  })

  it('should reject get when QQ client is missing', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({}))

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })).rejects.toThrow('QQ client not available on instance')
  })

  it('should return null when QQ message is missing', async () => {
    messageAPI = new (MessageAPIImpl as any)(() => ({
      qqClient: { getMessage: vi.fn().mockResolvedValue(null) },
    }))

    await expect(messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })).resolves.toBeNull()
  })

  it('should map QQ message segments', async () => {
    messageAPI = new (MessageAPIImpl as any)((() => ({
      qqClient: {
        getGroup: vi.fn().mockResolvedValue({ groupCode: 123456 }),
        getMessage: vi.fn().mockResolvedValue({
          content: [
            null as any,
            { type: 'text', data: { text: 'Hello' } },
            { type: 'at', data: { userId: '42', userName: 'User' } },
            { type: 'unknown', data: { foo: 'bar' } },
          ],
          chat: { id: '888888' },
          sender: { id: '999999' },
          timestamp: 123456,
        }),
      },
    })))

    const result = await messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123456',
    })

    expect(result?.segments[0].type).toBe('raw')
    expect(result?.segments[1].type).toBe('text')
    expect(result?.segments[2].type).toBe('at')
    expect(result?.segments[3].type).toBe('raw')
  })

  it('should handle Telegram channelId variants and video/audio/file segments', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: 555 })
    messageAPI = new (MessageAPIImpl as any)(() => ({
      tgBot: { getChat: vi.fn().mockResolvedValue({ sendMessage }) },
    }))

    // telegram: prefix
    await messageAPI.send({
      instanceId: 1,
      channelId: 'telegram:100',
      content: [
        { type: 'video', data: { file: 'v.mp4' } },
        { type: 'audio', data: { url: 'http://a' } },
        { type: 'file', data: { file: 'f.bin', name: 'n' } },
      ],
    })

    expect(sendMessage).toHaveBeenCalled()
  })

  it('should handle QQ private channelId and different segment types', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq777' })
    messageAPI = new (MessageAPIImpl as any)(() => ({
      qqClient: { uin: '1', sendMessage },
    }))

    await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:private:888',
      content: [
        { type: 'image', data: { url: 'http://i' } },
        { type: 'video', data: { url: 'http://v' } },
      ],
    })

    expect(sendMessage).toHaveBeenCalled()
  })

  // Additional tests for Phase 3: Branch coverage improvement
  describe('parseChannelId edge cases', () => {
    it('should handle null and undefined channelId', async () => {
      messageAPI = new (MessageAPIImpl as any)(() => ({}))

      await expect(messageAPI.send({
        instanceId: 1,
        channelId: null as any,
        content: 'test',
      })).rejects.toThrow('channelId is required')

      await expect(messageAPI.send({
        instanceId: 1,
        channelId: undefined as any,
        content: 'test',
      })).rejects.toThrow('channelId is required')

      await expect(messageAPI.send({
        instanceId: 1,
        channelId: '   ',
        content: 'test',
      })).rejects.toThrow('channelId is required')
    })

    it('should reject channelId without proper prefix', async () => {
      messageAPI = new (MessageAPIImpl as any)(() => ({}))

      await expect(messageAPI.send({
        instanceId: 1,
        channelId: 'invalid-format',
        content: 'test',
      })).rejects.toThrow('channelId must be prefixed')

      await expect(messageAPI.send({
        instanceId: 1,
        channelId: '12345',
        content: 'test',
      })).rejects.toThrow('channelId must be prefixed')
    })

    it('should handle telegram prefix variant', async () => {
      const sendMessage = vi.fn().mockResolvedValue({ id: 999 })
      messageAPI = new (MessageAPIImpl as any)(() => ({
        tgBot: { getChat: vi.fn().mockResolvedValue({ sendMessage }) },
      }))

      await messageAPI.send({
        instanceId: 1,
        channelId: 'telegram:12345',
        content: 'test',
      })

      expect(sendMessage).toHaveBeenCalled()
    })

    it('should handle QQ group without explicit type', async () => {
      const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq999' })
      messageAPI = new (MessageAPIImpl as any)(() => ({
        qqClient: { uin: '1', sendMessage },
      }))

      await messageAPI.send({
        instanceId: 1,
        channelId: 'qq:888888',
        content: 'test',
      })

      expect(sendMessage).toHaveBeenCalled()
    })
  })

  describe('parseMessageId edge cases', () => {
    it('should handle null and undefined messageId in recall', async () => {
      messageAPI = new (MessageAPIImpl as any)(() => ({}))

      await expect(messageAPI.recall({
        instanceId: 1,
        messageId: null as any,
      })).rejects.toThrow('messageId is required')

      await expect(messageAPI.recall({
        instanceId: 1,
        messageId: undefined as any,
      })).rejects.toThrow('messageId is required')

      await expect(messageAPI.recall({
        instanceId: 1,
        messageId: '   ',
      })).rejects.toThrow('messageId is required')
    })

    it('should handle telegram messageId with only 2 parts (invalid)', async () => {
      messageAPI = new (MessageAPIImpl as any)(() => ({
        tgBot: {},
      }))

      await expect(messageAPI.recall({
        instanceId: 1,
        messageId: 'tg:123',
      })).rejects.toThrow('Telegram messageId must be')
    })

    it('should handle telegram prefix variant in messageId', async () => {
      messageAPI = new (MessageAPIImpl as any)(() => ({
        tgBot: {
          getChat: vi.fn().mockResolvedValue({
            deleteMessages: vi.fn().mockResolvedValue(undefined),
          }),
        },
      }))

      await messageAPI.recall({
        instanceId: 1,
        messageId: 'telegram:100:456',
      })

      // Should succeed without error
    })

    it('should handle legacy unprefixed QQ messageId', async () => {
      messageAPI = new (MessageAPIImpl as any)(() => ({
        qqClient: { recallMessage: vi.fn().mockResolvedValue(undefined) },
      }))

      await messageAPI.recall({
        instanceId: 1,
        messageId: '123456789',
      })

      // Should assume QQ platform
    })
  })
})

describe('createMessageAPI', () => {
  it('should create message API instance', () => {
    const messageAPI = new (MessageAPIImpl as any)()

    expect(messageAPI).toBeDefined()
    expect(messageAPI.send).toBeDefined()
    expect(messageAPI.recall).toBeDefined()
    expect(messageAPI.get).toBeDefined()
  })
})

describe('message Conversion Coverage', () => {
  let messageAPI: MessageAPIImpl

  it('should convert all segment types to unified content in QQ send', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 'qq123' })
    const qqClient = {
      uin: '123456',
      nickname: 'TestBot',
      sendMessage,
    }
    messageAPI = new (MessageAPIImpl as any)(() => ({ qqClient }))

    // Trigger pluginSegmentsToUnifiedContents with all known types
    await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:group:123',
      content: [
        { type: 'text', data: { text: 't' } },
        { type: 'at', data: { userId: 'u', userName: 'n' } },
        { type: 'reply', data: { messageId: 'm' } },
        { type: 'image', data: { url: 'u' } },
        { type: 'video', data: { url: 'u' } },
        { type: 'audio', data: { url: 'u' } },
        { type: 'file', data: { url: 'u' } },
        { type: 'unknown' as any, data: {} }, // Default case
      ],
    })

    const unified = sendMessage.mock.calls[0][1]
    expect(unified.content).toHaveLength(8)
    expect(unified.content[7].type).toBe('text') // Default fallback
  })

  it('should handle missing replyTo for platform check', async () => {
    // parseReplyToForPlatform early return
    const mockInstanceResolver = vi.fn().mockReturnValue({
      tgBot: { getChat: vi.fn().mockReturnValue({ sendMessage: vi.fn().mockResolvedValue({}) }) },
    })
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    // Pass empty replyTo to hit line 75 check
    await messageAPI.send({
      instanceId: 1,
      channelId: 'tg:123',
      content: 'test',
      replyTo: '',
    })
  })

  it('should handle undefined raw input in parsing', async () => {
    // Force undefined into parseChannelId via cast
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    await expect(messageAPI.send({
      instanceId: 1,
      channelId: undefined as any,
      content: 't',
    })).rejects.toThrow()
  })

  it('should handle undefined input in helper functions', async () => {
    // Import exported helpers dynamically or use the ones available if we change import
    const {
      segmentsToText,
      pluginSegmentsToUnifiedContents,
      parseReplyToForPlatform,
      parseChannelId,
      parseMessageId,
    } = await import('../message')

    // segmentsToText
    expect(segmentsToText(undefined as any)).toBe('')
    expect(segmentsToText([null as any])).toBe('')
    expect(segmentsToText([{ type: 'text' } as any])).toBe('') // Missing data.text
    expect(segmentsToText([{ type: 'at' } as any])).toBe('@') // Missing data.userName
    expect(segmentsToText([{ type: 'image' } as any])).toBe('') // Unknown type for text conversion

    // pluginSegmentsToUnifiedContents
    expect(pluginSegmentsToUnifiedContents(undefined as any)).toEqual([])
    expect(pluginSegmentsToUnifiedContents([null as any])).toEqual([])

    const malformed = [
      { type: 'text' }, // Missing data
      { type: 'at' },
      { type: 'reply' },
    ]
    const unified = pluginSegmentsToUnifiedContents(malformed as any)
    expect(unified[0].data.text).toBe('')
    expect(unified[1].data.userId).toBe('')
    expect(unified[2].data.messageId).toBe('')

    // Default case
    expect(pluginSegmentsToUnifiedContents([{ type: 'unknown' } as any])[0].type).toBe('text')

    // parseReplyToForPlatform
    expect(parseReplyToForPlatform(undefined as any, 'qq')).toEqual({ messageId: '' })
    expect(() => parseReplyToForPlatform('qq:123', 'tg')).toThrow('replyTo platform mismatch')

    // parseChannelId
    expect(() => parseChannelId('')).toThrow('channelId is required')
    expect(() => parseChannelId('qq:group:')).toThrow('Invalid channelId') // Empty id part
    expect(() => parseChannelId('tg:')).toThrow() // Empty parts

    // parseMessageId
    expect(() => parseMessageId('')).toThrow('messageId is required')
    expect(() => parseMessageId('tg:123')).toThrow('must be "tg:<chatId>:<messageId>"')
  })

  it('should handle QQ replyTo logic', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: '123' })
    const qqClient = {
      uin: '123',
      sendMessage,
    }
    const mockInstanceResolver = vi.fn().mockReturnValue({ qqClient })
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    // Case: replyTo set, no reply segment in content
    await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:111',
      content: 'hello',
      replyTo: 'qq:999',
    })
    // Should prepend reply segment
    const sent = (sendMessage as any).mock.calls[0][1]
    expect(sent.content[0].type).toBe('reply')
    expect(sent.content[0].data.messageId).toBe('999')

    // Case: replyTo set, reply segment ALREADY in content
    await messageAPI.send({
      instanceId: 1,
      channelId: 'qq:111',
      content: [{ type: 'reply', data: { messageId: '888' } }, { type: 'text', data: { text: 'hi' } }] as any,
      replyTo: 'qq:999',
    })
    // Should NOT prepend another reply segment (logic line 339 in message.ts)
    const sent2 = (sendMessage as any).mock.calls[1][1]
    expect(sent2.content).toHaveLength(2)
    expect(sent2.content[0].data.messageId).toBe('888')
  })

  it('should handle malformed TG messageId in recall', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    // Line 369 coverage: missing chatId in tg messageId
    await expect(messageAPI.recall({
      instanceId: 1,
      messageId: 'tg:123', // Invalid format for TG recall, needs 3 parts
    })).rejects.toThrow('Telegram messageId must be')
  })

  it('should handle malformed content in get()', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        getMessage: vi.fn().mockResolvedValue({
          content: [
            null as any, // Line 394
            { type: 'text' }, // Missing data.text, Line 397
            { type: 'at' }, // Missing data.userId, Line 399
          ],
        }),
      },
    })
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    const result = await messageAPI.get({
      instanceId: 1,
      messageId: 'qq:123',
    })

    expect(result).toBeDefined()
    expect(result?.segments[0].type).toBe('raw')
    expect(result?.segments[1].type).toBe('text')
    expect(((result?.segments[1].data) as any).text).toBe('')
    expect(result?.segments[2].type).toBe('at')
    expect(((result?.segments[2].data) as any).userId).toBe('')
  })

  it('covers sendViaInstance edge cases (replyTo empty, qqType default)', async () => {
    // 1. replyTo is whitespace -> parses to empty messageId -> line 341 skipped
    const sendMessage = vi.fn().mockResolvedValue({ messageId: '123' })
    const qqClient = {
      uin: '123',
      sendMessage,
    }
    const mockInstanceResolver = vi.fn().mockReturnValue({ qqClient })
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    const params = {
      instanceId: 1,
      channelId: 'qq:123',
      content: 'test',
      replyTo: ' ',
    } as any
    await messageAPI.send(params)

    // verify sendViaInstance logic:
    // parseChannelId('qq:123') returns { platform: 'qq', channelId: '123' } (no qqType)
    // fallback to 'group' at line 349
    // replyTo ' ' returns { messageId: '' }. line 341 check fails. segments not modified.

    expect(sendMessage).toHaveBeenCalledWith('123', expect.objectContaining({
      chat: { id: '123', type: 'group' }, // default used
      content: expect.arrayContaining([expect.objectContaining({ type: 'text' })]),
    }))
  })

  it('covers getViaInstance with empty content', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      qqClient: {
        getMessage: vi.fn().mockResolvedValue({
          chat: { id: '123' },
          sender: { id: '456' },
          content: undefined, // trigger || []
          timestamp: 123456,
        }),
      },
    })
    messageAPI = new (MessageAPIImpl as any)(mockInstanceResolver)

    const res = await messageAPI.get({ instanceId: 1, messageId: 'qq:msg_empty' })
    expect(res).toBeDefined()
    expect(res?.text).toBe('')
    expect(res?.segments).toEqual([])
  })
})
