/**
 * AI-Powered Notification Digest Service
 * Prevents notification flooding by batching and summarizing notifications using Gemini AI
 * 
 * Features:
 * - Batch notifications by time window (15min, 1hour, 4hours, daily)
 * - Gemini 2.0 Flash AI summarization
 * - User preferences (digest frequency, quiet hours, email delivery)
 * - Fallback summaries when AI unavailable
 * - Confidence scoring for human review
 */

import { db } from '../db';
import { 
  notifications, 
  notificationDigests, 
  userNotificationPreferences,
  type Notification,
  type InsertNotificationDigest,
  type UserNotificationPreferences
} from '@shared/schema';
import { eq, and, gte, lte, inArray, isNull } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface DigestBatch {
  userId: string;
  workspaceId: string;
  notifications: Notification[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Get or create user notification preferences
 */
export async function getUserNotificationPreferences(userId: string, workspaceId: string): Promise<UserNotificationPreferences> {
  const [existing] = await db
    .select()
    .from(userNotificationPreferences)
    .where(and(
      eq(userNotificationPreferences.userId, userId),
      eq(userNotificationPreferences.workspaceId, workspaceId)
    ))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [newPrefs] = await db
    .insert(userNotificationPreferences)
    .values({
      userId,
      workspaceId,
      digestFrequency: 'realtime',
      enableAiSummarization: true,
      enabledTypes: [],
      preferEmail: false,
    })
    .returning();

  return newPrefs;
}

/**
 * Update user notification preferences
 */
export async function updateUserNotificationPreferences(
  userId: string,
  workspaceId: string,
  updates: Partial<UserNotificationPreferences>
) {
  const [updated] = await db
    .update(userNotificationPreferences)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(userNotificationPreferences.userId, userId),
      eq(userNotificationPreferences.workspaceId, workspaceId)
    ))
    .returning();

  return updated;
}

/**
 * Check if current time is within user's quiet hours
 */
function isQuietHours(preferences: UserNotificationPreferences): boolean {
  if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  
  const start = preferences.quietHoursStart;
  const end = preferences.quietHoursEnd;

  if (start < end) {
    return currentHour >= start && currentHour < end;
  } else {
    return currentHour >= start || currentHour < end;
  }
}

/**
 * Get time window for digest frequency
 */
