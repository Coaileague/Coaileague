import { createLogger } from '../../lib/logger';
import { platformEventBus } from '../platformEventBus';

const log = createLogger('aiRateLimiter');
interface WindowEntry {
  timestamps: number[];
  blocked: boolean;
  blockedUntil?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  reason?: string;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const BURST_WINDOW_MS = 5_000;
const BURST_MAX_REQUESTS = 30;
const COOLDOWN_MS = 30_000;

const TIER_LIMITS: Record<string, { perMinute: number; burstPer5s: number }> = {
  free: { perMinute: 30, burstPer5s: 8 },
  starter: { perMinute: 60, burstPer5s: 15 },
  professional: { perMinute: 120, burstPer5s: 30 },
  enterprise: { perMinute: 300, burstPer5s: 60 },
  platform: { perMinute: 500, burstPer5s: 100 },
};

class AIRateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60_000);
  }

  checkLimit(
    workspaceId: string,
    tier?: string
  ): RateLimitResult {
    const now = Date.now();
    const key = workspaceId;
    let entry = this.windows.get(key);

    if (!entry) {
      entry = { timestamps: [], blocked: false };
      this.windows.set(key, entry);
    }

    if (entry.blocked && entry.blockedUntil && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: entry.blockedUntil - now,
        reason: `Rate limited: workspace cooldown active (${Math.ceil((entry.blockedUntil - now) / 1000)}s remaining)`,
      };
    }

    if (entry.blocked && entry.blockedUntil && now >= entry.blockedUntil) {
      entry.blocked = false;
      entry.blockedUntil = undefined;
      entry.timestamps = [];
    }

    const limits = TIER_LIMITS[tier || 'professional'] || TIER_LIMITS.professional;

    entry.timestamps = entry.timestamps.filter(t => t > now - DEFAULT_WINDOW_MS);

    const burstCount = entry.timestamps.filter(t => t > now - BURST_WINDOW_MS).length;
    if (burstCount >= limits.burstPer5s) {
      entry.blocked = true;
      entry.blockedUntil = now + COOLDOWN_MS;
      log.error(`[AIRateLimiter] BURST LIMIT: workspace=${workspaceId} hit ${burstCount} calls in 5s (limit: ${limits.burstPer5s}). Cooldown ${COOLDOWN_MS / 1000}s.`);
      this.emitAlert(workspaceId, 'burst', burstCount, limits.burstPer5s);
      return {
        allowed: false,
        remaining: 0,
        resetMs: COOLDOWN_MS,
        reason: `Burst rate limit exceeded: ${burstCount} calls in 5 seconds (limit: ${limits.burstPer5s})`,
      };
    }

    if (entry.timestamps.length >= limits.perMinute) {
      entry.blocked = true;
      entry.blockedUntil = now + COOLDOWN_MS;
      log.error(`[AIRateLimiter] MINUTE LIMIT: workspace=${workspaceId} hit ${entry.timestamps.length} calls in 60s (limit: ${limits.perMinute}). Cooldown ${COOLDOWN_MS / 1000}s.`);
      this.emitAlert(workspaceId, 'sustained', entry.timestamps.length, limits.perMinute);
      return {
        allowed: false,
        remaining: 0,
        resetMs: COOLDOWN_MS,
        reason: `Rate limit exceeded: ${entry.timestamps.length} calls in 60 seconds (limit: ${limits.perMinute})`,
      };
    }

    entry.timestamps.push(now);
    const remaining = limits.perMinute - entry.timestamps.length;

    return {
      allowed: true,
      remaining,
      resetMs: entry.timestamps.length > 0 ? (entry.timestamps[0] + DEFAULT_WINDOW_MS - now) : DEFAULT_WINDOW_MS,
    };
  }

  private emitAlert(workspaceId: string, type: 'burst' | 'sustained', count: number, limit: number) {
    try {
      platformEventBus.publish({
        type: 'rate_limit_hit',
        category: 'ai_brain',
        title: `AI Rate Limit Triggered`,
        description: `${type} rate limit exceeded: ${count}/${limit} requests in window for workspace ${workspaceId}`,
        workspaceId,
        metadata: { limitType: type, count, limit, timestamp: new Date().toISOString() },
      }).catch((err) => log.warn('[aiRateLimiter] Fire-and-forget failed:', err));
    } catch (err: unknown) {
      log.warn('[AIRateLimiter] Rate limit alert emission failed (non-fatal):', err?.message);
    }
  }

  resetWorkspace(workspaceId: string): void {
    this.windows.delete(workspaceId);
  }

  getStats(workspaceId: string): { recentCalls: number; blocked: boolean; cooldownRemaining: number } {
    const entry = this.windows.get(workspaceId);
    if (!entry) return { recentCalls: 0, blocked: false, cooldownRemaining: 0 };
    const now = Date.now();
    const recentCalls = entry.timestamps.filter(t => t > now - DEFAULT_WINDOW_MS).length;
    const cooldownRemaining = entry.blocked && entry.blockedUntil ? Math.max(0, entry.blockedUntil - now) : 0;
    return { recentCalls, blocked: entry.blocked && cooldownRemaining > 0, cooldownRemaining };
  }

  private cleanup() {
    const now = Date.now();
    const staleThreshold = now - 10 * 60_000;
    for (const [key, entry] of this.windows) {
      const latestTimestamp = entry.timestamps.length > 0 ? entry.timestamps[entry.timestamps.length - 1] : 0;
      if (latestTimestamp < staleThreshold && !entry.blocked) {
        this.windows.delete(key);
      }
    }
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const aiRateLimiter = new AIRateLimiter();
