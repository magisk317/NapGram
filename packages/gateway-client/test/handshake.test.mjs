import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';

import { NapGramGatewayClient } from '../dist/index.js';

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function waitFor(predicate, { timeoutMs = 1000, intervalMs = 5 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        const value = predicate();
        if (value) {
          clearInterval(timer);
          resolve(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error('timeout'));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, intervalMs);
  });
}

test('handshake + event + call(message.send)', async (t) => {
  const received = {
    identify: null,
    pings: 0,
    calls: [],
  };

  const wss = new WebSocketServer({ port: 0 });
  t.after(async () => {
    for (const ws of wss.clients) {
      try { ws.terminate(); } catch {}
    }
    await new Promise((resolve) => wss.close(resolve));
  });

  const port = await waitFor(() => wss.address()?.port, { timeoutMs: 500 });

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        op: 'hello',
        v: 1,
        t: Date.now(),
        data: {
          sessionId: 's1',
          heartbeatMs: 20,
          server: { name: 'NapGram', version: 'test' },
          capabilities: ['events', 'actions'],
          resume: { supported: false, bufferMs: 0 },
        },
      }),
    );

    socket.on('message', (data) => {
      const raw = typeof data === 'string' ? data : String(data);
      const frame = JSON.parse(raw);

      if (frame.op === 'identify') {
        received.identify = frame;
        socket.send(
          JSON.stringify({
            op: 'ready',
            v: 1,
            t: Date.now(),
            data: {
              user: { id: 'admin', name: 'Administrator' },
              instances: [{ id: 0, name: 'Instance-0' }],
            },
          }),
        );
        socket.send(
          JSON.stringify({
            op: 'event',
            v: 1,
            t: Date.now(),
            data: {
              seq: 1,
              type: 'message.created',
              instanceId: 0,
              channelId: 'tg:c:-1001',
              threadId: 123,
              actor: { userId: 'u1', name: 'User' },
              message: {
                messageId: 'tg:m:-1001:1',
                platform: 'tg',
                threadId: 123,
                native: { test: true },
                segments: [{ type: 'text', data: { text: 'ping' } }],
                timestamp: Date.now(),
              },
            },
          }),
        );
        return;
      }

      if (frame.op === 'ping') {
        received.pings += 1;
        socket.send(JSON.stringify({ op: 'pong', v: 1, t: Date.now(), data: null }));
        return;
      }

      if (frame.op === 'call') {
        received.calls.push(frame);
        socket.send(
          JSON.stringify({
            op: 'result',
            v: 1,
            t: Date.now(),
            data: {
              id: frame.data.id,
              success: true,
              result: { messageId: 'tg:m:-1001:2', platform: 'tg', timestamp: Date.now() },
            },
          }),
        );
      }
    });
  });

  const client = new NapGramGatewayClient({
    endpoint: `ws://127.0.0.1:${port}/`,
    token: 'token-1',
    instances: [0],
    heartbeatMs: 20,
    reconnect: false,
  });
  t.after(async () => {
    await client.close();
  });

  const readyPromise = new Promise((resolve) => client.on('ready', resolve));
  const eventPromise = new Promise((resolve) => client.on('message.created', resolve));

  await client.connect();

  const ready = await withTimeout(readyPromise, 500, 'ready not received');
  assert.equal(ready.user.id, 'admin');

  const evt = await withTimeout(eventPromise, 500, 'message.created not received');
  assert.equal(evt.type, 'message.created');
  assert.equal(evt.channelId, 'tg:c:-1001');

  const result = await client.sendMessage({
    instanceId: 0,
    channelId: 'tg:c:-1001',
    segments: [{ type: 'text', data: { text: 'pong' } }],
  });
  assert.equal(result.platform, 'tg');

  await waitFor(() => received.pings > 0, { timeoutMs: 500 });
  assert.ok(received.identify, 'identify received');
  assert.ok(received.calls.length >= 1, 'call received');
});
