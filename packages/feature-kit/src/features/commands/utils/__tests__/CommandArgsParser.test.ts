import { describe, expect, it } from 'vitest'
import { CommandArgsParser } from '../CommandArgsParser'

describe('commandArgsParser', () => {
  const createMockMessage = (replyData?: any): any => ({
    content: replyData ? [{ type: 'reply', data: replyData }] : [],
    metadata: {
      raw: replyData?.raw || {},
    },
  })

  describe('parseUserAction', () => {
    it('parses action without QQ number', () => {
      const result = CommandArgsParser.parseUserAction(['on'], {} as any, false)

      expect(result.action).toBe('on')
      expect(result.uin).toBeNull()
    })

    it('parses QQ number and action', () => {
      const result = CommandArgsParser.parseUserAction(['12345678', 'off'], {} as any, false)

      expect(result.uin).toBe('12345678')
      expect(result.action).toBe('off')
    })

    it('parses action in reverse order', () => {
      const result = CommandArgsParser.parseUserAction(['on', '12345678'], {} as any, false)

      expect(result.uin).toBe('12345678')
      expect(result.action).toBe('on')
    })

    it('returns toggle when no action specified', () => {
      const result = CommandArgsParser.parseUserAction([], {} as any, false)

      expect(result.action).toBe('toggle')
      expect(result.uin).toBeNull()
    })

    it('extracts UIN from reply message', () => {
      const msg = createMockMessage({
        raw: { replyToMessage: { id: 1, senderId: '87654321', sender: {} } },
      })

      const result = CommandArgsParser.parseUserAction(['on'], msg, true)

      expect(result.uin).toBe('87654321')
      expect(result.action).toBe('on')
    })

    it('supports Chinese on/off', () => {
      const result1 = CommandArgsParser.parseUserAction(['开'], {} as any, false)
      const result2 = CommandArgsParser.parseUserAction(['关'], {} as any, false)

      expect(result1.action).toBe('on')
      expect(result2.action).toBe('off')
    })
  })

  describe('parseUserContent', () => {
    it('parses content without QQ number', () => {
      const result = CommandArgsParser.parseUserContent(['hello', 'world'], {} as any, false)

      expect(result.uin).toBeNull()
      expect(result.content).toBe('hello world')
    })

    it('parses QQ number and content', () => {
      const result = CommandArgsParser.parseUserContent(['12345678', 'new', 'title'], {} as any, false)

      expect(result.uin).toBe('12345678')
      expect(result.content).toBe('new title')
    })

    it('extracts UIN from reply and uses all args as content', () => {
      const msg = createMockMessage({
        raw: { replyToMessage: { id: 1, senderId: '87654321', sender: {} } },
      })

      const result = CommandArgsParser.parseUserContent(['my', 'content'], msg, true)

      expect(result.uin).toBe('87654321')
      expect(result.content).toBe('my content')
    })

    it('returns null UIN when reply has no valid sender data (line 147)', () => {
      // Test the case where extractUinFromReply returns null
      const msg = createMockMessage({
        // No senderId in reply data, and no raw.replyToMessage
      })

      const result = CommandArgsParser.parseUserContent(['some', 'content'], msg, true)

      expect(result.uin).toBeNull()
      expect(result.content).toBe('some content')
    })

    it('handles empty content', () => {
      const result = CommandArgsParser.parseUserContent([], {} as any, false)

      expect(result.content).toBe('')
    })
  })

  describe('parseLikeArgs', () => {
    it('parses QQ number and times', () => {
      const result = CommandArgsParser.parseLikeArgs(['12345678', '5'], {} as any, false)

      expect(result.uin).toBe('12345678')
      expect(result.times).toBe(5)
    })

    it('parses times and QQ number in reverse order', () => {
      const result = CommandArgsParser.parseLikeArgs(['8', '87654321'], {} as any, false)

      expect(result.uin).toBe('87654321')
      expect(result.times).toBe(8)
    })

    it('defaults to 1 time when not specified', () => {
      const result = CommandArgsParser.parseLikeArgs(['12345678'], {} as any, false)

      expect(result.uin).toBe('12345678')
      expect(result.times).toBe(1)
    })

    it('clamps times to valid range', () => {
      const result1 = CommandArgsParser.parseLikeArgs(['12345678', '0'], {} as any, false)
      const result2 = CommandArgsParser.parseLikeArgs(['12345678', '15'], {} as any, false)

      expect(result1.times).toBe(1) // invalid, defaults to 1
      expect(result2.times).toBe(1) // out of range, ignored
    })

    it('extracts UIN from reply', () => {
      const msg = createMockMessage({
        raw: { replyToMessage: { id: 1, senderId: '87654321', sender: {} } },
      })

      const result = CommandArgsParser.parseLikeArgs(['7'], msg, true)

      expect(result.uin).toBe('87654321')
      expect(result.times).toBe(7)
    })
  })

  describe('hasReplyMessage', () => {
    it('returns false for message without reply', () => {
      const msg = createMockMessage()

      expect(CommandArgsParser.hasReplyMessage(msg)).toBe(false)
    })

    it('returns true for TG reply message', () => {
      const msg = createMockMessage({
        raw: { replyToMessage: { id: 1, sender: {}, chat: {} } },
      })

      expect(CommandArgsParser.hasReplyMessage(msg)).toBe(true)
    })

    it('returns false for forum topic thread context', () => {
      const msg = createMockMessage({
        raw: { replyToMessage: { id: 1, isForumTopic: true } },
      })

      expect(CommandArgsParser.hasReplyMessage(msg)).toBe(false)
    })

    it('returns true for QQ reply content', () => {
      const msg = createMockMessage({ senderId: '12345678' })

      expect(CommandArgsParser.hasReplyMessage(msg)).toBe(true)
    })

    it('returns true for replyTo structure', () => {
      const msg: any = {
        content: [],
        metadata: {
          raw: { replyTo: { replyToMsgId: 123 } },
        },
      }

      expect(CommandArgsParser.hasReplyMessage(msg)).toBe(true)
    })

    it('returns false for replyToMessage without sender or chat', () => {
      const msg: any = {
        content: [], // Explicitly no 'reply' content
        metadata: {
          raw: { replyToMessage: { id: 1 } },
        },
      }

      expect(CommandArgsParser.hasReplyMessage(msg)).toBe(false)
    })
  })

  describe('extractUinFromReply (via parseUserAction)', () => {
    it('extracts UIN from QQ reply content structure', () => {
      const msg: any = {
        content: [
          { type: 'reply', data: { senderId: '88888888' } },
        ],
        metadata: {},
      }

      const result = CommandArgsParser.parseUserAction(['on'], msg, true)
      expect(result.uin).toBe('88888888')
      expect(result.action).toBe('on')
    })
  })
})
