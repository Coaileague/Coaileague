/**
 * Room Analytics Service
 * Tracks and aggregates metrics for chat room activities
 * - Message counts and trends
 * - Participant activity patterns
 * - Support ticket resolution times
 * - AI escalation rates
 * - Sentiment distribution analysis
 * - Time-series data (hourly and daily)
 */

import { db } from "../db";
import {
  roomAnalytics,
  roomAnalyticsTimeseries,
  chatMessages,
  chatParticipants,
  supportTickets,
  chatConversations,
} from "@shared/schema";
import { eq, and, or, gte, lte, count, sum, avg, sql, desc } from "drizzle-orm";

/**
 * Room Analytics Metrics - aggregated statistics
 */
export interface RoomMetrics {
  id: string;
  workspaceId: string;
  roomType: string;
  conversationId: string;
  roomName?: string;
  totalMessages: number;
  messageCountToday: number;
  messageCountThisWeek: number;
  totalParticipants: number;
  activeParticipantsNow: number;
  newParticipantsToday: number;
  ticketsCreated: number;
  ticketsResolved: number;
  avgResolutionTimeHours?: number;
  unresovledTickets: number;
  aiEscalationCount: number;
  aiEscalationRate: number;
  aiResponseCount: number;
  sentimentPositive: number;
  sentimentNeutral: number;
  sentimentNegative: number;
  averageSentimentScore?: number;
  status: string;
  updatedAt: Date;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  id: string;
  workspaceId: string;
  conversationId: string;
  period: "hourly" | "daily";
  periodStart: Date;
  periodEnd: Date;
  messageCount: number;
  participantCount: number;
  newParticipants: number;
  ticketsCreated: number;
  ticketsResolved: number;
  avgResolutionTimeHours?: number;
  aiResponses: number;
  aiEscalations: number;
  sentimentPositive: number;
  sentimentNeutral: number;
  sentimentNegative: number;
  averageSentimentScore?: number;
}

/**
 * Analytics response for API
 */
export interface RoomsAnalyticsResponse {
  workspaceId: string;
  totalRooms: number;
  rooms: RoomMetrics[];
  summary: {
    totalMessages: number;
    totalParticipants: number;
    averageResolutionTime: number;
    averageAiEscalationRate: number;
  };
}

/**
 * Get or create room analytics record
 */
