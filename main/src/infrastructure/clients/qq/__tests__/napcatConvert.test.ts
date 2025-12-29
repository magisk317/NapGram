import { describe, expect, it, vi } from 'vitest'
import { napCatForwardMultiple } from '../napcatConvert'

// Mock logger to avoid console noise and verify warnings
// Mock logger to avoid console noise and verify warnings
const { mockWarn } = vi.hoisted(() => {
  return { mockWarn: vi.fn() }
})

vi.mock('../../../../shared/logger', () => ({
  getLogger: () => ({
    warn: mockWarn,
  }),
}))

describe('napCatForwardMultiple', () => {
  const baseSender = { user_id: 123, nickname: 'User', card: '' }

  it('should convert basic group forward message', () => {
    const messages: any = [{
      message_type: 'group',
      group_id: 456,
      sender: baseSender,
      time: 1234567890,
      message_id: 1001,
      raw_message: 'raw',
      message: [{ type: 'text', data: { text: 'hello' } }],
    }]

    const result = napCatForwardMultiple(messages)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      group_id: 456,
      nickname: 'User',
      time: 1234567890,
      user_id: 123,
      seq: 1001,
      raw_message: 'raw',
      message: [{ type: 'text', text: 'hello' }],
    })
  })

  it('should handle single message object conversion (not array)', () => {
    const messages: any = [{
      message_type: 'private',
      sender: { ...baseSender, card: 'CardName' },
      time: 1234567890,
      message_id: 1002,
      raw_message: 'raw',
      message: { type: 'text', data: { text: 'single' } }, // Object not array
    }]

    const result = napCatForwardMultiple(messages)

    expect(result[0].nickname).toBe('CardName')
    expect(result[0].group_id).toBeUndefined()
    expect(result[0].message).toHaveLength(1)
    expect(result[0].message[0]).toEqual({ type: 'text', text: 'single' })
  })

  it('should filter out null message elements', () => {
    const messages: any = [{
      message_type: 'group',
      sender: baseSender,
      time: 0,
      message_id: 1,
      message: [
        null,
        { type: 'text', data: { text: 'ok' } },
        undefined,
      ],
    }]

    const result = napCatForwardMultiple(messages)
    expect(result[0].message).toHaveLength(1)
    expect(result[0].message[0].text).toBe('ok')
  })

  describe('segment type conversion', () => {
    const makeMsg = (segment: any) => [{
      message_type: 'group',
      sender: baseSender,
      time: 0,
      message_id: 1,
      message: [segment],
    }]

    it('should convert face', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'face', data: { id: 1 } }) as any)
      expect(res[0].message[0]).toMatchObject({ type: 'face', id: 1, asface: false })

      const res2 = napCatForwardMultiple(makeMsg({ type: 'face', data: { id: 1, sub_type: 1 } }) as any)
      expect(res2[0].message[0]).toMatchObject({ type: 'face', id: 1, asface: true })
    })

    it('should convert mface', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'mface', data: { url: 'u' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'image', url: 'u', file: 'u' })
    })

    it('should convert at (specific)', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'at', data: { qq: '123' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'at', qq: 123, text: '@123' })
    })

    it('should convert at (all)', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'at', data: { qq: 'all' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'at', qq: -1, text: '@全体成员' })
    })

    it('should convert bface', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'bface', data: { url: 'u', text: 't' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'image', url: 'u', file: 'u', brief: 't' })
    })

    it('should convert reply', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'reply', data: { id: '999' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'reply', id: '999' })
    })

    it('should convert video', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'video', data: { url: 'u', file: 'f' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'video', url: 'u', file: 'f', name: 'u' })
    })

    it('should convert file', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'file', data: { file: 'f', file_id: 'fi', url: 'u', file_size: 100 } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'file', file: 'f', file_id: 'fi', url: 'f', file_size: 100 })
    })

    it('should convert forward', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'forward', data: { url: 'u' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'forward', url: 'u', file: 'u' })
    })

    it('should convert dice/rps', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'dice', data: { result: '3' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'dice', result: 3 })

      const res2 = napCatForwardMultiple(makeMsg({ type: 'rps', data: { result: '2' } }) as any)
      expect(res2[0].message[0]).toEqual({ type: 'rps', result: 2 })
    })

    it('should convert poke', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'poke', data: { id: '1' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'poke', id: 1 })
    })

    it('should handle common types (image, json, etc) with direct mapping', () => {
      const types = ['image', 'record', 'json', 'markdown', 'sface']
      types.forEach((type) => {
        const res = napCatForwardMultiple(makeMsg({ type, data: { foo: 'bar' } }) as any)
        expect(res[0].message[0]).toMatchObject({ type, foo: 'bar', asface: false })
      })
    })

    it('should handle unknown types', () => {
      const res = napCatForwardMultiple(makeMsg({ type: 'unknown', data: { raw: 'data' } }) as any)
      expect(res[0].message[0]).toEqual({ type: 'unknown', raw: 'data' })
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Unknown message type'), expect.any(String))
    })

    it('should handle missing type', () => {
      const res = napCatForwardMultiple(makeMsg({ data: {} } as any) as any)
      // Should be filtered out
      expect(res[0].message).toHaveLength(0)
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Element missing type'), expect.any(String))
    })

    it('should handle null data in convert (internal check)', () => {
      // napCatReceiveToMessageElem check !data
      // Pass null explicitly to makeMsg helper?
      // But napCatForwardMultiple filters nulls from array first.
      // We can force a null passing if we hack the array after filter?
      // Or just call internal function if exported?
      // Since not exported, we rely on types that might pass filter but fail internal check?
      // Actually lines 15-16 filter: elem != null.
      // So passed elem is not null.
      // But internal check: if (!data) return null.
      // 'data' IS the elem. So it's already checked?
      // Maybe elem is truthy but becomes falsy? Unlikely.
      // EXCEPT: The logic in filter 'elem != null' allows 'false', 0, etc.
      // But 'message' elements are objects.
      // Wait, if I pass `false` as an element?
      const messages: any = [{
        message_type: 'group',
        sender: baseSender,
        time: 0,
        message_id: 1,
        message: [false], // truthy filter? No, false != null is true.
      }]
      const result = napCatForwardMultiple(messages)
      // false is passed to napCatReceiveToMessageElem(data)
      // if (!data) -> if (!false) -> returns null.
      // Then result filtered: .filter(e => e!=null).
      // So result.message should be empty.
      expect(result[0].message).toHaveLength(0)
    })
    describe('branch coverage for fallbacks', () => {
      it('should handle bface url/file priority', () => {
        // Case 1: url present
        const res1 = napCatForwardMultiple(makeMsg({ type: 'bface', data: { url: 'u1' } }) as any)
        expect(res1[0].message[0]).toMatchObject({ file: 'u1', url: 'u1' })

        // Case 2: url missing, file present
        const res2 = napCatForwardMultiple(makeMsg({ type: 'bface', data: { file: 'f1' } }) as any)
        expect(res2[0].message[0]).toMatchObject({ file: 'f1', url: 'f1' })

        // Case 3: both (url wins) -> covered by Case 1 implicitly but good to be explicit
        const res3 = napCatForwardMultiple(makeMsg({ type: 'bface', data: { url: 'u2', file: 'f2' } }) as any)
        expect(res3[0].message[0]).toMatchObject({ file: 'u2', url: 'u2' })
      })

      it('should handle video file/url priority', () => {
        // file || url
        const res1 = napCatForwardMultiple(makeMsg({ type: 'video', data: { file: 'f' } }) as any)
        expect(res1[0].message[0]).toMatchObject({ file: 'f', name: 'f' }) // url is undefined in result if input url missing? No, line 98 `url: anyData.data.url`.

        const res2 = napCatForwardMultiple(makeMsg({ type: 'video', data: { url: 'u' } }) as any)
        expect(res2[0].message[0]).toMatchObject({ file: 'u', name: 'u', url: 'u' })

        // name: url || file
        // Covered above (res2 -> name=u, res1 -> name=f)
      })

      it('should handle file segment priority', () => {
        // file_id: file_id || file
        const res1 = napCatForwardMultiple(makeMsg({ type: 'file', data: { file: 'f', file_id: 'fi' } }) as any)
        expect(res1[0].message[0]).toMatchObject({ file_id: 'fi' })

        const res2 = napCatForwardMultiple(makeMsg({ type: 'file', data: { file: 'f' } }) as any)
        expect(res2[0].message[0]).toMatchObject({ file_id: 'f' })

        // url: file || url (Wait, line 106: file || url)
        const res3 = napCatForwardMultiple(makeMsg({ type: 'file', data: { url: 'u' } }) as any)
        expect(res3[0].message[0]).toMatchObject({ url: 'u' })

        const res4 = napCatForwardMultiple(makeMsg({ type: 'file', data: { file: 'f2' } }) as any)
        expect(res4[0].message[0]).toMatchObject({ url: 'f2' })
      })

      it('should handle forward segment priority', () => {
        // file || url
        const res1 = napCatForwardMultiple(makeMsg({ type: 'forward', data: { file: 'f' } }) as any)
        expect(res1[0].message[0]).toMatchObject({ file: 'f' })

        const res2 = napCatForwardMultiple(makeMsg({ type: 'forward', data: { url: 'u' } }) as any)
        expect(res2[0].message[0]).toMatchObject({ file: 'u' })

        // url: url || file
        const res3 = napCatForwardMultiple(makeMsg({ type: 'forward', data: { url: 'u2' } }) as any)
        expect(res3[0].message[0]).toMatchObject({ url: 'u2' })

        const res4 = napCatForwardMultiple(makeMsg({ type: 'forward', data: { file: 'f2' } }) as any)
        expect(res4[0].message[0]).toMatchObject({ url: 'f2' })
      })
    })

    describe('missing data property handling', () => {
      it('should handle text with missing data', () => {
        const res = napCatForwardMultiple(makeMsg({ type: 'text' }) as any) // data undefined
        expect(res[0].message[0]).toEqual({ type: 'text' })
      })

      it('should handle image with missing data', () => {
        const res = napCatForwardMultiple(makeMsg({ type: 'image' }) as any)
        expect(res[0].message[0]).toMatchObject({ type: 'image', asface: undefined })
      })

      it('should handle face with missing data', () => {
        const res = napCatForwardMultiple(makeMsg({ type: 'face' }) as any)
        expect(res[0].message[0]).toMatchObject({ type: 'face', asface: undefined })
      })

      it('should handle image with data but missing sub_type', () => {
        const res = napCatForwardMultiple(makeMsg({ type: 'image', data: { url: 'u' } }) as any)
        expect(res[0].message[0]).toMatchObject({ type: 'image', url: 'u', asface: false })
      })

      it('should handle image with sub_type 0', () => {
        const res = napCatForwardMultiple(makeMsg({ type: 'image', data: { sub_type: 0 } }) as any)
        expect(res[0].message[0]).toMatchObject({ type: 'image', asface: false })
      })

      it('should handle unknown with missing data', () => {
        const res = napCatForwardMultiple(makeMsg({ type: 'unknown_gen', foo: 'bar' }) as any)
        // Default case: ...(anyData.data || anyData)
        // data missing, so generic spread user anyData
        expect(res[0].message[0]).toMatchObject({ type: 'unknown_gen', foo: 'bar' })
      })
    })
  }) // end segment type conversion
})
