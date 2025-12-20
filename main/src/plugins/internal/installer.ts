import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unzipSync } from 'fflate';
import env from '../../domain/models/env';
import { readMarketplaceCache } from './marketplace';
import { patchPluginConfig, readPluginsConfig, removePluginConfig, upsertPluginConfig } from './store';
import { PluginRuntime } from '../runtime';

const execFileAsync = promisify(execFile);

export type DistType = 'zip' | 'tgz';

export interface MarketplaceIndexV1 {
  schemaVersion: 1;
  name?: string;
  plugins: Array<{
    id: string;
    name?: string;
    versions: Array<MarketplacePluginVersion>;
  }>;
}

export interface MarketplacePluginVersion {
  version: string;
  entry: { type: 'file'; path: string };
  dist: { type: DistType; url: string; sha256: string };
  install?: {
    mode?: 'none' | 'pnpm';
    production?: boolean;
    ignoreScripts?: boolean;
    frozenLockfile?: boolean;
    registry?: string;
  };
  permissions?: {
    network?: string[];
    fs?: string[];
    instances?: Array<number | string>;
  };
}

export interface InstallOptions {
  marketplaceId: string;
  pluginId: string;
  version?: string;
  enabled?: boolean;
  config?: any;
  reload?: boolean;
  dryRun?: boolean;
}

export interface UpgradeOptions {
  marketplaceId?: string;
  version?: string;
  reload?: boolean;
  dryRun?: boolean;
}

export interface RollbackOptions {
  version?: string;
  reload?: boolean;
  dryRun?: boolean;
}

export interface UninstallOptions {
  removeFiles?: boolean;
  reload?: boolean;
  dryRun?: boolean;
}

export interface PluginInstallResult {
  id: string;
  version: string;
  entryPath: string;
  module: string;
  installDir: string;
  permissions: Required<NonNullable<MarketplacePluginVersion['permissions']>>;
  source: any;
}

let installQueue: Promise<void> = Promise.resolve();

function resolveDataDir(): string {
  return path.resolve(String(env.DATA_DIR || process.env.DATA_DIR || '/app/data'));
}

function resolvePluginsRoot(...parts: string[]): string {
  return path.join(resolveDataDir(), 'plugins', ...parts);
}

function normalizeHexSha256(input: string): string {
  const v = String(input || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(v)) throw new Error('Invalid sha256 (expected 64 hex chars)');
  return v;
}

function sanitizeId(input: string): string {
  return String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64) || 'plugin';
}

function safeJoin(root: string, rel: string): string {
  const out = path.resolve(root, rel);
  const rootReal = path.resolve(root) + path.sep;
  if ((out + path.sep).startsWith(rootReal)) return out;
  throw new Error(`Unsafe path traversal: ${rel}`);
}

function isSafeArchivePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith('/')) return false;
  if (p.includes('\\')) return false;
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) return false;
  if (parts.some(x => x === '.' || x === '..')) return false;
  return true;
}

function parseSemver3(v: string): [number, number, number, string] | null {
  const m = String(v || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] || ''];
}

function compareVersions(a: string, b: string): number {
  const pa = parseSemver3(a);
  const pb = parseSemver3(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] as number) - (pb[i] as number);
    if (d) return d;
  }
  const ra = pa[3] || '';
  const rb = pb[3] || '';
  if (!ra && rb) return 1;
  if (ra && !rb) return -1;
  return ra.localeCompare(rb);
}

function resolveRequestedPermissions(p?: MarketplacePluginVersion['permissions']): Required<NonNullable<MarketplacePluginVersion['permissions']>> {
  return {
    network: Array.isArray(p?.network) ? p!.network.map(String) : [],
    fs: Array.isArray(p?.fs) ? p!.fs.map(String) : [],
    instances: Array.isArray(p?.instances) ? p!.instances.map(x => (typeof x === 'number' ? x : String(x))) : [],
  };
}

