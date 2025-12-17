# @naplink/napgram-gateway-sdk

NapGram Gateway 的聚合 SDK 包。

面向插件作者的默认入口：安装一个包即可获得 client + protocol 的全部导出。

## 安装

```bash
pnpm add @naplink/napgram-gateway-sdk
```

## 用法

```ts
import { NapGramGatewayClient } from '@naplink/napgram-gateway-sdk';
import type { MessageCreatedEvent, Segment } from '@naplink/napgram-gateway-sdk';
```

## 依赖关系

- `@naplink/napgram-gateway-client`
- `@naplink/napgram-gateway-protocol`

