/**
 * Unread Message Service - Optimized unread message counting
 * Caches unread counts to avoid expensive queries
 */

import { db } from "../db";
import { chatMessages, chatParticipants } from "@shared/schema";
import { eq, and, isNull, ne, sql, count, inArray } from "drizzle-orm";
import { TIMEOUTS } from '../config/platformConfig';

const unreadCache = new Map<string, { count: number; timestamp: number }>();
const CACHE_TTL = TIMEOUTS.unreadMessageCacheTtlMs;

/**
 * Get unread message count for a conversation (optimized with caching + COUNT query)
 */
export async function getUnreadCount(conversationId: string, userId: string): Promise<number> {
  const cacheKey = `${conversationId}:${userId}`;
  const cached = unreadCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.count;
  }

  const [result] = await db
    .select({ count: count() })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      isNull(chatMessages.readAt),
      ne(chatMessages.senderId, userId)
    ));

  const total = result?.count ?? 0;
  unreadCache.set(cacheKey, { count: total, timestamp: Date.now() });

  return total;
}

/**
 * Get total unread messages across all conversations the user participates in
 */
export async function getTotalUnreadCount(userId: string): Promise<number> {
  const cacheKey = `total:${userId}`;
  const cached = unreadCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.count;
  }

  const userConversations = await db
    .select({ conversationId: chatParticipants.conversationId })
    .from(chatParticipants)
    .where(and(
      eq(chatParticipants.participantId, userId),
      eq(chatParticipants.isActive, true)
    ));

  if (userConversations.length === 0) {
    unreadCache.set(cacheKey, { count: 0, timestamp: Date.now() });
    return 0;
  }

  const conversationIds = userConversations.map(c => c.conversationId).filter(Boolean) as string[];

  const [result] = await db
    .select({ count: count() })
    .from(chatMessages)
    .where(and(
      inArray(chatMessages.conversationId, conversationIds),
      isNull(chatMessages.readAt),
      ne(chatMessages.senderId, userId)
    ));

  const total = result?.count ?? 0;
  unreadCache.set(cacheKey, { count: total, timestamp: Date.now() });

  return total;
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
  await db
    .update(chatMessages)
    .set({ readAt: new Date() })
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      isNull(chatMessages.readAt)
    ));

  // Invalidate cache
  const cacheKey = `${conversationId}:${userId}`;
  unreadCache.delete(cacheKey);
  unreadCache.delete(`total:${userId}`);
}

/**
 * Invalidate cache for a conversation (call after sending/receiving messages)
 */
export function invalidateCache(conversationId: string, userId?: string): void {
  if (userId) {
    unreadCache.delete(`${conversationId}:${userId}`);
    unreadCache.delete(`total:${userId}`);
  } else {
    // Invalidate all entries for this conversation
    const keysToDelete: string[] = [];
    unreadCache.forEach((_, key) => {
      if (key.startsWith(conversationId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => unreadCache.delete(key));
  }
}

export const unreadMessageService = {
  getUnreadCount,
  getTotalUnreadCount,
  markMessagesAsRead,
  invalidateCache,
};
