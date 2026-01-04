import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'
import { TelegramSender } from '../TelegramSender'

vi.mock('@napgram/infra-kit', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      })),
    })),
  },
  schema: {
    forwardMultiple: { id: 'id' },
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
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  })),
  configureInfraKit: vi.fn(),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
  flags: {
    DISABLE_RICH_HEADER: 1, // Mock value
    // Add other flags if needed by tests, but TelegramSender usually accesses specific flags.
    // If it's an enum in code, we might need to match the enum values or object structure.
    // Since original was enum, referencing flags.DISABLE_RICH_HEADER works if mocked as object.
  }
}))



describe('telegramSender', () => {
  const mockInstance = {
    id: 1,
    flags: 0,
    tgBot: {
      downloadMedia: vi.fn(),
    },
  } as any
  const mockChat = {
    id: 100,
    sendMessage: vi.fn().mockResolvedValue({ id: 123 }),
    client: {
      sendMedia: vi.fn().mockResolvedValue({ id: 456 }),
    },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sendToTelegram sends simple text message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'hello' } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalledWith('hello', expect.any(Object))
  })

  it('sendToTelegram handles nickname mode 10 (show nickname)', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'hello' } }],
    }
    await sender.sendToTelegram(mockChat, msg, { apiKey: 'key' }, undefined, '10')
    expect(mockChat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('hello') }),
      expect.any(Object),
    )
  })

  it('sendToTelegram handles media group (photo/video)', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [
        { type: 'image', data: { file: Buffer.from('img') } },
        { type: 'video', data: { file: Buffer.from('vid') } },
      ],
    }
    // Mock mediaSender.sendMediaGroup
    const sendMediaGroupSpy = vi.spyOn((sender as any).mediaSender, 'sendMediaGroup').mockResolvedValue({ id: 789 })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(sendMediaGroupSpy).toHaveBeenCalled()
  })

  it('sendToTelegram handles audio message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: Buffer.from('aud') } }],
    }
    // Mock sendMediaToTG indirectly
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('norm'), fileName: 'aud.ogg' })
    vi.spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: Buffer.from('voice') })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
    expect(mediaInput.type).toBe('voice')
  })

  it('sendToTelegram handles dice message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'dice', data: { emoji: '🎲' } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'dice' }), expect.any(Object))
  })

  it('sendToTelegram falls back to text for unsupported dice', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'dice', data: { emoji: '🎉', value: 3 } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalled()
    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('sendToTelegram handles forward message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'forward', data: { id: 'f1' } }],
    }
    await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
    expect(db.insert).toHaveBeenCalled()
    expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息]', expect.any(Object))
  })

  it('sendToTelegram handles location message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'location', data: { latitude: 1, longitude: 2 } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'geo' }), expect.any(Object))
  })

  it('sendToTelegram sends venue when location has title', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'location', data: { latitude: 1, longitude: 2, title: 'Place', address: 'Addr' } }],
    }
    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'venue' }), expect.any(Object))
  })

  it('sendMediaToTG sends placeholder when file missing', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'file', data: { file: 'missing', filename: 'report.txt' } }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('missing')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    const result = await (sender as any).sendMediaToTG(mockChat, '', content)

    expect(mockChat.sendMessage).toHaveBeenCalledWith('[文件不可用] report.txt', expect.any(Object))
    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('sendMediaToTG retries without ttlSeconds when sendMedia fails', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'image', data: { file: '/tmp/test.jpg' } }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/test.jpg')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('img'), fileName: 'test.jpg' })
    vi.spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(false)

    const ttlValues: Array<number | undefined> = []
    mockChat.client.sendMedia.mockImplementation((_chatId: any, mediaInput: any) => {
      ttlValues.push(mediaInput.ttlSeconds)
      if (ttlValues.length === 1)
        return Promise.reject(new Error('fail'))
      return Promise.resolve({ id: 999 })
    })

    const prevTtl = env.TG_MEDIA_TTL_SECONDS
    env.TG_MEDIA_TTL_SECONDS = 5 as any
    try {
      await (sender as any).sendMediaToTG(mockChat, 'head', content)
    }
    finally {
      env.TG_MEDIA_TTL_SECONDS = prevTtl as any
    }

    expect(mockChat.client.sendMedia).toHaveBeenCalledTimes(2)
    expect(ttlValues).toEqual([5, undefined])
  })

  it('sendToTelegram sends forward without WEB_ENDPOINT', async () => {
    const sender = new TelegramSender(mockInstance)
    const prevEndpoint = env.WEB_ENDPOINT
    env.WEB_ENDPOINT = '' as any
    try {
      const msg: any = {
        sender: { id: 'q1', name: 'QQUser' },
        content: [{ type: 'forward', data: { id: 'f1' } }],
      }
      await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
      expect(mockChat.sendMessage).toHaveBeenCalledWith(expect.stringContaining('未配置 WEB_ENDPOINT'), expect.any(Object))
    }
    finally {
      env.WEB_ENDPOINT = prevEndpoint as any
    }
  })

  it('sendToTelegram falls back when forward create fails', async () => {
    const sender = new TelegramSender(mockInstance)
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockRejectedValue(new Error('fail')),
      })),
    } as any)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'forward', data: { id: 'f1', messages: ['m1'] } }],
    }
    await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息x1]', expect.any(Object))
  })

  it('sendToTelegram sends rich header for audio message', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: 'aud.amr' } }],
    }
    // Mock normalize
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('aud'), fileName: 'aud.ogg' })
    vi.spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: Buffer.from('voice') })

    // Setup Rich Header environment
    const pair = { apiKey: 'key', flags: 0 }

    // Create spy for richHeaderBuilder
    const buildUrlSpy = vi.spyOn((sender as any).richHeaderBuilder, 'generateRichHeaderUrl').mockReturnValue('http://header.url')
    const applyHeaderSpy = vi.spyOn((sender as any).richHeaderBuilder, 'applyRichHeader').mockReturnValue({ text: 'Rich', params: {} })

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '10') // nickname '10' enables rich header if env present

    expect(buildUrlSpy).toHaveBeenCalled()
    expect(applyHeaderSpy).toHaveBeenCalled()

    // Should send header message separate from media
    expect(mockChat.sendMessage).toHaveBeenCalledWith('Rich', expect.any(Object))
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  })

  it('handles rich header failure gracefully', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: 'aud.amr' } }],
    }
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('aud'), fileName: 'aud.ogg' })
    vi.spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: Buffer.from('voice') })

    const pair = { apiKey: 'key', flags: 0 }
    vi.spyOn((sender as any).richHeaderBuilder, 'generateRichHeaderUrl').mockReturnValue('http://header.url')
    vi.spyOn((sender as any).richHeaderBuilder, 'applyRichHeader').mockReturnValue({ text: 'Rich', params: {} })

    // Mock header send failure
    mockChat.sendMessage.mockRejectedValueOnce(new Error('Header fail'))

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '10')

    // Media should still be sent
    expect(mockChat.client.sendMedia).toHaveBeenCalled()
  })

  it('handles local file path in media', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'image', data: { file: '/local/path/img.png' } }],
    }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/local/path/img.png')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('img'), fileName: 'img.png' })
    vi.spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(false)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
    expect(mediaInput.fileName).toBe('img.png')
  })

  it('handles gif media as animation', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'image', data: { file: 'anim.gif' } }],
    }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('anim.gif')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('gif'), fileName: 'anim.gif' })
    vi.spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(true)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalled()
    const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
    expect(mediaInput.type).toBe('animation')
  })

  it('handles video source failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'video', data: { file: 'bad.mp4' } }],
    }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('bad.mp4')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
    // Error is logged and swallowed in sendToTelegram loop, but sendMediaToTG returns null
  })

  it('handles audio source failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'audio', data: { file: 'bad.amr' } }],
    }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('bad.amr')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('sends to specific thread when tgThreadId provided', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'text', data: { text: 'threaded' } }],
    }
    const pair = { tgThreadId: '999' }

    await sender.sendToTelegram(mockChat, msg, pair, undefined, '00')

    expect(mockChat.sendMessage).toHaveBeenCalledWith('threaded', expect.objectContaining({ messageThreadId: 999 }))
  })
  it('handles dice fallback failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'dice', data: { emoji: '🎉', value: 3 } }],
    }

    // Mock sendMessage failure
    mockChat.sendMessage.mockRejectedValueOnce(new Error('Fallback fail'))

    await expect(sender.sendToTelegram(mockChat, msg, {}, undefined, '00')).rejects.toThrow('Fallback fail')
  })

  it('handles sendMedia non-ttl failure', async () => {
    const sender = new TelegramSender(mockInstance)
    const content: any = { type: 'image', data: { file: '/tmp/test.jpg' } }
    vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/test.jpg')
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('img'), fileName: 'test.jpg' })

    mockChat.client.sendMedia.mockRejectedValueOnce(new Error('Fatal error'))

    await (sender as any).sendMediaToTG(mockChat, 'head', content)
    // Error logged
    // No throw because sendMediaToTG catches it and logs it, returning null
  })

  it('handles forward message fallback when no id', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'forward', data: { text: 'fwd text' } }], // No ID
    }
    await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
    expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息x0]', expect.any(Object))
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('sendToTelegram handles file message successfully', async () => {
    const sender = new TelegramSender(mockInstance)
    const msg: any = {
      sender: { id: 'q1', name: 'QQUser' },
      content: [{ type: 'file', data: { file: 'doc.pdf', filename: 'doc.pdf' } }],
    }
    vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('doc'), fileName: 'doc.pdf' })

    await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')

    expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'document', fileName: 'doc.pdf' }), expect.any(Object))
  })
})
