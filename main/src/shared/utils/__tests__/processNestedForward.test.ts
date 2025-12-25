import { describe, expect, it, vi, beforeEach } from 'vitest'
import processNestedForward from '../processNestedForward'
import db from '../../../domain/models/db'

// Mock db
vi.mock('../../../domain/models/db', () => ({
    default: {
        forwardMultiple: {
            findFirst: vi.fn(),
            create: vi.fn(),
        }
    }
}))

describe('processNestedForward', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should skip invalid messages', async () => {
        await processNestedForward([null as any], 1)
        expect(db.forwardMultiple.findFirst).not.toHaveBeenCalled()

        await processNestedForward([{ message: 'text' } as any], 1)
        expect(db.forwardMultiple.findFirst).not.toHaveBeenCalled()
    })

    it('should skip invalid elements', async () => {
        const msgs = [{
            message: [
                { type: 'text' }, // wrong type
                null,
                { type: 'json', data: 'invalid json' } // json parse fail
            ]
        }] as any

        await processNestedForward(msgs, 1)
        expect(db.forwardMultiple.findFirst).not.toHaveBeenCalled()
    })

    it('should process forward nodes', async () => {
        const jsonData = JSON.stringify({ type: 'forward', resId: 'abc', fileName: 'foo' })
        const elem = { type: 'json', data: jsonData }
        const msgs = [{ message: [elem] }] as any

        // Mock existing
        const existing = { id: 'uuid-123' }
        vi.mocked(db.forwardMultiple.findFirst).mockResolvedValueOnce(existing as any)

        await processNestedForward(msgs, 1)

        expect(db.forwardMultiple.findFirst).toHaveBeenCalledWith({ where: { resId: 'abc' } })
        expect(db.forwardMultiple.create).not.toHaveBeenCalled()

        // element data modified?
        const parsed = JSON.parse(elem.data)
        expect(parsed).toEqual({ type: 'forward', uuid: 'uuid-123' })
    })

    it('should create new forward node if missing', async () => {
        const jsonData = JSON.stringify({ type: 'forward', resId: 'xyz', fileName: 'bar' })
        const elem = { type: 'json', data: jsonData }
        const msgs = [{ message: [elem] }] as any

        vi.mocked(db.forwardMultiple.findFirst).mockResolvedValueOnce(null)
        const created = { id: 'uuid-new' }
        vi.mocked(db.forwardMultiple.create).mockResolvedValueOnce(created as any)

        await processNestedForward(msgs, 2)

        expect(db.forwardMultiple.create).toHaveBeenCalledWith({
            data: {
                resId: 'xyz',
                fileName: 'bar',
                fromPairId: 2
            }
        })

        const parsed = JSON.parse(elem.data)
        expect(parsed).toEqual({ type: 'forward', uuid: 'uuid-new' })
    })

    it('should skip if type is not forward or no resId', async () => {
        // type not forward
        let elem = { type: 'json', data: JSON.stringify({ type: 'other', resId: '1' }) }
        await processNestedForward([{ message: [elem] }] as any, 1)
        expect(db.forwardMultiple.findFirst).not.toHaveBeenCalled()

        // no resId
        elem = { type: 'json', data: JSON.stringify({ type: 'forward' }) }
        await processNestedForward([{ message: [elem] }] as any, 1)
        expect(db.forwardMultiple.findFirst).not.toHaveBeenCalled()
    })
    it('should create new forward node with empty filename if missing', async () => {
        const jsonData = JSON.stringify({ type: 'forward', resId: 'missing-fname' })
        const elem = { type: 'json', data: jsonData }
        const msgs = [{ message: [elem] }] as any

        vi.mocked(db.forwardMultiple.findFirst).mockResolvedValueOnce(null)
        vi.mocked(db.forwardMultiple.create).mockResolvedValueOnce({ id: 'uuid-empty' } as any)

        await processNestedForward(msgs, 3)

        expect(db.forwardMultiple.create).toHaveBeenCalledWith({
            data: {
                resId: 'missing-fname',
                fileName: '',
                fromPairId: 3
            }
        })
    })
})
