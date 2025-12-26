import { describe, expect, test, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PluginLoader, PluginType } from '../plugin-loader'
import type { PluginSpec } from '../interfaces'

// Mock logger
vi.mock('../../../shared/logger', () => ({
    getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}))

// Mock fs
vi.mock('node:fs', () => ({
    default: {
        statSync: vi.fn(),
    },
}))

describe('PluginLoader', () => {
    let loader: PluginLoader

    const mockPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        install: vi.fn(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
        loader = new PluginLoader()
    })

    describe('load', () => {
        test('should load plugin using spec.load function', async () => {
            const spec: PluginSpec = {
                id: 'test-plugin',
                module: './test-plugin',
                enabled: true,
                load: vi.fn(async () => ({ default: mockPlugin })),
            }

            const result = await loader.load(spec)

            expect(result.plugin).toEqual(mockPlugin)
            expect(result.type).toBe(PluginType.Native)
            expect(spec.load).toHaveBeenCalled()
        })

        test('should load plugin using importModule with absolute path', async () => {
            // This is tricky because we can't easily mock import() globally
            // But we can test the error path which covers more logic
            const spec: PluginSpec = {
                id: 'abs-plugin',
                module: '/absolute/path/to/plugin.js',
                enabled: true,
            }

            // Expect it to fail because the file doesn't exist, but it will go through importModule
            await expect(loader.load(spec)).rejects.toThrow('Failed to load plugin abs-plugin')
        })

        test('should try extensions in importModule on failure', async () => {
            const spec: PluginSpec = {
                id: 'ext-plugin',
                module: './missing-ext',
                enabled: true,
            }

            // This will trigger the retry logic for .js, .mjs, etc.
            await expect(loader.load(spec)).rejects.toThrow('Failed to load plugin ext-plugin')
        })

        test('should detect Unknown plugin type', async () => {
            const invalidPlugin = {
                // Missing required fields
                name: 'Invalid',
            }

            const spec: PluginSpec = {
                id: 'invalid-plugin',
                module: './invalid',
                enabled: true,
                load: vi.fn(async () => ({ default: invalidPlugin })),
            }

            await expect(loader.load(spec)).rejects.toThrow('Unknown plugin type')
        })

        test('should throw error for missing required fields', async () => {
            const incompletePlugin = {
                id: 'incomplete',
                name: 'Incomplete Plugin',
                // Missing version and install
            }

            const spec: PluginSpec = {
                id: 'incomplete-plugin',
                module: './incomplete',
                enabled: true,
                load: vi.fn(async () => ({ default: incompletePlugin })),
            }

            await expect(loader.load(spec)).rejects.toThrow('missing required field')
        })

        test('should validate plugin ID matches', async () => {
            const mismatchPlugin = {
                ...mockPlugin,
                id: 'different-id',
            }

            const spec: PluginSpec = {
                id: 'expected-id',
                module: './test',
                enabled: true,
                load: vi.fn(async () => ({ default: mismatchPlugin })),
            }

            // Should still load but log warning
            const result = await loader.load(spec)
            expect(result.plugin.id).toBe('different-id')
        })

        test('should validate semver format', async () => {
            const badVersionPlugin = {
                ...mockPlugin,
                version: 'not-semver',
            }

            const spec: PluginSpec = {
                id: 'test-plugin',
                module: './test',
                enabled: true,
                load: vi.fn(async () => ({ default: badVersionPlugin })),
            }

            // Should still load but log warning
            const result = await loader.load(spec)
            expect(result.plugin.version).toBe('not-semver')
        })

        test('should throw error for non-function install', async () => {
            const badInstallPlugin = {
                id: 'bad-install',
                name: 'Bad Install',
                version: '1.0.0',
                install: 'not-a-function',
            }

            const spec: PluginSpec = {
                id: 'bad-install',
                module: './test',
                enabled: true,
                load: vi.fn(async () => ({ default: badInstallPlugin })),
            }

            await expect(loader.load(spec)).rejects.toThrow('install must be a function')
        })

        test('should handle plugin without default export', async () => {
            const spec: PluginSpec = {
                id: 'no-default',
                module: './test',
                enabled: true,
                load: vi.fn(async () => mockPlugin), // No .default
            }

            const result = await loader.load(spec)
            expect(result.plugin).toEqual(mockPlugin)
        })

        test('should include module path in result', async () => {
            const spec: PluginSpec = {
                id: 'path-test',
                module: './test-plugin.js',
                enabled: true,
                load: vi.fn(async () => ({ default: mockPlugin })),
            }

            const result = await loader.load(spec)
            expect(result.modulePath).toBeTruthy()
        })

        test('should throw descriptive error on load failure', async () => {
            const spec: PluginSpec = {
                id: 'failing-plugin',
                module: './failing',
                enabled: true,
                load: vi.fn(async () => {
                    throw new Error('Load failed')
                }),
            }

            await expect(loader.load(spec)).rejects.toThrow('Failed to load plugin failing-plugin')
        })
    })

    describe('loadAll', () => {
        test('should load multiple enabled plugins', async () => {
            const specs: PluginSpec[] = [
                {
                    id: 'plugin1',
                    module: './plugin1',
                    enabled: true,
                    load: vi.fn(async () => ({ default: { ...mockPlugin, id: 'plugin1' } })),
                },
                {
                    id: 'plugin2',
                    module: './plugin2',
                    enabled: true,
                    load: vi.fn(async () => ({ default: { ...mockPlugin, id: 'plugin2' } })),
                },
            ]

            const results = await loader.loadAll(specs)

            expect(results).toHaveLength(2)
            expect(results[0].plugin.id).toBe('plugin1')
            expect(results[1].plugin.id).toBe('plugin2')
        })

        test('should skip disabled plugins', async () => {
            const specs: PluginSpec[] = [
                {
                    id: 'enabled-plugin',
                    module: './enabled',
                    enabled: true,
                    load: vi.fn(async () => ({ default: mockPlugin })),
                },
                {
                    id: 'disabled-plugin',
                    module: './disabled',
                    enabled: false,
                    load: vi.fn(async () => ({ default: mockPlugin })),
                },
            ]

            const results = await loader.loadAll(specs)

            expect(results).toHaveLength(1)
            expect(results[0].plugin.id).toBe('test-plugin')
            expect(specs[1].load).not.toHaveBeenCalled()
        })

        test('should continue loading after individual failures', async () => {
            const specs: PluginSpec[] = [
                {
                    id: 'failing-plugin',
                    module: './failing',
                    enabled: true,
                    load: vi.fn(async () => {
                        throw new Error('Failed')
                    }),
                },
                {
                    id: 'working-plugin',
                    module: './working',
                    enabled: true,
                    load: vi.fn(async () => ({ default: mockPlugin })),
                },
            ]

            const results = await loader.loadAll(specs)

            expect(results).toHaveLength(1)
            expect(results[0].plugin.id).toBe('test-plugin')
        })

        test('should handle empty plugin list', async () => {
            const results = await loader.loadAll([])
            expect(results).toEqual([])
        })

        test('should handle all disabled plugins', async () => {
            const specs: PluginSpec[] = [
                {
                    id: 'disabled1',
                    module: './disabled1',
                    enabled: false,
                },
                {
                    id: 'disabled2',
                    module: './disabled2',
                    enabled: false,
                },
            ]

            const results = await loader.loadAll(specs)
            expect(results).toEqual([])
        })
    })

    describe('resolveModulePath', () => {
        test('should return npm package names as-is', () => {
            const loader = new PluginLoader()
            // Access private method through type assertion
            const result = (loader as any).resolveModulePath('some-package')
            expect(result).toBe('some-package')
        })

        test('should resolve relative paths', () => {
            const loader = new PluginLoader()
            const result = (loader as any).resolveModulePath('./plugin.js')
            expect(path.isAbsolute(result)).toBe(true)
        })

        test('should preserve absolute paths', () => {
            const loader = new PluginLoader()
            const absolutePath = '/absolute/path/plugin.js'
            const result = (loader as any).resolveModulePath(absolutePath)
            expect(result).toBe(absolutePath)
        })
    })

    describe('detectPluginType', () => {
        test('should detect Native plugin type', () => {
            const loader = new PluginLoader()
            const module = { default: mockPlugin }
            const result = (loader as any).detectPluginType(module)
            expect(result).toBe(PluginType.Native)
        })

        test('should return Unknown for invalid plugins', () => {
            const loader = new PluginLoader()
            const module = { default: { name: 'Invalid' } }
            const result = (loader as any).detectPluginType(module)
            expect(result).toBe(PluginType.Unknown)
        })
    })

    describe('isNativePlugin', () => {
        test('should identify valid native plugins', () => {
            const loader = new PluginLoader()
            const result = (loader as any).isNativePlugin({ default: mockPlugin })
            expect(result).toBe(true)
        })

        test('should identify plugins without default export', () => {
            const loader = new PluginLoader()
            const result = (loader as any).isNativePlugin(mockPlugin)
            expect(result).toBe(true)
        })

        test('should reject non-object plugins', () => {
            const loader = new PluginLoader()
            const result = (loader as any).isNativePlugin({ default: 'not-an-object' })
            expect(result).toBe(false)
        })

        test('should reject plugins missing id', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).id
            const result = (loader as any).isNativePlugin({ default: plugin })
            expect(result).toBe(false)
        })

        test('should reject plugins missing name', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).name
            const result = (loader as any).isNativePlugin({ default: plugin })
            expect(result).toBe(false)
        })

        test('should allow plugins missing version for validation', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).version
            const result = (loader as any).isNativePlugin({ default: plugin })
            expect(result).toBe(true)
        })

        test('should allow plugins missing install for validation', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).install
            const result = (loader as any).isNativePlugin({ default: plugin })
            expect(result).toBe(true)
        })
    })

    describe('validatePlugin', () => {
        test('should pass for valid plugins', () => {
            const loader = new PluginLoader()
            expect(() => {
                (loader as any).validatePlugin(mockPlugin, 'test-plugin')
            }).not.toThrow()
        })

        test('should throw for missing id', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).id
            expect(() => {
                (loader as any).validatePlugin(plugin, 'test')
            }).toThrow('missing required field')
        })

        test('should throw for missing name', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).name
            expect(() => {
                (loader as any).validatePlugin(plugin, 'test-plugin')
            }).toThrow('missing required field')
        })

        test('should throw for missing version', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin }
            delete (plugin as any).version
            expect(() => {
                (loader as any).validatePlugin(plugin, 'test-plugin')
            }).toThrow('missing required field')
        })

        test('should throw for non-function install', () => {
            const loader = new PluginLoader()
            const plugin = { ...mockPlugin, install: 'not-a-function' }
            expect(() => {
                (loader as any).validatePlugin(plugin, 'test-plugin')
            }).toThrow('install must be a function')
        })
    })

    describe('buildFileImportUrl', () => {
        test('should build URL with cache-busting timestamp', () => {
            vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 123456789 } as any)

            const loader = new PluginLoader()
            const result = (loader as any).buildFileImportUrl('/test/plugin.js')

            expect(result).toContain('file://')
            expect(result).toContain('?v=123456789')
        })

        test('should handle stat errors gracefully', () => {
            vi.mocked(fs.statSync).mockImplementation(() => {
                throw new Error('File not found')
            })

            const loader = new PluginLoader()
            const result = (loader as any).buildFileImportUrl('/test/plugin.js')

            expect(result).toContain('file://')
            expect(result).not.toContain('?v=')
        })
    })

    describe('extractPlugin', () => {
        test('should extract from default export', () => {
            const loader = new PluginLoader()
            const module = { default: mockPlugin }
            const result = (loader as any).extractPlugin(
                module,
                { id: 'test' },
                PluginType.Native
            )
            expect(result).toEqual(mockPlugin)
        })

        test('should extract from direct export', () => {
            const loader = new PluginLoader()
            const result = (loader as any).extractPlugin(
                mockPlugin,
                { id: 'test' },
                PluginType.Native
            )
            expect(result).toEqual(mockPlugin)
        })

        test('should throw for unknown plugin type', () => {
            const loader = new PluginLoader()
            expect(() => {
                (loader as any).extractPlugin(
                    {},
                    { id: 'test' },
                    PluginType.Unknown
                )
            }).toThrow('Unknown plugin type')
        })
    })

    describe('Global Instance', () => {
        test('should export a global pluginLoader instance', async () => {
            const { pluginLoader } = await import('../plugin-loader')
            expect(pluginLoader).toBeInstanceOf(PluginLoader)
        })
    })
})
