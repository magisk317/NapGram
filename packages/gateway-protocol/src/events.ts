/**
 * Gateway 事件类型定义（MVP）
 */

export type Platform = 'qq' | 'tg';

export type ChannelId = string;

export interface Segment {
  type: SegmentType;
  data: SegmentData;
}

export type SegmentType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'at' | 'reply' | 'forward' | 'raw';

export type SegmentData =
  | { text: string }
  | { url: string; filename?: string; mime?: string }
  | { userId: string; name?: string }
  | { messageId: string }
  | { items: Array<{ segments: Segment[] }> }
  | { [key: string]: unknown };

export interface MessageCreatedEvent {
  seq: number;
  type: 'message.created';
  instanceId: number;
  channelId: ChannelId;
  threadId?: number | null;
  actor: { userId: string; name: string };
  message: {
    messageId: string;
    platform: Platform;
    threadId?: number | null;
    native: any;
    segments: Segment[];
    timestamp: number;
  };
}

export type GatewayEvent = MessageCreatedEvent;