function validatePermissions(permissions: Required<NonNullable<MarketplacePluginVersion['permissions']>>) {
  const allowNetwork = String(process.env.PLUGIN_ALLOW_NETWORK || '').trim().toLowerCase();
  const networkAllowed = allowNetwork === '1' || allowNetwork === 'true' || allowNetwork === 'yes' || allowNetwork === 'on';
  const allowFs = String(process.env.PLUGIN_ALLOW_FS || '').trim().toLowerCase();
  const fsAllowed = allowFs === '1' || allowFs === 'true' || allowFs === 'yes' || allowFs === 'on';

  const allowlistRaw = String(process.env.PLUGIN_NETWORK_ALLOWLIST || '').trim();
  const allowlist = allowlistRaw
    ? allowlistRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (permissions.network.length) {
    if (!networkAllowed) {
      throw new Error('Plugin requests network permission but PLUGIN_ALLOW_NETWORK is not enabled');
    }
    if (allowlist.length) {
      for (const rule of permissions.network) {
        const prefix = rule.endsWith('*') ? rule.slice(0, -1) : rule;
        const ok = allowlist.some(a => prefix.startsWith(a) || a.startsWith(prefix));
        if (!ok) throw new Error(`Network permission not allowed by PLUGIN_NETWORK_ALLOWLIST: ${rule}`);
      }
    }
  }

  if (permissions.fs.length && !fsAllowed) {
    throw new Error('Plugin requests fs permission but PLUGIN_ALLOW_FS is not enabled');
  }
}

