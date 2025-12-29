import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginLogger } from '../logger'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const getLoggerMock = vi.hoisted(() => vi.fn(() => loggerMocks))

vi.mock('../../../shared/logger', () => ({
  getLogger: getLoggerMock,
}))

describe('createPluginLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards log calls to the shared logger', () => {
    const logger = createPluginLogger('test-plugin')

    logger.debug('debug', 1)
    logger.info('info', { ok: true })
    logger.warn('warn')
    logger.error('error', new Error('fail'))

    expect(getLoggerMock).toHaveBeenCalledWith('Plugin')
    expect(loggerMocks.debug).toHaveBeenCalledWith('[test-plugin] debug', 1)
    expect(loggerMocks.info).toHaveBeenCalledWith('[test-plugin] info', { ok: true })
    expect(loggerMocks.warn).toHaveBeenCalledWith('[test-plugin] warn')
    expect(loggerMocks.error).toHaveBeenCalledWith('[test-plugin] error', expect.any(Error))
  })
})
