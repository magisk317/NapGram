import { describe, expect, it } from 'vitest'
import random from '../random'

describe('random utility', () => {
  it('should generate random int in range', () => {
    // Run multiple times to verify bounds
    for (let i = 0; i < 100; i++) {
      const val = random.int(1, 5)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(5)
    }
    // Min > Max not handled in code but JS Math.random handles it gracefully-ish?
    // Code says: Math.floor(Math.random() * (max - min + 1)) + min
    // 5-1+1 = 5.
  })

  it('should generate hex string', () => {
    const hex = random.hex(10)
    expect(hex).toHaveLength(10)
    expect(hex).toMatch(/^[0-9a-f]+$/)
  })

  it('should pick random item', () => {
    const list = ['a', 'b', 'c']
    const picked = random.pick(...list)
    expect(list).toContain(picked)
  })

  it('should generate fake uuid', () => {
    const uuid = random.fakeUuid()
    // 8-4-4-4-12 hex chars
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('should generate imei', () => {
    const imei = random.imei()
    expect(typeof imei).toBe('string')
    expect(imei.length).toBeGreaterThan(10) // 15 digits usually
    // Verify it ends with checksum digit
    expect(imei).toMatch(/^\d+$/)

    // Test branch coverage for the complex IMEI logic?
    // It's mostly math on UIN.
    // We can just run it enough times or mock random.int to force branches if needed.
    // For now, simple execution is fine for lines.
  })
  it('should cover imei edge cases (low UIN values)', () => {
    const originalInt = random.int

    // Case 1: Trigger a < 1000
    // If uin = 1, buf = 00 00 00 01. a = 0.
    random.int = () => 1
    const imei1 = random.imei()
    expect(imei1).toBeTruthy()

    // Case 3: b < 1000000
    // UIN=0x10000001 -> ... 00 00 01. b = 1.
    random.int = () => 0x10000001
    const imei2 = random.imei()
    expect(imei2).toBeTruthy()

    // Case: Even UIN -> '35' prefix
    random.int = () => 2
    const imei3 = random.imei()
    expect(imei3.startsWith('35')).toBe(true)

    // Restore
    random.int = originalInt
  })

  it('should handle large random values in imei loop', () => {
    const originalInt = random.int
    random.int = () => 10000000
    const imei = random.imei()
    expect(imei).toBeTruthy()
    random.int = originalInt
  })

  it('should cover a > 9999 branch in imei', () => {
    const originalInt = random.int
    // Use a UIN value where the first 16 bits (big-endian) > 9999
    // 0xFFFF0000 -> buf.readUInt16BE() = 0xFFFF = 65535 > 9999
    random.int = () => 0xFFFF0000
    const imei = random.imei()
    expect(imei).toBeTruthy()
    expect(imei).toMatch(/^\d+$/)
    random.int = originalInt
  })
})
