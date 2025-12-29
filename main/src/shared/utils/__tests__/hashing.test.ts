import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { md5, md5B64, md5Hex, sha256B64, sha256Hex } from '../hashing'

describe('hashing utils', () => {
  it('computes md5 variants', () => {
    const input = 'hello'
    const digest = md5(input)

    expect(digest).toBeInstanceOf(Buffer)
    expect(digest.length).toBe(16)
    expect(md5Hex(input)).toBe('5d41402abc4b2a76b9719d911017c592')
    expect(md5B64(input)).toBe('XUFAKrxLKna5cZ2REBfFkg==')
  })

  it('computes sha256 variants', () => {
    const input = 'hello'

    expect(sha256Hex(input)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect(sha256B64(input)).toBe('LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=')
  })
})
