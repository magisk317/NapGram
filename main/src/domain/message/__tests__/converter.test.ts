import type { UnifiedMessage } from '../types'
import { describe, expect, it } from 'vitest'
import { MessageConverter } from '../converter'

describe('messageConverter', () => {
  const converter = new MessageConverter()

  describe('fromNapCat', () => {
    it('should convert text message', () => {
      const napCatMsg = {
        message_id: 123,
        message: [
          {
            type: 'text',
            data: { text: 'Hello World' },
          },
        ],
        sender: {
          user_id: 456,
          nickname: 'TestUser',
        },
        user_id: 456,
        time: 1234567890,
        message_type: 'private',
      }

      const result = converter.fromNapCat(napCatMsg)

      expect(result.id).toBe('123')
      expect(result.platform).toBe('qq')
      expect(result.sender.id).toBe('456')
      expect(result.sender.name).toBe('TestUser')
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].data.text).toBe('Hello World')
    })

    it('should convert image message', () => {
      const napCatMsg = {
        message_id: 124,
        message: [
          {
            type: 'image',
            data: {
              url: 'https://example.com/image.jpg',
              file: 'image.jpg',
            },
          },
        ],
        sender: {
          user_id: 456,
          nickname: 'TestUser',
        },
        user_id: 456,
        time: 1234567890,
        message_type: 'group',
        group_id: 789,
      }

      const result = converter.fromNapCat(napCatMsg)

      expect(result.content[0].type).toBe('image')
      expect(result.content[0].data.url).toBe('https://example.com/image.jpg')
      expect(result.chat.type).toBe('group')
      expect(result.chat.id).toBe('789')
    })

    it('should convert at message', () => {
      const napCatMsg = {
        message_id: 125,
        message: [
          {
            type: 'at',
            data: {
              qq: '123456',
              name: 'AtUser',
            },
          },
        ],
        sender: {
          user_id: 456,
          nickname: 'TestUser',
        },
        user_id: 456,
        time: 1234567890,
        message_type: 'group',
        group_id: 789,
      }

      const result = converter.fromNapCat(napCatMsg)

      expect(result.content[0].type).toBe('at')
      expect(result.content[0].data.userId).toBe('123456')
      expect(result.content[0].data.userName).toBe('AtUser')
    })

    it('should convert mixed content message', () => {
      const napCatMsg = {
        message_id: 126,
        message: [
          { type: 'text', data: { text: 'Hello ' } },
          { type: 'at', data: { qq: '123', name: 'User' } },
          { type: 'text', data: { text: ' how are you?' } },
        ],
        sender: {
          user_id: 456,
          nickname: 'TestUser',
        },
        user_id: 456,
        time: 1234567890,
        message_type: 'group',
        group_id: 789,
      }

      const result = converter.fromNapCat(napCatMsg)

      expect(result.content).toHaveLength(3)
      expect(result.content[0].type).toBe('text')
      expect(result.content[1].type).toBe('at')
      expect(result.content[2].type).toBe('text')
    })
  })

  describe('toNapCat', () => {
    it('should convert text message to NapCat format', async () => {
      const unifiedMsg: UnifiedMessage = {
        id: '123',
        platform: 'qq',
        sender: {
          id: '456',
          name: 'TestUser',
        },
        chat: {
          id: '789',
          type: 'group',
        },
        content: [
          {
            type: 'text',
            data: { text: 'Hello World' },
          },
        ],
        timestamp: 1234567890000,
      }

      const result = await converter.toNapCat(unifiedMsg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('text')
      expect(result[0].data.text).toBe('Hello World')
    })

    it('should convert image message to NapCat format', async () => {
      const unifiedMsg: UnifiedMessage = {
        id: '123',
        platform: 'qq',
        sender: {
          id: '456',
          name: 'TestUser',
        },
        chat: {
          id: '789',
          type: 'group',
        },
        content: [
          {
            type: 'image',
            data: {
              url: 'https://example.com/image.jpg',
              isSpoiler: false,
            },
          },
        ],
        timestamp: 1234567890000,
      }

      const result = await converter.toNapCat(unifiedMsg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('image')
      expect(result[0].data.file).toBe('https://example.com/image.jpg')
      expect(result[0].data.sub_type).toBe('0')
    })

    it('should convert spoiler image to NapCat format', async () => {
      const unifiedMsg: UnifiedMessage = {
        id: '123',
        platform: 'qq',
        sender: {
          id: '456',
          name: 'TestUser',
        },
        chat: {
          id: '789',
          type: 'group',
        },
        content: [
          {
            type: 'image',
            data: {
              url: 'https://example.com/image.jpg',
              isSpoiler: true,
            },
          },
        ],
        timestamp: 1234567890000,
      }

      const result = await converter.toNapCat(unifiedMsg)

      expect(result[0].data.sub_type).toBe('7')
    })
  })
})
