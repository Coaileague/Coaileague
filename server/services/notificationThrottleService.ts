import { db } from "@db";
import { notificationActivity, userNotificationPreferences } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

interface ThrottleDecision {
  shouldThrottle: boolean;
  reason?: string;
  resumeAt?: Date;
  currentEngagement?: number;
}

interface ActivityMetrics {
  totalReceived: number;
  totalRead: number;
  totalDismissed: number;
  totalActedOn: number;
  engagementRate: number;
}

export class NotificationThrottleService {
  private static instance: NotificationThrottleService;
  
  private readonly WINDOW_DURATION_MS = 60 * 60 * 1000; // 1 hour window
  private readonly HIGH_VOLUME_THRESHOLD = 50; // notifications per hour
  private readonly LOW_ENGAGEMENT_THRESHOLD = 0.1; // 10% engagement
  private readonly THROTTLE_DURATION_MS = 30 * 60 * 1000; // 30 min throttle

  static getInstance(): NotificationThrottleService {
    if (!NotificationThrottleService.instance) {
      NotificationThrottleService.instance = new NotificationThrottleService();
    }
    return NotificationThrottleService.instance;
  }

  async shouldThrottle(
    userId: string,
    workspaceId?: string | null,
    notificationType?: string
  ): Promise<ThrottleDecision> {
    const prefs = await this.getUserPreferences(userId, workspaceId);
    
    if (prefs?.digestFrequency === 'never') {
      return {
        shouldThrottle: true,
        reason: 'User has disabled all notifications',
      };
    }

    if (prefs?.quietHoursStart != null && prefs?.quietHoursEnd != null) {
      const now = new Date();
      const currentHour = now.getHours();
      if (this.isInQuietHours(currentHour, prefs.quietHoursStart, prefs.quietHoursEnd)) {
        return {
          shouldThrottle: true,
          reason: 'Quiet hours active',
          resumeAt: this.getQuietHoursEnd(prefs.quietHoursEnd),
        };
      }
    }

    const activity = await this.getCurrentActivity(userId, workspaceId);
    
    if (activity.isThrottled && activity.throttleUntil && new Date(activity.throttleUntil) > new Date()) {
      return {
        shouldThrottle: true,
        reason: activity.throttleReason || 'Currently throttled',
        resumeAt: new Date(activity.throttleUntil),
      };
    }

    const metrics = this.calculateMetrics(activity);

    if (metrics.totalReceived >= this.HIGH_VOLUME_THRESHOLD && 
        metrics.engagementRate < this.LOW_ENGAGEMENT_THRESHOLD) {
      await this.setThrottled(userId, workspaceId, 'High volume, low engagement');
      return {
        shouldThrottle: true,
        reason: 'High notification volume with low engagement',
        resumeAt: new Date(Date.now() + this.THROTTLE_DURATION_MS),
        currentEngagement: metrics.engagementRate,
      };
    }

    return { shouldThrottle: false };
  }

