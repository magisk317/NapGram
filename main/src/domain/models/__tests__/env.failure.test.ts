import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env failure', () => {
  beforeEach(() => {
    vi.resetModules()
    const originalEnv = process.env
    process.env = { ...originalEnv }
    // Ensure we are NOT in test mode to avoid automatic filling of dummy values
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should exit process validation fails', async () => {
    // Set invalid values
    process.env.TG_API_ID = 'invalid-number'

    // Mock process.exit
    const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {
      // Throw to interrupt execution flow
      throw new Error('PROCESS_EXIT')
    }) as any)

    // Mock console.error to suppress output
    vi.spyOn(console, 'error').mockImplementation(() => { })

    // Import env - this should trigger the validation logic
    try {
      await import('../env')
    }
    catch (e: any) {
      expect(e.message).toBe('PROCESS_EXIT')
    }

    expect(exitMock).toHaveBeenCalledWith(1)
  })
})
