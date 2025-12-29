import * as Sentry from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sentry from '../sentry'

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setTag: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('../env', () => ({
  default: {
    ERROR_REPORTING: true,
    REPO: 'test/repo',
    REF: 'refs/heads/main',
    COMMIT: 'hash123',
    LOG_FILE: '/tmp/test.log',
  },
}))

describe('sentry Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset internal state if possible, or we rely on module reloading if needed.
    // Since 'initialized' is a module-level variable, we might strictly need to use vi.resetModules()
    // but let's see if we can test around it or if we need to mock the state.
    // For this simple recreation, I'll simulate fresh state by re-importing if feasible,
    // or just assume standard flow.
    // Actually, captureException calls initSentry if not initialized.
  })

  it('should initialize sentry with correct config', () => {
    sentry.init()
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      environment: 'napgram',
      release: 'hash123',
    }))
    expect(Sentry.setTag).toHaveBeenCalledWith('repo', 'test/repo')
  })

  it('should capture exception', () => {
    const error = new Error('test')
    sentry.captureException(error, { foo: 'bar' })
    expect(Sentry.captureException).toHaveBeenCalledWith(error, { extra: { foo: 'bar' } })
  })

  it('should capture message', () => {
    sentry.captureMessage('hello')
    expect(Sentry.captureMessage).toHaveBeenCalledWith('hello', { extra: undefined })
  })

  it('should flush', async () => {
    await sentry.flush()
    expect(Sentry.flush).toHaveBeenCalled()
  })
})
