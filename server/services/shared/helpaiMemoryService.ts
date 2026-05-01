/**
 * HelpAI & Trinity Memory Service
 * =================================
 * Loads per-user and per-org support history from the helpai_sessions table
 * to give Trinity and HelpAI continuity across sessions.
 *
 * Used by:
 * - HelpAI at session start (loads user/org context)
 * - Trinity Chat (loads user support history for empathetic responses)
 */

import { db } from '../../db';
import { helpaiSessions } from '@shared/schema';
import { eq, desc, and, isNotNull, or } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('helpaiMemoryService');


export interface UserSupportHistory {
  userId?: string;
  workspaceId?: string;
  sessionCount: number;
  resolvedCount: number;
  escalatedCount: number;
  categories: string[];
  recurringCategories: string[];
  recentSessions: Array<{
    id: string;
    ticketNumber: string;
    issueCategory: string | null;
    issueSummary: string | null;
    resolution: string | null;
    wasEscalated: boolean | null;
    wasResolved: boolean | null;
    satisfactionScore: number | null;
    createdAt: Date | null;
  }>;
  lastInteractionDays: number | null;
  averageSatisfaction: number | null;
  isReturningUser: boolean;
  previousIssues: string[];
  recurringTopics: string[];
}

// Simple TTL cache to avoid repeated DB reads in the same session
const memoryCache = new Map<string, { data: UserSupportHistory; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getUserSupportHistory(
  userId?: string,
  workspaceId?: string
): Promise<UserSupportHistory> {
  if (!userId && !workspaceId) {
    return createEmptyHistory();
  }

  const cacheKey = `${userId || ''}:${workspaceId || ''}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    // Build query conditions
    const conditions = [];
    if (userId) conditions.push(eq(helpaiSessions.userId, userId));
    if (workspaceId && !userId) conditions.push(eq(helpaiSessions.workspaceId, workspaceId));
    if (userId && workspaceId) conditions.push(
      or(eq(helpaiSessions.userId, userId), eq(helpaiSessions.workspaceId, workspaceId))!
    );

    const sessions = await db
      .select({
        id: helpaiSessions.id,
        ticketNumber: helpaiSessions.ticketNumber,
        issueCategory: helpaiSessions.issueCategory,
        issueSummary: helpaiSessions.issueSummary,
        resolution: helpaiSessions.resolution,
        wasEscalated: helpaiSessions.wasEscalated,
        wasResolved: helpaiSessions.wasResolved,
        satisfactionScore: helpaiSessions.satisfactionScore,
        createdAt: helpaiSessions.createdAt,
      })
      .from(helpaiSessions)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(helpaiSessions.createdAt))
      .limit(20);

    const history = buildHistory(sessions, userId, workspaceId);
    memoryCache.set(cacheKey, { data: history, expiresAt: Date.now() + CACHE_TTL_MS });
    return history;
  } catch (err: unknown) {
    log.warn('[HelpAIMemory] Failed to load user history:', (err instanceof Error ? err.message : String(err)));
    return createEmptyHistory(userId, workspaceId);
  }
}

function buildHistory(
  sessions: Array<{
    id: string;
    ticketNumber: string;
    issueCategory: string | null;
    issueSummary: string | null;
    resolution: string | null;
    wasEscalated: boolean | null;
    wasResolved: boolean | null;
    satisfactionScore: number | null;
    createdAt: Date | null;
  }>,
  userId?: string,
  workspaceId?: string
): UserSupportHistory {
  if (sessions.length === 0) {
    return createEmptyHistory(userId, workspaceId);
  }

  // Category frequency count
  const categoryCount: Record<string, number> = {};
  sessions.forEach(s => {
    if (s.issueCategory) {
      categoryCount[s.issueCategory] = (categoryCount[s.issueCategory] || 0) + 1;
    }
  });

  const categories = Object.keys(categoryCount);
  const recurringCategories = Object.entries(categoryCount)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);

  const resolved = sessions.filter(s => s.wasResolved).length;
  const escalated = sessions.filter(s => s.wasEscalated).length;

  // Average satisfaction
  const ratingSessions = sessions.filter(s => s.satisfactionScore != null);
  const avgSatisfaction = ratingSessions.length > 0
    ? ratingSessions.reduce((sum, s) => sum + (s.satisfactionScore || 0), 0) / ratingSessions.length
    : null;

  // Days since last interaction
  const lastSession = sessions[0];
  const lastInteractionDays = lastSession?.createdAt
    ? Math.floor((Date.now() - lastSession.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Previous issue summaries for context injection
  const previousIssues = sessions
    .slice(0, 5)
    .filter(s => s.issueSummary)
    .map(s => s.issueSummary!.substring(0, 100));

  const recurringTopics = recurringCategories.map(cat => cat.replace(/_/g, ' '));

  return {
    userId,
    workspaceId,
    sessionCount: sessions.length,
    resolvedCount: resolved,
    escalatedCount: escalated,
    categories,
    recurringCategories,
    recentSessions: sessions.slice(0, 5),
    lastInteractionDays,
    averageSatisfaction: avgSatisfaction,
    isReturningUser: sessions.length > 0,
    previousIssues,
    recurringTopics,
  };
}

function createEmptyHistory(userId?: string, workspaceId?: string): UserSupportHistory {
  return {
    userId,
    workspaceId,
    sessionCount: 0,
    resolvedCount: 0,
    escalatedCount: 0,
    categories: [],
    recurringCategories: [],
    recentSessions: [],
    lastInteractionDays: null,
    averageSatisfaction: null,
    isReturningUser: false,
    previousIssues: [],
    recurringTopics: [],
  };
}

/**
 * Invalidate cached history after a session ends (to pick up new data).
 */
export function invalidateHistoryCache(userId?: string, workspaceId?: string): void {
  const cacheKey = `${userId || ''}:${workspaceId || ''}`;
  memoryCache.delete(cacheKey);
}

/**
 * Build a brief memory summary string for injection into prompts.
 */
export function buildMemorySummary(history: UserSupportHistory): string {
  if (!history.isReturningUser) return '';

  const parts: string[] = [];

  if (history.sessionCount > 0) {
    parts.push(`This user/org has ${history.sessionCount} previous support session(s).`);
  }
  if (history.recurringTopics.length > 0) {
    parts.push(`Recurring topics: ${history.recurringTopics.join(', ')}.`);
  }
  if (history.escalatedCount > 0) {
    parts.push(`They've needed escalation ${history.escalatedCount} time(s) in the past — be thorough.`);
  }
  if (history.averageSatisfaction !== null) {
    const satisfied = history.averageSatisfaction >= 4;
    parts.push(satisfied
      ? `Their average satisfaction rating is ${history.averageSatisfaction.toFixed(1)}/5 — they generally find interactions helpful.`
      : `Their average satisfaction rating is ${history.averageSatisfaction.toFixed(1)}/5 — extra care needed to rebuild trust.`
    );
  }
  if (history.lastInteractionDays !== null) {
    const when = history.lastInteractionDays === 0 ? 'today'
      : history.lastInteractionDays === 1 ? 'yesterday'
      : `${history.lastInteractionDays} days ago`;
    parts.push(`Last interaction: ${when}.`);
  }
  if (history.previousIssues.length > 0) {
    parts.push(`Recent issue context:\n${history.previousIssues.map((issue, i) => `  ${i + 1}. ${issue}`).join('\n')}`);
  }

  return parts.length > 0 ? `\n[MEMORY CONTEXT]\n${parts.join('\n')}\n` : '';
}
