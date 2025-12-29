import { describe, expect, it, vi } from 'vitest'
import { createWebAPI, WebAPIImpl } from '../web'

const { warnMock, infoMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  infoMock: vi.fn(),
}))

vi.mock('../../../shared/logger', () => ({
  getLogger: () => ({
    warn: warnMock,
    info: infoMock,
  }),
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