function canInstallWithPnpm(): boolean {
  const raw = String(process.env.PLUGIN_ALLOW_NPM_INSTALL || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function canRunInstallScripts(): boolean {
  const raw = String(process.env.PLUGIN_ALLOW_INSTALL_SCRIPTS || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function isNetworkAllowedForInstall(): boolean {
  const raw = String(process.env.PLUGIN_ALLOW_NETWORK || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(url: string, filePath: string): Promise<{ sha256: string; bytes: number }> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  await ensureDir(path.dirname(filePath));
  const file = await fs.open(filePath, 'w');
  const hash = crypto.createHash('sha256');
  let bytes = 0;

  try {
    // @ts-ignore - Node's fetch body supports async iteration
    for await (const chunk of res.body) {
      const buf = Buffer.from(chunk as any);
      bytes += buf.length;
      hash.update(buf);
      await file.write(buf);
    }
  } finally {
    await file.close();
  }

  return { sha256: hash.digest('hex'), bytes };
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const data = await fs.readFile(zipPath);
  const files = unzipSync(new Uint8Array(data));
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    if (!isSafeArchivePath(name)) {
      throw new Error(`Unsafe zip entry path: ${name}`);
    }
    const outPath = safeJoin(destDir, name);
    await ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, Buffer.from(content));
  }
}

async function listTarEntriesVerbose(tgzPath: string): Promise<Array<{ type: string; name: string }>> {
  const { stdout } = await execFileAsync('tar', ['-tvzf', tgzPath], { maxBuffer: 10 * 1024 * 1024 });
  const lines = String(stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
  return lines.map(line => {
    const type = line[0] || '?';
    const arrow = line.indexOf(' -> ');
    const last = arrow >= 0 ? line.slice(0, arrow) : line;
    const name = last.split(/\s+/).slice(-1)[0] || '';
    return { type, name };
  });
}

async function extractTgz(tgzPath: string, destDir: string): Promise<void> {
  const entries = await listTarEntriesVerbose(tgzPath);
  for (const e of entries) {
    if (!isSafeArchivePath(e.name)) throw new Error(`Unsafe tar entry path: ${e.name}`);
    if (!['-', 'd'].includes(e.type)) {
      throw new Error(`Unsupported tar entry type "${e.type}" for: ${e.name}`);
    }
  }
  await execFileAsync('tar', ['-xzf', tgzPath, '-C', destDir, '--no-same-owner', '--no-same-permissions'], { maxBuffer: 10 * 1024 * 1024 });
}

async function extractArchive(distType: DistType, archivePath: string, destDir: string): Promise<void> {
  await ensureDir(destDir);
  if (distType === 'zip') return extractZip(archivePath, destDir);
  if (distType === 'tgz') return extractTgz(archivePath, destDir);
  throw new Error(`Unsupported dist.type: ${distType}`);
}

async function resolveEntryFile(destDir: string, entryPath: string): Promise<string> {
  const direct = safeJoin(destDir, entryPath);
  if (await pathExists(direct)) return direct;
  const npmLayout = safeJoin(destDir, path.join('package', entryPath));
  if (await pathExists(npmLayout)) return npmLayout;
  throw new Error(`Entry not found after extract: ${entryPath}`);
}

async function findPnpmProjectDir(destDir: string): Promise<string | null> {
  const direct = path.join(destDir, 'package.json');
  if (await pathExists(direct)) return destDir;
  const npm = path.join(destDir, 'package', 'package.json');
  if (await pathExists(npm)) return path.join(destDir, 'package');
  return null;
}

async function runPnpmInstall(projectDir: string, opts: Required<NonNullable<MarketplacePluginVersion['install']>>) {
  if (!canInstallWithPnpm()) {
    throw new Error('Refusing to run pnpm install without PLUGIN_ALLOW_NPM_INSTALL=1');
  }
  if (!isNetworkAllowedForInstall()) {
    throw new Error('pnpm install requires network; enable PLUGIN_ALLOW_NETWORK=1');
  }
  if (!opts.ignoreScripts && !canRunInstallScripts()) {
    throw new Error('Refusing to run install scripts without PLUGIN_ALLOW_INSTALL_SCRIPTS=1');
  }

  const args = ['install'];
  if (opts.production) args.push('--prod');
  if (opts.ignoreScripts) args.push('--ignore-scripts');
  if (opts.frozenLockfile) args.push('--frozen-lockfile');
  else args.push('--no-frozen-lockfile');
  args.push('--prefer-offline');

  const envVars: NodeJS.ProcessEnv = { ...process.env };
  if (opts.registry) envVars.npm_config_registry = opts.registry;

  await execFileAsync('pnpm', args, {
    cwd: projectDir,
    env: envVars,
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function loadMarketplaceIndex(marketplaceId: string): Promise<MarketplaceIndexV1> {
  const cached = await readMarketplaceCache(marketplaceId);
  if (!cached.exists) {
    throw new Error(`Marketplace cache not found for "${marketplaceId}". Call /api/admin/marketplaces/refresh first.`);
  }
  const data = cached.data?.data;
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.plugins)) {
    throw new Error('Invalid marketplace index schema');
  }
  return data as MarketplaceIndexV1;
}

function pickVersion(versions: MarketplacePluginVersion[], requested?: string): MarketplacePluginVersion {
  if (!versions.length) throw new Error('No versions available');
  if (requested) {
    const v = versions.find(x => x.version === requested);
    if (!v) throw new Error(`Version not found: ${requested}`);
    return v;
  }
  const sorted = [...versions].sort((a, b) => compareVersions(a.version, b.version));
  return sorted[sorted.length - 1];
}

function buildModuleSpecifier(pluginId: string, version: string, entryPath: string): string {
  return `./${pluginId}/${version}/${entryPath.split(path.sep).join('/')}`;
}

async function listInstalledVersions(pluginId: string): Promise<string[]> {
  const root = resolvePluginsRoot(pluginId);
  if (!await pathExists(root)) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(Boolean)
    .sort((a, b) => compareVersions(a, b));
}

async function inferCurrentVersion(pluginId: string): Promise<string | null> {
  const { config } = await readPluginsConfig();
  const entry = config.plugins.find(p => p.id === pluginId);
  const src = (entry as any)?.source;
  if (typeof src?.version === 'string' && src.version) return src.version;

  const mod = String(entry?.module || '');
  const m = mod.match(new RegExp(`^\\./${pluginId}/([^/]+)/`));
  if (m) return m[1];
  return null;
}

async function writeInstallMeta(installDir: string, meta: any) {
  await fs.writeFile(path.join(installDir, 'napgram-plugin.json'), JSON.stringify(meta, null, 2), 'utf8');
}

async function withInstallLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = installQueue;
  let release!: () => void;
  installQueue = new Promise<void>((resolve) => (release = resolve));
  await start;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function installFromMarketplace(opts: InstallOptions): Promise<PluginInstallResult> {
  return withInstallLock(async () => {
    const marketplaceId = sanitizeId(opts.marketplaceId);
    const pluginId = sanitizeId(opts.pluginId);

    const existing = (await readPluginsConfig()).config.plugins.find(p => p.id === pluginId);
    const enabled = typeof opts.enabled === 'boolean' ? opts.enabled : (existing ? existing.enabled !== false : true);
    const userConfig = typeof opts.config === 'undefined' ? existing?.config : opts.config;

    const index = await loadMarketplaceIndex(marketplaceId);
    const plugin = index.plugins.find(p => sanitizeId(p.id) === pluginId);
    if (!plugin) throw new Error(`Plugin not found in marketplace: ${pluginId}`);

    const target = pickVersion(plugin.versions, opts.version);
    const entryPath = String(target.entry?.path || '').trim().replace(/^\/+/, '');
    if (!entryPath) throw new Error('Invalid entry.path');

    const distType = target.dist?.type;
    if (distType !== 'zip' && distType !== 'tgz') throw new Error('Invalid dist.type');
    const url = String(target.dist?.url || '').trim();
    if (!url) throw new Error('Missing dist.url');
    const expected = normalizeHexSha256(target.dist?.sha256);

    const permissions = resolveRequestedPermissions(target.permissions);
    validatePermissions(permissions);

    const install = {
      mode: (target.install?.mode || 'none') as 'none' | 'pnpm',
      production: target.install?.production !== false,
      ignoreScripts: target.install?.ignoreScripts !== false,
      frozenLockfile: target.install?.frozenLockfile === true,
      registry: (target.install?.registry || String(process.env.PLUGIN_NPM_REGISTRY || '').trim() || undefined) as string | undefined,
    };

    if (install.mode === 'pnpm') {
      if (!canInstallWithPnpm()) {
        throw new Error('Plugin requires pnpm install; set PLUGIN_ALLOW_NPM_INSTALL=1 to enable');
      }
    }

    const installDir = resolvePluginsRoot(pluginId, target.version);
    const tmpDir = resolvePluginsRoot('tmp');
    const archivePath = path.join(tmpDir, `${pluginId}-${target.version}.${distType}`);

    if (opts.dryRun) {
      const module = buildModuleSpecifier(pluginId, target.version, entryPath);
      return {
        id: pluginId,
        version: target.version,
        entryPath,
        module,
        installDir,
        permissions,
        source: { type: 'marketplace', marketplaceId, pluginId, version: target.version, dist: { type: distType, url, sha256: expected }, install, permissions },
      };
    }

    await ensureDir(tmpDir);
    const { sha256 } = await downloadToFile(url, archivePath);
    if (sha256 !== expected) {
      throw new Error(`sha256 mismatch: expected=${expected} got=${sha256}`);
    }

    await fs.rm(installDir, { recursive: true, force: true });
    await ensureDir(installDir);
    await extractArchive(distType, archivePath, installDir);

    if (install.mode === 'pnpm') {
      const projectDir = await findPnpmProjectDir(installDir);
      if (!projectDir) throw new Error('install.mode=pnpm but package.json not found after extract');
      await runPnpmInstall(projectDir, install as any);
    }

    const entryFile = await resolveEntryFile(installDir, entryPath);
    const entryRel = path.relative(installDir, entryFile).split(path.sep).join('/');
    const module = buildModuleSpecifier(pluginId, target.version, entryRel);

    const source = { type: 'marketplace', marketplaceId, pluginId, version: target.version, dist: { type: distType, url, sha256: expected }, install, permissions };
    await writeInstallMeta(installDir, {
      installedAt: new Date().toISOString(),
      ...source,
      entry: { path: entryRel },
    });

    await upsertPluginConfig({
      id: pluginId,
      module,
      enabled,
      config: userConfig,
      source,
    });

    return { id: pluginId, version: target.version, entryPath: entryRel, module, installDir, permissions, source };
  });
}

export async function upgradePlugin(pluginIdRaw: string, options: UpgradeOptions): Promise<PluginInstallResult> {
  return withInstallLock(async () => {
    const pluginId = sanitizeId(pluginIdRaw);
    const current = await inferCurrentVersion(pluginId);
    const marketplaceId = sanitizeId(options.marketplaceId || '');
    if (!marketplaceId) {
      const { config } = await readPluginsConfig();
      const entry = config.plugins.find(p => p.id === pluginId);
      const src = (entry as any)?.source;
      const mid = typeof src?.marketplaceId === 'string' ? src.marketplaceId : '';
      if (!mid) throw new Error('Missing marketplaceId (not installed from marketplace?)');
      options.marketplaceId = mid;
    }

    const index = await loadMarketplaceIndex(sanitizeId(options.marketplaceId!));
    const plugin = index.plugins.find(p => sanitizeId(p.id) === pluginId);
    if (!plugin) throw new Error(`Plugin not found in marketplace: ${pluginId}`);
    const target = pickVersion(plugin.versions, options.version);
    if (current && target.version === current) {
      throw new Error(`Already on version ${current}`);
    }
    return installFromMarketplace({
      marketplaceId: sanitizeId(options.marketplaceId!),
      pluginId,
      version: target.version,
      reload: options.reload,
      dryRun: options.dryRun,
    });
  });
}

export async function rollbackPlugin(pluginIdRaw: string, options: RollbackOptions): Promise<{ id: string; from: string; to: string; module: string }> {
  return withInstallLock(async () => {
    const pluginId = sanitizeId(pluginIdRaw);
    const current = await inferCurrentVersion(pluginId);
    if (!current) throw new Error('Plugin not installed');

    const installed = await listInstalledVersions(pluginId);
    if (!installed.length) throw new Error('No installed versions on disk');

    let target = options.version;
    if (!target) {
      const candidates = installed.filter(v => v !== current);
      if (!candidates.length) throw new Error('No previous version to rollback to');
      target = candidates[candidates.length - 1];
    }
    if (!installed.includes(target)) throw new Error(`Target version not installed: ${target}`);

    const installDir = resolvePluginsRoot(pluginId, target);
    const metaPath = path.join(installDir, 'napgram-plugin.json');
    const meta = await pathExists(metaPath) ? JSON.parse(await fs.readFile(metaPath, 'utf8')) : null;
    const entryRel = String(meta?.entry?.path || '').trim();
    if (!entryRel) throw new Error('Missing entry metadata for rollback target');

    const module = buildModuleSpecifier(pluginId, target, entryRel);

    if (!options.dryRun) {
      await patchPluginConfig(pluginId, { module, source: { ...(meta || {}), version: target } });
    }

    return { id: pluginId, from: current, to: target, module };
  });
}

export async function uninstallPlugin(pluginIdRaw: string, options: UninstallOptions): Promise<{ id: string; removed: boolean; filesRemoved: boolean }> {
  return withInstallLock(async () => {
    const pluginId = sanitizeId(pluginIdRaw);
    const { config } = await readPluginsConfig();
    const idx = config.plugins.findIndex(p => p.id === pluginId);
    const removed = idx >= 0;

    if (!options.dryRun) {
      if (removed) {
        const entry = config.plugins[idx];
        const isMarketplacePlugin = entry.source && typeof entry.source === 'object' && entry.source.type === 'marketplace';

        // For marketplace plugins, remove the config entry (they can be reinstalled)
        // For local plugins, keep the entry but set enabled: false to prevent auto-discovery from re-enabling
        if (isMarketplacePlugin) {
          await removePluginConfig(pluginId);
        } else {
          await patchPluginConfig(pluginId, { enabled: false });
        }
      } else {
        // Plugin not in config yet (probably auto-discovered local plugin)
        // Check if it's loaded in runtime to determine if it's a local plugin
        const runtime = PluginRuntime.getLastReport();
        const isLoaded = runtime.loaded.includes(pluginId);

        if (isLoaded) {
          // It's a local plugin that was auto-discovered - add it to config as disabled
          const loadedPlugin = runtime.loadedPlugins?.find(p => p.id === pluginId);
          if (loadedPlugin) {
            // Try to infer the module path from runtime
            const localDir = resolvePluginsRoot('local', pluginId);
            const possiblePaths = [
              `./local/${pluginId}/index.mjs`,
              `./local/${pluginId}/index.js`,
            ];

            // Add the plugin to config with enabled: false
            try {
              await upsertPluginConfig({
                id: pluginId,
                module: possiblePaths[0], // Use default path
                enabled: false,
              });
            } catch (error) {
              // If upsert fails, it means we can't persist the disable - this is acceptable
              // The plugin will be re-enabled on next reload
            }
          }
        }
      }
    }

    let filesRemoved = false;
    if (options.removeFiles && !options.dryRun) {
      const dir = resolvePluginsRoot(pluginId);
      await fs.rm(dir, { recursive: true, force: true });
      filesRemoved = true;
    }
    return { id: pluginId, removed, filesRemoved };
  });
}

export async function getPluginVersions(pluginIdRaw: string): Promise<{ current: string | null; installed: string[] }> {
  const pluginId = sanitizeId(pluginIdRaw);
  const current = await inferCurrentVersion(pluginId);
  const installed = await listInstalledVersions(pluginId);
  return { current, installed };
}

