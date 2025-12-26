import type { PluginSpec } from '../core/interfaces'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import YAML from 'yaml'
import env from '../../domain/models/env'
import { getLogger } from '../../shared/logger'
import builtinPingPong from '../../../../packages/plugin-ping-pong/src/index'
import { readBoolEnv, readStringEnv } from './env'
import { getManagedPluginsConfigPath } from './store'

const logger = getLogger('PluginHost')

export function resolvePluginsEnabled(): boolean {
  return readBoolEnv(['PLUGINS_ENABLED'])
}

export function resolveGatewayEndpoint(): string {
  return readStringEnv(['PLUGINS_GATEWAY_URL']) || 'ws://127.0.0.1:8765'
}

export function resolvePluginsInstances(defaultInstances?: number[]): number[] {
  const raw = readStringEnv(['PLUGINS_INSTANCES'])
  if (!raw)
    return Array.isArray(defaultInstances) && defaultInstances.length ? defaultInstances : [0]
  const instances = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n))
  return instances.length ? instances : (defaultInstances?.length ? defaultInstances : [0])
}

export function resolveAllowTsPlugins(): boolean {
  return readBoolEnv(['PLUGINS_ALLOW_TS'])
}

export function resolveDebugSessions(): boolean {
  return readBoolEnv(['PLUGINS_DEBUG_SESSIONS'])
}

function resolveDataDir(): string {
  const dataDir = String(env.DATA_DIR || process.env.DATA_DIR || '/app/data')
  return path.resolve(dataDir)
}

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  }
  catch {
    return p
  }
}

async function resolvePathUnderDataDir(inputPath: string): Promise<string> {
  const abs = path.resolve(inputPath)
  const real = await realpathSafe(abs)
  const dataDir = resolveDataDir()
  const dataReal = await realpathSafe(dataDir)

  if (real === dataReal)
    return real
  if (!real.startsWith(dataReal + path.sep)) {
    throw new Error(`Path is outside DATA_DIR: ${inputPath}`)
  }
  return real
}

async function loadConfigFile(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, 'utf8')
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.yaml' || ext === '.yml')
    return YAML.parse(raw)
  return JSON.parse(raw)
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  }
  catch {
    return false
  }
}

function resolveModuleSpecifier(spec: string, baseDir: string): string {
  if (!spec)
    return spec
  if (spec.startsWith('file://'))
    return spec
  if (spec.startsWith('.') || spec.startsWith('/'))
    return path.resolve(baseDir, spec)
  return ''
}

function isTsFile(specifier: string): boolean {
  const s = specifier.startsWith('file://') ? specifier.slice('file://'.length) : specifier
  return /\.ts$/i.test(s)
}

function fileUrlToPathSafe(specifier: string): string {
  try {
    return fileURLToPath(specifier)
  }
  catch {
    return specifier
  }
}

function inferIdFromPath(modulePath: string): string {
  const clean = modulePath.startsWith('file://') ? fileUrlToPathSafe(modulePath) : modulePath
  const ext = path.extname(clean)
  const base = path.basename(clean, ext)
  if (base.toLowerCase() === 'index') {
    return path.basename(path.dirname(clean)) || 'plugin'
  }
  return base || 'plugin'
}

