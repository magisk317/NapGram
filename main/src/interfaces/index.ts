import Fastify from 'fastify';
import { getLogger } from '../shared/logger';
import env from '../domain/models/env';
import telegramAvatar from './telegramAvatar';
import richHeader from './richHeader';
import tempFile from './tempFile';
import ui from './ui';
import qqAvatar from './qqAvatar';
import messages from './messages';

const log = getLogger('Web Api');

const fastify = Fastify({
  logger: false // We use our own logger
});

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
