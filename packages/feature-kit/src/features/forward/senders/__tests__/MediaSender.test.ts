import { beforeEach, describe, expect, it, vi } from 'vitest'
import env from '../../../../../../../main/src/domain/models/env'
import { MediaSender } from '../MediaSender'

describe('mediaSender', () => {
  const fileNormalizer = {
    normalizeInputFile: vi.fn(),
    isGifMedia: vi.fn(),
  }
  const richHeaderBuilder = {
    applyRichHeader: vi.fn(),
    buildReplyTo: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when media group is empty', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const result = await sender.sendMediaGroup({} as any, [], '', undefined)

    expect(result).toBeNull()
  })

  it('delegates single media to sendMediaToTG', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const sendMediaToTG = vi.fn().mockResolvedValue({ id: 1 })

    const result = await sender.sendMediaGroup(
      {} as any,
      [{ type: 'image', data: {} } as any],
      '',
      1,
      {},
      'header',
      false,
      undefined,
      'qq1',
      sendMediaToTG,
    )

    expect(sendMediaToTG).toHaveBeenCalled()
    expect(result).toEqual({ id: 1 })
  })

  it('sends media group with caption and reply', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: {
        sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]),
      },
      sendMessage: vi.fn(),
    }

    fileNormalizer.normalizeInputFile.mockResolvedValue({ data: 'file', fileName: 'a.jpg' })
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(77)

    const result = await sender.sendMediaGroup(
      chat,
      [
        { type: 'image', data: { file: 'file-a' } },
        { type: 'image', data: { file: 'file-b' } },
      ] as any,
      'caption',
      55,
      { tgThreadId: 0 },
      'header:',
      false,
      undefined,
      'qq2',
    )

    expect(chat.client.sendMediaGroup).toHaveBeenCalled()
    const mediaInputs = vi.mocked(chat.client.sendMediaGroup).mock.calls[0][1] as any[]
    expect(mediaInputs[0].caption).toContain('header:')
    expect(mediaInputs[0].caption).toContain('caption')
    const sendParams = vi.mocked(chat.client.sendMediaGroup).mock.calls[0][2]
    expect(sendParams.replyTo).toBe(77)
    expect(result).toEqual({ id: 10 })
  })

  it('sends venue or geo for location', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 200,
      client: {
        sendMedia: vi.fn().mockResolvedValue({ id: 20 }),
      },
    }

    const venueContent = { type: 'location', data: { latitude: 1, longitude: 2, title: 'T', address: 'A' } }
    const geoContent = { type: 'location', data: { latitude: 3, longitude: 4 } }

    await sender.sendLocationToTG(chat as any, venueContent as any)
    await sender.sendLocationToTG(chat as any, geoContent as any)

    const firstCall = vi.mocked(chat.client.sendMedia).mock.calls[0][1]
    const secondCall = vi.mocked(chat.client.sendMedia).mock.calls[1][1]

    expect(firstCall.type).toBe('venue')
    expect(secondCall.type).toBe('geo')
  })

  it('falls back to text for unsupported dice emoji', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 300,
      client: {
        sendMedia: vi.fn(),
      },
      sendMessage: vi.fn().mockResolvedValue({ id: 30 }),
    }

    richHeaderBuilder.applyRichHeader.mockReturnValue({ text: 'msg', params: {} })

    const content = { type: 'dice', data: { emoji: '🪨', value: 2 } }
    await sender.sendDiceToTG(chat as any, content as any, 11, undefined, 'User:')

    expect(chat.sendMessage).toHaveBeenCalled()
    expect(chat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('adds messageThreadId for unsupported dice emoji', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 300,
      client: {
        sendMedia: vi.fn(),
      },
      sendMessage: vi.fn().mockResolvedValue({ id: 30 }),
    }

    richHeaderBuilder.applyRichHeader.mockReturnValue({ text: 'msg', params: {} })

    const content = { type: 'dice', data: { emoji: '🪨', value: 1 } }
    await sender.sendDiceToTG(chat as any, content as any, 11, 9, 'User:')

    const params = vi.mocked(chat.sendMessage).mock.calls[0][1]
    expect(params.messageThreadId).toBe(9)
  })

  it('sends dice media for supported emoji', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 400,
      client: {
        sendMedia: vi.fn().mockResolvedValue({ id: 40 }),
      },
      sendMessage: vi.fn(),
    }

    const content = { type: 'dice', data: { emoji: '🎲', value: 6 } }
    await sender.sendDiceToTG(chat as any, content as any, 12)

    expect(chat.client.sendMedia).toHaveBeenCalled()
  })

  it('sends rich header before media group', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]) },
      sendMessage: vi.fn().mockResolvedValue({ id: 5 }),
    }

    fileNormalizer.normalizeInputFile.mockResolvedValue({ data: 'file', fileName: 'a.jpg' })
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(77)
    richHeaderBuilder.applyRichHeader.mockReturnValue({ text: 'rich header', params: {} })

    await sender.sendMediaGroup(
      chat,
      [{ type: 'image', data: { file: 'file-a' } }] as any,
      'caption',
      55,
      { tgThreadId: 1 },
      'header:',
      true,
      'http://example.com',
      'qq3',
    )

    expect(chat.sendMessage).toHaveBeenCalledWith('rich header', expect.objectContaining({ replyTo: 77, messageThreadId: 1 }))
    expect(chat.client.sendMediaGroup).toHaveBeenCalled()
  })

  it('handles rich header send failure gracefully', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]) },
      sendMessage: vi.fn().mockRejectedValue(new Error('Send failed')),
    }

    fileNormalizer.normalizeInputFile.mockResolvedValue({ data: 'file', fileName: 'a.jpg' })
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(77)
    richHeaderBuilder.applyRichHeader.mockReturnValue({ text: 'rich header', params: {} })

    await sender.sendMediaGroup(
      chat,
      [{ type: 'image', data: { file: 'file-a' } }] as any,
      'caption',
      55,
      {},
      'header:',
      true,
      'http://example.com',
      'qq4',
    )

    // Should still send media group despite rich header failure
    expect(chat.client.sendMediaGroup).toHaveBeenCalled()
  })

  it('returns null when all media normalization fails', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = { id: 100, client: { sendMediaGroup: vi.fn() } }

    fileNormalizer.normalizeInputFile.mockResolvedValue(null)
    richHeaderBuilder.buildReplyTo.mockReturnValue(undefined)

    const result = await sender.sendMediaGroup(
      chat,
      [{ type: 'image', data: { file: 'file-a' } }] as any,
      '',
    )

    expect(result).toBeNull()
    expect(chat.client.sendMediaGroup).not.toHaveBeenCalled()
  })

  it('skips failed media items but sends valid ones', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]) },
    }

    fileNormalizer.normalizeInputFile
      .mockResolvedValueOnce(null) // First fails
      .mockResolvedValueOnce({ data: 'file2', fileName: 'b.jpg' }) // Second succeeds
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(undefined)

    const result = await sender.sendMediaGroup(
      chat,
      [
        { type: 'image', data: { file: 'file-a' } },
        { type: 'image', data: { file: 'file-b' } },
      ] as any,
      '',
    )

    expect(chat.client.sendMediaGroup).toHaveBeenCalled()
    const mediaInputs = vi.mocked(chat.client.sendMediaGroup).mock.calls[0][1] as any[]
    expect(mediaInputs.length).toBe(1)
    expect(result).toEqual({ id: 10 })
  })

  it('continues when media item processing throws', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]) },
    }

    fileNormalizer.normalizeInputFile
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: 'file2', fileName: 'b.jpg' })
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(undefined)

    const result = await sender.sendMediaGroup(
      chat,
      [
        { type: 'image', data: { file: 'file-a' } },
        { type: 'image', data: { file: 'file-b' } },
      ] as any,
      '',
    )

    expect(chat.client.sendMediaGroup).toHaveBeenCalled()
    const mediaInputs = vi.mocked(chat.client.sendMediaGroup).mock.calls[0][1] as any[]
    expect(mediaInputs.length).toBe(1)
    expect(result).toEqual({ id: 10 })
  })

  it('retries sendMediaGroup without ttlSeconds after failure', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn() },
    }

    fileNormalizer.normalizeInputFile.mockResolvedValue({ data: 'file', fileName: 'a.jpg' })
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(undefined)

    const originalTtl = env.TG_MEDIA_TTL_SECONDS
    env.TG_MEDIA_TTL_SECONDS = 10

    try {
      let firstInputsSnapshot: any[] | undefined
      let secondInputsSnapshot: any[] | undefined
      chat.client.sendMediaGroup
        .mockImplementationOnce((_chatId: number, inputs: any[]) => {
          firstInputsSnapshot = inputs.map(item => ({ ...item }))
          return Promise.reject(new Error('fail'))
        })
        .mockImplementationOnce((_chatId: number, inputs: any[]) => {
          secondInputsSnapshot = inputs.map(item => ({ ...item }))
          return Promise.resolve([{ id: 10 }])
        })

      const result = await sender.sendMediaGroup(
        chat,
        [{ type: 'image', data: { file: 'file-a' } }] as any,
        '',
      )

      expect(firstInputsSnapshot?.[0].ttlSeconds).toBe(10)
      expect(secondInputsSnapshot?.[0].ttlSeconds).toBeUndefined()
      expect(result).toEqual({ id: 10 })
    }
    finally {
      env.TG_MEDIA_TTL_SECONDS = originalTtl
    }
  })

  it('returns null when sendMediaGroup fails completely', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn().mockRejectedValue(new Error('Complete failure')) },
    }

    fileNormalizer.normalizeInputFile.mockResolvedValue({ data: 'file', fileName: 'a.jpg' })
    fileNormalizer.isGifMedia.mockReturnValue(false)
    richHeaderBuilder.buildReplyTo.mockReturnValue(undefined)

    const result = await sender.sendMediaGroup(
      chat,
      [{ type: 'image', data: { file: 'file-a' } }] as any,
      '',
    )

    expect(result).toBeNull()
  })

  it('handles GIF media type correctly', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 100,
      client: { sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]) },
    }

    fileNormalizer.normalizeInputFile.mockResolvedValue({ data: 'file', fileName: 'a.gif' })
    fileNormalizer.isGifMedia.mockReturnValue(true)
    richHeaderBuilder.buildReplyTo.mockReturnValue(undefined)

    await sender.sendMediaGroup(
      chat,
      [{ type: 'image', data: { file: 'file-a.gif' } }] as any,
      '',
    )

    const mediaInputs = vi.mocked(chat.client.sendMediaGroup).mock.calls[0][1] as any[]
    expect(mediaInputs[0].type).toBe('animation')
  })

  it('returns null for location without coordinates', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = { id: 200, client: { sendMedia: vi.fn() } }

    const invalidContent = { type: 'location', data: {} }
    const result = await sender.sendLocationToTG(chat as any, invalidContent as any)

    expect(result).toBeNull()
    expect(chat.client.sendMedia).not.toHaveBeenCalled()
  })

  it('handles location with header and thread', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 200,
      client: { sendMedia: vi.fn().mockResolvedValue({ id: 20 }) },
    }

    const content = { type: 'location', data: { latitude: 1, longitude: 2 } }
    await sender.sendLocationToTG(chat as any, content as any, 10, 5, 'User: ')

    const sendParams = vi.mocked(chat.client.sendMedia).mock.calls[0][2]
    expect(sendParams.caption).toBe('User: ')
    expect(sendParams.messageThreadId).toBe(5)
    expect(sendParams.replyTo).toBe(10)
  })

  it('handles dice with RPS mapping', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 300,
      client: { sendMedia: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue({ id: 30 }),
    }

    richHeaderBuilder.applyRichHeader.mockReturnValue({ text: 'msg', params: {} })

    // Test all RPS values
    for (const [value] of [[1, '✋ 布'], [2, '✌️ 剪刀'], [3, '✊ 石头']]) {
      const content = { type: 'dice', data: { emoji: '🪨', value } }
      await sender.sendDiceToTG(chat as any, content as any, undefined, undefined, '')
    }

    expect(chat.sendMessage).toHaveBeenCalledTimes(3)
  })

  it('handles dice with messageThreadId', async () => {
    const sender = new MediaSender(fileNormalizer as any, richHeaderBuilder as any)
    const chat = {
      id: 400,
      client: { sendMedia: vi.fn().mockResolvedValue({ id: 40 }) },
    }

    const content = { type: 'dice', data: { emoji: '🎲' } }
    await sender.sendDiceToTG(chat as any, content as any, undefined, 7)

    const sendParams = vi.mocked(chat.client.sendMedia).mock.calls[0][2]
    expect(sendParams.messageThreadId).toBe(7)
  })
})
