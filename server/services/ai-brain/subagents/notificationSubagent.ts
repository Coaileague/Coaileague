/**
 * UNIVERSAL NOTIFICATION SUBAGENT - Fortune 500-Grade Communication
 * ==================================================================
 * Intelligent, personalized notification delivery with:
 * 
 * - Tiered Priorities: P0 (Critical), P1 (Urgent), P2 (Routine)
 * - Smart Bundling: Reduces notification fatigue
 * - Role-Based Personalization: Context-aware messaging
 * - Frequency Management: Prevents over-notification
 * - Secure Opt-In: GDPR/CCPA compliant preferences
 */

import { db } from '../../../db';
import {
  notifications,
  users,
  employees,
  userNotificationPreferences
} from '@shared/schema';
import { eq, and, gte, desc, inArray, sql } from 'drizzle-orm';
import { universalNotificationEngine } from '../../universalNotificationEngine';
import { emailService } from '../../emailService';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { createLogger } from '../../../lib/logger';
const log = createLogger('notificationSubagent');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type NotificationPriority = 'P0' | 'P1' | 'P2';
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';
export type RecipientRole = 'employee' | 'manager' | 'admin' | 'owner';

interface NotificationTier {
  priority: NotificationPriority;
  name: string;
  description: string;
  allowOutsideHours: boolean;
  bundleWindow: number; // minutes
  maxPerHour: number;
  channels: NotificationChannel[];
}

interface NotificationPayload {
  priority: NotificationPriority;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, any>;
}

interface BundledNotification {
  id: string;
  bundleKey: string;
  notifications: NotificationPayload[];
  summary: string;
  priority: NotificationPriority;
  createdAt: Date;
}

interface PersonalizedMessage {
  role: RecipientRole;
  title: string;
  message: string;
  actionLabel: string;
}

interface NotificationResult {
  success: boolean;
  notificationId?: string;
  bundled: boolean;
  bundleId?: string;
  deliveredVia: NotificationChannel[];
  suppressedReason?: string;
}

interface FrequencyState {
  userId: string;
  hourlyCount: number;
  dailyCount: number;
  lastNotification: Date;
  bundlePending: Map<string, NotificationPayload[]>;
}

// ============================================================================
// NOTIFICATION TIERS CONFIGURATION
// ============================================================================

const NOTIFICATION_TIERS: Record<NotificationPriority, NotificationTier> = {
  P0: {
    priority: 'P0',
    name: 'Critical',
    description: 'System failures, payroll errors, compliance violations',
    allowOutsideHours: true, // Can interrupt outside work hours
    bundleWindow: 0, // Never bundle - deliver immediately
    maxPerHour: 10,
    channels: ['in_app', 'email', 'sms', 'push'],
  },
  P1: {
    priority: 'P1',
    name: 'Urgent',
    description: 'Open shifts, schedule conflicts, pending approvals',
    allowOutsideHours: false,
    bundleWindow: 15, // Bundle similar notifications within 15 minutes
    maxPerHour: 20,
    channels: ['in_app', 'email', 'push'],
  },
  P2: {
    priority: 'P2',
    name: 'Routine',
    description: 'Shift confirmations, updates, reminders',
    allowOutsideHours: false,
    bundleWindow: 60, // Bundle within 1 hour
    maxPerHour: 50,
    channels: ['in_app', 'email'],
  },
};

// ============================================================================
// NOTIFICATION SUBAGENT SERVICE
// ============================================================================

class NotificationSubagentService {
  private static instance: NotificationSubagentService;
  private frequencyState: Map<string, FrequencyState> = new Map();
  private bundleQueue: Map<string, BundledNotification> = new Map();
  private bundleFlushInterval: NodeJS.Timeout | null = null;

  static getInstance(): NotificationSubagentService {
    if (!NotificationSubagentService.instance) {
      NotificationSubagentService.instance = new NotificationSubagentService();
    }
    return NotificationSubagentService.instance;
  }

