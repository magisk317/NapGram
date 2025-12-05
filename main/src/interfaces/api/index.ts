import { getLogger } from '../../shared/logger';
import env from '../../domain/models/env';
import telegramAvatar from './telegramAvatar';
import richHeader from './richHeader';
import tempFile from './tempFile';
import '@bogeychan/elysia-polyfills/node/index.js';
import { Elysia } from 'elysia';
import ui from './ui';
import qqAvatar from './qqAvatar';

import messages from './messages';

const log = getLogger('Web Api');
let app = new Elysia()
  .onError(({ request, error, code }) => {
    const msg = (error as any)?.message || String(error);
    log.error(request.method, request.url, msg);
    log.debug(error);
    return { message: msg };
  })
  .get('/', () => {
    return { hello: 'NapGram' };
  })
  .use(telegramAvatar)
  .use(qqAvatar) // Register the new endpoint
  .use(richHeader)
  .use(tempFile)
  .use(messages)
  .use(ui);

export default {
  startListening() {
    app.listen({
      port: Number(env.LISTEN_PORT),
      hostname: '0.0.0.0',
    });
    log.info('Listening on', env.LISTEN_PORT);
  },
};

export type App = typeof app;
