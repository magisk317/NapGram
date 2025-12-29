import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('logger', () => {
  const mockStdoutWrite = vi.fn(() => true)

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    // Define the mock for node:process
    // We need to keep other process properties mostly intact or at least the ones used
    // But since we can't easily spread the real process in a factory (it's not pure),
    // we'll mock what's needed. logger.ts only uses process.env.TZ and process.stdout.write.
    // And imported env.ts uses process.env for other things.
    // Ideally we should proxy the real process.

    // BETTER APPROACH: Spy on the actual imported process object AFTER import?
    // No, because logger captures it at module level? No, it imports it.

    // Let's try mocking node:process with a proxy
    vi.doMock('node:process', () => {
      // We can't use 'process' global here easily if strict mode?
      // Actually we can just return the global process but with mocked stdout
      return {
        default: {
          ...process,
          stdout: {
            ...process.stdout,
            write: mockStdoutWrite,
          },
          env: { ...process.env, TZ: 'Asia/Shanghai' }, // Ensure TZ is consistent
        },
      }
    })

    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'info',
        LOG_FILE_LEVEL: 'debug',
        LOG_FILE: '/tmp/napgram/test-logs/app.log',
        TZ: 'Asia/Shanghai',
      },
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should normalize invalid log levels to info and log correctly', async () => {
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'invalid-level',
        LOG_FILE_LEVEL: 'debug',
        LOG_FILE: '/tmp/napgram/test-logs/app.log',
        TZ: 'Asia/Shanghai',
      },
    }))

    const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined)
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'createWriteStream').mockReturnValue({ write: vi.fn(), end: vi.fn() } as any)

    const { getLogger } = await import('../logger')
    const logger = getLogger('TestNormalize')
    logger.info('test message')

    expect(mockStdoutWrite).toHaveBeenCalled()
    expect(mkdirSyncSpy).toHaveBeenCalled()
  })

  it('should handle log rotation', async () => {
    vi.useFakeTimers()
    const mockStream = { write: vi.fn(), end: vi.fn() }
    vi.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream as any)
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    // Day 1
    const day1 = new Date('2023-01-01T12:00:00Z')
    vi.setSystemTime(day1)

    // We import logger AFTER setting time so initial date matches
    const loggerModule = await import('../logger')
    const logger = loggerModule.getLogger('RotationTest')
    logger.info('msg 1')

    // Day 2 (Simulate rotation)
    const day2 = new Date('2023-01-02T12:00:00Z')
    vi.setSystemTime(day2)

    // Log again, should trigger rotation
    logger.info('msg 2')

    expect(mockStream.end).toHaveBeenCalled()
    expect(fs.createWriteStream).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('should handle setConsoleLogLevel and thresholds', async () => {
    const { getLogger, setConsoleLogLevel } = await import('../logger')

    setConsoleLogLevel('error')
    const logger = getLogger('ThresholdTest')

    logger.info('should not show')
    expect(mockStdoutWrite).not.toHaveBeenCalled()

    logger.error('should show')
    expect(mockStdoutWrite).toHaveBeenCalledTimes(1)

    setConsoleLogLevel('debug')
    logger.debug('should show now')
    expect(mockStdoutWrite).toHaveBeenCalledTimes(2)
  })

  it('should respect file log threshold', async () => {
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'info',
        LOG_FILE_LEVEL: 'error',
        LOG_FILE: '/tmp/test.log',
      },
    }))

    const mockStream = { write: vi.fn(), end: vi.fn() }
    vi.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream as any)
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    const { getLogger } = await import('../logger')
    const logger = getLogger('FileThreshold')

    logger.info('skip file')
    expect(mockStream.write).not.toHaveBeenCalled()

    logger.error('write file')
    expect(mockStream.write).toHaveBeenCalled()
  })

  it('should cover all log levels', async () => {
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'trace',
        LOG_FILE_LEVEL: 'off',
        LOG_FILE: '/tmp/test.log',
      },
    }))
    vi.spyOn(fs, 'createWriteStream').mockReturnValue({ write: vi.fn(), end: vi.fn() } as any)

    const { getLogger } = await import('../logger')
    const logger = getLogger('AllLevels')

    logger.trace('trace')
    logger.debug('debug')
    logger.info('info')
    logger.warn('warn')
    logger.error('error')
    logger.fatal('fatal')

    expect(mockStdoutWrite).toHaveBeenCalledTimes(6)
  })

  it('should handle fallback match for colors', async () => {
    const { getLogger } = await import('../logger')
    const logger = getLogger('CheckColors')

    logger.info('test color')
    expect(mockStdoutWrite).toHaveBeenCalled()

    // Test prefix match
    const pluginLogger = getLogger('Instance-1')
    pluginLogger.info('plugin')
    expect(mockStdoutWrite).toHaveBeenCalledTimes(2)

    // Test direct match (covers line 170)
    const mainLogger = getLogger('Main')
    mainLogger.info('main')
    expect(mockStdoutWrite).toHaveBeenCalledTimes(3)
  })

  it('should handle non-string args and empty messages (lines 75, 226)', async () => {
    const { getLogger } = await import('../logger')
    const logger = getLogger('ArgTest')

    // Cover line 75: typeof arg === 'string' ? ... : inspect(...)
    logger.info({ foo: 'bar' }, 123, ['array'])
    expect(mockStdoutWrite).toHaveBeenCalled()

    // Cover line 226: message ? ... : prefix (empty message)
    // Note: formatArgs returns empty array if no args? No, it maps args.
    // If we pass no args to info(), args is []. formatArgs returns []. join is "".
    logger.info()
    expect(mockStdoutWrite).toHaveBeenCalled()
  })

  it('should handle undefined TZ (line 34)', async () => {
    vi.resetModules()
    vi.doMock('node:process', () => ({
      default: {
        ...process,
        stdout: { ...process.stdout, write: mockStdoutWrite },
        env: { ...process.env, TZ: undefined }, // Force undefined TZ
      },
    }))

    // Re-import to trigger top-level const tz initialization
    await import('../logger')
    // If no error thrown, it passed the fallback check
  })

  it('should handle undefined/empty LOG_LEVEL (line 23)', async () => {
    vi.resetModules()
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: '', // Empty string to trigger (level || '')
        LOG_FILE_LEVEL: undefined, // Undefined to trigger fallback
        LOG_FILE: '/tmp/test.log',
        TZ: 'Asia/Shanghai',
      },
    }))

    const { getLogger } = await import('../logger')
    const logger = getLogger('FallbackTest')
    logger.info('test')
    // Should default to 'info' and work
    expect(mockStdoutWrite).toHaveBeenCalled()
  })

  it('should handle file logging initialization errors (lines 63, 78-79)', async () => {
    vi.resetModules()
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'info',
        LOG_FILE_LEVEL: 'debug',
        LOG_FILE: '/readonly/path/app.log',
      },
    }))

    // Mock mkdirSync to throw error
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('Permission denied')
    })

    // This should trigger line 63: fileLoggingEnabled = false
    const { getLogger } = await import('../logger')
    const logger = getLogger('ErrorTest')
    logger.info('test')

    // Should still log to console despite file logging failure
    expect(mockStdoutWrite).toHaveBeenCalled()
  })

  it('should handle file stream creation errors (lines 78-79)', async () => {
    vi.resetModules()
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'info',
        LOG_FILE_LEVEL: 'debug',
        LOG_FILE: '/readonly/test.log',
      },
    }))

    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'createWriteStream').mockImplementation(() => {
      throw new Error('Cannot create stream')
    })

    // This should trigger lines 78-79: catch block setting fileLoggingEnabled = false
    const { getLogger } = await import('../logger')
    const logger = getLogger('StreamErrorTest')
    logger.info('test')

    expect(mockStdoutWrite).toHaveBeenCalled()
  })

  it('should handle rotation failure gracefully (lines 85, 95-96, 265)', async () => {
    vi.useFakeTimers()

    // Mock a successful initial stream
    const mockStream1 = { write: vi.fn(), end: vi.fn() }
    let createCallCount = 0

    vi.spyOn(fs, 'createWriteStream').mockImplementation((_path) => {
      createCallCount++
      if (createCallCount === 1) {
        return mockStream1 as any
      }
      throw new Error('Disk full')
    })

    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    const day1 = new Date('2023-01-01T10:00:00Z')
    vi.setSystemTime(day1)

    const { getLogger } = await import('../logger')
    const logger = getLogger('RotationTest')
    logger.info('message on day 1')
    expect(mockStream1.write).toHaveBeenCalled()

    mockStream1.write.mockClear()
    mockStdoutWrite.mockClear()

    const day2 = new Date('2023-01-02T10:00:00Z')
    vi.setSystemTime(day2)

    logger.info('message on day 2')

    expect(mockStream1.end).toHaveBeenCalled()
    expect(mockStdoutWrite).toHaveBeenCalled()
    expect(mockStream1.write).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
  it('should return early in rotateIfNeeded when logging disabled (line 85)', async () => {
    vi.resetModules()
    vi.doMock('../../domain/models/env', () => ({
      default: {
        LOG_LEVEL: 'info',
        LOG_FILE_LEVEL: 'off', // Disabled
        LOG_FILE: '/tmp/test.log',
      },
    }))

    const { rotateIfNeeded } = await import('../logger')
    // Reset any mocks to ensure we catch if it tries to do anything
    const createStreamSpy = vi.spyOn(fs, 'createWriteStream')

    rotateIfNeeded()

    expect(createStreamSpy).not.toHaveBeenCalled()
  })
})