function sanitizeId(input: string): string {
  return String(input || '')
    .trim()
    .replace(/[^\w-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64) || 'plugin'
}

async function loadModule(specifier: string): Promise<any> {
  if (isTsFile(specifier) && !resolveAllowTsPlugins()) {
    throw new Error(`Refusing to load TypeScript plugin without PLUGINS_ALLOW_TS=1: ${specifier}`)
  }
  if (specifier.startsWith('file://')) {
    const mod = await import(specifier)
    return mod?.default ?? mod
  }
  if (specifier.startsWith('/') || specifier.startsWith('.')) {
    const url = pathToFileURL(specifier).href
    const mod = await import(url)
    return mod?.default ?? mod
  }
  throw new Error(`Refusing to load package module: ${specifier}`)
}

export async function loadPluginSpecs(): Promise<PluginSpec[]> {
  type SpecOrigin = 'config' | 'local' | 'builtin'
  const priorityByOrigin: Record<SpecOrigin, number> = {
    config: 3,
    local: 2,
    builtin: 1,
  }
  const specsById = new Map<string, { spec: PluginSpec, origin: SpecOrigin, priority: number, order: number }>()
  let order = 0
  const allowTs = resolveAllowTsPlugins()
  const dataDir = resolveDataDir()
  const hasSpec = (predicate: (spec: PluginSpec) => boolean): boolean => {
    for (const entry of specsById.values()) {
      if (predicate(entry.spec))
        return true
    }
    return false
  }
  const addSpec = (spec: PluginSpec, origin: SpecOrigin) => {
    const priority = priorityByOrigin[origin]
    const existing = specsById.get(spec.id)
    if (!existing) {
      specsById.set(spec.id, { spec, origin, priority, order: order++ })
      return
    }
    if (priority > existing.priority) {
      logger.info({
        id: spec.id,
        module: spec.module,
        origin,
        previous: existing.origin,
        previousModule: existing.spec.module,
      }, 'Plugin spec overridden by higher priority source')
      specsById.set(spec.id, { spec, origin, priority, order: order++ })
      return
    }
    if (origin === 'builtin') {
      logger.info({ id: spec.id }, 'Builtin plugin skipped (overridden by user plugin)')
      return
    }
    logger.warn({
      id: spec.id,
      module: spec.module,
      origin,
      previous: existing.origin,
      previousModule: existing.spec.module,
    }, 'Duplicate plugin id skipped')
  }

  const managedConfigPath = await getManagedPluginsConfigPath()
  const configPath = readStringEnv(['PLUGINS_CONFIG_PATH']) || managedConfigPath
  if (configPath && await exists(configPath)) {
    try {
      const abs = await resolvePathUnderDataDir(configPath)
      const baseDir = path.dirname(abs)
      const config = await loadConfigFile(abs)
      const plugins = Array.isArray(config?.plugins) ? config.plugins : []

      for (const p of plugins) {
        const rawId = typeof p?.id === 'string' ? p.id : ''
        const moduleRaw = typeof p?.module === 'string' ? p.module : ''
        const module = resolveModuleSpecifier(moduleRaw, baseDir)
        if (!module) {
          logger.warn({ module: moduleRaw }, 'Skip non-file plugin (only DATA_DIR file paths are allowed)')
          continue
        }
        if (isTsFile(module) && !allowTs) {
          logger.warn({ module }, 'Skip .ts plugin (set PLUGINS_ALLOW_TS=1 to enable)')
          continue
        }
        const resolved = module.startsWith('file://')
          ? await resolvePathUnderDataDir(fileUrlToPathSafe(module))
          : await resolvePathUnderDataDir(module)
        const enabled = p?.enabled !== false
        const id = sanitizeId(rawId || inferIdFromPath(resolved))
        addSpec({
          id,
          module: resolved,
          enabled,
          config: p?.config,
          source: p?.source,
          load: () => loadModule(resolved),
        }, 'config')
      }
    }
    catch (error: any) {
      logger.error({ configPath, dataDir, error }, 'Failed to load PLUGINS_CONFIG_PATH')
    }
  }

  const defaultDir = path.join(dataDir, 'plugins', 'local')
  const pluginsDir = readStringEnv(['PLUGINS_DIR']) || defaultDir
  if (pluginsDir && await exists(pluginsDir)) {
    try {
      const absDir = await resolvePathUnderDataDir(pluginsDir)
      logger.debug({ absDir }, 'Scanning local plugins directory')
      const entries = await fs.readdir(absDir, { withFileTypes: true })

      // 加载文件（单文件插件）
      const files = entries
        .filter(e => e.isFile())
        .map(e => e.name)
        .filter(name => !name.startsWith('.'))
        .filter(name => /\.(?:mjs|cjs|js)$/i.test(name) || (allowTs && /\.ts$/i.test(name)))
        .sort((a, b) => a.localeCompare(b))

      for (const filename of files) {
        try {
          const modulePath = path.join(absDir, filename)
          const id = sanitizeId(inferIdFromPath(modulePath))

          // 如果该插件已在配置文件中定义（无论启用与否），则跳过自动发现
          // 检查 ID 或 模块路径是否匹配
          if (specsById.has(id) || hasSpec(s => s.module === modulePath)) {
            logger.debug({ id }, 'Plugin already configured via config file, skipping auto-discovery')
            continue
          }

          logger.debug({ id, modulePath }, 'Found local file plugin')
          addSpec({
            id,
            module: modulePath,
            enabled: true,
            load: () => loadModule(modulePath),
          }, 'local')
        }
        catch (err) {
          logger.warn({ filename, error: err }, 'Failed to parse file plugin')
        }
      }

      // 加载目录（package 插件）
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .filter(name => !name.startsWith('.'))
        .sort((a, b) => a.localeCompare(b))

      for (const dirname of dirs) {
        const dirPath = path.join(absDir, dirname)
        const pkgPath = path.join(dirPath, 'package.json')

        logger.debug({ dirname, dirPath }, 'Checking directory for plugin')

        // 检查是否有 package.json
        if (await exists(pkgPath)) {
          try {
            const pkgRaw = await fs.readFile(pkgPath, 'utf8')
            const pkg = JSON.parse(pkgRaw)

            // 默认寻找 index.mjs -> index.js -> package.json[main]
            let mainFile = pkg.main
            if (!mainFile) {
              if (await exists(path.join(dirPath, 'index.mjs')))
                mainFile = 'index.mjs'
              else if (await exists(path.join(dirPath, 'index.js')))
                mainFile = 'index.js'
            }

            if (!mainFile) {
              logger.debug({ dirname }, 'Skip directory plugin: No entry file (main/index.mjs/index.js) found')
              continue
            }

            const modulePath = path.join(dirPath, mainFile)

            if (await exists(modulePath)) {
              // 提取 ID 时，如果 package.json 有 name，则优先使用其最后一部分
              const pkgName = typeof pkg.name === 'string' ? pkg.name : ''
              const rawId = pkgName.split('/').pop() || dirname
              const id = sanitizeId(rawId)

              // 如果该插件已在配置文件中定义（无论启用与否），则跳过自动发现
              // 检查 ID 或 模块路径（入口文件或目录）是否匹配
              if (specsById.has(id) || hasSpec(s => s.module === modulePath || s.module === dirPath)) {
                logger.debug({ id }, 'Plugin already configured via config file, skipping auto-discovery')
                continue
              }

              logger.debug({ id, modulePath, pkgName }, 'Found local directory plugin')
              addSpec({
                id,
                module: modulePath,
                enabled: true,
                load: () => loadModule(modulePath),
              }, 'local')
            }
            else {
              logger.debug({ dirname, modulePath }, 'Skip directory plugin: Entry file does not exist')
            }
          }
          catch (err: any) {
            logger.warn({ dir: dirname, error: err.message }, 'Failed to load directory plugin')
          }
        }
        else {
          logger.debug({ dirname }, 'Skip directory: No package.json found')
        }
      }
    }
    catch (error: any) {
      logger.error({ pluginsDir, dataDir, error: error.message }, 'Failed to scan PLUGINS_DIR')
    }
  }

  // 加载内置插件（低优先级：仅当外部未提供同名 id）
  try {
    const builtinPlugins: Array<PluginSpec> = [
      {
        id: 'ping-pong',
        module: '@builtin/ping-pong',
        enabled: true,
        load: async () => builtinPingPong,
      },
    ]

    for (const builtin of builtinPlugins) {
      addSpec(builtin, 'builtin')
      if (specsById.get(builtin.id)?.spec === builtin) {
        logger.debug({ id: builtin.id, module: builtin.module }, 'Builtin plugin added')
      }
    }
  }
  catch (error) {
    logger.error({ error }, 'Failed to load builtin plugins')
  }

  return Array.from(specsById.values())
    .sort((a, b) => a.order - b.order)
    .map(entry => entry.spec)
}
