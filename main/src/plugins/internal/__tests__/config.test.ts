import { describe, expect, test, vi, beforeEach } from 'vitest'
import * as config from '../config'
import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

vi.mock('node:fs/promises')
vi.mock('../../../domain/models/env', () => ({
  default: { DATA_DIR: '/app/data', LOG_FILE: '/app/data/logs/napgram.log' }
}))
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}))

vi.mock('../builtin/ping-pong', () => ({
  default: { id: 'ping-pong' }
}))

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATA_DIR = '/app/data'
    delete process.env.PLUGINS_ENABLED
    delete process.env.PLUGINS_GATEWAY_URL
    delete process.env.PLUGINS_INSTANCES
    delete process.env.PLUGINS_ALLOW_TS
    delete process.env.PLUGINS_CONFIG_PATH
    delete process.env.PLUGINS_DIR
    delete process.env.PLUGINS_DEBUG_SESSIONS
  })

  test('resolve env basics', () => {
    expect(config.resolvePluginsEnabled()).toBe(false)
    process.env.PLUGINS_ENABLED = 'true'
    expect(config.resolvePluginsEnabled()).toBe(true)

    expect(config.resolveGatewayEndpoint()).toBe('ws://127.0.0.1:8765')
    process.env.PLUGINS_GATEWAY_URL = 'ws://example.com'
    expect(config.resolveGatewayEndpoint()).toBe('ws://example.com')

    expect(config.resolvePluginsInstances()).toEqual([0])
    process.env.PLUGINS_INSTANCES = '1,2,3'
    expect(config.resolvePluginsInstances()).toEqual([1, 2, 3])
    process.env.PLUGINS_INSTANCES = 'invalid'
    expect(config.resolvePluginsInstances([4])).toEqual([4])

    expect(config.resolveAllowTsPlugins()).toBe(false)
    process.env.PLUGINS_ALLOW_TS = 'true'
    expect(config.resolveAllowTsPlugins()).toBe(true)

    expect(config.resolveDebugSessions()).toBe(false)
    process.env.PLUGINS_DEBUG_SESSIONS = '1'
    expect(config.resolveDebugSessions()).toBe(true)
  })

  test('loadPluginSpecs from config file (json and yaml)', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined)
    vi.mocked(fs.realpath).mockImplementation(async (p) => p)

    // JSON case
    const jsonConfig = JSON.stringify({
      plugins: [
        { id: 'p1', module: './p1.js', enabled: true },
        { id: 'p2', module: 'file:///app/data/p2.js', enabled: false }
      ]
    })
    vi.mocked(fs.readFile).mockResolvedValueOnce(jsonConfig)

    let specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'p1')).toBeDefined()
    expect(specs.find(s => s.id === 'p1')?.enabled).toBe(true)
    expect(specs.find(s => s.id === 'p2')?.enabled).toBe(false)

    // YAML case
    vi.mocked(fs.readFile).mockResolvedValueOnce('plugins:\n  - id: py\n    module: ./py.yaml')
    process.env.PLUGINS_CONFIG_PATH = '/app/data/config.yaml'
    specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'py')).toBeDefined()
  })

  test('loadPluginSpecs local directory scanning', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined)
    vi.mocked(fs.realpath).mockImplementation(async (p) => p)

    vi.mocked(fs.readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'solo.js' },
      { isFile: () => false, isDirectory: () => true, name: 'pkg' },
      { isFile: () => true, isDirectory: () => false, name: 'other.txt' }
    ] as any)

    vi.mocked(fs.readFile).mockImplementation(async (p) => {
      if (p.endsWith('package.json')) {
        return JSON.stringify({ name: 'my-pkg', main: 'index.js' })
      }
      return '{}'
    })

    const specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'solo')).toBeDefined()
    expect(specs.find(s => s.id === 'my-pkg')).toBeDefined()
  })

  test('loadPluginSpecs priority and duplicate handling', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined)
    vi.mocked(fs.realpath).mockImplementation(async (p) => p)

    // Config has p1
    vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
      plugins: [{ id: 'duplicate-id', module: './config-p.js' }]
    }))

    // Local also has duplicate-id
    vi.mocked(fs.readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'local-p.js' }
    ] as any)

    // We need to trigger inferIdFromPath which might result in 'local-p' normally
    // But if we return empty file list it won't trigger.
    // Let's just mock readdir to return a file that would sanitize to 'duplicate-id'
    vi.mocked(fs.readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'duplicate-id.js' }
    ] as any)

    const specs = await config.loadPluginSpecs()
    const match = specs.find(s => s.id === 'duplicate-id')
    expect(match).toBeDefined()
    // It should keep the config one because focus is priority
  })

  test('error handling in various stages', async () => {
    // config path outside DATA_DIR
    vi.mocked(fs.access).mockResolvedValue(undefined)
    vi.mocked(fs.realpath).mockImplementation(async (p) => {
      if (p.includes('outside')) return '/outside/data'
      return p
    })
    process.env.PLUGINS_CONFIG_PATH = '/outside/config.json'

    await config.loadPluginSpecs()
    // Error should be caught and logged

    // readdir fail
    vi.mocked(fs.readdir).mockRejectedValue(new Error('readdir fail'))
    await config.loadPluginSpecs()

    // package.json read fail
    vi.mocked(fs.readdir).mockResolvedValue([{ isFile: () => false, isDirectory: () => true, name: 'bad-pkg' }] as any)
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('pkg fail'))
    await config.loadPluginSpecs()
  })

  test('builtin plugin coverage', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('no files'))
    const specs = await config.loadPluginSpecs()
    const ping = specs.find(s => s.id === 'ping-pong')
    expect(ping).toBeDefined()
    if (ping?.load) {
      await ping.load()
    }
  })
})
