import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import env from '../domain/models/env';

export interface MarketplaceIndexSpec {
  id: string;
  url: string;
  enabled?: boolean;
}

export interface MarketplacesConfigFile {
  version: 1;
  indexes: MarketplaceIndexSpec[];
}

function resolveDataDir(): string {
  const dataDir = String(env.DATA_DIR || process.env.DATA_DIR || '/app/data');
  return path.resolve(dataDir);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function sanitizeId(id: string): string {
  return String(id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64) || 'market';
}

export function getManagedMarketplacesPath(): string {
  return path.join(resolveDataDir(), 'koishi', 'marketplaces.yaml');
}

export function getMarketCacheDir(): string {
  return path.join(resolveDataDir(), 'koishi', 'cache');
}

export async function readMarketplaces(): Promise<{ path: string; config: MarketplacesConfigFile; exists: boolean }> {
  const filePath = getManagedMarketplacesPath();
  const ok = await exists(filePath);
  if (!ok) return { path: filePath, config: { version: 1, indexes: [] }, exists: false };
  const raw = await fs.readFile(filePath, 'utf8');
  const data = YAML.parse(raw) || {};
  const indexes = Array.isArray((data as any).indexes) ? (data as any).indexes : [];
  const normalized: MarketplaceIndexSpec[] = indexes
    .map((i: any) => ({
      id: sanitizeId(i?.id),
      url: typeof i?.url === 'string' ? i.url : '',
      enabled: i?.enabled === false ? false : true,
    }))
    .filter(i => i.id && i.url);
  return { path: filePath, config: { version: 1, indexes: normalized }, exists: true };
}

export async function writeMarketplaces(next: MarketplacesConfigFile): Promise<{ path: string; config: MarketplacesConfigFile }> {
  const filePath = getManagedMarketplacesPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const normalized: MarketplacesConfigFile = {
    version: 1,
    indexes: (next.indexes || []).map(i => ({ ...i, id: sanitizeId(i.id), enabled: i.enabled === false ? false : true })),
  };
  normalized.indexes.sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(filePath, YAML.stringify(normalized), 'utf8');
  return { path: filePath, config: normalized };
}

export async function upsertMarketplaceIndex(input: MarketplaceIndexSpec) {
  const { config } = await readMarketplaces();
  const id = sanitizeId(input.id);
  const url = String(input.url || '').trim();
  if (!url) throw new Error('Missing url');
  const enabled = input.enabled === false ? false : true;
  const idx = config.indexes.findIndex(i => i.id === id);
  const record = { id, url, enabled };
  if (idx >= 0) config.indexes[idx] = record;
  else config.indexes.push(record);
  await writeMarketplaces(config);
  return record;
}

export async function removeMarketplaceIndex(id: string) {
  const { config } = await readMarketplaces();
  const key = sanitizeId(id);
  const idx = config.indexes.findIndex(i => i.id === key);
  if (idx < 0) return { removed: false, id: key };
  config.indexes.splice(idx, 1);
  await writeMarketplaces(config);
  return { removed: true, id: key };
}

export async function refreshMarketplaceIndex(id: string, url: string) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  const cacheDir = getMarketCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `marketplace-${sanitizeId(id)}.json`);
  await fs.writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), url, data: json }, null, 2), 'utf8');
  return { id: sanitizeId(id), cachePath, fetchedAt: Date.now() };
}

export async function readMarketplaceCache(id: string) {
  const cachePath = path.join(getMarketCacheDir(), `marketplace-${sanitizeId(id)}.json`);
  const ok = await exists(cachePath);
  if (!ok) return { exists: false, cachePath, data: null as any };
  const raw = await fs.readFile(cachePath, 'utf8');
  return { exists: true, cachePath, data: JSON.parse(raw) };
}

