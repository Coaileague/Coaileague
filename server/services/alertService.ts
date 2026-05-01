/**
 * Alert Service - Real-time Alert System for Critical System Events
 * 
 * Features:
 * - Evaluate alert conditions based on configurable thresholds
 * - Trigger alerts through multiple channels (in-app, email, SMS)
 * - Rate limiting to prevent alert flooding
 * - Alert history tracking and acknowledgment
 * - WebSocket integration for real-time in-app notifications
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { db } from '../db';
import { randomUUID } from 'crypto';
import { 
  alertConfigurations, 
  alertHistory, 
  alertRateLimits,
  users,
  employees,
  workspaces,
  type AlertConfiguration,
  type InsertAlertConfiguration,
  type AlertHistory,
  type InsertAlertHistory,
} from '@shared/schema';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { createNotification } from './notificationService';
import { createLogger } from '../lib/logger';
const log = createLogger('alertService');


// Alert type definitions for thresholds
export interface AlertThresholds {
  overtime?: { hours: number };
  low_coverage?: { percentage: number };
  compliance_violation?: { threshold: number };
  payment_overdue?: { days: number };
  shift_unfilled?: { hoursBeforeShift: number };
  clock_anomaly?: { varianceMinutes: number };
  budget_exceeded?: { percentage: number };
  approval_pending?: { hours: number };
}

// Alert trigger context
export interface AlertTriggerContext {
  workspaceId: string;
  alertType: 'overtime' | 'low_coverage' | 'compliance_violation' | 'payment_overdue' | 'shift_unfilled' | 'clock_anomaly' | 'budget_exceeded' | 'approval_pending';
  title: string;
  message: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  triggerData?: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  deduplicationKey?: string;
}

// Default alert configurations for new workspaces
export const DEFAULT_ALERT_CONFIGS: Partial<InsertAlertConfiguration>[] = [
  {
    alertType: 'overtime',
    isEnabled: true,
    severity: 'high',
    thresholds: { hours: 10 },
    channels: ['in_app', 'email'],
    cooldownMinutes: 60,
    maxAlertsPerHour: 5,
  },
  {
    alertType: 'low_coverage',
    isEnabled: true,
    severity: 'high',
    thresholds: { percentage: 80 },
    channels: ['in_app', 'email'],
    cooldownMinutes: 30,
    maxAlertsPerHour: 10,
  },
  {
    alertType: 'compliance_violation',
    isEnabled: true,
    severity: 'critical',
    thresholds: { threshold: 1 },
    channels: ['in_app', 'email', 'sms'],
    cooldownMinutes: 15,
    maxAlertsPerHour: 20,
  },
  {
    alertType: 'payment_overdue',
    isEnabled: true,
    severity: 'medium',
    thresholds: { days: 30 },
    channels: ['in_app', 'email'],
    cooldownMinutes: 1440, // 24 hours
    maxAlertsPerHour: 2,
  },
  {
    alertType: 'shift_unfilled',
    isEnabled: true,
    severity: 'high',
    thresholds: { hoursBeforeShift: 24 },
    channels: ['in_app', 'email'],
    cooldownMinutes: 120,
    maxAlertsPerHour: 10,
  },
  {
    alertType: 'clock_anomaly',
    isEnabled: false,
    severity: 'medium',
    thresholds: { varianceMinutes: 30 },
    channels: ['in_app'],
    cooldownMinutes: 60,
    maxAlertsPerHour: 10,
  },
  {
    alertType: 'budget_exceeded',
    isEnabled: true,
    severity: 'high',
    thresholds: { percentage: 100 },
    channels: ['in_app', 'email'],
    cooldownMinutes: 240,
    maxAlertsPerHour: 3,
  },
  {
    alertType: 'approval_pending',
    isEnabled: true,
    severity: 'low',
    thresholds: { hours: 48 },
    channels: ['in_app'],
    cooldownMinutes: 480,
    maxAlertsPerHour: 5,
  },
];

class AlertService {
  /**
   * Get all alert configurations for a workspace
   */
  async getAlertConfigurations(workspaceId: string): Promise<AlertConfiguration[]> {
    return await db
      .select()
      .from(alertConfigurations)
      .where(eq(alertConfigurations.workspaceId, workspaceId))
      .orderBy(alertConfigurations.alertType);
  }

  /**
   * Get a specific alert configuration
   */
  async getAlertConfiguration(workspaceId: string, alertType: string): Promise<AlertConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(alertConfigurations)
      .where(and(
        eq(alertConfigurations.workspaceId, workspaceId),
        eq(alertConfigurations.alertType, alertType as any)
      ));
    return config;
  }

  /**
   * Create or update an alert configuration
   */
  async upsertAlertConfiguration(
    workspaceId: string,
    config: Partial<InsertAlertConfiguration> & { alertType: string },
    userId?: string
  ): Promise<AlertConfiguration> {
    const existing = await this.getAlertConfiguration(workspaceId, config.alertType);
    
    if (existing) {
      const [updated] = await db
        .update(alertConfigurations)
        .set({
          ...config,
          updatedAt: new Date(),
        })
        .where(eq(alertConfigurations.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(alertConfigurations)
        .values({
          id: randomUUID(),
          workspaceId,
          ...config,
          alertType: config.alertType as any,
          createdBy: userId,
        } as InsertAlertConfiguration)
        .returning();
      return created;
    }
  }

  /**
   * Initialize default alert configurations for a new workspace
   */
  async initializeDefaultConfigs(workspaceId: string, userId?: string): Promise<AlertConfiguration[]> {
    const configs: AlertConfiguration[] = [];
    
    for (const defaultConfig of DEFAULT_ALERT_CONFIGS) {
      const config = await this.upsertAlertConfiguration(
        workspaceId,
        defaultConfig as Partial<InsertAlertConfiguration> & { alertType: string },
        userId
      );
      configs.push(config);
    }
    
    return configs;
  }

  /**
   * Check if an alert should be rate-limited
   */
  async checkRateLimit(
    workspaceId: string,
    alertType: string,
    deduplicationKey: string,
    cooldownMinutes: number,
    maxAlertsPerHour: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const now = new Date();
    const cooldownThreshold = new Date(now.getTime() - cooldownMinutes * 60 * 1000);
    const hourWindowStart = new Date(now.getTime() - 60 * 60 * 1000);

    // Check for existing rate limit entry
    const [existing] = await db
      .select()
      .from(alertRateLimits)
      .where(and(
        eq(alertRateLimits.workspaceId, workspaceId),
        eq(alertRateLimits.alertType, alertType as any),
        eq(alertRateLimits.deduplicationKey, deduplicationKey)
      ));

    if (existing) {
      // Check cooldown
      if (existing.lastTriggeredAt > cooldownThreshold) {
        return { 
          allowed: false, 
          reason: `Cooldown active. Last triggered ${Math.round((now.getTime() - existing.lastTriggeredAt.getTime()) / 60000)} minutes ago.` 
        };
      }

      // Check hourly limit
      if (existing.windowStart > hourWindowStart && existing.windowAlertCount! >= maxAlertsPerHour) {
        return { 
          allowed: false, 
          reason: `Hourly limit reached (${maxAlertsPerHour} alerts per hour).` 
        };
      }

      // Update rate limit entry
      const shouldResetWindow = existing.windowStart <= hourWindowStart;
      await db
        .update(alertRateLimits)
        .set({
          lastTriggeredAt: now,
          triggerCount: sql`${alertRateLimits.triggerCount} + 1`,
          windowStart: shouldResetWindow ? now : existing.windowStart,
          windowAlertCount: shouldResetWindow ? 1 : sql`${alertRateLimits.windowAlertCount} + 1`,
        })
        .where(eq(alertRateLimits.id, existing.id));
    } else {
      // Create new rate limit entry
      await db
        .insert(alertRateLimits)
        .values({
          workspaceId,
          alertType: alertType as any,
          deduplicationKey,
          lastTriggeredAt: now,
          triggerCount: 1,
          windowStart: now,
          windowAlertCount: 1,
        });
    }

    return { allowed: true };
  }

  /**
   * Trigger an alert through configured channels
   */
  async triggerAlert(context: AlertTriggerContext): Promise<AlertHistory | null> {
    const { workspaceId, alertType, title, message, severity, triggerData, relatedEntityType, relatedEntityId, deduplicationKey } = context;

    // Get alert configuration
    const config = await this.getAlertConfiguration(workspaceId, alertType);
    if (!config || !config.isEnabled) {
      log.info(`[AlertService] Alert type ${alertType} is disabled for workspace ${workspaceId}`);
      return null;
    }

    // Check rate limiting
    const dedupKey = deduplicationKey || `${alertType}:${relatedEntityType}:${relatedEntityId}`;
    const rateLimitCheck = await this.checkRateLimit(
      workspaceId,
      alertType,
      dedupKey,
      config.cooldownMinutes || 60,
      config.maxAlertsPerHour || 10
    );

    if (!rateLimitCheck.allowed) {
      log.info(`[AlertService] Alert rate-limited: ${rateLimitCheck.reason}`);
      return null;
    }

    // Create alert history entry
    const alertSeverity = severity || (config as any).severity || 'medium';
    const channels = config.channels || ['in_app'];
    
    const [alert] = await db
      .insert(alertHistory)
      .values({
        workspaceId,
        configurationId: config.id,
        alertType: alertType as any,
        severity: alertSeverity,
        title: config.customTitle || title,
        message: config.customMessage || message,
        triggerData: triggerData || {},
        relatedEntityType,
        relatedEntityId,
        channelsNotified: channels,
        deliveryStatus: {},
      })
      .returning();

    // Deliver through channels
    const deliveryStatus: Record<string, string> = {};
    const recipientUserIds = await this.getAlertRecipients(workspaceId, config);

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'in_app':
            await this.deliverInAppAlert(alert, recipientUserIds);
            deliveryStatus.in_app = 'sent';
            break;
          case 'email':
            await this.deliverEmailAlert(alert, recipientUserIds);
            deliveryStatus.email = 'sent';
            break;
          case 'sms':
            await this.deliverSmsAlert(alert, recipientUserIds);
            deliveryStatus.sms = 'sent';
            break;
        }
      } catch (error) {
        log.error(`[AlertService] Failed to deliver ${channel} alert:`, error);
        deliveryStatus[channel] = 'failed';
      }
    }

    // Update delivery status
    await db
      .update(alertHistory)
      .set({ deliveryStatus })
      .where(eq(alertHistory.id, alert.id));

    log.info(`[AlertService] Alert triggered: ${alertType} - ${title}`);
    return { ...alert, deliveryStatus };
  }

  /**
   * Get recipients for an alert based on configuration
   */
  private async getAlertRecipients(workspaceId: string, config: AlertConfiguration): Promise<string[]> {
    const recipientIds = new Set<string>();

    // Add specific user IDs if configured
    if (config.notifyUserIds && config.notifyUserIds.length > 0) {
      config.notifyUserIds.forEach(id => recipientIds.add(id));
    }

    // Add users by role
    if (config.notifyRoles && config.notifyRoles.length > 0) {
      // Get workspace owner
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
      
      if (workspace && config.notifyRoles.includes('org_owner')) {
        recipientIds.add(workspace.ownerId);
      }

      // Get employees with matching roles
      const employeesWithRoles = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          inArray(employees.role as any, config.notifyRoles)
        ));

      for (const emp of employeesWithRoles) {
        if (emp.userId) {
          recipientIds.add(emp.userId);
        }
      }
    }

    return Array.from(recipientIds);
  }

  /**
   * Deliver in-app notification via WebSocket
   */
  private async deliverInAppAlert(alert: AlertHistory, recipientUserIds: string[]): Promise<void> {
    for (const userId of recipientUserIds) {
      await createNotification({
        workspaceId: alert.workspaceId,
        userId,
        type: `alert_${alert.alertType}`,
        title: alert.title,
        message: alert.message,
        actionUrl: '/alert-settings',
        relatedEntityType: alert.relatedEntityType || undefined,
        relatedEntityId: alert.relatedEntityId || undefined,
        metadata: {
          alertId: alert.id,
          severity: alert.severity,
          alertType: alert.alertType,
          triggerData: alert.triggerData,
        },
      });
    }
  }

  /**
   * Deliver email alert
   */
  private async deliverEmailAlert(alert: AlertHistory, recipientUserIds: string[]): Promise<void> {
    try {
      const { emailService } = await import('./emailService');

      for (const userId of recipientUserIds) {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId));

        if (user?.email) {
          const severityColor = {
            low: '#3b82f6',
            medium: '#eab308',
            high: '#f97316',
            critical: '#ef4444',
          }[alert.severity] || '#3b82f6';

          const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${severityColor}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
                  <h2 style="margin: 0;">${alert.title}</h2>
                  <span style="opacity: 0.8; font-size: 12px;">Severity: ${alert.severity.toUpperCase()}</span>
                </div>
                <div style="padding: 16px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0 0 16px;">${alert.message}</p>
                  <a href="${process.env.APP_URL || 'https://coaileague.platform'}/alert-settings" 
                     style="display: inline-block; background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
                    View Alert Settings
                  </a>
                </div>
              </div>
            `;

          try {
            await NotificationDeliveryService.send({ type: 'alert_notification', workspaceId: alert.workspaceId || 'system', recipientUserId: user.id || user.email, channel: 'email', body: { to: user.email, subject: `[${alert.severity.toUpperCase()}] ${alert.title}`, html } });
          } catch (err: unknown) {
            log.warn('[AlertService] Email delivery failed (non-fatal):', (err instanceof Error ? err.message : String(err)));
          }
        }
      }
    } catch (error) {
      log.error('[AlertService] Email delivery failed:', error);
      throw error;
    }
  }

  /**
   * Deliver SMS alert via NDS
   */
  private async deliverSmsAlert(alert: AlertHistory, recipientUserIds: string[]): Promise<void> {
    try {
      const { NotificationDeliveryService } = await import('./notificationDeliveryService');

      for (const userId of recipientUserIds) {
        await NotificationDeliveryService.send({
          type: 'alert_notification',
          workspaceId: alert.workspaceId,
          recipientUserId: userId,
          channel: 'sms',
          body: {
            body: `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`,
          },
          idempotencyKey: `alert-sms-${alert.id}-${userId}`,
        });
      }
    } catch (error) {
      log.error('[AlertService] SMS delivery failed:', error);
      throw error;
    }
  }

  /**
   * Get alert history for a workspace
   */
  async getAlertHistory(
    workspaceId: string,
    options?: {
      alertType?: string;
      severity?: string;
      acknowledged?: boolean;
      resolved?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<AlertHistory[]> {
    let query = db
      .select()
      .from(alertHistory)
      .where(eq(alertHistory.workspaceId, workspaceId))
      .orderBy(desc(alertHistory.createdAt));

    if (options?.alertType) {
      query = (query as any).where(eq(alertHistory.alertType, options.alertType as any));
    }
    if (options?.severity) {
      query = (query as any).where(eq(alertHistory.severity, options.severity as any));
    }
    if (options?.acknowledged !== undefined) {
      query = (query as any).where(eq(alertHistory.isAcknowledged, options.acknowledged));
    }
    if (options?.resolved !== undefined) {
      query = (query as any).where(eq(alertHistory.isResolved, options.resolved));
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    return await query;
  }

  /**
   * Get a specific alert by ID
   */
  async getAlert(alertId: string): Promise<AlertHistory | undefined> {
    const [alert] = await db
      .select()
      .from(alertHistory)
      .where(eq(alertHistory.id, alertId));
    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    userId: string,
    notes?: string
  ): Promise<AlertHistory | undefined> {
    const [alert] = await db
      .update(alertHistory)
      .set({
        isAcknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
        acknowledgmentNotes: notes,
      })
      .where(eq(alertHistory.id, alertId))
      .returning();
    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    alertId: string,
    userId: string,
    notes?: string
  ): Promise<AlertHistory | undefined> {
    const [alert] = await db
      .update(alertHistory)
      .set({
        isResolved: true,
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes: notes,
      })
      .where(eq(alertHistory.id, alertId))
      .returning();
    return alert;
  }

  /**
   * Get unacknowledged alert count for a workspace
   */
  async getUnacknowledgedCount(workspaceId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(alertHistory)
      .where(and(
        eq(alertHistory.workspaceId, workspaceId),
        eq(alertHistory.isAcknowledged, false)
      ));
    return result?.count || 0;
  }

  /**
   * Delete old alerts (cleanup)
   */
  async deleteOldAlerts(workspaceId: string, daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(alertHistory)
      .where(and(
        eq(alertHistory.workspaceId, workspaceId),
        sql`${alertHistory.createdAt} < ${cutoffDate}`
      ));
    
    return result.rowCount || 0;
  }
}

export const alertService = new AlertService();