async function getOrCreateRoomAnalytics(
  workspaceId: string,
  conversationId: string,
  roomName?: string,
  roomType?: string
): Promise<string> {
  // Check if exists
  const existing = await db
    .select()
    .from(roomAnalytics)
    .where(
      and(
        eq(roomAnalytics.workspaceId, workspaceId),
        eq(roomAnalytics.conversationId, conversationId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Get conversation to determine room type if not provided
  if (!roomType) {
    const conv = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);

    if (conv.length > 0) {
      roomType = conv[0].conversationType === "shift_chat" ? "work" : "meeting";
      roomName = conv[0].subject;
    }
  }

  // Create new record
  const newRecord = await db
    .insert(roomAnalytics)
    .values({
      workspaceId,
      conversationId,
      roomName: roomName || "Unnamed Room",
      roomType: roomType || "meeting",
      status: "active",
    })
    .returning({ id: roomAnalytics.id });

  return newRecord[0]?.id || "";
}

/**
 * Increment message count
 */
export async function trackMessagePosted(
  workspaceId: string,
  conversationId: string,
  sentiment?: "positive" | "neutral" | "negative"
): Promise<void> {
  try {
    await getOrCreateRoomAnalytics(workspaceId, conversationId);

    // Update current metrics
    await db.execute(
      sql`UPDATE room_analytics SET
        total_messages = total_messages + 1,
        message_count_today = message_count_today + 1,
        message_count_this_week = message_count_this_week + 1,
        ${
          sentiment === "positive"
            ? sql`sentiment_positive = sentiment_positive + 1`
            : sentiment === "negative"
              ? sql`sentiment_negative = sentiment_negative + 1`
              : sql`sentiment_neutral = sentiment_neutral + 1`
        },
        updated_at = NOW()
      WHERE workspace_id = ${workspaceId} AND conversation_id = ${conversationId}`
    );

    // Add to hourly timeseries
    await trackTimeseriesMetric(
      workspaceId,
      conversationId,
      "hourly",
      { messageCount: 1 }
    );
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking message:", error);
  }
}

/**
 * Track participant joining room
 * Note: Analytics tracking is non-critical - errors are logged but don't block chat operations
 */
export async function trackParticipantJoined(
  workspaceId: string,
  conversationId: string,
  userId: string
): Promise<void> {
  try {
    // Skip analytics if required params are missing (non-critical feature)
    if (!workspaceId || !conversationId) {
      console.log("[RoomAnalyticsService] Skipping analytics - missing workspace or conversation ID");
      return;
    }
    
    await getOrCreateRoomAnalytics(workspaceId, conversationId);

    // Check if this is a new participant (first time in this room)
    const participantRecord = await db
      .select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.conversationId, conversationId),
          eq(chatParticipants.userId, userId)
        )
      )
      .limit(1);

    const isNewParticipant = participantRecord.length === 0;

    // Update metrics using simpler increment logic
    const updateFields: Record<string, any> = {
      activeParticipantsNow: sql`active_participants_now + 1`,
      updatedAt: new Date(),
    };
    
    if (isNewParticipant) {
      updateFields.totalParticipants = sql`total_participants + 1`;
      updateFields.newParticipantsToday = sql`new_participants_today + 1`;
    }

    await db
      .update(roomAnalytics)
      .set(updateFields)
      .where(
        and(
          eq(roomAnalytics.workspaceId, workspaceId),
          eq(roomAnalytics.conversationId, conversationId)
        )
      );

    // Add to timeseries
    await trackTimeseriesMetric(
      workspaceId,
      conversationId,
      "hourly",
      { participantCount: 1, newParticipants: isNewParticipant ? 1 : 0 }
    );
  } catch (error) {
    // Non-critical - log and continue
    console.warn("[RoomAnalyticsService] Analytics tracking failed (non-critical):", (error as Error).message);
  }
}

/**
 * Track participant leaving room
 */
export async function trackParticipantLeft(
  workspaceId: string,
  conversationId: string
): Promise<void> {
  try {
    // Decrement active participants (but don't go below 0)
    await db.execute(
      sql`UPDATE room_analytics SET
        active_participants_now = GREATEST(0, active_participants_now - 1),
        updated_at = NOW()
      WHERE workspace_id = ${workspaceId} AND conversation_id = ${conversationId}`
    );
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking participant leave:", error);
  }
}

/**
 * Track support ticket creation
 */
export async function trackTicketCreated(
  workspaceId: string,
  conversationId: string
): Promise<void> {
  try {
    await getOrCreateRoomAnalytics(workspaceId, conversationId, undefined, "support");

    await db.execute(
      sql`UPDATE room_analytics SET
        tickets_created = tickets_created + 1,
        unresolved_tickets = unresolved_tickets + 1,
        updated_at = NOW()
      WHERE workspace_id = ${workspaceId} AND conversation_id = ${conversationId}`
    );

    await trackTimeseriesMetric(
      workspaceId,
      conversationId,
      "hourly",
      { ticketsCreated: 1 }
    );
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking ticket creation:", error);
  }
}

/**
 * Track support ticket resolution
 */
