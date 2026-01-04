import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { env, getLogger } from '@napgram/infra-kit'
import { readStringEnv } from './utils/env'

const logger = getLogger('PluginStore')

const legacyConfigExtensions = ['.yaml', '.yml', '.json'] as const

export interface PluginsConfigFile {
    plugins: Array<{
        id: string
        module: string
        enabled?: boolean
        config?: any
        source?: any
    }>
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

async function ensureUnderDataDir(absolutePath: string): Promise<string> {
    const dataDir = resolveDataDir()
    const abs = path.resolve(absolutePath)
    const real = await realpathSafe(abs)
    const dataReal = await realpathSafe(dataDir)
    if (real === dataReal)
        return real
    if (!real.startsWith(dataReal + path.sep)) {
        throw new Error(`Path is outside DATA_DIR: ${absolutePath}`)
    }
    return real
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


async function writeAtomic(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(tmpPath, content, 'utf8')
    await fs.rename(tmpPath, filePath)
}

async function backupConfig(filePath: string): Promise<void> {
    if (!await exists(filePath)) return
    try {
        const backupPath = `${filePath}.bak`
        await fs.copyFile(filePath, backupPath)
    } catch (error) {
        logger.warn({ error, filePath }, 'Failed to backup config file')
    }
}

async function writePluginsConfigFile(configPath: string, config: PluginsConfigFile): Promise<void> {
    await backupConfig(configPath)
    await writeAtomic(configPath, YAML.stringify({ plugins: config.plugins }))
}

function parseConfig(raw: string, ext: string): PluginsConfigFile {
    const data = (ext === '.yaml' || ext === '.yml') ? YAML.parse(raw) : JSON.parse(raw)
    const plugins = Array.isArray((data as any)?.plugins) ? (data as any).plugins : []
    const normalized = plugins
        .map((p: any) => ({
            id: typeof p?.id === 'string' ? p.id : '',
            module: typeof p?.module === 'string' ? p.module : '',
            enabled: p?.enabled !== false,
            config: p?.config,
            source: p?.source,
        }))
        .filter((p: any) => p.id && p.module)
    return { plugins: normalized }
}

function inferIdFromModule(modulePath: string): string {
    const clean = modulePath.startsWith('file://') ? fileURLToPath(modulePath) : modulePath
    const ext = path.extname(clean)
    const base = path.basename(clean, ext)
    if (base.toLowerCase() === 'index') {
        return path.basename(path.dirname(clean)) || 'plugin'
    }
    return base || 'plugin'
}

function sanitizeId(id: string): string {
    return String(id || '')
        .trim()
        .replace(/[^\w-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 64) || 'plugin'
}

function getLegacyConfigCandidates(configPath: string): string[] {
    const ext = path.extname(configPath).toLowerCase()
    const base = path.join(path.dirname(configPath), path.basename(configPath, ext))
    return legacyConfigExtensions
        .filter(candidate => candidate !== ext)
        .map(candidate => `${base}${candidate}`)
}

async function migrateLegacyPluginsConfig(configPath: string): Promise<PluginsConfigFile | null> {
    const candidates = getLegacyConfigCandidates(configPath)
    for (const candidate of candidates) {
        if (!await exists(candidate))
            continue
        try {
            await ensureUnderDataDir(candidate)
            const raw = await fs.readFile(candidate, 'utf8')
            const ext = path.extname(candidate).toLowerCase()
            const config = parseConfig(raw, ext)
            await writePluginsConfigFile(configPath, config)
            logger.info({ from: candidate, to: configPath }, 'Migrated legacy plugins config')
            return config
        }
        catch (error) {
            logger.warn({ from: candidate, error }, 'Failed to migrate legacy plugins config')
        }
    }
    return null
}

export async function getManagedPluginsConfigPath(): Promise<string> {
    const override = readStringEnv(['PLUGINS_CONFIG_PATH'])
    if (override)
        return path.resolve(override)

    const baseDir = path.join(resolveDataDir(), 'plugins')
    return path.join(baseDir, 'plugins.yaml')
}

export async function normalizeModuleSpecifierForPluginsConfig(moduleRaw: string): Promise<{ stored: string, absolute: string }> {
    const configPath = await getManagedPluginsConfigPath()
    await ensureUnderDataDir(configPath)
    const baseDir = path.dirname(configPath)

    const raw = String(moduleRaw || '').trim()
    if (!raw)
        throw new Error('Missing module')

    const absolute
        = raw.startsWith('file://')
            ? await ensureUnderDataDir(fileURLToPath(raw))
            : raw.startsWith('/') || raw.startsWith('.')
                ? await ensureUnderDataDir(path.resolve(baseDir, raw))
                : await ensureUnderDataDir(path.resolve(baseDir, raw))

    const rel = path.relative(baseDir, absolute)
    const stored = !rel.startsWith(`..${path.sep}`) && rel !== '..'
        ? `./${rel.split(path.sep).join('/')}`
        : absolute

    return { stored, absolute }
}

export async function readPluginsConfig(): Promise<{ path: string, config: PluginsConfigFile, exists: boolean }> {
    const configPath = await getManagedPluginsConfigPath()
    await ensureUnderDataDir(configPath)

    // Recovery attempt from backup if main file is missing
    if (!await exists(configPath)) {
        const backupPath = `${configPath}.bak`
        if (await exists(backupPath)) {
            try {
                await fs.copyFile(backupPath, configPath)
                logger.warn({ backupPath, configPath }, 'Restored config from backup (main file missing)')
            } catch (error) {
                logger.error({ error }, 'Failed to restore from backup')
            }
        }
    }

    let ok = await exists(configPath)
    if (!ok) {
        const migrated = await migrateLegacyPluginsConfig(configPath)
        if (migrated)
            return { path: configPath, config: migrated, exists: true }
        ok = await exists(configPath)
    }

    if (!ok)
        return { path: configPath, config: { plugins: [] }, exists: false }

    try {
        const raw = await fs.readFile(configPath, 'utf8')
        // Basic validation: if empty, try swap with backup if exists
        if (!raw.trim()) {
            throw new Error('Empty config file')
        }
        const ext = path.extname(configPath).toLowerCase()
        return { path: configPath, config: parseConfig(raw, ext), exists: true }
    } catch (error) {
        logger.error({ error, configPath }, 'Failed to read/parse config file, trying backup...')
        const backupPath = `${configPath}.bak`
        if (await exists(backupPath)) {
            try {
                const rawBak = await fs.readFile(backupPath, 'utf8')
                await fs.copyFile(backupPath, configPath)
                logger.warn('Restored config from backup (main file corrupted)')
                const ext = path.extname(configPath).toLowerCase()
                return { path: configPath, config: parseConfig(rawBak, ext), exists: true }
            } catch (bakError) {
                logger.error({ error: bakError }, 'Failed to restore from backup')
            }
        }
        return { path: configPath, config: { plugins: [] }, exists: false }
    }
}

export async function upsertPluginConfig(entry: { id?: string, module: string, enabled?: boolean, config?: any, source?: any }) {
    const { path: configPath, config } = await readPluginsConfig()
    const { stored, absolute } = await normalizeModuleSpecifierForPluginsConfig(entry.module)

    const inferredId = sanitizeId(entry.id || inferIdFromModule(absolute))
    const enabled = entry.enabled !== false

    const idx = config.plugins.findIndex(p => p.id === inferredId)
    const record = {
        id: inferredId,
        module: stored,
        enabled,
        config: entry.config,
        source: entry.source,
    }
    if (idx >= 0)
        config.plugins[idx] = record
    else config.plugins.push(record)

    config.plugins.sort((a, b) => a.id.localeCompare(b.id))

    await writePluginsConfigFile(configPath, config)

    return { id: inferredId, path: configPath, record }
}

export async function patchPluginConfig(id: string, patch: { module?: string, enabled?: boolean, config?: any, source?: any }) {
    const pluginId = sanitizeId(id)
    const { path: configPath, config } = await readPluginsConfig()
    const idx = config.plugins.findIndex(p => p.id === pluginId)

    if (idx < 0) {
        // Plugin not in config yet - try to add it
        if (!patch.module) {
            const possiblePaths = [
                `./local/${pluginId}/index.mjs`,
                `./local/${pluginId}/index.js`,
            ]
            patch.module = possiblePaths[0]
        }

        return await upsertPluginConfig({
            id: pluginId,
            module: patch.module!,
            enabled: patch.enabled,
            config: patch.config,
            source: patch.source,
        })
    }

    const next = { ...config.plugins[idx] } as any
    if (typeof patch.enabled === 'boolean')
        next.enabled = patch.enabled
    if ('config' in patch)
        next.config = patch.config
    if ('source' in patch)
        next.source = patch.source
    if (typeof patch.module === 'string' && patch.module.trim()) {
        const { stored } = await normalizeModuleSpecifierForPluginsConfig(patch.module)
        next.module = stored
    }

    config.plugins[idx] = next
    await writePluginsConfigFile(configPath, config)

    return { id: pluginId, path: configPath, record: next }
}

export async function removePluginConfig(id: string) {
    const pluginId = sanitizeId(id)
    const { path: configPath, config } = await readPluginsConfig()
    const idx = config.plugins.findIndex(p => p.id === pluginId)
    if (idx < 0)
        return { removed: false, id: pluginId, path: configPath }
    config.plugins.splice(idx, 1)
    await writePluginsConfigFile(configPath, config)
    return { removed: true, id: pluginId, path: configPath }
}

export const __testing = {
    resolveDataDir,
    parseConfig,
    inferIdFromModule,
    sanitizeId,
}
