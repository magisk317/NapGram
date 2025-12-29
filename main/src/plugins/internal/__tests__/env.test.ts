import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readBoolEnv, readStringEnv } from '../env'

const ENV_KEYS = [
  'TEST_BOOL_ENV_1',
  'TEST_BOOL_ENV_2',
  'TEST_BOOL_ENV_3',
  'TEST_STRING_ENV_1',
  'TEST_STRING_ENV_2',
]

const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined)
      delete process.env[key]
    else
      process.env[key] = originalEnv[key]
  }
})

describe('readBoolEnv', () => {
  it('returns true for matching values and skips blanks', () => {
    process.env.TEST_BOOL_ENV_1 = '  '
    process.env.TEST_BOOL_ENV_2 = 'Yes'

    expect(readBoolEnv(['TEST_BOOL_ENV_1', 'TEST_BOOL_ENV_2'])).toBe(true)
  })

  it('returns false for non-matching values and stops at first key', () => {
    process.env.TEST_BOOL_ENV_1 = 'maybe'
    process.env.TEST_BOOL_ENV_2 = 'true'

    expect(readBoolEnv(['TEST_BOOL_ENV_1', 'TEST_BOOL_ENV_2'])).toBe(false)
  })

  it('returns false when no keys are set', () => {
    expect(readBoolEnv(['TEST_BOOL_ENV_1', 'TEST_BOOL_ENV_2'])).toBe(false)
  })
})

describe('readStringEnv', () => {
  it('returns the first non-empty value', () => {
    process.env.TEST_STRING_ENV_1 = ''
    process.env.TEST_STRING_ENV_2 = '  hello  '

    expect(readStringEnv(['TEST_STRING_ENV_1', 'TEST_STRING_ENV_2'])).toBe('hello')
  })

  it('returns empty string when no keys are set', () => {
    expect(readStringEnv(['TEST_STRING_ENV_1', 'TEST_STRING_ENV_2'])).toBe('')
  })
})
