import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'
import env from '../../../main/src/domain/models/env'
import { getLogger } from '../../../main/src/shared/logger'

const logger = getLogger('MarketplacesConfig')
const legacyConfigExtensions = ['.yaml', '.yml', '.json'] as const

export interface MarketplaceIndexSpec {
  id: string
  url: string
  enabled?: boolean
}

export interface MarketplacesConfigFile {
  version: 1
  indexes: MarketplaceIndexSpec[]
}

function resolveDataDir(): string {
  const dataDir = String(env.DATA_DIR || process.env.DATA_DIR || '/app/data')
  return path.resolve(dataDir)
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

async function writeMarketplacesFile(filePath: string, next: MarketplacesConfigFile): Promise<MarketplacesConfigFile> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const normalized: MarketplacesConfigFile = {
    version: 1,
    indexes: (next.indexes || []).map(i => ({ ...i, id: sanitizeId(i.id), enabled: i.enabled !== false })),
  }
  normalized.indexes.sort((a, b) => a.id.localeCompare(b.id))
  await fs.writeFile(filePath, YAML.stringify(normalized), 'utf8')
  return normalized
}

function sanitizeId(id: string): string {
  return String(id || '')
    .trim()
    .replace(/[^\w-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64) || 'market'
}

function parseMarketplaces(raw: string, ext: string): MarketplacesConfigFile {
  const data = (ext === '.yaml' || ext === '.yml') ? YAML.parse(raw) : JSON.parse(raw)
  const indexes = Array.isArray((data as any)?.indexes) ? (data as any).indexes : []
  const normalized: MarketplaceIndexSpec[] = indexes
    .map((i: any) => ({
      id: sanitizeId(i?.id),
      url: typeof i?.url === 'string' ? i.url : '',
      enabled: i?.enabled !== false,
    }))
    .filter(i => i.id && i.url)
  return { version: 1, indexes: normalized }
}

function getLegacyMarketplaceCandidates(filePath: string): string[] {
  const ext = path.extname(filePath).toLowerCase()
  const base = path.join(path.dirname(filePath), path.basename(filePath, ext))
  return legacyConfigExtensions
    .filter(candidate => candidate !== ext)
    .map(candidate => `${base}${candidate}`)
}

async function migrateLegacyMarketplaces(filePath: string): Promise<MarketplacesConfigFile | null> {
  const candidates = getLegacyMarketplaceCandidates(filePath)
  for (const candidate of candidates) {
    if (!await exists(candidate))
      continue
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      const ext = path.extname(candidate).toLowerCase()
      const config = parseMarketplaces(raw, ext)
      await writeMarketplacesFile(filePath, config)
      logger.info({ from: candidate, to: filePath }, 'Migrated legacy marketplaces config')
      return config
    }
    catch (error) {
      logger.warn({ from: candidate, error }, 'Failed to migrate legacy marketplaces config')
    }
  }
  return null
}

export async function getManagedMarketplacesPath(): Promise<string> {
  const override = String(process.env.PLUGINS_MARKETPLACES_PATH || '').trim()
  if (override)
    return path.resolve(override)

  const baseDir = path.join(resolveDataDir(), 'plugins')
  return path.join(baseDir, 'marketplaces.yaml')
}

export async function getMarketCacheDir(): Promise<string> {
  const override = String(process.env.PLUGINS_CACHE_DIR || '').trim()
  if (override)
    return path.resolve(override)
  return path.join(resolveDataDir(), 'plugins', 'cache')
}

export async function readMarketplaces(): Promise<{ path: string, config: MarketplacesConfigFile, exists: boolean }> {
  const filePath = await getManagedMarketplacesPath()
  let ok = await exists(filePath)
  if (!ok) {
    const migrated = await migrateLegacyMarketplaces(filePath)
    if (migrated)
      return { path: filePath, config: migrated, exists: true }
    ok = await exists(filePath)
  }
  if (!ok)
    return { path: filePath, config: { version: 1, indexes: [] }, exists: false }
  const raw = await fs.readFile(filePath, 'utf8')
  const ext = path.extname(filePath).toLowerCase()
  return { path: filePath, config: parseMarketplaces(raw, ext), exists: true }
}

export async function writeMarketplaces(next: MarketplacesConfigFile): Promise<{ path: string, config: MarketplacesConfigFile }> {
  const filePath = await getManagedMarketplacesPath()
  const normalized = await writeMarketplacesFile(filePath, next)
  return { path: filePath, config: normalized }
}

export async function upsertMarketplaceIndex(input: MarketplaceIndexSpec) {
  const { config } = await readMarketplaces()
  const id = sanitizeId(input.id)
  const url = String(input.url || '').trim()
  if (!url)
    throw new Error('Missing url')
  const enabled = input.enabled !== false
  const idx = config.indexes.findIndex(i => i.id === id)
  const record = { id, url, enabled }
  if (idx >= 0)
    config.indexes[idx] = record
  else config.indexes.push(record)
  await writeMarketplaces(config)
  return record
}

export async function removeMarketplaceIndex(id: string) {
  const { config } = await readMarketplaces()
  const key = sanitizeId(id)
  const idx = config.indexes.findIndex(i => i.id === key)
  if (idx < 0)
    return { removed: false, id: key }
  config.indexes.splice(idx, 1)
  await writeMarketplaces(config)
  return { removed: true, id: key }
}

export async function refreshMarketplaceIndex(id: string, url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok)
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const json = await res.json()
  const cacheDir = await getMarketCacheDir()
  await fs.mkdir(cacheDir, { recursive: true })
  const cachePath = path.join(cacheDir, `marketplace-${sanitizeId(id)}.json`)
  await fs.writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), url, data: json }, null, 2), 'utf8')
  return { id: sanitizeId(id), cachePath, fetchedAt: Date.now() }
}

export async function readMarketplaceCache(id: string) {
  const cacheDir = await getMarketCacheDir()
  const cachePath = path.join(cacheDir, `marketplace-${sanitizeId(id)}.json`)
  const ok = await exists(cachePath)
  if (ok) {
    const raw = await fs.readFile(cachePath, 'utf8')
    return { exists: true, cachePath, data: JSON.parse(raw) }
  }

  return { exists: false, cachePath, data: null as any }
}
