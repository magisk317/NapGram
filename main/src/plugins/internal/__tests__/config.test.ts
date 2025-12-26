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

vi.mock('../../../../packages/plugin-ping-pong/src/index', () => ({
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

    vi.mocked(fs.access).mockResolvedValue(undefined)
    vi.mocked(fs.realpath).mockImplementation(async (p) => p)
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

  test('loadPluginSpecs from config file variations', async () => {
    const jsonConfig = JSON.stringify({
      plugins: [
        { id: 'ts-p', module: './p.ts' },
        { id: 'invalid-p', module: '' }
      ]
    })
    vi.mocked(fs.readFile).mockResolvedValueOnce(jsonConfig)
    vi.mocked(fs.readdir).mockResolvedValue([])

    let specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'ts-p')).toBeUndefined()

    process.env.PLUGINS_ALLOW_TS = 'true'
    vi.mocked(fs.readFile).mockResolvedValueOnce(jsonConfig)
    specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'ts-p')).toBeDefined()
  })

  test('loadPluginSpecs local directory scanning with fallbacks', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => false, isDirectory: () => true, name: 'mjs-plugin' }
    ] as any)

    vi.mocked(fs.access).mockImplementation(async (p) => {
      if (p.includes('package.json')) return undefined
      if (p.includes('index.mjs')) return undefined
      if (p === '/app/data/plugins/local' || p === '/app/data/plugins' || p === '/app/data') return undefined
      throw new Error('no file: ' + p)
    })
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (p.includes('package.json')) return JSON.stringify({ name: 'mjs-plugin' })
      return ''
    })

    let specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'mjs-plugin')).toBeDefined()

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => false, isDirectory: () => true, name: 'js-plugin' }
    ] as any)
    vi.mocked(fs.access).mockImplementation(async (p) => {
      if (p.includes('package.json')) return undefined
      if (p.includes('index.mjs')) throw new Error('no mjs')
      if (p.includes('index.js')) return undefined
      if (p === '/app/data/plugins/local' || p === '/app/data/plugins' || p === '/app/data') return undefined
      throw new Error('no file: ' + p)
    })
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (p.includes('package.json')) return JSON.stringify({ name: '@scope/js-plugin' })
      return ''
    })
    specs = await config.loadPluginSpecs()
    expect(specs.find(s => s.id === 'js-plugin')).toBeDefined()
  })

  test('loadPluginSpecs priority and overrides', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (p.includes('config.json')) return JSON.stringify({
        plugins: [{ id: 'dup', module: '/app/data/config-dup.js' }]
      })
      return JSON.stringify({ name: 'dup' })
    })
    process.env.PLUGINS_CONFIG_PATH = '/app/data/config.json'

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => true, isDirectory: () => false, name: 'dup.js' }
    ] as any)

    const specs = await config.loadPluginSpecs()
    const match = specs.find(s => s.id === 'dup')
    expect(match).toBeDefined()
    expect(match?.module).toBe('/app/data/config-dup.js')
  })

  test('builtin plugin override', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
      plugins: [{ id: 'ping-pong', module: '/app/data/my-ping.js' }]
    }))
    vi.mocked(fs.readdir).mockResolvedValue([])

    const specs = await config.loadPluginSpecs()
    const ping = specs.find(s => s.id === 'ping-pong')
    expect(ping?.module).toBe('/app/data/my-ping.js')
  })

  test('error handling and edge cases', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('readdir failed'))
    await config.loadPluginSpecs()

    vi.mocked(fs.realpath).mockImplementation(async (p) => {
      if (p.includes('evil')) return '/etc/passwd'
      return p
    })
    process.env.PLUGINS_CONFIG_PATH = '/app/data/evil.json'
    await config.loadPluginSpecs()

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => true, isDirectory: () => false, name: 'fail.js' }
    ] as any)
    vi.mocked(fs.access).mockImplementation(async (p) => {
      if (p.includes('fail.js')) throw new Error('access fail')
      return undefined
    })
    await config.loadPluginSpecs()
  })

  test('loadPluginSpecs package.json parse error', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => false, isDirectory: () => true, name: 'bad-pkg' }
    ] as any)
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (p.includes('package.json')) return 'invalid json'
      return ''
    })
    await config.loadPluginSpecs()
  })

  test('loadPluginSpecs directory skip scenarios', async () => {
    // No entry file (line 308-309)
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => false, isDirectory: () => true, name: 'no-entry-dir' }
    ] as any)
    vi.mocked(fs.access).mockImplementation(async (p) => {
      if (p.includes('package.json')) return undefined
      throw new Error('no entry')
    })
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'no-entry' }))
    await config.loadPluginSpecs()

    // Entry file does not exist (line 337)
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => false, isDirectory: () => true, name: 'missing-entry-dir' }
    ] as any)
    vi.mocked(fs.access).mockImplementation(async (p) => {
      if (p.includes('package.json')) return undefined
      if (p.includes('main.js')) throw new Error('not found')
      return undefined
    })
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'missing-entry', main: 'main.js' }))
    await config.loadPluginSpecs()

    // No package.json found (line 345)
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { isFile: () => false, isDirectory: () => true, name: 'no-pkg-dir' }
    ] as any)
    vi.mocked(fs.access).mockImplementation(async (p) => {
      if (p.includes('package.json')) throw new Error('no pkg')
      return undefined
    })
    await config.loadPluginSpecs()
  })
})
