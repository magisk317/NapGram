import type { FastifyInstance } from 'fastify'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import {
  ApiResponse,
  env,
  getLogger,
} from '@napgram/infra-kit'
import {
  getPluginVersions,
  installFromMarketplace,
  normalizeModuleSpecifierForPluginsConfig,
  patchPluginConfig,
  PluginRuntime,
  readPluginsConfig,
  removePluginConfig,
  rollbackPlugin,
  uninstallPlugin,
  upgradePlugin,
  upsertPluginConfig,
} from '@napgram/plugin-kit'
const logger = getLogger('PluginAdmin')

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  }
  catch {
    return false
  }
}

function resolvePluginRootFromModule(modulePath: string): string {
  const dir = path.dirname(modulePath)
  return path.basename(dir) === 'dist' ? path.dirname(dir) : dir
}

async function readPackageMeta(rootDir: string): Promise<{ name?: string, description?: string, homepage?: string } | null> {
  const pkgPath = path.join(rootDir, 'package.json')
  if (!await pathExists(pkgPath))
    return null
  try {
    const raw = await fs.readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    return {
      name: typeof pkg?.name === 'string' ? pkg.name : undefined,
      description: typeof pkg?.description === 'string' ? pkg.description : undefined,
      homepage: typeof pkg?.homepage === 'string' ? pkg.homepage : undefined,
    }
  }
  catch {
    return null
  }
}

async function loadPluginDefaultConfig(rootDir: string): Promise<any | null> {
  const candidates = [
    path.join(rootDir, 'dist', 'config.js'),
    path.join(rootDir, 'dist', 'config.mjs'),
    path.join(rootDir, 'config.js'),
    path.join(rootDir, 'config.mjs'),
    path.join(rootDir, 'config.json'),
  ]

  for (const candidate of candidates) {
    if (!await pathExists(candidate))
      continue
    try {
      if (candidate.endsWith('.json')) {
        const raw = await fs.readFile(candidate, 'utf8')
        return JSON.parse(raw)
      }
      const mod = await import(pathToFileURL(candidate).href)
      if (mod?.defaultConfig)
        return mod.defaultConfig
      if (mod?.default)
        return mod.default
    }
    catch (error) {
      logger.warn({ error, candidate }, 'Failed to load plugin default config')
    }
  }

  return null
}

function logPluginAdminHit(request: any, meta?: Record<string, any>) {
  logger.info({
    method: request.method,
    url: request.url,
    ip: request.ip,
    ...(meta || {}),
  }, 'Plugin admin request hit')
}

/**
 * Plugin Admin API
 */