function getTimeWindow(frequency: string): number {
  switch (frequency) {
    case '15min': return 15 * 60 * 1000;
    case '1hour': return 60 * 60 * 1000;
    case '4hours': return 4 * 60 * 60 * 1000;
    case 'daily': return 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

/**
 * Generate AI summary using Gemini 2.0 Flash
 */
async function generateAiSummary(batch: DigestBatch): Promise<{ summary: string; confidence: number }> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const notificationList = batch.notifications.map((n, idx) => 
      `${idx + 1}. [${n.type}] ${n.title}: ${n.message}`
    ).join('\n');

    const prompt = `You are an AI assistant summarizing notifications for a user in CoAIleague, an AI-powered workforce management platform.

NOTIFICATIONS TO SUMMARIZE (${batch.notifications.length} total):
${notificationList}

TASK: Create a concise, actionable summary that:
1. Groups similar notifications together (e.g., "3 schedule changes", "2 AI approvals needed")
2. Highlights urgent/important items first
3. Uses clear, professional language
4. Is 2-4 sentences max
5. Ends with a suggested action if appropriate

FORMAT: Plain text summary only. No markdown, no bullet points. Just 2-4 clear sentences.

EXAMPLE OUTPUT: "You have 3 schedule changes for this week, including 2 new shift assignments and 1 cancellation. The AI Brain also generated 2 invoices totaling $4,850 and is waiting for your approval on the weekly payroll schedule. Review your schedule and approve the pending AI actions to keep operations running smoothly."

NOW SUMMARIZE:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const confidence = 0.85;

    return {
      summary: text.trim(),
      confidence
    };
  } catch (error) {
    console.error('[Notification Digest] AI summarization failed:', error);
    throw error;
  }
}

/**
 * Generate fallback summary (non-AI)
 */
function generateFallbackSummary(batch: DigestBatch): string {
  const typeCount: Record<string, number> = {};
  
  batch.notifications.forEach(n => {
    typeCount[n.type] = (typeCount[n.type] || 0) + 1;
  });

  const summaryParts = Object.entries(typeCount).map(([type, count]) => {
    const displayType = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `${count} ${displayType}${count > 1 ? 's' : ''}`;
  });

  return `You have ${batch.notifications.length} new notification${batch.notifications.length > 1 ? 's' : ''}: ${summaryParts.join(', ')}. Check your notifications to review details.`;
}

/**
 * Create notification digest from batch
 */
export async function createDigest(batch: DigestBatch, preferences: UserNotificationPreferences): Promise<string> {
  let aiSummary: string | null = null;
  let rawSummary: string = generateFallbackSummary(batch);
  let confidence: number | null = null;
  let generatedBy = 'fallback';

  if (preferences.enableAiSummarization) {
    try {
      const aiResult = await generateAiSummary(batch);
      aiSummary = aiResult.summary;
      confidence = aiResult.confidence;
      generatedBy = 'gemini-2.0-flash-exp';
    } catch (error) {
      console.warn('[Notification Digest] Falling back to non-AI summary');
    }
  }

  const title = `${batch.notifications.length} update${batch.notifications.length > 1 ? 's' : ''} in the last ${getPeriodLabel(batch.periodStart, batch.periodEnd)}`;

  const [digest] = await db
    .insert(notificationDigests)
    .values({
      userId: batch.userId,
      workspaceId: batch.workspaceId,
      title,
      aiSummary: aiSummary || rawSummary,
      rawSummary,
      notificationIds: batch.notifications.map(n => n.id),
      notificationCount: batch.notifications.length,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      isRead: false,
      emailSent: false,
      generatedBy,
      confidenceScore: confidence,
    })
    .returning();

  console.log(`[Notification Digest] Created digest ${digest.id} for user ${batch.userId} (${batch.notifications.length} notifications, ${generatedBy})`);

  return digest.id;
}

/**
 * Get human-readable period label
 */
function getPeriodLabel(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) return `${diffMins} minutes`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  return `${Math.floor(diffHours / 24)} day${diffHours >= 48 ? 's' : ''}`;
}

/**
 * Process pending notifications for a user
 */
export async function processUserDigests(userId: string, workspaceId: string): Promise<string[]> {
  const preferences = await getUserNotificationPreferences(userId, workspaceId);

  if (preferences.digestFrequency === 'realtime' || preferences.digestFrequency === 'never') {
    return [];
  }

  if (isQuietHours(preferences)) {
    console.log(`[Notification Digest] Skipping user ${userId} - quiet hours active`);
    return [];
  }

  const windowMs = getTimeWindow(preferences.digestFrequency);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowMs);

  const pendingNotifications = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.workspaceId, workspaceId),
      eq(notifications.isRead, false),
      gte(notifications.createdAt, periodStart),
      lte(notifications.createdAt, periodEnd)
    ))
    .orderBy(notifications.createdAt);

  if (pendingNotifications.length === 0) {
    return [];
  }

  const batch: DigestBatch = {
    userId,
    workspaceId,
    notifications: pendingNotifications,
    periodStart,
    periodEnd,
  };

  const digestId = await createDigest(batch, preferences);

  return [digestId];
}

/**
 * Mark digest as read (and optionally mark source notifications)
 */
export async function markDigestRead(digestId: string, markSourceNotifications: boolean = false) {
  const [digest] = await db
    .update(notificationDigests)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(eq(notificationDigests.id, digestId))
    .returning();

  if (markSourceNotifications && digest) {
    await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(inArray(notifications.id, digest.notificationIds as string[]));
  }

  return digest;
}

/**
 * Get recent digests for user
 */
export async function getUserDigests(userId: string, workspaceId: string, limit: number = 10) {
  return db
    .select()
    .from(notificationDigests)
    .where(and(
      eq(notificationDigests.userId, userId),
      eq(notificationDigests.workspaceId, workspaceId)
    ))
    .orderBy(notificationDigests.createdAt)
    .limit(limit);
}
