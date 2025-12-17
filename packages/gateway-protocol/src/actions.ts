/**
 * Gateway 动作类型定义（MVP）
 */

import type { Segment } from './events.js';

export interface MessageSendAction {
  action: 'message.send';
  params: { channelId: string; segments: Segment[]; reply?: string };
}

export interface MessageSendResult {
  messageId: string;
  platform: 'qq' | 'tg';
  timestamp: number;
}

export type GatewayAction = MessageSendAction;
export type GatewayActionResult = MessageSendResult;
