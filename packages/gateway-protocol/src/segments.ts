import type { Segment } from './events.js';

export function makeText(text: string): Segment {
  return { type: 'text', data: { text } };
}

export function makeAt(userId: string, name?: string): Segment {
  return { type: 'at', data: { userId, ...(name ? { name } : {}) } };
}

export function makeReply(messageId: string): Segment {
  return { type: 'reply', data: { messageId } };
}

export function extractPlainText(segments: Segment[]): string {
  return segments
    .filter(s => s.type === 'text' && typeof (s.data as any)?.text === 'string')
    .map(s => String((s.data as any).text))
    .join('');
}

