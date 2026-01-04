import { describe, expect, it, vi } from 'vitest'
import { createWebAPI, WebAPIImpl } from '../web'

const { warnMock, infoMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  infoMock: vi.fn(),
}))

vi.mock('@napgram/infra-kit', () => ({
  getLogger: () => ({
    warn: warnMock,
    info: infoMock,
  }),
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  hashing: { md5Hex: vi.fn((value: string) => value) },
}))

describe('webAPI', () => {
  it('should register routes when configured', () => {
    const registrar = vi.fn()
    const api = createWebAPI(registrar)
    const registerFn = vi.fn()

    api.registerRoutes(registerFn, 'test-plugin')
    expect(registrar).toHaveBeenCalledWith(registerFn, 'test-plugin')
  })

  it('should log warning when not configured', () => {
    const api = new WebAPIImpl(undefined)
    const registerFn = vi.fn()

    api.registerRoutes(registerFn)
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('not configured'))
    expect(registerFn).not.toHaveBeenCalled()
  })
})
