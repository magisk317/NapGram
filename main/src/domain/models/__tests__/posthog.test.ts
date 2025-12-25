import { beforeEach, describe, expect, it, vi } from 'vitest'
import posthog from '../posthog'

const envMock = vi.hoisted(() => ({
  POSTHOG_OPTOUT: false,
  REPO: 'repo',
  REF: 'ref',
  COMMIT: 'commit',
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
}))

const fetchMock = vi.fn()

vi.mock('../env', () => ({
  default: envMock,
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('node:os', () => ({
  default: {
    hostname: () => 'test-host',
  },
}))

describe('posthog', () => {
  beforeEach(() => {
    envMock.POSTHOG_OPTOUT = false
    envMock.REPO = 'repo'
    envMock.REF = 'ref'
    envMock.COMMIT = 'commit'
    fetchMock.mockReset()
    loggerMocks.debug.mockReset()
    globalThis.fetch = fetchMock as typeof fetch
  })

  it('skips capture when opted out', () => {
    envMock.POSTHOG_OPTOUT = true

    posthog.capture('event', { foo: 'bar' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends telemetry and normalizes error payload', () => {
    const error = new Error('boom')
    const properties: Record<string, any> = { error, foo: 'bar' }
    fetchMock.mockResolvedValue({})

    posthog.capture('test-event', properties)

    expect(properties.error).toBe(error.stack)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [, options] = fetchMock.mock.calls[0]
    const body = JSON.parse(options.body as string)

    expect(body.event).toBe('test-event')
    expect(body.properties).toMatchObject({
      foo: 'bar',
      repo: 'repo',
      ref: 'ref',
      commit: 'commit',
      distinct_id: 'test-host',
      $lib: 'napgram-lite',
    })
    expect(body.api_key).toBeTruthy()
    expect(body.timestamp).toBeTruthy()
  })

  it('logs when telemetry fails', async () => {
    fetchMock.mockRejectedValue(new Error('fail'))

    posthog.capture('event', {})

    await new Promise(resolve => setImmediate(resolve))

    expect(loggerMocks.debug).toHaveBeenCalledWith('Failed to send telemetry', expect.any(Error))
  })
})
