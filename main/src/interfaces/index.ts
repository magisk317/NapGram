import process from 'node:process'
import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import env from '../domain/models/env'
import { getLogger } from '../shared/logger'
import auth from './auth'
import database from './database'
import instances from './instances'
import logs from './logs'
import marketplaces from './marketplaces'
import messages from './messages'
import { setupMonitoring } from './monitoring'
import pairs from './pairs'
import plugins from './plugins'
import qqAvatar from './qqAvatar'
import richHeader from './richHeader'
import settings from './settings'
import statistics from './statistics'
import telegramAvatar from './telegramAvatar'
import tempFile from './tempFile'
import tokens from './tokens'
import ui from './ui'

const log = getLogger('Web Api')

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

// Register routes
fastify.register(telegramAvatar)
fastify.register(qqAvatar)
fastify.register(richHeader)
fastify.register(tempFile)
fastify.register(messages)
fastify.register(ui)
fastify.register(auth)
fastify.register(pairs)
fastify.register(instances)
fastify.register(statistics)
fastify.register(logs)
fastify.register(settings)
fastify.register(tokens)
fastify.register(plugins)
fastify.register(marketplaces)
fastify.register(database)

// 📊 Register monitoring and statistics API
setupMonitoring(fastify)

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
