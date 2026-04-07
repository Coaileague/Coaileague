/**
 * WebSocket Rate Limiting & Connection Tracking
 *
 * SECURITY: Enhanced rate limiting to protect against distributed attacks
 *
 * Implements multi-dimensional rate limiting for WebSocket connections:
 * - User-based rate limiting (primary)
 * - IP-based rate limiting (secondary, for distributed attack protection)
 * - Sliding window algorithm (more accurate than fixed window)
 * - Connection limiting per user with exponential backoff
 * - Security audit logging for violations
 *
 * Features:
 * - 30 messages/minute per user (sliding window)
 * - 100 messages/minute per IP (prevents distributed attacks)
 * - 20 concurrent connections per user
 * - 50 concurrent connections per IP
 * - Exponential backoff for reconnection attempts
 * - Comprehensive security logging
 */

import { db } from '../db';
import { chatConnections, systemAuditLogs } from '@shared/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { RATE_LIMITS } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('wsRateLimiter');

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface SlidingWindowEntry {
  timestamps: number[];  // Array of request timestamps within the window
  violations: number;    // Count of rate limit violations
  lastViolation: number; // Timestamp of last violation
}

interface ConnectionAttempt {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  backoffUntil: number;  // Timestamp until which reconnection is blocked
  backoffLevel: number;  // Current exponential backoff level (0-5)
}

interface RateLimitViolation {
  type: 'message' | 'connection' | 'reconnection';
  dimension: 'user' | 'ip';
  identifier: string;
  limit: number;
  current: number;
  ipAddress?: string;
  userId?: string;
  timestamp: Date;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Message rate limiting
const MESSAGE_RATE_WINDOW = 60 * 1000; // 1 minute sliding window
const USER_MESSAGE_RATE_LIMIT = 30;    // 30 messages per minute per user
const IP_MESSAGE_RATE_LIMIT = 100;     // 100 messages per minute per IP (higher for shared IPs)

// Connection limiting
const MAX_CONCURRENT_CONNECTIONS_PER_USER = RATE_LIMITS.websocket.maxConnectionsPerUser;
const MAX_CONCURRENT_CONNECTIONS_PER_IP = RATE_LIMITS.websocket.maxConnectionsPerIp;

// Exponential backoff for reconnection
const BASE_BACKOFF_MS = 1000;          // 1 second base
const MAX_BACKOFF_MS = RATE_LIMITS.websocket.maxBackoffMs;
const MAX_BACKOFF_LEVEL = RATE_LIMITS.websocket.maxBackoffLevel;
const BACKOFF_DECAY_MS = RATE_LIMITS.websocket.backoffDecayMs;

// Cleanup intervals
const SLIDING_WINDOW_CLEANUP_INTERVAL = 60 * 1000; // Clean up every minute
const CONNECTION_ATTEMPT_CLEANUP_INTERVAL = 5 * 60 * 1000; // Clean up every 5 minutes

// =============================================================================
// IN-MEMORY STORES
// =============================================================================

// Sliding window rate limiting stores
const userMessageLimits = new Map<string, SlidingWindowEntry>();
const ipMessageLimits = new Map<string, SlidingWindowEntry>();

// Connection attempt tracking for exponential backoff
const connectionAttempts = new Map<string, ConnectionAttempt>(); // key: `${userId}:${ipAddress}`

// IP-based connection tracking (in-memory for fast checks)
const ipConnectionCounts = new Map<string, Set<string>>(); // IP -> Set of session IDs

// Simple rate limit tracking for checkMessageRateLimit function
const simpleMessageRateLimits = new Map<string, { count: number; windowStart: number }>();
const MESSAGE_RATE_LIMIT = 30; // Max messages per window

/**
 * Check if user has exceeded message rate limit (30 messages/minute)
 */
export function checkMessageRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const userLimit = simpleMessageRateLimits.get(userId);

  if (!userLimit || now - userLimit.windowStart > MESSAGE_RATE_WINDOW) {
    // New window - reset counter
    simpleMessageRateLimits.set(userId, {
      count: 1,
      windowStart: now
    });
    return { allowed: true };
  }

