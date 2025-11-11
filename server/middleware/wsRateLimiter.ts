/**
 * WebSocket Rate Limiting & Connection Tracking
 * 
 * Implements chat-specific rate limiting for WebSocket connections:
 * - 30 messages/minute per user
 * - 3 concurrent connections per user
 * - Connection tracking in database
 */

import { db } from '../db';
import { chatConnections } from '@shared/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

interface MessageRateLimit {
  count: number;
  windowStart: number;
}

// In-memory tracking for message rate limiting (30 messages/minute)
const messageRateLimits = new Map<string, MessageRateLimit>();

// Constants
const MESSAGE_RATE_WINDOW = 60 * 1000; // 1 minute
const MESSAGE_RATE_LIMIT = 30; // 30 messages per minute
const MAX_CONCURRENT_CONNECTIONS = 3; // 3 concurrent WebSocket connections per user

/**
 * Check if user has exceeded message rate limit (30 messages/minute)
 */
export function checkMessageRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const userLimit = messageRateLimits.get(userId);

  if (!userLimit || now - userLimit.windowStart > MESSAGE_RATE_WINDOW) {
    // New window - reset counter
    messageRateLimits.set(userId, {
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
  messageRateLimits.delete(userId);
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

    // Enforce concurrent connection limit
    if (activeConnections.length >= MAX_CONCURRENT_CONNECTIONS) {
      return {
        allowed: false,
        error: `Maximum concurrent connections (${MAX_CONCURRENT_CONNECTIONS}) exceeded. Please close another session first.`
      };
    }

    // Track the new connection
    await db.insert(chatConnections).values({
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
    
    console.error('Error tracking connection:', error);
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
    console.error('Error tracking disconnection:', error);
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
    console.error('Error getting active connection count:', error);
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
    
    console.log(`Cleaned up ${deletedRecords.length} stale chat connections`);
    return deletedRecords.length;
  } catch (error) {
    console.error('Error cleaning up stale connections:', error);
    return 0;
  }
}
