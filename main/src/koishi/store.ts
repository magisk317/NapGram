import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import env from '../domain/models/env';

export interface KoishiPluginsConfigFile {
  plugins: Array<{
    id: string;
    module: string;
    enabled?: boolean;
    config?: any;
    source?: any;
  }>;
}

function resolveDataDir(): string {
  const dataDir = String(env.DATA_DIR || process.env.DATA_DIR || '/app/data');
  return path.resolve(dataDir);
}

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
}

async function ensureUnderDataDir(absolutePath: string): Promise<string> {
  const dataDir = resolveDataDir();
  const abs = path.resolve(absolutePath);
  const real = await realpathSafe(abs);
  const dataReal = await realpathSafe(dataDir);
  if (real === dataReal) return real;
  if (!real.startsWith(dataReal + path.sep)) {
    throw new Error(`Path is outside DATA_DIR: ${absolutePath}`);
  }
  return real;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function getManagedKoishiConfigPath(): string {
  const raw = String(process.env.KOISHI_CONFIG_PATH || '').trim();
  if (raw) return path.resolve(raw);
  return path.join(resolveDataDir(), 'koishi', 'plugins.yaml');
}

function parseConfig(raw: string, ext: string): KoishiPluginsConfigFile {
  const data = (ext === '.yaml' || ext === '.yml') ? YAML.parse(raw) : JSON.parse(raw);
  const plugins = Array.isArray((data as any)?.plugins) ? (data as any).plugins : [];
  const normalized = plugins
    .map((p: any) => ({
      id: typeof p?.id === 'string' ? p.id : '',
      module: typeof p?.module === 'string' ? p.module : '',
      enabled: p?.enabled === false ? false : true,
      config: p?.config,
      source: p?.source,
    }))
    .filter((p: any) => p.id && p.module);
  return { plugins: normalized };
}

export async function readKoishiPluginsConfig(): Promise<{ path: string; config: KoishiPluginsConfigFile; exists: boolean }> {
  const configPath = getManagedKoishiConfigPath();
  await ensureUnderDataDir(configPath);
  const ok = await exists(configPath);
  if (!ok) return { path: configPath, config: { plugins: [] }, exists: false };
  const raw = await fs.readFile(configPath, 'utf8');
  const ext = path.extname(configPath).toLowerCase();
  return { path: configPath, config: parseConfig(raw, ext), exists: true };
}

function inferIdFromModule(modulePath: string): string {
  const clean = modulePath.startsWith('file://') ? fileURLToPath(modulePath) : modulePath;
  const ext = path.extname(clean);
  const base = path.basename(clean, ext);
  if (base.toLowerCase() === 'index') {
    return path.basename(path.dirname(clean)) || 'plugin';
  }
  return base || 'plugin';
}

function sanitizeId(id: string): string {
  return String(id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64) || 'plugin';
}

export async function normalizeModuleSpecifierForConfig(moduleRaw: string): Promise<{ stored: string; absolute: string }> {
  const configPath = getManagedKoishiConfigPath();
  await ensureUnderDataDir(configPath);
  const baseDir = path.dirname(configPath);

  const raw = String(moduleRaw || '').trim();
  if (!raw) throw new Error('Missing module');

  const absolute =
    raw.startsWith('file://')
      ? await ensureUnderDataDir(fileURLToPath(raw))
      : raw.startsWith('/') || raw.startsWith('.')
        ? await ensureUnderDataDir(path.resolve(baseDir, raw))
        : await ensureUnderDataDir(path.resolve(baseDir, raw));

  const rel = path.relative(baseDir, absolute);
  const stored = !rel.startsWith('..' + path.sep) && rel !== '..'
    ? `./${rel.split(path.sep).join('/')}`
    : absolute;

  return { stored, absolute };
}

export async function upsertKoishiPlugin(entry: { id?: string; module: string; enabled?: boolean; config?: any; source?: any }) {
  const { path: configPath, config } = await readKoishiPluginsConfig();
  const { stored, absolute } = await normalizeModuleSpecifierForConfig(entry.module);

  const inferredId = sanitizeId(entry.id || inferIdFromModule(absolute));
  const enabled = entry.enabled === false ? false : true;

  const idx = config.plugins.findIndex(p => p.id === inferredId);
  const record = {
    id: inferredId,
    module: stored,
    enabled,
    config: entry.config,
    source: entry.source,
  };
  if (idx >= 0) config.plugins[idx] = record;
  else config.plugins.push(record);

  config.plugins.sort((a, b) => a.id.localeCompare(b.id));

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, YAML.stringify({ plugins: config.plugins }), 'utf8');

  return { id: inferredId, path: configPath, record };
}

export async function patchKoishiPlugin(id: string, patch: { module?: string; enabled?: boolean; config?: any; source?: any }) {
  const pluginId = sanitizeId(id);
  const { path: configPath, config } = await readKoishiPluginsConfig();
  const idx = config.plugins.findIndex(p => p.id === pluginId);
  if (idx < 0) throw new Error(`Plugin not found: ${pluginId}`);

  const next = { ...config.plugins[idx] } as any;
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if ('config' in patch) next.config = patch.config;
  if ('source' in patch) next.source = patch.source;
  if (typeof patch.module === 'string' && patch.module.trim()) {
    const { stored } = await normalizeModuleSpecifierForConfig(patch.module);
    next.module = stored;
  }

  config.plugins[idx] = next;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, YAML.stringify({ plugins: config.plugins }), 'utf8');

  return { id: pluginId, path: configPath, record: next };
}

export async function removeKoishiPlugin(id: string) {
  const pluginId = sanitizeId(id);
  const { path: configPath, config } = await readKoishiPluginsConfig();
  const idx = config.plugins.findIndex(p => p.id === pluginId);
  if (idx < 0) return { removed: false, id: pluginId, path: configPath };
  config.plugins.splice(idx, 1);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, YAML.stringify({ plugins: config.plugins }), 'utf8');
  return { removed: true, id: pluginId, path: configPath };
}

