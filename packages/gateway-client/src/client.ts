import WebSocket, { type RawData } from 'ws';
import {
  type MessageCreatedEvent,
  type MessageSendResult,
  type ReadyFrame,
  type Segment,
  type Frame,
} from '@naplink/napgram-gateway-protocol';

export interface ClientOptions {
  endpoint: string;
  token: string;
  instances: number[];
  name?: string;
  adapterVersion?: string;
  heartbeatMs?: number;
  reconnect?: boolean;
  reconnectDelayMs?: number;
}

export type ReadyPayload = ReadyFrame['data'];

export type ClientEvents = {
  ready: (payload: ReadyPayload) => void;
  'message.created': (event: MessageCreatedEvent) => void;
  error: (error: any) => void;
  close: (info: { code: number; reason: string }) => void;
};

type Listener<K extends keyof ClientEvents> = ClientEvents[K];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class NapGramGatewayClient {
  private ws?: WebSocket;
  private heartbeat?: NodeJS.Timeout;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }>();
  private listeners: { [K in keyof ClientEvents]: Array<Listener<K>> } = {
    ready: [],
    'message.created': [],
    error: [],
    close: [],
  };
  private connecting?: Promise<void>;
  private closed = false;

  constructor(private readonly options: ClientOptions) { }

  on<K extends keyof ClientEvents>(event: K, listener: Listener<K>) {
    this.listeners[event].push(listener);
  }

  private emit<K extends keyof ClientEvents>(event: K, payload: Parameters<Listener<K>>[0]) {
    for (const listener of this.listeners[event]) {
      try {
        listener(payload as any);
      } catch {
        // ignore listener errors
      }
    }
  }

  async connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.closed = false;
    this.connecting = this.connectLoop().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = undefined;
    if (!ws) return;
    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  private async connectLoop(): Promise<void> {
    const reconnect = this.options.reconnect !== false;
    const delay = Number(this.options.reconnectDelayMs ?? 2_000);
    for (;;) {
      try {
        await this.connectOnce();
        return;
      } catch (error) {
        this.emit('error', error);
        if (!reconnect || this.closed) throw error;
        await sleep(delay);
      }
    }
  }

  private async connectOnce(): Promise<void> {
    await this.disconnect();
    if (this.closed) throw new Error('Client closed');

    const ws = new WebSocket(this.options.endpoint);
    this.ws = ws;

    ws.on('message', (data: RawData) => this.onMessage(typeof data === 'string' ? data : String(data)));
    ws.on('close', (code: number, reason: Buffer) => {
      this.stopHeartbeat();
      this.emit('close', { code, reason: String(reason || '') });
      for (const [id, p] of this.pending.entries()) {
        clearTimeout(p.timer);
        p.reject(new Error(`Gateway disconnected (pending ${id})`));
      }
      this.pending.clear();
      if (!this.closed && this.options.reconnect !== false) {
        // fire-and-forget reconnect loop
        this.connect().catch(() => {});
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err: Error) => reject(err));
    });
  }

  private onMessage(raw: string) {
    let frame: Frame;
    try {
      frame = JSON.parse(raw) as Frame;
    } catch {
      return;
    }

    if (frame.op === 'hello') {
      const identify: Frame = {
        op: 'identify',
        v: 1,
        t: Date.now(),
        data: {
          token: this.options.token,
          scope: { instances: this.options.instances },
        },
      };
      this.sendFrame(identify);
      return;
    }

    if (frame.op === 'ready') {
      this.emit('ready', frame.data);
      this.startHeartbeat();
      return;
    }

    if (frame.op === 'event') {
      if (frame.data?.type === 'message.created') {
        this.emit('message.created', frame.data as MessageCreatedEvent);
      }
      return;
    }

    if (frame.op === 'result') {
      const id = frame.data?.id;
      const p = id ? this.pending.get(String(id)) : undefined;
      if (!p) return;
      this.pending.delete(String(id));
      clearTimeout(p.timer);
      if (frame.data?.success) p.resolve(frame.data?.result);
      else p.reject(frame.data?.error || new Error('Gateway call failed'));
      return;
    }

    if (frame.op === 'error') {
      this.emit('error', frame.data);
    }
  }

  private startHeartbeat() {
    if (this.heartbeat) return;
    const ms = Number(this.options.heartbeatMs ?? 25_000);
    this.heartbeat = setInterval(() => {
      try {
        this.sendFrame({ op: 'ping', v: 1, t: Date.now(), data: null } as Frame);
      } catch {
        // ignore
      }
    }, ms);
  }

  private stopHeartbeat() {
    if (!this.heartbeat) return;
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private sendFrame(frame: Frame) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not connected');
    ws.send(JSON.stringify(frame));
  }

  async call<T = any>(action: string, params: any, instanceId?: number): Promise<T> {
    const id = `call-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const frame: Frame = { op: 'call', v: 1, t: Date.now(), data: { id, instanceId, action, params } };
    this.sendFrame(frame);
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway call timeout: ${action}`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  async sendMessage(input: { instanceId: number; channelId: string; segments: Segment[] }): Promise<MessageSendResult> {
    return await this.call<MessageSendResult>(
      'message.send',
      { channelId: input.channelId, segments: input.segments },
      input.instanceId,
    );
  }
}
