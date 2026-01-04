import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginStorage } from '../storage'

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
}))

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}))

const getLoggerMock = vi.hoisted(() => vi.fn(() => loggerMocks))

vi.mock('node:fs/promises', () => ({
  default: fsMocks,
  mkdir: fsMocks.mkdir,
  readFile: fsMocks.readFile,
  writeFile: fsMocks.writeFile,
  unlink: fsMocks.unlink,
  readdir: fsMocks.readdir,
}))

vi.mock('@napgram/infra-kit', () => ({
  getLogger: getLoggerMock,
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  hashing: { md5Hex: vi.fn((value: string) => value) },
}))

describe('plugin storage', () => {
  const originalDataDir = process.env.DATA_DIR

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATA_DIR = '/data'
  })

  afterEach(() => {
    if (originalDataDir === undefined)
      delete process.env.DATA_DIR
    else
      process.env.DATA_DIR = originalDataDir
  })

  it('sets and gets data with sanitized paths', async () => {
    const storage = createPluginStorage('plugin#1')
    fsMocks.mkdir.mockResolvedValueOnce(undefined)
    fsMocks.writeFile.mockResolvedValueOnce(undefined)

    await storage.set('key@1', { ok: true })

    expect(fsMocks.mkdir).toHaveBeenCalledWith('/data/plugins-data/plugin-1', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/data/plugins-data/plugin-1/key-1.json',
      JSON.stringify({ ok: true }, null, 2),
      'utf8',
    )

    fsMocks.readFile.mockResolvedValueOnce('{"ok":true}')
    const value = await storage.get('key@1')

    expect(value).toEqual({ ok: true })
    expect(fsMocks.readFile).toHaveBeenCalledWith('/data/plugins-data/plugin-1/key-1.json', 'utf8')
  })

  it('returns null for missing keys', async () => {
    const storage = createPluginStorage('plugin#1')
    fsMocks.readFile.mockRejectedValueOnce({ code: 'ENOENT' })

    await expect(storage.get('missing')).resolves.toBeNull()
  })

  it('logs and throws when create directory fails', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('mkdir fail')
    fsMocks.mkdir.mockRejectedValueOnce(error)

    await expect(storage.set('bad', { ok: true })).rejects.toThrow('mkdir fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('logs and throws on read errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('fail')
    fsMocks.readFile.mockRejectedValueOnce(error)

    await expect(storage.get('bad')).rejects.toThrow('fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('logs and throws on write errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('write fail')
    fsMocks.mkdir.mockResolvedValueOnce(undefined)
    fsMocks.writeFile.mockRejectedValueOnce(error)

    await expect(storage.set('bad', { ok: true })).rejects.toThrow('write fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('lists keys and deletes files', async () => {
    const storage = createPluginStorage('plugin#1')
    fsMocks.mkdir.mockResolvedValueOnce(undefined)
    fsMocks.readdir.mockResolvedValueOnce(['a.json', 'b.txt', 'c.json'])

    await expect(storage.keys()).resolves.toEqual(['a', 'c'])

    fsMocks.unlink.mockResolvedValueOnce(undefined)
    await storage.delete('a')
    expect(fsMocks.unlink).toHaveBeenCalledWith('/data/plugins-data/plugin-1/a.json')
  })

  it('logs and throws on delete errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('unlink fail')
    fsMocks.unlink.mockRejectedValueOnce(error)

    await expect(storage.delete('bad')).rejects.toThrow('unlink fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('ignores delete when file is missing', async () => {
    const storage = createPluginStorage('plugin#1')
    fsMocks.unlink.mockRejectedValueOnce({ code: 'ENOENT' })

    await expect(storage.delete('missing')).resolves.toBeUndefined()
  })

  it('logs and throws on keys errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('readdir fail')
    fsMocks.mkdir.mockResolvedValueOnce(undefined)
    fsMocks.readdir.mockRejectedValueOnce(error)

    await expect(storage.keys()).rejects.toThrow('readdir fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })

  it('clears all keys', async () => {
    const storage = createPluginStorage('plugin#1')
    fsMocks.mkdir.mockResolvedValueOnce(undefined)
    fsMocks.readdir.mockResolvedValueOnce(['a.json', 'c.json'])
    fsMocks.unlink.mockResolvedValue(undefined)

    await storage.clear()

    expect(fsMocks.unlink).toHaveBeenCalledTimes(2)
  })

  it('logs and throws on clear errors', async () => {
    const storage = createPluginStorage('plugin#1')
    const error = new Error('unlink fail')
    fsMocks.mkdir.mockResolvedValueOnce(undefined)
    fsMocks.readdir.mockResolvedValueOnce(['a.json'])
    fsMocks.unlink.mockRejectedValueOnce(error)

    await expect(storage.clear()).rejects.toThrow('unlink fail')
    expect(loggerMocks.error).toHaveBeenCalled()
  })
})
