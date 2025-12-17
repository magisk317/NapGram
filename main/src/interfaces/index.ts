import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { getLogger } from '../shared/logger';
import env from '../domain/models/env';
import telegramAvatar from './telegramAvatar';
import richHeader from './richHeader';
import tempFile from './tempFile';
import ui from './ui';
import qqAvatar from './qqAvatar';
import messages from './messages';
import auth from './auth';
import pairs from './pairs';
import instances from './instances';
import statistics from './statistics';
import { setupMonitoring } from './monitoring';
import logs from './logs';
import settings from './settings';
import tokens from './tokens';
import koishi from './koishi';
import koishiMarketplaces from './koishiMarketplaces';

const log = getLogger('Web Api');

const fastify = Fastify({
  logger: false // We use our own logger
});

// Register cookie support
fastify.register(cookie);

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  const msg = (error as any).message || String(error);
  log.error(request.method, request.url, msg);
  log.debug(error);
  reply.status(500).send({ message: msg });
});

fastify.get('/', async () => {
  return { hello: 'NapGram (Fastify)' };
});

// Register routes
fastify.register(telegramAvatar);
fastify.register(qqAvatar);
fastify.register(richHeader);
fastify.register(tempFile);
fastify.register(messages);
fastify.register(ui);
fastify.register(auth);
fastify.register(pairs);
fastify.register(instances);
fastify.register(statistics);
fastify.register(logs);
fastify.register(settings);
fastify.register(tokens);
fastify.register(koishi);
fastify.register(koishiMarketplaces);

// 📊 Register monitoring and statistics API
setupMonitoring(fastify);

export default {
  async startListening() {
    try {
      await fastify.listen({
        port: Number(env.LISTEN_PORT),
        host: '0.0.0.0',
      });
      log.info('Listening on', env.LISTEN_PORT);
    } catch (err) {
      log.error('Failed to start web server:', err);
      process.exit(1);
    }
  },
};

export type App = typeof fastify;
