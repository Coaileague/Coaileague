/**
 * ChatDurabilityAdapter — Redis-backed event buffer with in-memory fallback.
 *
 * P0 fix: workspaceEventBuffer was an in-memory Map that vanished on Railway
 * restart or across multiple replicas. This adapter:
 *   1. Uses Redis Sorted Sets (ZADD) if REDIS_URL is set — survives restarts
 *   2. Falls back to the same in-memory Map if Redis is unavailable
 *   3. Provides a pub/sub interface for multi-replica broadcast
 *
 * The websocket.ts pushEventToBuffer() and broadcastToWorkspace() are wired
 * through this adapter without changing callers.
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('ChatDurabilityAdapter');

const EVENT_BUFFER_MAX = 100;           // Keep last N events per workspace
const EVENT_BUFFER_TTL_SEC = 5 * 60;   // 5 minutes — Redis TTL per event

export interface BufferedChatEvent {
  eventId: string;
  timestamp: number;
  workspaceId: string;
  data: Record<string, unknown>;
}

// ── Redis client (optional) ───────────────────────────────────────────────────
let redisClient: any = null;
let pubClient: any = null;
let subClient: any = null;
let redisAvailable = false;

// In-memory fallback
const memoryBuffer = new Map<string, BufferedChatEvent[]>();

async function initRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) {
    log.info('[ChatDurability] No REDIS_URL — using in-memory buffer (single-replica mode)');
    return false;
  }

  try {
    // Dynamic import so the server boots without Redis installed
    const { createClient } = await import('redis').catch(() => ({ createClient: null }));
    if (!createClient) {
      log.warn('[ChatDurability] redis package not installed — falling back to in-memory');
      return false;
    }

    redisClient = createClient({ url, socket: { reconnectStrategy: (attempts: number) => Math.min(attempts * 100, 3000) } });
    pubClient = redisClient.duplicate();
    subClient = redisClient.duplicate();

    await Promise.all([
      redisClient.connect(),
      pubClient.connect(),
      subClient.connect(),
    ]);

    redisAvailable = true;
    log.info('[ChatDurability] Redis connected — durable multi-replica mode active');
    return true;
  } catch (err: unknown) {
    log.warn('[ChatDurability] Redis connection failed, falling back to in-memory:', err?.message);
    redisAvailable = false;
    return false;
  }
}

// ── Event storage ─────────────────────────────────────────────────────────────

export function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function pushEvent(workspaceId: string, data: Record<string, unknown>): Promise<string> {
  const eventId = generateEventId();
  const event: BufferedChatEvent = { eventId, timestamp: Date.now(), workspaceId, data: { ...data, eventId } };

  if (redisAvailable && redisClient) {
    try {
      const key = `chat:events:${workspaceId}`;
      const score = event.timestamp;
      const value = JSON.stringify(event);

      // ZADD with score = timestamp, trim to max, set TTL
      await redisClient.zAdd(key, { score, value });
      const minScore = Date.now() - EVENT_BUFFER_TTL_SEC * 1000;
      await redisClient.zRemRangeByScore(key, '-inf', minScore);
      const count = await redisClient.zCard(key);
      if (count > EVENT_BUFFER_MAX) {
        await redisClient.zRemRangeByRank(key, 0, count - EVENT_BUFFER_MAX - 1);
      }
      await redisClient.expire(key, EVENT_BUFFER_TTL_SEC * 2);
      return eventId;
    } catch (err: unknown) {
      log.warn('[ChatDurability] Redis push failed, using memory:', err?.message);
    }
  }

  // Memory fallback
  const existing = memoryBuffer.get(workspaceId) ?? [];
  existing.push(event);
  const now = Date.now();
  const trimmed = existing.filter(e => now - e.timestamp < EVENT_BUFFER_TTL_SEC * 1000).slice(-EVENT_BUFFER_MAX);
  memoryBuffer.set(workspaceId, trimmed);
  return eventId;
}

export async function getEventsSince(workspaceId: string, sinceTimestamp: number): Promise<BufferedChatEvent[]> {
  if (redisAvailable && redisClient) {
    try {
      const key = `chat:events:${workspaceId}`;
      const results = await redisClient.zRangeByScore(key, sinceTimestamp, '+inf', { LIMIT: { offset: 0, count: EVENT_BUFFER_MAX } });
      return results.map((r: string) => JSON.parse(r));
    } catch {
      // fallthrough to memory
    }
  }

  const events = memoryBuffer.get(workspaceId) ?? [];
  return events.filter(e => e.timestamp > sinceTimestamp);
}

// ── Pub/Sub for multi-replica broadcast ───────────────────────────────────────

type BroadcastHandler = (workspaceId: string, data: Record<string, unknown>) => void;

const localHandlers: BroadcastHandler[] = [];

export function onBroadcast(handler: BroadcastHandler): void {
  localHandlers.push(handler);
}

export async function publishBroadcast(workspaceId: string, data: Record<string, unknown>): Promise<void> {
  if (redisAvailable && pubClient) {
    try {
      const payload = JSON.stringify({ workspaceId, data });
      await pubClient.publish('chat:broadcast', payload);
      return;
    } catch {
      // fallthrough to local
    }
  }
  // Local delivery (single instance)
  for (const handler of localHandlers) {
    try { handler(workspaceId, data); } catch { /* non-fatal */ }
  }
}

export async function subscribeBroadcast(): Promise<void> {
  if (!redisAvailable || !subClient) return;
  try {
    await subClient.subscribe('chat:broadcast', (message: string) => {
      try {
        const { workspaceId, data } = JSON.parse(message);
        for (const handler of localHandlers) {
          try { handler(workspaceId, data); } catch { /* non-fatal */ }
        }
      } catch {
        log.warn('[ChatDurability] Invalid broadcast payload from Redis');
      }
    });
    log.info('[ChatDurability] Subscribed to chat:broadcast channel');
  } catch (err: unknown) {
    log.warn('[ChatDurability] Subscribe failed:', err?.message);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

let initialized = false;
export async function initChatDurability(): Promise<boolean> {
  if (initialized) return redisAvailable;
  initialized = true;
  await initRedis();
  if (redisAvailable) {
    await subscribeBroadcast();
  }
  return redisAvailable;
}

/**
 * subscribeToRoomBroadcasts — CD-15 multi-replica support
 * ChatServerHub calls this to receive events published by other Railway replicas.
 * The callback fires for every message published to the 'chat:broadcast' channel.
 */
export function subscribeToRoomBroadcasts(
  handler: (event: Record<string, unknown>) => void
): void {
  localHandlers.push((_workspaceId: string, data: Record<string, unknown>) => {
    try { handler(data); } catch { /* non-fatal */ }
  });
}

/**
 * publishRoomEvent — CD-15: publish to Redis so other replicas receive it
 * Call this AFTER local WS broadcast so local clients get it immediately.
 */
export async function publishRoomEvent(
  workspaceId: string,
  event: Record<string, unknown>
): Promise<void> {
  if (!redisAvailable || !pubClient) return;
  try {
    await pubClient.publish('chat:broadcast', JSON.stringify({ workspaceId, data: event }));
  } catch (err: unknown) {
    log.warn('[ChatDurability] Redis publish failed (non-fatal):', err?.message);
  }
}

export { redisAvailable };
