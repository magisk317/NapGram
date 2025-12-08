
import { FastifyInstance } from 'fastify';
import env from '../domain/models/env';
import fs from 'fs';
import path from 'path';

import { getMimeType } from '../shared/utils/mime';
import { ErrorResponses } from '../shared/utils/fastify';

export default async function (fastify: FastifyInstance) {
  if (env.UI_PROXY) {
    fastify.all('/ui/*', async (request: any, reply: any) => {
      const targetUrl = new URL(env.UI_PROXY!);
      const reqUrl = new URL(request.url, targetUrl);
      reqUrl.protocol = targetUrl.protocol;
      reqUrl.hostname = targetUrl.hostname;
      reqUrl.port = targetUrl.port;

      try {
        const fetchOptions: RequestInit = {
          method: request.method,
          headers: request.headers as any,
          body: request.body ? JSON.stringify(request.body) : undefined
        };

        // Remove host header to avoid conflicts
        if (fetchOptions.headers) {
          delete (fetchOptions.headers as any)['host'];
        }

        const response = await fetch(reqUrl.toString(), fetchOptions);

        reply.code(response.status);

        // Copy headers
        response.headers.forEach((value, key) => {
          reply.header(key, value);
        });

        // Return body as stream
        return Buffer.from(await response.arrayBuffer());
      } catch (err) {
        request.log.error('Proxy error', err);
        return reply.code(502).send({ error: 'Bad Gateway' });
      }
    });

  } else if (env.UI_PATH) {
    // Serve assets
    const assetsPath = path.join(env.UI_PATH, 'assets');
    if (fs.existsSync(assetsPath)) {
      const assets = fs.readdirSync(assetsPath);
      for (const asset of assets) {
        fastify.get('/ui/assets/' + asset, async (req: any, reply: any) => {
          reply.header('content-type', getMimeType(asset));
          return fs.createReadStream(path.join(assetsPath, asset));
        });
      }
    }

    // Serve vite.svg
    fastify.get('/vite.svg', async (req: any, reply: any) => {
      const possiblePaths = [
        path.join(env.UI_PATH!, 'vite.svg'),
        path.join(env.UI_PATH!, 'public', 'vite.svg'),
        path.join(env.UI_PATH!, 'assets', 'vite.svg')
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          reply.header('content-type', 'image/svg+xml');
          return fs.createReadStream(p);
        }
      }
      return ErrorResponses.notFound(reply);
    });

    // Fallback for SPA
    fastify.get('/ui/*', async (req: any, reply: any) => {
      reply.header('content-type', 'text/html');
      return fs.createReadStream(path.join(env.UI_PATH!, 'index.html'));
    });
  }
}
