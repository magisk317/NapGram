import { describe, expect, it } from 'vitest'
import { formatDate } from '../date'

describe('date utility', () => {
  it('should format numbers and dates', () => {
    const d = new Date('2023-01-02T03:04:00')
    // Default format: yyyy-MM-dd HH:mm
    expect(formatDate(d)).toBe('2023-01-02 03:04')
    expect(formatDate(d.getTime())).toBe('2023-01-02 03:04')
  })

  it('should use custom format', () => {
    const d = new Date('2023-11-22T13:45:00')
    expect(formatDate(d, 'yyyy/MM/dd')).toBe('2023/11/22')
    expect(formatDate(d, 'HH:mm')).toBe('13:45')
  })
})
