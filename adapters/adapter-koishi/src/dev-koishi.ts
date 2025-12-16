import { Context } from '@koishijs/core';
import * as adapter from './index.js';

const endpoint = process.env.NAPGRAM_GATEWAY_URL || 'ws://localhost:8765';
const token = process.env.NAPGRAM_GATEWAY_TOKEN || '';
const instances = String(process.env.NAPGRAM_INSTANCES || '0')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => Number(s))
  .filter(n => Number.isFinite(n));

if (!token) {
  throw new Error('NAPGRAM_GATEWAY_TOKEN is required');
}

const ctx = new Context();

ctx.plugin(adapter as any, {
  endpoint,
  token,
  instances,
});

ctx.on('ready', () => {
  console.log('[koishi] ready');
});

ctx.on('message', async (session) => {
  // MVP: 收到包含 "ping" 的消息就回复 "pong"
  if (!String(session.content || '').includes('ping')) return;
  await session.send('pong');
});

await ctx.start();
console.log('[koishi] started');