export async function trackTicketResolved(
  workspaceId: string,
  conversationId: string,
  resolutionTimeHours: number
): Promise<void> {
  try {
    await getOrCreateRoomAnalytics(workspaceId, conversationId, undefined, "support");

    // Update metrics: increment resolved, decrement unresolved, update average resolution time
    const current = await db
      .select()
      .from(roomAnalytics)
      .where(
        and(
          eq(roomAnalytics.workspaceId, workspaceId),
          eq(roomAnalytics.conversationId, conversationId)
        )
      )
      .limit(1);

    if (current.length > 0) {
      const currentRecord = current[0];
      const newResolved = (currentRecord.ticketsResolved || 0) + 1;
      const newAvgTime = currentRecord.avgResolutionTimeHours
        ? (currentRecord.avgResolutionTimeHours * (newResolved - 1) + resolutionTimeHours) /
          newResolved
        : resolutionTimeHours;

      await db.execute(
        sql`UPDATE room_analytics SET
          tickets_resolved = tickets_resolved + 1,
          unresolved_tickets = GREATEST(0, unresolved_tickets - 1),
          avg_resolution_time_hours = ${newAvgTime},
          updated_at = NOW()
        WHERE workspace_id = ${workspaceId} AND conversation_id = ${conversationId}`
      );
    }

    await trackTimeseriesMetric(
      workspaceId,
      conversationId,
      "hourly",
      { ticketsResolved: 1, avgResolutionTimeHours: resolutionTimeHours }
    );
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking ticket resolution:", error);
  }
}

/**
 * Track AI escalation
 */
export async function trackAiEscalation(
  workspaceId: string,
  conversationId: string
): Promise<void> {
  try {
    await getOrCreateRoomAnalytics(workspaceId, conversationId);

    // Get current metrics to calculate escalation rate
    const current = await db
      .select()
      .from(roomAnalytics)
      .where(
        and(
          eq(roomAnalytics.workspaceId, workspaceId),
          eq(roomAnalytics.conversationId, conversationId)
        )
      )
      .limit(1);

    if (current.length > 0) {
      const record = current[0];
      const totalResponses = (record.aiResponseCount || 0) + 1;
      const totalEscalations = (record.aiEscalationCount || 0) + 1;
      const escalationRate = (totalEscalations / totalResponses) * 100;

      await db.execute(
        sql`UPDATE room_analytics SET
          ai_escalation_count = ai_escalation_count + 1,
          ai_response_count = ai_response_count + 1,
          ai_escalation_rate = ${escalationRate},
          updated_at = NOW()
        WHERE workspace_id = ${workspaceId} AND conversation_id = ${conversationId}`
      );

      await trackTimeseriesMetric(
        workspaceId,
        conversationId,
        "hourly",
        { aiResponses: 1, aiEscalations: 1 }
      );
    }
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking AI escalation:", error);
  }
}

/**
 * Track AI response (non-escalation)
 */
export async function trackAiResponse(
  workspaceId: string,
  conversationId: string
): Promise<void> {
  try {
    await getOrCreateRoomAnalytics(workspaceId, conversationId);

    // Get current metrics to calculate escalation rate (ratio doesn't change)
    const current = await db
      .select()
      .from(roomAnalytics)
      .where(
        and(
          eq(roomAnalytics.workspaceId, workspaceId),
          eq(roomAnalytics.conversationId, conversationId)
        )
      )
      .limit(1);

    if (current.length > 0) {
      const record = current[0];
      const totalResponses = (record.aiResponseCount || 0) + 1;
      const totalEscalations = record.aiEscalationCount || 0;
      const escalationRate = totalResponses > 0 ? (totalEscalations / totalResponses) * 100 : 0;

      await db.execute(
        sql`UPDATE room_analytics SET
          ai_response_count = ai_response_count + 1,
          ai_escalation_rate = ${escalationRate},
          updated_at = NOW()
        WHERE workspace_id = ${workspaceId} AND conversation_id = ${conversationId}`
      );

      await trackTimeseriesMetric(
        workspaceId,
        conversationId,
        "hourly",
        { aiResponses: 1, aiEscalations: 0 }
      );
    }
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking AI response:", error);
  }
}

/**
 * Track time-series metric aggregation
 */
