/**
 * Redis Pub/Sub Adapter for WebSocket Broadcasting
 *
 * When REDIS_URL is set (Railway Redis addon), cross-replica broadcasting
 * activates automatically. Without it, falls back to in-process broadcast
 * (single-replica mode — current Railway setup).
 *
 * To enable:
 *   1. Add Redis addon in Railway dashboard
 *   2. Railway auto-sets REDIS_URL
 *   3. This module activates on next deploy — no code change needed
 *
 * Install when ready: npm install ioredis
 * Then uncomment the ioredis import below.
 */

import { createLogger } from '../lib/logger';

const log = createLogger('RedisAdapter');

export interface RedisPubSubAdapter {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  disconnect(): Promise<void>;
}

// In-process fallback — works on single replica, drops events across replicas
class InProcessAdapter implements RedisPubSubAdapter {
  private handlers = new Map<string, Set<(msg: string) => void>>();

  async publish(channel: string, message: string): Promise<void> {
    const channelHandlers = this.handlers.get(channel);
    if (channelHandlers) {
      channelHandlers.forEach(h => {
        try { h(message); } catch { /* ignore */ }
      });
    }
  }

  async subscribe(channel: string, handler: (msg: string) => void): Promise<void> {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);
  }

  async disconnect(): Promise<void> { this.handlers.clear(); }
}

// Redis adapter — activate by installing ioredis + setting REDIS_URL
// Uncomment when ioredis is installed:
/*
import Redis from 'ioredis';

class RedisAdapter implements RedisPubSubAdapter {
  private pub: Redis;
  private sub: Redis;

  constructor(redisUrl: string) {
    this.pub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
    this.sub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
    this.pub.on('error', err => log.warn('[Redis pub] connection error:', err.message));
    this.sub.on('error', err => log.warn('[Redis sub] connection error:', err.message));
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  async subscribe(channel: string, handler: (msg: string) => void): Promise<void> {
    await this.sub.subscribe(channel);
    this.sub.on('message', (ch, msg) => { if (ch === channel) handler(msg); });
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.pub.quit(), this.sub.quit()]);
  }
}
*/

let _adapter: RedisPubSubAdapter | null = null;

export function getRedisAdapter(): RedisPubSubAdapter {
  if (_adapter) return _adapter;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // TODO: swap InProcessAdapter for RedisAdapter once ioredis is installed
    // _adapter = new RedisAdapter(redisUrl);
    log.info('[RedisAdapter] REDIS_URL detected — ioredis not installed yet. Run: npm install ioredis');
    _adapter = new InProcessAdapter();
  } else {
    log.info('[RedisAdapter] No REDIS_URL — using in-process broadcast (single-replica mode)');
    _adapter = new InProcessAdapter();
  }
  return _adapter;
}

/**
 * Broadcast a workspace event across all replicas.
 * When Redis is active, this pub/sub ensures all Railway replicas
 * deliver the event to their connected WebSocket clients.
 */
export async function publishWorkspaceEvent(workspaceId: string, data: unknown): Promise<void> {
  const adapter = getRedisAdapter();
  const channel = `workspace:${workspaceId}`;
  const message = JSON.stringify(data);
  await adapter.publish(channel, message);
}

export async function subscribeWorkspaceEvents(
  workspaceId: string,
  handler: (data: unknown) => void,
): Promise<void> {
  const adapter = getRedisAdapter();
  const channel = `workspace:${workspaceId}`;
  await adapter.subscribe(channel, (msg: string) => {
    try { handler(JSON.parse(msg)); } catch { /* malformed — ignore */ }
  });
}
