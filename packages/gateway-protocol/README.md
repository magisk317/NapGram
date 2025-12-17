# @naplink/napgram-gateway-protocol

NapGram Gateway 的协议契约（TypeScript types）。

该包仅包含协议结构定义：frames / events / actions，可被服务端、插件、工具链共同复用。

## 安装

```bash
pnpm add @naplink/napgram-gateway-protocol
```

## 用法

```ts
import type { Frame, MessageCreatedEvent, Segment } from '@naplink/napgram-gateway-protocol';
import { extractPlainText, makeAt, makeReply, makeText } from '@naplink/napgram-gateway-protocol';
```

## 包含内容

- `frames`：`hello/identify/ready/ping/pong/event/call/result/error`
- `events`：`message.created`（MVP）
- `actions`：`message.send`（MVP）
- `segments`：常用 segment 构造与文本提取
- `errors`：错误码与错误结构
