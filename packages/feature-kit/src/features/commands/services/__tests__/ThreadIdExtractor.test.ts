import type { UnifiedMessage } from '../../../../../../../main/src/domain/message'
import { describe, expect, it } from 'vitest'
import { ThreadIdExtractor } from '../ThreadIdExtractor'

function createMessage(raw?: any): UnifiedMessage {
  return {
    id: '123',
    platform: 'telegram',
    sender: {
      id: '111',
      name: 'Tester',
    },
    chat: {
      id: '222',
      type: 'group',
    },
    content: [
      {
        type: 'text',
        data: { text: '/cmd' },
      },
    ],
    timestamp: Date.now(),
    metadata: raw ? { raw } : {},
  }
}

describe('threadIdExtractor', () => {
  it('extracts thread ID from args', () => {
    const extractor = new ThreadIdExtractor()
    const msg = createMessage()

    const threadId = extractor.extract(msg, ['qq', '123', '456'])

    expect(threadId).toBe(456)
  })

  it('extracts thread ID from raw metadata', () => {
    const extractor = new ThreadIdExtractor()
    const msg = createMessage({ replyTo: { replyToTopId: 789 } })

    const threadId = extractor.extract(msg, [])

    expect(threadId).toBe(789)
  })

  it('returns undefined when no thread ID exists', () => {
    const extractor = new ThreadIdExtractor()
    const msg = createMessage()

    const threadId = extractor.extract(msg, [])

    expect(threadId).toBeUndefined()
  })

  it('extracts thread ID from nested TL layer raw.raw', () => {
    const extractor = new ThreadIdExtractor()
    const msg = createMessage({
      raw: {
        replyTo: { replyToTopId: 999 },
      },
    })

    const threadId = extractor.extract(msg, [])

    expect(threadId).toBe(999)
  })

  it('extracts thread ID from raw.raw topicId', () => {
    const extractor = new ThreadIdExtractor()
    const msg = createMessage({
      raw: {
        topicId: 888,
      },
    })

    const threadId = extractor.extract(msg, [])

    expect(threadId).toBe(888)
  })
})
