import { describe, expect, it } from 'vitest'
import { InteractionSegmentConverter } from '../InteractionSegmentConverter'

describe('interactionSegmentConverter', () => {
  const converter = new InteractionSegmentConverter()

  describe('convertAt', () => {
    it('should convert at with name', () => {
      const data = { qq: 12345, name: 'User' }
      const result = converter.convertAt(data)
      expect(result).toEqual({
        type: 'at',
        data: {
          userId: '12345',
          userName: 'User',
        },
      })
    })

    it('should handle missing name', () => {
      const data = { qq: '67890' }
      const result = converter.convertAt(data)
      expect(result).toEqual({
        type: 'at',
        data: {
          userId: '67890',
          userName: '',
        },
      })
    })
  })

  describe('convertFace', () => {
    it('should convert standard face with explicit text', () => {
      const data = { id: 1, raw: { faceText: '[Smile]' } }
      const result = converter.convertFace(data)
      expect(result).toEqual({
        type: 'face',
        data: {
          id: 1,
          text: '[Smile]',
        },
      })
    })

    it('should convert dice by regex', () => {
      // "骰" triggers dice
      const data = { raw: { faceText: '[骰子]' } }
      const result = converter.convertFace(data)
      expect(result).toEqual({
        type: 'dice',
        data: {
          emoji: '🎲',
        },
      })
    })

    it('should convert rps by regex', () => {
      // "猜拳" triggers rps
      const data = { raw: { faceText: '[猜拳]' } }
      const result = converter.convertFace(data)
      expect(result).toEqual({
        type: 'dice',
        data: {
          emoji: '✊✋✌️',
        },
      })
    })

    it('should fallback to qface mapping if faceText is not string', () => {
      // id 14 is commonly associated with a specific face, let's assume qface has it.
      // We rely on the real qface import here.
      // If qface[14] is undefined in real code, text is undefined.
      // Let's use a known ID if possible or just check the logic path.
      // The code: (qface as Record<number, string>)[faceId]
      const data = { id: 100 } // Assume 100 might be mapped or undefined
      // If raw is undefined, raw?.faceText is undefined.
      const result = converter.convertFace(data)
      // We don't assert exact text as qface content is external, but we assert structure
      expect(result.type).toBe('face')
      expect(result.data.id).toBe(100)
    })
  })

  describe('convertDice', () => {
    it('should convert dice value', () => {
      const data = { result: '6' }
      const result = converter.convertDice(data)
      expect(result).toEqual({
        type: 'dice',
        data: {
          emoji: '🎲',
          value: 6,
        },
      })
    })
  })

  describe('convertRps', () => {
    it('should convert rps value', () => {
      const data = { result: '2' }
      const result = converter.convertRps(data)
      expect(result).toEqual({
        type: 'dice',
        data: {
          emoji: '✊✋✌️',
          value: 2,
        },
      })
    })
  })

  describe('convertLocation', () => {
    it('should convert with lat/lng', () => {
      const data = { lat: '10.5', lng: '20.5', title: 'T', address: 'A' }
      const result = converter.convertLocation(data)
      expect(result).toEqual({
        type: 'location',
        data: {
          latitude: 10.5,
          longitude: 20.5,
          title: 'T',
          address: 'A',
        },
      })
    })

    it('should convert with latitude/longitude', () => {
      const data = { latitude: 30, longitude: 40 }
      const result = converter.convertLocation(data)
      expect(result.data.latitude).toBe(30)
      expect(result.data.longitude).toBe(40)
    })

    it('should fallback to 0', () => {
      const data = {}
      const result = converter.convertLocation(data)
      expect(result.data.latitude).toBe(0)
      expect(result.data.longitude).toBe(0)
    })
  })

  describe('convertReply', () => {
    it('should convert reply', () => {
      const data = { id: 123456 }
      const result = converter.convertReply(data)
      expect(result).toEqual({
        type: 'reply',
        data: {
          messageId: '123456',
          senderId: '',
          senderName: '',
        },
      })
    })
  })
})
