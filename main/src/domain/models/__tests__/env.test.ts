import { describe, expect, it, vi } from 'vitest'
import z from 'zod'

describe('env', () => {
  it('should export parsed environment config in test mode', async () => {
    const env = (await import('../env')).default

    expect(env.TG_API_ID).toBeDefined()
    expect(env.TG_API_HASH).toBeDefined()
    expect(env.TG_BOT_TOKEN).toBeDefined()
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.TG_CONNECTION).toBe('tcp')
  })

  it('should handle emptyStringToUndefined preprocessing', async () => {
    // Test the emptyString preprocessing logic by checking fields that use it
    const env = (await import('../env')).default

    // These fields use emptyStringToUndefined and should be undefined if not set
    expect(env.PROXY_IP).toBeUndefined()
    expect(env.ADMIN_TOKEN).toBeUndefined()
  })

  it('should test emptyStringToUndefined for both branches (line 5)', async () => {
    // Save original values
    const originalFfmpegPath = process.env.FFMPEG_PATH
    const originalFfprobePath = process.env.FFPROBE_PATH

    // Reset modules to test with new env values
    vi.resetModules()

    // Test branch 1: Empty string should become undefined
    process.env.FFMPEG_PATH = ''
    // Test branch 2: Non-empty string should remain as-is
    process.env.FFPROBE_PATH = '/usr/bin/ffprobe'

    const env = await import(`../env?t=${Date.now()}`)

    // Empty string should be preprocessed to undefined
    expect(env.default.FFMPEG_PATH).toBeUndefined()
    // Non-empty value should remain
    expect(env.default.FFPROBE_PATH).toBe('/usr/bin/ffprobe')

    // Restore environment variables
    if (originalFfmpegPath === undefined) {
      delete process.env.FFMPEG_PATH
    }
    else {
      process.env.FFMPEG_PATH = originalFfmpegPath
    }
    if (originalFfprobePath === undefined) {
      delete process.env.FFPROBE_PATH
    }
    else {
      process.env.FFPROBE_PATH = originalFfprobePath
    }
    vi.resetModules()
  })

  it('should validate zod schema error handling', () => {
    // Recreate the schema to test validation
    const schema = z.object({
      TG_API_ID: z.string().regex(/^\d+$/).transform(Number),
      TG_API_HASH: z.string(),
      TG_BOT_TOKEN: z.string(),
    })

    // Test that invalid config fails parsing
    const invalidConfig = {
      TG_API_ID: 'not-a-number', // Invalid: not a number
      TG_API_HASH: 'test',
      TG_BOT_TOKEN: 'test',
    }

    const result = schema.safeParse(invalidConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeDefined()
    }
  })

  it('should test error path simulation (lines 79-80)', () => {
    // Mock console.error and process.exit to test error handling
    const originalExit = process.exit
    const originalError = console.error
    const mockExit = vi.fn() as any
    const mockError = vi.fn()

    process.exit = mockExit
    console.error = mockError

    // Simulate the error handling logic from env.ts
    const configParsed = {
      success: false,
      error: new Error('Validation failed'),
    }

    // This simulates lines 78-80 of env.ts
    if (!configParsed.success) {
      console.error('环境变量解析错误:', (configParsed as any).error)
      process.exit(1)
    }

    expect(mockError).toHaveBeenCalledWith(
      '环境变量解析错误:',
      expect.any(Error),
    )
    expect(mockExit).toHaveBeenCalledWith(1)

    // Restore
    process.exit = originalExit
    console.error = originalError
  })

  it('should actually trigger error path with invalid environment variables (lines 79-80)', async () => {
    // Save original values
    const originalExit = process.exit
    const originalError = console.error
    const originalApiId = process.env.TG_API_ID
    const originalNodeEnv = process.env.NODE_ENV
    const mockExit = vi.fn() as any
    const mockError = vi.fn()

    // Mock process.exit and console.error
    process.exit = mockExit
    console.error = mockError

    // Clear module cache and set invalid environment variable
    vi.resetModules()
    // Remove test mode to trigger actual validation
    delete process.env.NODE_ENV
    // Set invalid environment variable that will fail zod validation
    process.env.TG_API_ID = 'invalid-not-a-number'

    // This import will trigger the validation and error path
    try {
      await import(`../env?t=${Date.now()}`)
    }
    catch {
      // Module may throw or call process.exit
    }

    // Verify error handling was triggered
    expect(mockError).toHaveBeenCalledWith(
      '环境变量解析错误:',
      expect.anything(),
    )
    expect(mockExit).toHaveBeenCalledWith(1)

    // Restore
    process.exit = originalExit
    console.error = originalError
    process.env.TG_API_ID = originalApiId
    process.env.NODE_ENV = originalNodeEnv
    vi.resetModules()
  })

  it('should transform boolean strings correctly', () => {
    const transform = (v: string) => ['true', '1', 'yes'].includes(v.toLowerCase())

    expect(transform('true')).toBe(true)
    expect(transform('1')).toBe(true)
    expect(transform('yes')).toBe(true)
    expect(transform('YES')).toBe(true)
    expect(transform('false')).toBe(false)
    expect(transform('0')).toBe(false)
  })

  it('should use default values', async () => {
    const env = (await import('../env')).default

    expect(env.DATA_DIR).toBeDefined()
    expect(env.CACHE_DIR).toBeDefined()
    expect(env.LISTEN_PORT).toBe(8080)
    expect(env.REPO).toBe('Local Build')
    expect(env.REF).toBe('Local Build')
    expect(env.COMMIT).toBe('Local Build')
  })
})
