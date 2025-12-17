# @naplink/napgram-gateway-client

NapGram Gateway 的 Node.js 客户端（WebSocket）。

该包实现了与 NapGram Gateway 的连接、认证、心跳、RPC 调用，并复用 `@naplink/napgram-gateway-protocol` 的类型。

## 安装

```bash
pnpm add @naplink/napgram-gateway-client
```

## 快速开始

```ts
import { NapGramGatewayClient } from '@naplink/napgram-gateway-client';

const client = new NapGramGatewayClient({
  endpoint: 'ws://127.0.0.1:8765/',
  token: process.env.ADMIN_TOKEN!,
  instances: [0],
});

client.on('ready', (ready) => {
  console.log('ready:', ready.user);
});

client.on('message.created', async (event) => {
  const text = event.message.segments
    .filter(s => s.type === 'text')
    .map(s => String(s.data?.text ?? ''))
    .join('');

  if (text.trim() === 'ping') {
    await client.sendMessage({
      instanceId: event.instanceId,
      channelId: event.channelId,
      segments: [{ type: 'text', data: { text: 'pong' } }],
    });
  }
});

await client.connect();
```

