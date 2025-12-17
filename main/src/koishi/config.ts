import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { getLogger } from '../shared/logger';

const logger = getLogger('KoishiHost');

export interface KoishiPluginSpec {
  module: string;
  enabled: boolean;
  config?: any;
  load: () => Promise<any>;
}

export function resolveKoishiEnabled(): boolean {
  const raw = String(process.env.KOISHI_ENABLED || '').trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function resolveKoishiEndpoint(): string {
  return String(process.env.KOISHI_GATEWAY_URL || 'ws://127.0.0.1:8765');
}

export function resolveKoishiInstances(defaultInstances?: number[]): number[] {
  const raw = String(process.env.KOISHI_INSTANCES || '').trim();
  if (!raw) return Array.isArray(defaultInstances) && defaultInstances.length ? defaultInstances : [0];
  const instances = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));
  return instances.length ? instances : (defaultInstances?.length ? defaultInstances : [0]);
}

export function resolveKoishiAllowTsPlugins(): boolean {
  const raw = String(process.env.KOISHI_ALLOW_TS || '').trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function loadConfigFile(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') return YAML.parse(raw);
  return JSON.parse(raw);
}

function resolveModuleSpecifier(spec: string, baseDir: string): string {
  if (!spec) return spec;
  if (spec.startsWith('file://')) return spec;
  if (spec.startsWith('.') || spec.startsWith('/')) return path.resolve(baseDir, spec);
  return spec; // package name
}

function isTsFile(specifier: string): boolean {
  const s = specifier.startsWith('file://') ? specifier.slice('file://'.length) : specifier;
  return /\.ts$/i.test(s);
}

async function loadModule(specifier: string): Promise<any> {
  if (isTsFile(specifier) && !resolveKoishiAllowTsPlugins()) {
    throw new Error(`Refusing to load TypeScript plugin without KOISHI_ALLOW_TS=1: ${specifier}`);
  }
  if (specifier.startsWith('file://')) {
    const mod = await import(specifier);
    return mod?.default ?? mod;
  }
  if (specifier.startsWith('/') || specifier.startsWith('.')) {
    const url = pathToFileURL(specifier).href;
    const mod = await import(url);
    return mod?.default ?? mod;
  }
  const mod = await import(specifier);
  return mod?.default ?? mod;
}

export async function loadKoishiPluginSpecs(): Promise<KoishiPluginSpec[]> {
  const specs: KoishiPluginSpec[] = [];
  const allowTs = resolveKoishiAllowTsPlugins();

  const configPath = String(process.env.KOISHI_CONFIG_PATH || '').trim();
  if (configPath) {
    try {
      const abs = path.resolve(configPath);
      const baseDir = path.dirname(abs);
      const config = await loadConfigFile(abs);
      const plugins = Array.isArray(config?.plugins) ? config.plugins : [];

      for (const p of plugins) {
        const moduleRaw = typeof p?.module === 'string' ? p.module : '';
        const module = resolveModuleSpecifier(moduleRaw, baseDir);
        if (!module) continue;
        if (isTsFile(module) && !allowTs) {
          logger.warn({ module }, 'Skip .ts Koishi plugin (set KOISHI_ALLOW_TS=1 to enable)');
          continue;
        }
        const enabled = p?.enabled === false ? false : true;
        specs.push({
          module,
          enabled,
          config: p?.config,
          load: () => loadModule(module),
        });
      }
    } catch (error: any) {
      logger.error({ configPath, error }, 'Failed to load KOISHI_CONFIG_PATH');
    }
  }

  const pluginsDir = String(process.env.KOISHI_PLUGINS_DIR || '').trim();
  if (pluginsDir) {
    try {
      const absDir = path.resolve(pluginsDir);
      const entries = await fs.readdir(absDir, { withFileTypes: true });
      const files = entries
        .filter(e => e.isFile())
        .map(e => e.name)
        .filter(name => !name.startsWith('.'))
        .filter(name => /\.(mjs|cjs|js)$/i.test(name) || (allowTs && /\.ts$/i.test(name)))
        .sort((a, b) => a.localeCompare(b));

      for (const filename of files) {
        const modulePath = path.join(absDir, filename);
        specs.push({
          module: modulePath,
          enabled: true,
          load: () => loadModule(modulePath),
        });
      }
    } catch (error: any) {
      logger.error({ pluginsDir, error }, 'Failed to load KOISHI_PLUGINS_DIR');
    }
  }

  return specs;
}
