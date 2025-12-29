import type { UnifiedMessage } from '../../../../../../../main/src/domain/message'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModeCommandHandler } from '../ModeCommandHandler'

function createMessage(raw?: any): UnifiedMessage {
  return {
    id: '1',
    platform: 'telegram',
    sender: { id: '100', name: 'Tester' },
    chat: { id: '200', type: 'group' },
    content: [{ type: 'text', data: { text: '/mode' } }],
    timestamp: Date.now(),
    metadata: raw ? { raw } : {},
  }
}

describe('modeCommandHandler', () => {
  const replyTG = vi.fn().mockResolvedValue(undefined)
  const modeService = {
    setNicknameMode: vi.fn(),
    setForwardMode: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replies with usage when args are invalid', async () => {
    const handler = new ModeCommandHandler(modeService as any, replyTG)
    const msg = createMessage({ replyToTopId: 123 })

    await handler.handle(msg, ['nickname', '2'])

    expect(replyTG).toHaveBeenCalledWith(
      '200',
      expect.stringContaining('/mode'),
      123,
    )
    expect(modeService.setNicknameMode).not.toHaveBeenCalled()
    expect(modeService.setForwardMode).not.toHaveBeenCalled()
  })

  it('updates nickname mode', async () => {
    const handler = new ModeCommandHandler(modeService as any, replyTG)
    const msg = createMessage()

    await handler.handle(msg, ['nickname', '10'])

    expect(modeService.setNicknameMode).toHaveBeenCalledWith('10')
    expect(replyTG).toHaveBeenCalledWith(
      '200',
      expect.stringContaining('10'),
      undefined,
    )
  })

  it('updates forward mode', async () => {
    const handler = new ModeCommandHandler(modeService as any, replyTG)
    const msg = createMessage()

    await handler.handle(msg, ['forward', '01'])

    expect(modeService.setForwardMode).toHaveBeenCalledWith('01')
    expect(replyTG).toHaveBeenCalledWith(
      '200',
      expect.stringContaining('01'),
      undefined,
    )
  })

  it('handles unknown mode type', async () => {
    const handler = new ModeCommandHandler(modeService as any, replyTG)
    const msg = createMessage()

    await handler.handle(msg, ['other', '01'])

    expect(replyTG).toHaveBeenCalledWith(
      '200',
      expect.stringContaining('nickname'),
      undefined,
    )
  })
})