  private async getUserPreferences(userId: string, workspaceId?: string | null) {
    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);
    return prefs;
  }

  private async getCurrentActivity(userId: string, workspaceId?: string | null) {
    const windowStart = new Date(Date.now() - this.WINDOW_DURATION_MS);
    
    const [activity] = await db
      .select()
      .from(notificationActivity)
      .where(
        and(
          eq(notificationActivity.userId, userId),
          gte(notificationActivity.windowEnd, windowStart)
        )
      )
      .orderBy(desc(notificationActivity.windowEnd))
      .limit(1);

    return activity || {
      totalReceived: 0,
      totalRead: 0,
      totalDismissed: 0,
      totalActedOn: 0,
      isThrottled: false,
      throttleReason: null,
      throttleUntil: null,
    };
  }

  private calculateMetrics(activity: any): ActivityMetrics {
    const totalReceived = activity.totalReceived || 0;
    const totalRead = activity.totalRead || 0;
    const totalActedOn = activity.totalActedOn || 0;
    const totalDismissed = activity.totalDismissed || 0;

    const engagementRate = totalReceived > 0 
      ? (totalRead + totalActedOn) / totalReceived 
      : 1;

    return {
      totalReceived,
      totalRead,
      totalDismissed,
      totalActedOn,
      engagementRate,
    };
  }

  private isInQuietHours(currentHour: number, start: number, end: number): boolean {
    if (start <= end) {
      return currentHour >= start && currentHour < end;
    } else {
      return currentHour >= start || currentHour < end;
    }
  }

  private getQuietHoursEnd(endHour: number): Date {
    const now = new Date();
    const resumeTime = new Date(now);
    resumeTime.setHours(endHour, 0, 0, 0);
    
    if (resumeTime <= now) {
      resumeTime.setDate(resumeTime.getDate() + 1);
    }
    
    return resumeTime;
  }

  private async setThrottled(
    userId: string,
    workspaceId: string | null | undefined,
    reason: string
  ): Promise<void> {
    const windowStart = new Date(Date.now() - this.WINDOW_DURATION_MS);
    const windowEnd = new Date();
    const throttleUntil = new Date(Date.now() + this.THROTTLE_DURATION_MS);

    await db
      .insert(notificationActivity)
      .values({
        userId,
        workspaceId: workspaceId || null,
        windowStart,
        windowEnd,
        isThrottled: true,
        throttleReason: reason,
        throttleUntil,
      })
      .onConflictDoUpdate({
        target: [notificationActivity.userId],
        set: {
          isThrottled: true,
          throttleReason: reason,
          throttleUntil,
        },
      });
  }

  async recordNotificationReceived(
    userId: string,
    workspaceId?: string | null,
    category?: string,
    type?: string
  ): Promise<void> {
    const windowStart = new Date(Date.now() - this.WINDOW_DURATION_MS);
    const windowEnd = new Date();

    const existing = await db
      .select()
      .from(notificationActivity)
      .where(
        and(
          eq(notificationActivity.userId, userId),
          gte(notificationActivity.windowStart, windowStart)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const currentCount = existing[0].countByCategory || {};
      const currentTypeCount = existing[0].countByType || {};
      
      await db
        .update(notificationActivity)
        .set({
          totalReceived: (existing[0].totalReceived || 0) + 1,
          countByCategory: {
            ...currentCount,
            [category || 'unknown']: ((currentCount as any)[category || 'unknown'] || 0) + 1,
          },
          countByType: {
            ...currentTypeCount,
            [type || 'unknown']: ((currentTypeCount as any)[type || 'unknown'] || 0) + 1,
          },
        })
        .where(eq(notificationActivity.id, existing[0].id));
    } else {
      await db
        .insert(notificationActivity)
        .values({
          userId,
          workspaceId: workspaceId || null,
          windowStart,
          windowEnd,
          totalReceived: 1,
          countByCategory: { [category || 'unknown']: 1 },
          countByType: { [type || 'unknown']: 1 },
        });
    }
  }

  async recordNotificationRead(userId: string): Promise<void> {
    const windowStart = new Date(Date.now() - this.WINDOW_DURATION_MS);

    await db
      .update(notificationActivity)
      .set({
        totalRead: db.raw`COALESCE(total_read, 0) + 1`,
      })
      .where(
        and(
          eq(notificationActivity.userId, userId),
          gte(notificationActivity.windowStart, windowStart)
        )
      );
  }

  async recordNotificationActedOn(userId: string): Promise<void> {
    const windowStart = new Date(Date.now() - this.WINDOW_DURATION_MS);

    await db
      .update(notificationActivity)
      .set({
        totalActedOn: db.raw`COALESCE(total_acted_on, 0) + 1`,
      })
      .where(
        and(
          eq(notificationActivity.userId, userId),
          gte(notificationActivity.windowStart, windowStart)
        )
      );
  }

  async getActivityMetrics(userId: string, workspaceId?: string | null): Promise<ActivityMetrics> {
    const activity = await this.getCurrentActivity(userId, workspaceId);
    return this.calculateMetrics(activity);
  }
}

export const notificationThrottleService = NotificationThrottleService.getInstance();