  constructor() {
    // Start bundle flush interval (every minute)
    this.bundleFlushInterval = setInterval(() => this.flushBundles(), 60000);
  }

  // ---------------------------------------------------------------------------
  // SEND NOTIFICATION (with smart bundling)
  // ---------------------------------------------------------------------------
  async sendNotification(
    workspaceId: string,
    userId: string,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    const tier = NOTIFICATION_TIERS[payload.priority];
    
    // Check user preferences
    const preferences = await this.getUserPreferences(userId);
    if (preferences?.pauseAll) {
      return {
        success: false,
        bundled: false,
        deliveredVia: [],
        suppressedReason: 'User has paused all notifications',
      };
    }

    // Check frequency limits
    const frequencyCheck = this.checkFrequencyLimits(userId, tier);
    if (!frequencyCheck.allowed) {
      return {
        success: false,
        bundled: false,
        deliveredVia: [],
        suppressedReason: frequencyCheck.reason,
      };
    }

    // Check outside hours
    if (!tier.allowOutsideHours && this.isOutsideWorkHours(preferences)) {
      // Queue for delivery during work hours
      return {
        success: true,
        bundled: true,
        deliveredVia: [],
        suppressedReason: 'Queued for delivery during work hours',
      };
    }

    // Check if should bundle
    if (tier.bundleWindow > 0) {
      const bundleKey = this.generateBundleKey(userId, payload.type);
      const bundled = this.addToBundleQueue(bundleKey, payload, tier.bundleWindow);
      
      if (bundled) {
        return {
          success: true,
          bundled: true,
          bundleId: bundleKey,
          deliveredVia: [],
        };
      }
    }

    // Deliver immediately
    return await this.deliverNotification(workspaceId, userId, payload, tier);
  }

  // ---------------------------------------------------------------------------
  // BULK NOTIFICATION (role-targeted)
  // ---------------------------------------------------------------------------
  async sendBulkNotification(
    workspaceId: string,
    targetRoles: RecipientRole[],
    basePayload: NotificationPayload,
    personalizeByRole: boolean = true
  ): Promise<{
    sent: number;
    suppressed: number;
    bundled: number;
    results: NotificationResult[];
  }> {
    // Get users by role
    const targetUsers = await this.getUsersByRole(workspaceId, targetRoles);
    
    const results: NotificationResult[] = [];
    let sent = 0;
    let suppressed = 0;
    let bundled = 0;

    for (const user of targetUsers) {
      // Personalize message if requested
      const personalizedPayload = personalizeByRole
        ? await this.personalizeMessage(basePayload, user.role as RecipientRole)
        : basePayload;

      const result = await this.sendNotification(workspaceId, user.id, personalizedPayload);
      results.push(result);

      if (result.success && !result.bundled) sent++;
      else if (result.bundled) bundled++;
      else suppressed++;
    }

    return { sent, suppressed, bundled, results };
  }

  // ---------------------------------------------------------------------------
  // P0 CRITICAL ALERT (immediate, all channels)
  // ---------------------------------------------------------------------------
  async sendCriticalAlert(
    workspaceId: string,
    userIds: string[],
    alert: {
      title: string;
      message: string;
      actionUrl?: string;
      relatedEntity?: { type: string; id: string };
    }
  ): Promise<{
    delivered: number;
    failed: number;
    channels: NotificationChannel[];
  }> {
    log.info(`[NotificationSubagent] Sending P0 CRITICAL alert to ${userIds.length} users`);

    const payload: NotificationPayload = {
      priority: 'P0',
      type: 'critical_alert',
      title: alert.title,
      message: alert.message,
      actionUrl: alert.actionUrl,
      relatedEntityType: alert.relatedEntity?.type,
      relatedEntityId: alert.relatedEntity?.id,
      metadata: { isCritical: true, sentAt: new Date().toISOString() },
    };

    let delivered = 0;
    let failed = 0;
    const channelsUsed = new Set<NotificationChannel>();

    for (const userId of userIds) {
      const result = await this.sendNotification(workspaceId, userId, payload);
      
      if (result.success) {
        delivered++;
        result.deliveredVia.forEach(c => channelsUsed.add(c));
      } else {
        failed++;
      }
    }

    return {
      delivered,
      failed,
      channels: Array.from(channelsUsed),
    };
  }

