import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@napgram/infra-kit'
import processNestedForward from '../processNestedForward'

// Mock db
vi.mock('@napgram/infra-kit', () => ({
  db: {
    query: {
      forwardMultiple: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'uuid-new' }]),
      })),
    })),
  },
  schema: { forwardMultiple: { id: 'id', resId: 'resId' } },
  eq: vi.fn(),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  temp: {
    TEMP_PATH: '/tmp/napgram',
    file: vi.fn(),
    createTempFile: vi.fn(),
  },
  hashing: { md5Hex: vi.fn((s) => 'hashed-' + s) },
  sentry: { captureException: vi.fn() },
  ForwardMap: { load: vi.fn().mockResolvedValue({ map: true }) },
  qface: { 14: '/微笑' },
}))

describe('processNestedForward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should skip invalid messages', async () => {
    await processNestedForward([null as any], 1)
    expect(db.query.forwardMultiple.findFirst).not.toHaveBeenCalled()

    await processNestedForward([{ message: 'text' } as any], 1)
    expect(db.query.forwardMultiple.findFirst).not.toHaveBeenCalled()
  })

  it('should skip invalid elements', async () => {
    const msgs = [{
      message: [
        { type: 'text' }, // wrong type
        null,
        { type: 'json', data: 'invalid json' }, // json parse fail
      ],
    }] as any

    await processNestedForward(msgs, 1)
    expect(db.query.forwardMultiple.findFirst).not.toHaveBeenCalled()
  })

  it('should process forward nodes', async () => {
    const jsonData = JSON.stringify({ type: 'forward', resId: 'abc', fileName: 'foo' })
    const elem = { type: 'json', data: jsonData }
    const msgs = [{ message: [elem] }] as any

    // Mock existing
    const existing = { id: 'uuid-123' }
    vi.mocked(db.query.forwardMultiple.findFirst).mockResolvedValueOnce(existing as any)

    await processNestedForward(msgs, 1)

    expect(db.query.forwardMultiple.findFirst).toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()

    // element data modified?
    const parsed = JSON.parse(elem.data)
    expect(parsed).toEqual({ type: 'forward', uuid: 'uuid-123' })
  })

  it('should create new forward node if missing', async () => {
    const jsonData = JSON.stringify({ type: 'forward', resId: 'xyz', fileName: 'bar' })
    const elem = { type: 'json', data: jsonData }
    const msgs = [{ message: [elem] }] as any

    vi.mocked(db.query.forwardMultiple.findFirst).mockResolvedValueOnce(undefined)

    await processNestedForward(msgs, 2)

    expect(db.insert).toHaveBeenCalled()

    const parsed = JSON.parse(elem.data)
    expect(parsed).toEqual({ type: 'forward', uuid: 'uuid-new' })
  })

  it('should replace data when entity exists after lookup', async () => {
    const jsonData = JSON.stringify({ type: 'forward', resId: 'existing-1' })
    const elem = { type: 'json', data: jsonData }
    const msgs = [{ message: [elem] }] as any

    vi.mocked(db.query.forwardMultiple.findFirst).mockResolvedValueOnce({ id: 'uuid-exists' } as any)

    await processNestedForward(msgs, 4)

    const parsed = JSON.parse(elem.data)
    expect(parsed).toEqual({ type: 'forward', uuid: 'uuid-exists' })
  })

  it('should keep data unchanged when no entity is created', async () => {
    const jsonData = JSON.stringify({ type: 'forward', resId: 'missing-entity' })
    const elem = { type: 'json', data: jsonData }
    const msgs = [{ message: [elem] }] as any

    vi.mocked(db.query.forwardMultiple.findFirst).mockResolvedValueOnce(undefined)
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    } as any)

    await processNestedForward(msgs, 5)

    expect(elem.data).toBe(jsonData)
  })

  it('should skip if type is not forward or no resId', async () => {
    // type not forward
    let elem = { type: 'json', data: JSON.stringify({ type: 'other', resId: '1' }) }
    await processNestedForward([{ message: [elem] }] as any, 1)
    expect(db.query.forwardMultiple.findFirst).not.toHaveBeenCalled()

    // no resId
    elem = { type: 'json', data: JSON.stringify({ type: 'forward' }) }
    await processNestedForward([{ message: [elem] }] as any, 1)
    expect(db.query.forwardMultiple.findFirst).not.toHaveBeenCalled()
  })
  it('should create new forward node with empty filename if missing', async () => {
    const jsonData = JSON.stringify({ type: 'forward', resId: 'missing-fname' })
    const elem = { type: 'json', data: jsonData }
    const msgs = [{ message: [elem] }] as any

    vi.mocked(db.query.forwardMultiple.findFirst).mockResolvedValueOnce(undefined)

    await processNestedForward(msgs, 3)

    expect(db.insert).toHaveBeenCalled()
  })
})
