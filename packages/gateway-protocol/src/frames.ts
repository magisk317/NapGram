/**
 * Gateway 协议帧定义
 */

import type { GatewayError, GatewayErrorCode } from './errors.js';

export interface BaseFrame {
  op: string;
  v: number;
  t: number;
}

export interface HelloFrame extends BaseFrame {
  op: 'hello';
  data: {
    sessionId: string;
    heartbeatMs: number;
    server: { name: string; version: string };
    capabilities: string[];
    resume: { supported: boolean; bufferMs: number };
  };
}

export interface IdentifyFrame extends BaseFrame {
  op: 'identify';
  data: {
    token: string;
    scope: { instances: number[] };
    resume?: { sessionId: string; lastSeq: number };
  };
}

export interface ReadyFrame extends BaseFrame {
  op: 'ready';
  data: {
    user: { id: string; name: string };
    instances: Array<{
      id: number;
      name: string;
      pairs?: Array<{
        pairId: number;
        qq: { channelId: string; roomId: string; name?: string | null };
        tg: { channelId: string; chatId: string; threadId?: number | null; name?: string | null };
      }>;
    }>;
  };
}

export interface PingFrame extends BaseFrame {
  op: 'ping';
  data?: null;
}

export interface PongFrame extends BaseFrame {
  op: 'pong';
  data?: null;
}

export interface EventFrame extends BaseFrame {
  op: 'event';
  data: {
    seq: number;
    type: string;
    instanceId: number;
    [key: string]: any;
  };
}

export interface CallFrame extends BaseFrame {
  op: 'call';
  data: { id: string; instanceId?: number; action: string; params: any };
}

export interface ResultFrame extends BaseFrame {
  op: 'result';
  data: {
    id: string;
    success: boolean;
    result?: any;
    error?: GatewayError;
  };
}

export interface ErrorFrame extends BaseFrame {
  op: 'error';
  data: { code: GatewayErrorCode; message: string; fatal?: boolean };
}

export type Frame =
  | HelloFrame
  | IdentifyFrame
  | ReadyFrame
  | PingFrame
  | PongFrame
  | EventFrame
  | CallFrame
  | ResultFrame
  | ErrorFrame;

export function createHelloFrame(sessionId: string): HelloFrame {
  return {
    op: 'hello',
    v: 1,
    t: Date.now(),
    data: {
      sessionId,
      heartbeatMs: 30_000,
      server: { name: 'NapGram', version: '0.1.0' },
      capabilities: ['events', 'actions', 'media.ref'],
      resume: { supported: false, bufferMs: 0 },
    },
  };
}

export function createReadyFrame(
  userId: string,
  userName: string,
  instances: Array<{ id: number; name: string; pairs?: ReadyFrame['data']['instances'][number]['pairs'] }>,
): ReadyFrame {
  return {
    op: 'ready',
    v: 1,
    t: Date.now(),
    data: { user: { id: userId, name: userName }, instances },
  };
}

export function createErrorFrame(code: string, message: string, fatal = false): ErrorFrame {
  return {
    op: 'error',
    v: 1,
    t: Date.now(),
    data: { code, message, fatal },
  };
}

export function createPongFrame(): PongFrame {
  return { op: 'pong', v: 1, t: Date.now() };
}
