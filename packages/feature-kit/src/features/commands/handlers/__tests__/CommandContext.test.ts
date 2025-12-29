import type { UnifiedMessage } from '../../../../../../../main/src/domain/message'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandContext } from '../CommandContext'

function createMessage(platform: 'telegram' | 'qq' = 'telegram'): UnifiedMessage {
  return {
    id: '12345',
    platform,
    sender: {
      id: '999999',
      name: 'TestUser',
    },
    chat: {
      id: '777777',
      type: 'group',
    },
    content: [],
    timestamp: Date.now(),
    metadata: {},
  }
}

describe('commandContext', () => {
  let qqClient: any
  let replyTG: any
  let extractThreadId: any
  let forwardPairs: any
  let context: CommandContext

  beforeEach(() => {
    qqClient = {
      uin: 123456,
      sendMessage: vi.fn().mockResolvedValue({}),
    }
    replyTG = vi.fn().mockResolvedValue(undefined)
    extractThreadId = vi.fn().mockReturnValue(undefined)
    forwardPairs = {
      findByTG: vi.fn(),
      findByQQ: vi.fn(),
    }

    context = new CommandContext(
      { id: 1, forwardPairs } as any,
      {} as any,
      qqClient,
      {} as any,
      {} as any,
      {} as any,
      replyTG,
      extractThreadId,
    )
  })

  it('replyQQ sends a text message via QQ client', async () => {
    await context.replyQQ('888888', 'hello')

    expect(qqClient.sendMessage).toHaveBeenCalledWith(
      '888888',
      expect.objectContaining({
        platform: 'qq',
        chat: { id: '888888', type: 'group' },
        sender: { id: '123456', name: 'Bot' },
        content: [{ type: 'text', data: { text: 'hello' } }],
      }),
    )
  })

  it('replyQQ swallows send failures', async () => {
    qqClient.sendMessage.mockRejectedValueOnce(new Error('fail'))

    await expect(context.replyQQ('888888', 'oops')).resolves.toBeUndefined()
  })

  it('replies both sides for TG when allowed by pair settings', async () => {
    extractThreadId.mockReturnValue(123)
    forwardPairs.findByTG.mockReturnValue({
      id: 1,
      qqRoomId: 222222,
      commandReplyMode: '1',
      commandReplyFilter: 'whitelist',
      commandReplyList: 'help,status',
    })

    const msg = createMessage('telegram')
    await context.replyBoth(msg, 'ok', 'help')

    expect(replyTG).toHaveBeenCalledWith('777777', 'ok', 123)
    expect(qqClient.sendMessage).toHaveBeenCalledWith(
      '222222',
      expect.any(Object),
    )
  })

  it('skips QQ reply when command is filtered out', async () => {
    forwardPairs.findByTG.mockReturnValue({
      id: 2,
      qqRoomId: 333333,
      commandReplyMode: '1',
      commandReplyFilter: 'whitelist',
      commandReplyList: 'help',
    })

    const msg = createMessage('telegram')
    await context.replyBoth(msg, 'nope', 'ban')

    expect(replyTG).toHaveBeenCalledWith('777777', 'nope', undefined)
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

  it('blocks TG reply when QQ command is blacklisted', async () => {
    forwardPairs.findByQQ.mockReturnValue({
      id: 3,
      tgChatId: '555555',
      tgThreadId: 9,
      commandReplyMode: '1',
      commandReplyFilter: 'blacklist',
      commandReplyList: 'help',
    })

    const msg = createMessage('qq')
    await context.replyBoth(msg, 'ok', 'help')

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(replyTG).not.toHaveBeenCalled()
  })
})
