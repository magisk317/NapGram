import process from 'node:process'
import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import env from '../domain/models/env'
import { getLogger } from '../shared/logger'

const log = getLogger('Web Api')
const registeredWebPlugins = new Set<string>()

const fastify = Fastify({
  logger: false, // We use our own logger
})

// Register cookie support
fastify.register(cookie)

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  const msg = (error as any).message || String(error)
  log.error(request.method, request.url, msg)
  log.debug(error)
  reply.status(500).send({ message: msg })
})

fastify.get('/', async () => {
  return { hello: 'NapGram (Fastify)' }
})

// Routes are registered by plugins via registerWebRoutes.

export function registerWebRoutes(register: (app: App) => void, pluginId?: string) {
  if (pluginId) {
    if (registeredWebPlugins.has(pluginId)) {
      log.warn(`Web routes already registered for plugin: ${pluginId}`)
      return
    }
    registeredWebPlugins.add(pluginId)
  }
  register(fastify)
}

export function getWebApi() {
  return {
    registerRoutes: registerWebRoutes,
  }
}

export default {
  async startListening() {
    try {
      await fastify.listen({
        port: Number(env.LISTEN_PORT),
        host: '0.0.0.0',
      })
      log.info('Listening on', env.LISTEN_PORT)
    }
    catch (err) {
      log.error('Failed to start web server:', err)
      process.exit(1)
    }
  },
}

export type App = typeof fastify
