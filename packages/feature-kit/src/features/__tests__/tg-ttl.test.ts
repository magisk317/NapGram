import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { db, env } from '@napgram/infra-kit'

const envMock = vi.hoisted(() => ({
  TG_MEDIA_TTL_SECONDS: 10,
  WEB_ENDPOINT: 'http://example.test',
}))

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@napgram/infra-kit', () => ({
  db: {
    message: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    forwardPair: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    forwardMultiple: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    qqRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn()
  },
  get env() { return envMock }, // 使用hoisted的envMock
  hashing: { md5Hex: vi.fn((value: string) => value) },
  temp: { TEMP_PATH: '/tmp', createTempFile: vi.fn(() => ({ path: '/tmp/test', cleanup: vi.fn() })) },
  getLogger: vi.fn(() => loggerMocks),
  configureInfraKit: vi.fn(),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn() },
  flags: { DISABLE_RICH_HEADER: 1 },
}))



describe('telegram media TTL', () => {
  it('adds ttlSeconds to media-group items when configured', async () => {
    envMock.TG_MEDIA_TTL_SECONDS = 10

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
