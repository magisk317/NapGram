import { describe, expect, test, vi, beforeEach } from 'vitest'
import { loadPluginSpecs } from '../../internal/config'

// Mock the fs module and path module properly
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises')
  return {
    ...actual,
    readFile: vi.fn(),
  }
})

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  const join = vi.fn((...args) => args.join('/'))
  return {
    ...actual,
    join,
    default: {
      ...actual,
      join,
    },
  }
})

vi.mock('../../../package.json', () => ({
  default: {
    napgram: {
      plugins: [
        { id: 'builtin:ping-pong', module: './src/plugins/builtin/ping-pong.ts' },
        { id: 'external:example', module: './node_modules/example-plugin/dist/index.js' }
      ]
    }
  }
}))

describe('Plugin Config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('loadPluginSpecs should load plugin specifications', async () => {
    const { readFile } = await import('node:fs/promises')
    const mockReadFile = vi.mocked(readFile)
    mockReadFile.mockResolvedValue(JSON.stringify([
      { id: 'test-plugin', module: './test-plugin', enabled: true }
    ]))

    const specs = await loadPluginSpecs()
    expect(specs).toBeDefined()
    expect(Array.isArray(specs)).toBe(true)
  })

  test('loadPluginSpecs should handle missing plugin file', async () => {
    // Instead of mocking readFile, we'll rely on the fact that if no config files exist
    // and no plugins directory exists, it will still return builtin plugins
    const specs = await loadPluginSpecs()
    expect(specs).toBeDefined()
    expect(Array.isArray(specs)).toBe(true)
    // At minimum, builtin plugins should be available
    expect(specs.length).toBeGreaterThan(0)
  })
})