async function trackTimeseriesMetric(
  workspaceId: string,
  conversationId: string,
  period: "hourly" | "daily",
  delta: Partial<TimeSeriesPoint>
): Promise<void> {
  try {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (period === "hourly") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
    } else {
      // daily
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    }

    // Check if timeseries entry exists for this period
    const existing = await db
      .select()
      .from(roomAnalyticsTimeseries)
      .where(
        and(
          eq(roomAnalyticsTimeseries.workspaceId, workspaceId),
          eq(roomAnalyticsTimeseries.conversationId, conversationId),
          eq(roomAnalyticsTimeseries.period, period),
          eq(roomAnalyticsTimeseries.periodStart, periodStart)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      let updateFields: any = { updatedAt: new Date() };

      if (delta.messageCount) {
        updateFields.messageCount = sql`${roomAnalyticsTimeseries.messageCount} + ${delta.messageCount}`;
      }
      if (delta.participantCount) {
        updateFields.participantCount = sql`${roomAnalyticsTimeseries.participantCount} + ${delta.participantCount}`;
      }
      if (delta.newParticipants) {
        updateFields.newParticipants = sql`${roomAnalyticsTimeseries.newParticipants} + ${delta.newParticipants}`;
      }
      if (delta.ticketsCreated) {
        updateFields.ticketsCreated = sql`${roomAnalyticsTimeseries.ticketsCreated} + ${delta.ticketsCreated}`;
      }
      if (delta.ticketsResolved) {
        updateFields.ticketsResolved = sql`${roomAnalyticsTimeseries.ticketsResolved} + ${delta.ticketsResolved}`;
      }
      if (delta.aiResponses) {
        updateFields.aiResponses = sql`${roomAnalyticsTimeseries.aiResponses} + ${delta.aiResponses}`;
      }
      if (delta.aiEscalations) {
        updateFields.aiEscalations = sql`${roomAnalyticsTimeseries.aiEscalations} + ${delta.aiEscalations}`;
      }

      await db.execute(
        sql`UPDATE ${roomAnalyticsTimeseries} SET
          ${sql.raw(Object.entries(updateFields).map(([k, v]) => `${k} = ${v}`).join(", "))}
        WHERE workspace_id = ${workspaceId}
          AND conversation_id = ${conversationId}
          AND period = ${period}
          AND period_start = ${periodStart}`
      );
    } else {
      // Create new record with the delta values
      await db.insert(roomAnalyticsTimeseries).values({
        workspaceId,
        conversationId,
        period,
        periodStart,
        periodEnd,
        messageCount: delta.messageCount || 0,
        participantCount: delta.participantCount || 0,
        newParticipants: delta.newParticipants || 0,
        ticketsCreated: delta.ticketsCreated || 0,
        ticketsResolved: delta.ticketsResolved || 0,
        aiResponses: delta.aiResponses || 0,
        aiEscalations: delta.aiEscalations || 0,
      });
    }
  } catch (error) {
    console.error("[RoomAnalyticsService] Error tracking timeseries:", error);
  }
}

/**
 * Get analytics for all rooms in workspace
 */
export async function getRoomsAnalytics(
  workspaceId: string
): Promise<RoomsAnalyticsResponse> {
  try {
    const rooms = await db
      .select()
      .from(roomAnalytics)
      .where(eq(roomAnalytics.workspaceId, workspaceId))
      .orderBy(desc(roomAnalytics.updatedAt));

    // Calculate summary
    const summary = {
      totalMessages: rooms.reduce((sum, r) => sum + (r.totalMessages || 0), 0),
      totalParticipants: rooms.reduce((sum, r) => sum + (r.totalParticipants || 0), 0),
      averageResolutionTime:
        rooms.length > 0
          ? rooms.reduce((sum, r) => sum + (r.avgResolutionTimeHours || 0), 0) / rooms.length
          : 0,
      averageAiEscalationRate:
        rooms.length > 0
          ? rooms.reduce((sum, r) => sum + (r.aiEscalationRate || 0), 0) / rooms.length
          : 0,
    };

    return {
      workspaceId,
      totalRooms: rooms.length,
      rooms: rooms as RoomMetrics[],
      summary,
    };
  } catch (error) {
    console.error("[RoomAnalyticsService] Error getting rooms analytics:", error);
    return {
      workspaceId,
      totalRooms: 0,
      rooms: [],
      summary: {
        totalMessages: 0,
        totalParticipants: 0,
        averageResolutionTime: 0,
        averageAiEscalationRate: 0,
      },
    };
  }
}