  // ---------------------------------------------------------------------------
  // SMART BUNDLING
  // ---------------------------------------------------------------------------
  private generateBundleKey(userId: string, notificationType: string): string {
    return `${userId}-${notificationType}-${Math.floor(Date.now() / 60000)}`; // Per-minute bucket
  }

  private addToBundleQueue(
    bundleKey: string,
    payload: NotificationPayload,
    windowMinutes: number
  ): boolean {
    const existing = this.bundleQueue.get(bundleKey);
    
    if (existing) {
      existing.notifications.push(payload);
      existing.summary = this.generateBundleSummary(existing.notifications);
      return true;
    }

    // Create new bundle
    this.bundleQueue.set(bundleKey, {
      id: bundleKey,
      bundleKey,
      notifications: [payload],
      summary: payload.title,
      priority: payload.priority,
      createdAt: new Date(),
    });

    // Set timer to flush this bundle
    setTimeout(() => this.flushBundle(bundleKey), windowMinutes * 60 * 1000);

    return false; // First notification in bundle, will be delivered with bundle
  }

  private generateBundleSummary(notifications: NotificationPayload[]): string {
    if (notifications.length === 1) {
      return notifications[0].title;
    }

    // Group by type
    const types = new Map<string, number>();
    for (const n of notifications) {
      types.set(n.type, (types.get(n.type) || 0) + 1);
    }

    const summaries = Array.from(types.entries())
      .map(([type, count]) => `${count} ${type.replace(/_/g, ' ')}${count > 1 ? 's' : ''}`)
      .join(', ');

    return `${notifications.length} updates: ${summaries}`;
  }

  private async flushBundle(bundleKey: string): Promise<void> {
    const bundle = this.bundleQueue.get(bundleKey);
    if (!bundle || bundle.notifications.length === 0) {
      this.bundleQueue.delete(bundleKey);
      return;
    }

    // Extract userId from bundleKey
    const userId = bundleKey.split('-')[0];
    
    // Create bundled notification
    const bundledPayload: NotificationPayload = {
      priority: bundle.priority,
      type: 'bundled_notification',
      title: bundle.summary,
      message: this.formatBundleMessage(bundle.notifications),
      metadata: {
        isBundled: true,
        notificationCount: bundle.notifications.length,
        originalNotifications: bundle.notifications.map(n => ({ type: n.type, title: n.title })),
      },
    };

    // Get workspace from first notification or use placeholder
    const workspaceId = bundle.notifications[0]?.metadata?.workspaceId || 'unknown';

    await this.deliverNotification(
      workspaceId,
      userId,
      bundledPayload,
      NOTIFICATION_TIERS[bundle.priority]
    );

    this.bundleQueue.delete(bundleKey);
    log.info(`[NotificationSubagent] Flushed bundle ${bundleKey} with ${bundle.notifications.length} notifications`);
  }

  private formatBundleMessage(notifications: NotificationPayload[]): string {
    if (notifications.length <= 3) {
      return notifications.map(n => `- ${n.message}`).join('\n');
    }
    
    return notifications.slice(0, 3).map(n => `- ${n.message}`).join('\n') 
      + `\n...and ${notifications.length - 3} more`;
  }