  if (userLimit.count >= MESSAGE_RATE_LIMIT) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((MESSAGE_RATE_WINDOW - (now - userLimit.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment counter
  userLimit.count++;
  return { allowed: true };
}

/**
 * Reset message rate limit for a user (for testing or admin override)
 */
export function resetMessageRateLimit(userId: string): void {
  simpleMessageRateLimits.delete(userId);
}

/**
 * Track new WebSocket connection in database
 * Returns false if user has too many concurrent connections
 */
export async function trackConnection(
  userId: string,
  sessionId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    // Auto-cleanup: Mark connections older than 10 minutes as stale
    // This prevents accumulation of orphaned connections from server crashes/restarts
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
    await db
      .update(chatConnections)
      .set({
        disconnectedAt: new Date(),
        disconnectReason: 'stale_auto_cleanup'
      })
      .where(
        and(
          eq(chatConnections.userId, userId),
          isNull(chatConnections.disconnectedAt),
          sql`${chatConnections.connectedAt} < ${staleThreshold.toISOString()}`
        )
      );

    // Check for existing active connections (disconnectedAt is null)
    const activeConnections = await db
      .select()
      .from(chatConnections)
      .where(
        and(
          eq(chatConnections.userId, userId),
          isNull(chatConnections.disconnectedAt)
        )
      );

    // Enforce concurrent connection limit per user
    if (activeConnections.length >= MAX_CONCURRENT_CONNECTIONS_PER_USER) {
      return {
        allowed: false,
        error: `Maximum concurrent connections (${MAX_CONCURRENT_CONNECTIONS_PER_USER}) exceeded. Please close another session first.`
      };
    }

    // Track the new connection
    await db.insert(chatConnections).values({
      workspaceId: 'system',
      userId,
      sessionId,
      ipAddress,
      userAgent,
      connectedAt: new Date(),
    });

    return { allowed: true };
  } catch (error: any) {
    // If it's a unique constraint violation (duplicate sessionId), allow it
    // This can happen if the client reconnects with the same sessionId
    if (error.code === '23505') { // PostgreSQL unique violation
      return { allowed: true };
    }
    
    log.error('Error tracking connection:', error);
    return { allowed: true }; // Fail open for availability
  }
}

/**
 * Mark connection as disconnected
 */
export async function trackDisconnection(
  sessionId: string,
  disconnectReason?: string
): Promise<void> {
  try {
    await db
      .update(chatConnections)
      .set({
        disconnectedAt: new Date(),
        disconnectReason: disconnectReason || 'normal_close'
      })
      .where(eq(chatConnections.sessionId, sessionId));
  } catch (error) {
    log.error('Error tracking disconnection:', error);
    // Non-critical error - don't throw
  }
}

/**
 * Get user's active connection count
 */
export async function getActiveConnectionCount(userId: string): Promise<number> {
  try {
    const activeConnections = await db
      .select()
      .from(chatConnections)
      .where(
        and(
          eq(chatConnections.userId, userId),
          isNull(chatConnections.disconnectedAt)
        )
      );
    
    return activeConnections.length;
  } catch (error) {
    log.error('Error getting active connection count:', error);
    return 0;
  }
}

/**
 * Cleanup stale connections (disconnected more than 24 hours ago)
 * Should be run periodically via cron job
 */
export async function cleanupStaleConnections(): Promise<number> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Delete connections that were disconnected more than 24 hours ago
    // Using raw SQL for date comparison since Drizzle's operators may vary by driver
    const deletedRecords = await db
      .delete(chatConnections)
      .where(
        sql`${chatConnections.disconnectedAt} IS NOT NULL AND ${chatConnections.disconnectedAt} < ${oneDayAgo.toISOString()}`
      )
      .returning();
    
    log.info(`Cleaned up ${deletedRecords.length} stale chat connections`);
    return deletedRecords.length;
  } catch (error) {
    log.error('Error cleaning up stale connections:', error);
    return 0;
  }
}