export default async function (fastify: FastifyInstance) {
  async function requirePluginAdmin(request: any, reply: any) {
    const header = String(request.headers?.authorization || '')
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    const cookieToken = request.cookies?.admin_token ? String(request.cookies.admin_token) : ''
    const queryToken = request.query && typeof request.query === 'object' && 'token' in request.query ? String(request.query.token) : ''
    const token = bearer || cookieToken || queryToken

    const direct = String(process.env.PLUGIN_ADMIN_TOKEN || '').trim()
    if (direct && token && token === direct)
      return

    const { authMiddleware } = await import('@napgram/auth-kit')
    await authMiddleware(request, reply)
  }

  const reloadSchema = z.object({
    instances: z.array(z.number().int()).optional(),
  })

  fastify.post('/api/admin/plugins/reload', { preHandler: requirePluginAdmin }, async (request, reply) => {
    try {
      const body = reloadSchema.safeParse(request.body ?? {})
      if (!body.success) {
        return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
      }
      const result = await PluginRuntime.reload({ defaultInstances: body.data.instances })
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.post('/api/admin/plugins/:id/reload', { preHandler: requirePluginAdmin }, async (request, reply) => {
    try {
      const pluginId = String((request.params as any).id || '').trim()
      if (!pluginId)
        return reply.code(400).send(ApiResponse.error('Missing plugin id'))
      const result = await PluginRuntime.reloadPlugin(pluginId)
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.get('/api/admin/plugins/policy', { preHandler: requirePluginAdmin }, async () => {
    const readBool = (...keys: string[]) => {
      for (const key of keys) {
        const raw = String((process.env as any)[key] || '').trim()
        if (!raw)
          continue
        const v = raw.toLowerCase()
        return { key, value: v === '1' || v === 'true' || v === 'yes' || v === 'on' }
      }
      return { key: null as string | null, value: false }
    }

    const readString = (...keys: string[]) => {
      for (const key of keys) {
        const raw = String((process.env as any)[key] || '').trim()
        if (raw)
          return { key, value: raw }
      }
      return { key: null as string | null, value: '' }
    }

    const allowNetwork = readBool('PLUGIN_ALLOW_NETWORK')
    const allowFs = readBool('PLUGIN_ALLOW_FS')
    const allowNpmInstall = readBool('PLUGIN_ALLOW_NPM_INSTALL')
    const allowInstallScripts = readBool('PLUGIN_ALLOW_INSTALL_SCRIPTS')

    const allowlistRaw = readString('PLUGIN_NETWORK_ALLOWLIST')
    const allowlist = allowlistRaw.value
      ? allowlistRaw.value.split(',').map(s => s.trim()).filter(Boolean)
      : []

    const registry = readString('PLUGIN_NPM_REGISTRY')

    return ApiResponse.success({
      allowNetwork: allowNetwork.value,
      allowFs: allowFs.value,
      allowNpmInstall: allowNpmInstall.value,
      allowInstallScripts: allowInstallScripts.value,
      networkAllowlist: allowlist,
      npmRegistry: registry.value || null,
      sources: {
        allowNetwork: allowNetwork.key,
        allowFs: allowFs.key,
        allowNpmInstall: allowNpmInstall.key,
        allowInstallScripts: allowInstallScripts.key,
        networkAllowlist: allowlistRaw.key,
        npmRegistry: registry.key,
      },
    })
  })

  fastify.get('/api/admin/plugins/status', { preHandler: requirePluginAdmin }, async () => {
    const report = PluginRuntime.getLastReport()
    // Avoid circular structures (plugin context can include DB schema objects)
    const safeReport = {
      enabled: report.enabled,
      loaded: report.loaded,
      failed: report.failed,
      stats: report.stats,
      loadedPlugins: (report.loadedPlugins || []).map((p: any) => ({
        id: p.id,
        plugin: p.plugin,
      })),
    }
    return ApiResponse.success(safeReport)
  })

  const pluginCreateSchema = z.object({
    id: z.string().min(1).max(64).optional(),
    module: z.string().min(1),
    enabled: z.boolean().optional(),
    config: z.any().optional(),
    source: z.any().optional(),
    reload: z.boolean().optional(),
  })

  const pluginPatchSchema = z.object({
    module: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    config: z.any().optional(),
    source: z.any().optional(),
    reload: z.boolean().optional(),
  })

  async function moduleExistsAbsolute(moduleRaw: string): Promise<boolean> {
    const raw = String(moduleRaw || '').trim()
    if (!raw)
      return false
    if (raw.startsWith('file://'))
      return true
    if (!raw.startsWith('/') && !raw.startsWith('.'))
      return true
    try {
      const abs = raw.startsWith('.') ? path.resolve(path.dirname((await readPluginsConfig()).path), raw) : raw
      await fs.access(abs)
      return true
    }
    catch {
      return false
    }
  }

  fastify.get('/api/admin/plugins', { preHandler: requirePluginAdmin }, async () => {
    const { path: configPath, config, exists } = await readPluginsConfig()
    const report = PluginRuntime.getLastReport()
    const failed = new Map(report.failed.map((f: any) => [f.id, f.error] as const))
    const loaded = new Set(report.loaded)
    const runtime = PluginRuntime
    const runtimeActive = runtime.isActive()

    const plugins = await Promise.all(config.plugins.map(async (p: any) => {
      let absolute: string | null = null
      try {
        absolute = (await normalizeModuleSpecifierForPluginsConfig(p.module)).absolute
      }
      catch {
        absolute = null
      }
      const rootDir = absolute ? resolvePluginRootFromModule(absolute) : null
      const runtimePlugin = runtimeActive ? runtime.getPlugin(p.id) : undefined
      const runtimeMeta = runtimePlugin?.plugin
      const pkgMeta = rootDir ? await readPackageMeta(rootDir) : null
      const defaultConfig = runtimeMeta?.defaultConfig
        ?? ((p.config == null && rootDir) ? await loadPluginDefaultConfig(rootDir) : null)
      const description = runtimeMeta?.description || pkgMeta?.description
      const name = runtimeMeta?.name || pkgMeta?.name
      const homepage = runtimeMeta?.homepage || pkgMeta?.homepage

      return {
        ...p,
        absolute,
        exists: await moduleExistsAbsolute(absolute || p.module),
        loaded: loaded.has(p.id),
        error: failed.get(p.id) || null,
        name,
        description,
        homepage,
        defaultConfig,
      }
    }))

    return ApiResponse.success({ configPath, exists, plugins })
  })

  fastify.post('/api/admin/plugins', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const body = pluginCreateSchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      const result = await upsertPluginConfig({
        id: body.data.id,
        module: body.data.module,
        enabled: body.data.enabled,
        config: body.data.config,
        source: body.data.source,
      })
      if (body.data.reload)
        await PluginRuntime.reload()
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.patch('/api/admin/plugins/:id', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const body = pluginPatchSchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      const result = await patchPluginConfig(String((request.params as any).id), body.data)
      await PluginRuntime.reload()
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.delete('/api/admin/plugins/:id', { preHandler: requirePluginAdmin }, async (request, reply) => {
    try {
      const result = await removePluginConfig(String((request.params as any).id))
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  const installSchema = z.object({
    marketplaceId: z.string().min(1),
    pluginId: z.string().min(1),
    version: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    config: z.any().optional(),
    reload: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
  })

  fastify.post('/api/admin/plugins/install', { preHandler: requirePluginAdmin }, async (request, reply) => {
    logPluginAdminHit(request)
    const body = installSchema.safeParse(request.body ?? {})
    if (!body.success) {
      logger.warn({ issues: body.error.issues }, 'Plugin install request validation failed')
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      logger.info({
        marketplaceId: body.data.marketplaceId,
        pluginId: body.data.pluginId,
        version: body.data.version || 'latest',
        dryRun: body.data.dryRun === true,
      }, 'Plugin install requested')
      const result = await installFromMarketplace(body.data)
      logger.info({ pluginId: result.id, version: result.version }, 'Plugin install completed')
      if (body.data.reload && !body.data.dryRun)
        await PluginRuntime.reload()
      return ApiResponse.success(result)
    }
    catch (error: any) {
      logger.error({ error: error?.message || String(error), stack: error?.stack, data: body.data }, 'Plugin install failed')
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  const upgradeSchema = z.object({
    marketplaceId: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    reload: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
  })

  fastify.post('/api/admin/plugins/:id/upgrade', { preHandler: requirePluginAdmin }, async (request, reply) => {
    logPluginAdminHit(request, { pluginId: String((request.params as any).id || '').trim() })
    const body = upgradeSchema.safeParse(request.body ?? {})
    if (!body.success) {
      logger.warn({ issues: body.error.issues }, 'Plugin upgrade request validation failed')
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      logger.info({
        pluginId: String((request.params as any).id || '').trim(),
        marketplaceId: body.data.marketplaceId || '',
        version: body.data.version || 'latest',
        dryRun: body.data.dryRun === true,
      }, 'Plugin upgrade requested')
      const result = await upgradePlugin(String((request.params as any).id), body.data)
      logger.info({ pluginId: result.id, version: result.version }, 'Plugin upgrade completed')
      if (body.data.reload && !body.data.dryRun)
        await PluginRuntime.reload()
      return ApiResponse.success(result)
    }
    catch (error: any) {
      logger.error({ error: error?.message || String(error) }, 'Plugin upgrade failed')
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  const rollbackSchema = z.object({
    version: z.string().min(1).optional(),
    reload: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
  })

  fastify.post('/api/admin/plugins/:id/rollback', { preHandler: requirePluginAdmin }, async (request, reply) => {
    logPluginAdminHit(request, { pluginId: String((request.params as any).id || '').trim() })
    const body = rollbackSchema.safeParse(request.body ?? {})
    if (!body.success) {
      logger.warn({ issues: body.error.issues }, 'Plugin rollback request validation failed')
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      const result = await rollbackPlugin(String((request.params as any).id), body.data)
      if (body.data.reload && !body.data.dryRun)
        await PluginRuntime.reload()
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  const uninstallSchema = z.object({
    removeFiles: z.boolean().optional().default(false),
    reload: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
  })

  fastify.post('/api/admin/plugins/:id/uninstall', { preHandler: requirePluginAdmin }, async (request, reply) => {
    logPluginAdminHit(request, { pluginId: String((request.params as any).id || '').trim() })
    const body = uninstallSchema.safeParse(request.body ?? {})
    if (!body.success) {
      logger.warn({ issues: body.error.issues }, 'Plugin uninstall request validation failed')
      return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
    }
    try {
      const result = await uninstallPlugin(String((request.params as any).id), body.data)
      if (body.data.reload && !body.data.dryRun)
        await PluginRuntime.reload()
      return ApiResponse.success(result)
    }
    catch (error: any) {
      logger.error({ error: error?.message || String(error), stack: error?.stack, pluginId: String((request.params as any).id) }, 'Plugin uninstall failed')
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.get('/api/admin/plugins/:id/versions', { preHandler: requirePluginAdmin }, async (request, reply) => {
    try {
      const result = await getPluginVersions(String((request.params as any).id))
      return ApiResponse.success(result)
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })

  fastify.get('/api/admin/plugins/:id/logs', { preHandler: requirePluginAdmin }, async (request, reply) => {
    const { limit = 200, level, q } = request.query as { limit?: number, level?: string, q?: string }
    const pluginId = String((request.params as any).id || '').trim()
    if (!pluginId)
      return reply.code(400).send(ApiResponse.error('Missing plugin id'))

    try {
      const { config } = await readPluginsConfig()
      const record = config.plugins.find((p: any) => p.id === pluginId)
      let absolute: string | null = null
      if (record) {
        try {
          absolute = (await normalizeModuleSpecifierForPluginsConfig(record.module)).absolute
        }
        catch {
          absolute = null
        }
      }

      const patterns = [
        pluginId,
        record?.module,
        absolute,
        absolute ? path.basename(absolute) : null,
      ].filter(Boolean).map(String)

      const logDir = path.dirname(env.LOG_FILE)
      const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: process.env.TZ || 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const currentDate = dateFormatter.format(new Date())
      const todayLogFile = path.join(logDir, `${currentDate}.1.log`)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = dateFormatter.format(yesterday)
      const yesterdayLogFile = path.join(logDir, `${yesterdayDate}.1.log`)

      const possibleFiles = [todayLogFile, yesterdayLogFile, env.LOG_FILE].filter(Boolean)

      const max = Math.min(Math.max(Number(limit) || 200, 1), 2000)
      const out: Array<{ time: string, level: string, module: string, message: string }> = []
      for (const logFile of possibleFiles) {
        try {
          const content = await fs.readFile(logFile, 'utf-8')
          const lines = content.split('\n').filter(line => line.trim())
          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              out.push({
                time: entry.time,
                level: entry.level?.toUpperCase() || 'INFO',
                module: entry.logger || 'System',
                message: Array.isArray(entry.messages) ? entry.messages.join(' ') : String(entry.messages || ''),
              })
            }
            catch {
              // ignore
            }
          }
          if (out.length >= max * 4)
            break
        }
        catch {
          continue
        }
      }

      let filtered = out
      if (level)
        filtered = filtered.filter(l => l.level.toLowerCase() === String(level).toLowerCase())

      const extra = String(q || '').trim()
      filtered = filtered.filter((l) => {
        const hay = `${l.module} ${l.message}`
        const matchPlugin = patterns.length ? patterns.some(p => hay.includes(p)) : true
        const matchExtra = extra ? hay.includes(extra) : true
        return matchPlugin && matchExtra
      })

      filtered.sort((a, b) => b.time.localeCompare(a.time))
      const logs = filtered.slice(0, max)

      return ApiResponse.success({ id: pluginId, patterns, logs, total: logs.length, source: possibleFiles[0] })
    }
    catch (error: any) {
      return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
    }
  })
}