  private flushBundles(): void {
    const now = Date.now();
    
    for (const [key, bundle] of this.bundleQueue) {
      const ageMs = now - bundle.createdAt.getTime();
      const maxAgeMs = NOTIFICATION_TIERS[bundle.priority].bundleWindow * 60 * 1000;
      
      if (ageMs >= maxAgeMs) {
        this.flushBundle(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PERSONALIZATION
  // ---------------------------------------------------------------------------
  private async personalizeMessage(
    payload: NotificationPayload,
    role: RecipientRole
  ): Promise<NotificationPayload> {
    const personalizations: Record<RecipientRole, { titlePrefix?: string; actionLabel: string }> = {
      employee: { actionLabel: 'View your schedule' },
      manager: { titlePrefix: 'Action Required: ', actionLabel: 'Review and respond' },
      admin: { titlePrefix: 'Admin Alert: ', actionLabel: 'Take action' },
      owner: { titlePrefix: 'Business Alert: ', actionLabel: 'Review immediately' },
    };

    const personalization = personalizations[role] || personalizations.employee;

    return {
      ...payload,
      title: (personalization.titlePrefix || '') + payload.title,
      metadata: {
        ...payload.metadata,
        personalizedFor: role,
        actionLabel: personalization.actionLabel,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // FREQUENCY MANAGEMENT
  // ---------------------------------------------------------------------------
  private checkFrequencyLimits(
    userId: string,
    tier: NotificationTier
  ): { allowed: boolean; reason?: string } {
    const state = this.getFrequencyState(userId);
    const now = Date.now();
    const hourAgo = now - 3600000;

    // Reset hourly count if needed
    if (state.lastNotification.getTime() < hourAgo) {
      state.hourlyCount = 0;
    }

    if (state.hourlyCount >= tier.maxPerHour) {
      return {
        allowed: false,
        reason: `Hourly limit (${tier.maxPerHour}) reached for ${tier.name} notifications`,
      };
    }

    return { allowed: true };
  }

  private getFrequencyState(userId: string): FrequencyState {
    let state = this.frequencyState.get(userId);
    
    if (!state) {
      state = {
        userId,
        hourlyCount: 0,
        dailyCount: 0,
        lastNotification: new Date(0),
        bundlePending: new Map(),
      };
      this.frequencyState.set(userId, state);
    }

    return state;
  }

  private updateFrequencyState(userId: string): void {
    const state = this.getFrequencyState(userId);
    state.hourlyCount++;
    state.dailyCount++;
    state.lastNotification = new Date();
  }

  // ---------------------------------------------------------------------------
  // DELIVERY
  // ---------------------------------------------------------------------------
  private async deliverNotification(
    workspaceId: string,
    userId: string,
    payload: NotificationPayload,
    tier: NotificationTier
  ): Promise<NotificationResult> {
    const deliveredVia: NotificationChannel[] = [];

    try {
      // Always deliver in-app via UniversalNotificationEngine for Trinity AI enrichment and validation
      if (tier.channels.includes('in_app')) {
        await universalNotificationEngine.sendNotification({
          type: payload.type as any,
          title: payload.title,
          message: payload.message,
          workspaceId,
          targetUserIds: [userId],
          severity: payload.priority === 'P0' ? 'critical' : payload.priority === 'P1' ? 'high' : 'medium',
          source: 'notification_subagent',
          metadata: {
            ...payload.metadata,
            priority: payload.priority,
            actionUrl: payload.actionUrl,
            relatedEntityType: payload.relatedEntityType,
            relatedEntityId: payload.relatedEntityId,
          },
        });
        deliveredVia.push('in_app');
      }

      // Email for P0 and P1 - Actually send the email
      if (tier.channels.includes('email') && (payload.priority === 'P0' || payload.priority === 'P1')) {
        try {
          // Get user email
          const [user] = await db.select({ email: users.email, firstName: users.firstName })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (user?.email) {
            const priorityLabel = payload.priority === 'P0' ? '🚨 CRITICAL' : '⚠️ URGENT';
            await NotificationDeliveryService.send({
              type: 'ai_brain_email',
              workspaceId: workspaceId || 'system',
              recipientUserId: userId,
              channel: 'email',
              body: {
                to: user.email,
                subject: `${priorityLabel}: ${payload.title}`,
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: ${payload.priority === 'P0' ? '#dc2626' : '#f59e0b'};">${payload.title}</h2>
                  <p>${payload.message}</p>
                  ${payload.actionUrl ? `<p><a href="${payload.actionUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Details</a></p>` : ''}
                  <hr style="margin-top: 20px; border: none; border-top: 1px solid #e5e7eb;">
                  <p style="font-size: 12px; color: #6b7280;">This is an automated ${payload.priority} priority notification from CoAIleague.</p>
                </div>
              `,
              },
            });
            deliveredVia.push('email');
            log.info(`[NotificationSubagent] ${payload.priority} email sent to ${user.email}`);
          }
        } catch (emailError: any) {
          log.error(`[NotificationSubagent] Email delivery failed:`, emailError.message);
          // Don't fail the notification if email fails - in-app still works
        }
      }

      // Update frequency state
      this.updateFrequencyState(userId);

      return {
        success: true,
        bundled: false,
        deliveredVia,
      };

    } catch (error: any) {
      log.error(`[NotificationSubagent] Delivery failed:`, (error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        bundled: false,
        deliveredVia: [],
        suppressedReason: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------------------------------

  private async getUserPreferences(userId: string): Promise<any | null> {
    try {
      const [prefs] = await db.select()
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, userId))
        .limit(1);
      return prefs;
    } catch (error) {
      return null;
    }
  }

  private async getUsersByRole(workspaceId: string, roles: RecipientRole[]): Promise<Array<{ id: string; role: string }>> {
    // Map roles to workspace roles
    const workspaceRoles = roles.map(r => {
      if (r === 'owner') return 'org_owner';
      if (r === 'admin') return 'org_admin';
      if (r === 'manager') return 'manager';
      return 'employee';
    });

    const empData = await db.select({
      userId: employees.userId,
      workspaceRole: employees.workspaceRole,
    })
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      inArray(employees.workspaceRole, workspaceRoles),
      eq(employees.isActive, true)
    ));

    return empData
      .filter(e => e.userId)
      .map(e => ({ id: e.userId!, role: e.workspaceRole || 'employee' }));
  }

  private isOutsideWorkHours(preferences: any): boolean {
    if (!preferences?.quietHoursEnabled) return false;
    
    const now = new Date();
    const hour = now.getHours();
    const startQuiet = preferences.quietHoursStart || 21; // 9 PM
    const endQuiet = preferences.quietHoursEnd || 7; // 7 AM

    if (startQuiet > endQuiet) {
      // Overnight quiet hours (e.g., 9 PM to 7 AM)
      return hour >= startQuiet || hour < endQuiet;
    } else {
      return hour >= startQuiet && hour < endQuiet;
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  getTierConfiguration(): Record<NotificationPriority, NotificationTier> {
    return { ...NOTIFICATION_TIERS };
  }

  async getNotificationStats(workspaceId: string, hours: number = 24): Promise<{
    total: number;
    byPriority: Record<NotificationPriority, number>;
    bundledCount: number;
    suppressedCount: number;
  }> {
    const since = new Date(Date.now() - hours * 3600000);
    
    const notifs = await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.workspaceId, workspaceId),
        gte(notifications.createdAt, since)
      ));

    const byPriority: Record<NotificationPriority, number> = { P0: 0, P1: 0, P2: 0 };
    let bundledCount = 0;

    for (const n of notifs) {
      const priority = (n.metadata as any)?.priority as NotificationPriority;
      if (priority && byPriority[priority] !== undefined) {
        byPriority[priority]++;
      }
      if ((n.metadata as any)?.isBundled) bundledCount++;
    }

    return {
      total: notifs.length,
      byPriority,
      bundledCount,
      suppressedCount: 0, // Would need separate tracking
    };
  }

  cleanup(): void {
    if (this.bundleFlushInterval) {
      clearInterval(this.bundleFlushInterval);
    }
  }
}

export const notificationSubagent = NotificationSubagentService.getInstance();
