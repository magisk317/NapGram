import { describe, expect, it } from 'vitest'
import { QQClientFactory, qqClientFactory } from '../factory'

describe('qqClientFactory', () => {
  it('creates NapCat client', async () => {
    const factory = new QQClientFactory()
    const fakeClient = { uin: 12345678 }
    factory.register('napcat', async () => fakeClient as any)

    const client = await factory.create({
      type: 'napcat',
      wsUrl: 'ws://localhost:3001',
    })

    expect(client).toBeDefined()
    // Note: uin may be 0 until the client is actually connected
    expect(typeof client.uin).toBe('number')
  })

  it('throws error for unknown client type', async () => {
    const factory = new QQClientFactory()

    await expect(
      factory.create({ type: 'unknown' } as any),
    ).rejects.toThrow('Unknown client type: unknown')
  })

  it('exports singleton factory instance', () => {
    expect(qqClientFactory).toBeInstanceOf(QQClientFactory)
  })
})
