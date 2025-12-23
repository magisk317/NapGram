import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'

describe('telegram media TTL', () => {
  it('adds ttlSeconds to media-group items when configured', async () => {
    process.env.TG_MEDIA_TTL_SECONDS = '10'
    vi.resetModules()

    const { MediaSender } = await import('../forward/senders/MediaSender')
    const { FileNormalizer } = await import('../forward/senders/FileNormalizer')
    const { RichHeaderBuilder } = await import('../forward/senders/RichHeaderBuilder')

    const chat: any = {
      id: 1001,
      sendMessage: vi.fn().mockResolvedValue({ id: 1 }),
      client: {
        sendMediaGroup: vi.fn().mockResolvedValue([{ id: 10 }]),
      },
    }

    const sender = new MediaSender(new FileNormalizer(undefined), new RichHeaderBuilder())
    await sender.sendMediaGroup(
      chat,
      [
        { type: 'image', data: { file: Buffer.from('a'), fileName: 'a.jpg' } } as any,
        { type: 'video', data: { file: Buffer.from('b'), fileName: 'b.mp4' } } as any,
      ],
      '',
    )

    expect(chat.client.sendMediaGroup).toHaveBeenCalledTimes(1)
    const mediaInputs = chat.client.sendMediaGroup.mock.calls[0][1]
    expect(mediaInputs[0].ttlSeconds).toBe(10)
    expect(mediaInputs[1].ttlSeconds).toBe(10)
  })
})