/**
 * Get time-series analytics for a specific room
 */
export async function getRoomTimeSeries(
  workspaceId: string,
  conversationId: string,
  period: "hourly" | "daily",
  hoursBack: number = 24
): Promise<TimeSeriesPoint[]> {
  try {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const timeseries = await db
      .select()
      .from(roomAnalyticsTimeseries)
      .where(
        and(
          eq(roomAnalyticsTimeseries.workspaceId, workspaceId),
          eq(roomAnalyticsTimeseries.conversationId, conversationId),
          eq(roomAnalyticsTimeseries.period, period),
          gte(roomAnalyticsTimeseries.periodStart, cutoffTime)
        )
      )
      .orderBy(roomAnalyticsTimeseries.periodStart);

    return timeseries as TimeSeriesPoint[];
  } catch (error) {
    console.error("[RoomAnalyticsService] Error getting time series:", error);
    return [];
  }
}

/**
 * Reset daily counters (call once per day)
 */
export async function resetDailyCounters(workspaceId: string): Promise<void> {
  try {
    await db.execute(
      sql`UPDATE room_analytics SET
        message_count_today = 0,
        new_participants_today = 0
      WHERE workspace_id = ${workspaceId}`
    );
  } catch (error) {
    console.error("[RoomAnalyticsService] Error resetting daily counters:", error);
  }
}

/**
 * Reset weekly counters (call once per week)
 */
export async function resetWeeklyCounters(workspaceId: string): Promise<void> {
  try {
    await db.execute(
      sql`UPDATE room_analytics SET
        message_count_this_week = 0
      WHERE workspace_id = ${workspaceId}`
    );
  } catch (error) {
    console.error("[RoomAnalyticsService] Error resetting weekly counters:", error);
  }
}

/**
 * Get comprehensive analytics data for a workspace
 * Combines room analytics with time-series data
 */
export async function getAnalyticsData(
  workspaceId: string,
  roomType?: 'support' | 'work' | 'meeting' | 'org',
  timeframe: 'hourly' | 'daily' = 'daily',
  days: number = 7
): Promise<any> {
  try {
    // Get base room analytics
    const analytics = await getRoomsAnalytics(workspaceId, roomType);

    // Get time-series data for all rooms
    const hoursBack = timeframe === 'hourly' ? days * 24 : days * 24;
    const timeseriesData: Record<string, TimeSeriesPoint[]> = {};

    for (const room of analytics.rooms) {
      const timeseries = await getRoomTimeSeries(
        workspaceId,
        room.conversationId,
        timeframe,
        hoursBack
      );
      timeseriesData[room.conversationId] = timeseries;
    }

    return {
      ...analytics,
      timeseries: timeseriesData,
      timeframeConfig: {
        timeframe,
        days,
        hoursBack,
      },
    };
  } catch (error) {
    console.error("[RoomAnalyticsService] Error getting analytics data:", error);
    return {
      workspaceId,
      totalRooms: 0,
      rooms: [],
      timeseries: {},
      summary: {
        totalMessages: 0,
        totalParticipants: 0,
        averageResolutionTime: 0,
        averageAiEscalationRate: 0,
      },
      timeframeConfig: {
        timeframe,
        days,
        hoursBack: days * 24,
      },
    };
  }
}

export const roomAnalyticsService = {
  trackMessagePosted,
  trackParticipantJoined,
  trackParticipantLeft,
  trackTicketCreated,
  trackTicketResolved,
  trackAiEscalation,
  trackAiResponse,
  getRoomsAnalytics,
  getRoomTimeSeries,
  getAnalyticsData,
  resetDailyCounters,
  resetWeeklyCounters,
};
