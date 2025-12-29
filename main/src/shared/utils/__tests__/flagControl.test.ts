import { describe, expect, it, vi } from 'vitest'
import { editFlags } from '../flagControl'

// Correct path from __tests__ to src/domain/constants/flags
// src/shared/utils/__tests__ -> ../../../domain/constants/flags
vi.mock('../../../domain/constants/flags', () => ({
  default: {
    TEST_FLAG: 1,
    ANOTHER_FLAG: 2,
    THIRD_FLAG: 4,
  },
}))

describe('flagControl', () => {
  it('should display flags when no params', async () => {
    const target = { flags: 3 } as any // 1 | 2
    const res = await editFlags([], target)
    expect(res).toContain('0b11')
    expect(res).toContain('TEST_FLAG')
    expect(res).toContain('ANOTHER_FLAG')
  })

  it('should error on invalid param count', async () => {
    expect(await editFlags(['add'], {} as any)).toBe('参数格式错误')
  })

  it('should error on invalid flag format', async () => {
    expect(await editFlags(['add', 'INVALID'], {} as any)).toBe('flag 格式错误')
  })

  it('should add/set flag', async () => {
    const target = { flags: 1 } as any

    // by name (case insensitive in function? yes, toUpperCase used)
    await editFlags(['add', 'another_flag'], target)
    // 1 | 2 = 3
    expect(target.flags).toBe(3)

    // by value
    await editFlags(['set', '4'], target)
    // 3 | 4 = 7
    expect(target.flags).toBe(7)
  })

  it('should remove flag', async () => {
    const target = { flags: 3 } as any // 1 | 2

    await editFlags(['rm', 'TEST_FLAG'], target)
    // 3 & ~1 -> ( ...11 ) & ( ...11110 ) -> ...10 -> 2
    expect(target.flags).toBe(2)

    await editFlags(['delete', '2'], target)
    // 2 & ~2 -> 0
    expect(target.flags).toBe(0)
  })

  it('should put flag (overwrite)', async () => {
    const target = { flags: 100 } as any
    await editFlags(['put', '3'], target)
    expect(target.flags).toBe(3)
    // Check output string
    const res = await editFlags(['put', 'TEST_FLAG'], target)
    expect(target.flags).toBe(1)
    expect(res).toContain('0b1')
  })
})
