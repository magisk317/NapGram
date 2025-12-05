import { Elysia } from 'elysia';
import env from '../../domain/models/env';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

let app = new Elysia();

if (env.UI_PROXY) {
  app = app.mount('/ui/', (req) => {
    const url = new URL(req.url);
    const baseUrl = new URL(env.UI_PROXY);
    url.hostname = baseUrl.hostname;
    url.port = baseUrl.port;
    url.protocol = baseUrl.protocol;
    url.pathname = '/ui' + url.pathname;
    return fetch(url.toString(), req);
  });
}
else if (env.UI_PATH) {
  for (const asset of fs.readdirSync(path.join(env.UI_PATH, 'assets'))) {
    app = app.get('/ui/assets/' + asset, ({ set }) => {
      set.headers['content-type'] = mime.lookup(asset) || undefined;
      return fs.createReadStream(path.join(env.UI_PATH, 'assets', asset));
    });
    app = app.get('/ui/assets/' + asset, ({ set }) => {
      set.headers['content-type'] = mime.lookup(asset) || undefined;
      return fs.createReadStream(path.join(env.UI_PATH, 'assets', asset));
    });
  }

  // Serve vite.svg from root or assets if exists to suppress errors
  app = app.get('/vite.svg', ({ set }) => {
    const possiblePaths = [
      path.join(env.UI_PATH, 'vite.svg'),
      path.join(env.UI_PATH, 'public', 'vite.svg'),
      path.join(env.UI_PATH, 'assets', 'vite.svg')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        set.headers['content-type'] = 'image/svg+xml';
        return fs.createReadStream(p);
      }
    }
    return new Response(null, { status: 404 });
  });

  // @ts-expect-error - Elysia type inference limitation with dynamic route building
  app = app.get('/ui/*', ({ set }) => {
    set.headers['content-type'] = 'text/html';
    return fs.createReadStream(path.join(env.UI_PATH, 'index.html'));
  });
}

export default app;
