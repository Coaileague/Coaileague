/**
 * ALERT MANAGER - Proactive Alert Management
 * 
 * Handles alert creation, deduplication, lifecycle management,
 * and delivery to HelpOS and other channels
 */

import { db } from '../../db';
import { aiProactiveAlerts, aiNotificationHistory, type AiProactiveAlert } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import type { CreateAlertPayload, AlertAcknowledgment, AlertResolution } from './types';

export class AlertManager {
  /**
   * Create or update an alert (idempotent with deduplication)
   */
  async createAlert(payload: CreateAlertPayload): Promise<AiProactiveAlert> {
    // Generate dedupe hash
    const dedupeHash = payload.dedupeKey 
      ? this.generateDedupeHash(payload.dedupeKey)
      : this.generateDedupeHash(JSON.stringify({
          alertType: payload.alertType,
          workspaceId: payload.workspaceId,
          severity: payload.severity,
          entityType: payload.payload.entityType,
          entityId: payload.payload.entityId,
        }));

    // Check for existing alert
    const [existing] = await db
      .select()
      .from(aiProactiveAlerts)
      .where(
        and(
          eq(aiProactiveAlerts.workspaceId, payload.workspaceId),
          eq(aiProactiveAlerts.alertType, payload.alertType as any),
          eq(aiProactiveAlerts.dedupeHash, dedupeHash)
        )
      )
      .limit(1);

    if (existing && existing.status !== 'resolved') {
      console.log(`🔄 [AlertManager] Alert already exists: ${existing.id} (${existing.status})`);
      return existing;
    }

    // Create new alert
    const [alert] = await db
      .insert(aiProactiveAlerts)
      .values({
        workspaceId: payload.workspaceId,
        taskId: payload.taskId || null,
        alertType: payload.alertType as any,
        severity: payload.severity,
        status: 'queued',
        dedupeHash,
        payload: payload.payload,
        contextSnapshot: payload.contextSnapshot || {},
        triggeredAt: new Date(),
      })
      .returning();

    console.log(`🚨 [AlertManager] Created alert ${alert.id}: ${payload.alertType} (${payload.severity})`);
    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(ack: AlertAcknowledgment): Promise<void> {
    const [updated] = await db
      .update(aiProactiveAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedBy: ack.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiProactiveAlerts.id, ack.alertId))
      .returning();

    if (!updated) {
      throw new Error(`Alert ${ack.alertId} not found`);
    }

    console.log(`✅ [AlertManager] Alert ${ack.alertId} acknowledged by ${ack.userId}`);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(resolution: AlertResolution): Promise<void> {
    const [updated] = await db
      .update(aiProactiveAlerts)
      .set({
        status: 'resolved',
        resolvedBy: resolution.userId,
        resolvedAt: new Date(),
        resolutionNote: resolution.resolutionNote,
        updatedAt: new Date(),
      })
      .where(eq(aiProactiveAlerts.id, resolution.alertId))
      .returning();

    if (!updated) {
      throw new Error(`Alert ${resolution.alertId} not found`);
    }

    console.log(`✅ [AlertManager] Alert ${resolution.alertId} resolved by ${resolution.userId}`);
  }

  /**
   * Dispatch alert to channel (HelpOS, email, SMS)
   */
  async dispatchAlert(alertId: string, channel: 'helpos' | 'email' | 'sms'): Promise<void> {
    const [alert] = await db
      .select()
      .from(aiProactiveAlerts)
      .where(eq(aiProactiveAlerts.id, alertId))
      .limit(1);

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    // Update alert status to dispatched
    await db
      .update(aiProactiveAlerts)
      .set({
        status: 'dispatched',
        updatedAt: new Date(),
      })
      .where(eq(aiProactiveAlerts.id, alertId));

    // Record notification delivery attempt
    await db
      .insert(aiNotificationHistory)
      .values({
        alertId,
        workspaceId: alert.workspaceId,
        channel,
        status: 'pending',
        payload: {
          alertType: alert.alertType,
          severity: alert.severity,
          message: this.formatAlertMessage(alert),
        },
      });

    console.log(`📤 [AlertManager] Dispatched alert ${alertId} to ${channel}`);
  }

  /**
   * Get queued alerts for a workspace
   */
  async getQueuedAlerts(workspaceId: string): Promise<AiProactiveAlert[]> {
    return db
      .select()
      .from(aiProactiveAlerts)
      .where(
        and(
          eq(aiProactiveAlerts.workspaceId, workspaceId),
          eq(aiProactiveAlerts.status, 'queued')
        )
      );
  }

  /**
   * Get all alerts for a workspace
   */
  async getAlerts(
    workspaceId: string,
    status?: 'queued' | 'dispatched' | 'acknowledged' | 'resolved'
  ): Promise<AiProactiveAlert[]> {
    const conditions = [eq(aiProactiveAlerts.workspaceId, workspaceId)];
    
    if (status) {
      conditions.push(eq(aiProactiveAlerts.status, status));
    }

    return db
      .select()
      .from(aiProactiveAlerts)
      .where(and(...conditions));
  }

  /**
   * Generate dedupe hash
   */
  private generateDedupeHash(key: string): string {
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Format alert message for display
   */
  private formatAlertMessage(alert: AiProactiveAlert): string {
    const payload = alert.payload as any;
    
    switch (alert.alertType) {
      case 'credential_expiry':
        return `⚠️ Credential expiring soon: ${payload.credentialName || 'Unknown'} expires on ${payload.expiryDate || 'Unknown'}`;
      
      case 'contract_expiry':
        return `📄 Contract expiring: ${payload.clientName || 'Client'} contract expires on ${payload.expiryDate || 'Unknown'}`;
      
      case 'payment_issue':
        return `💳 Payment issue: ${payload.message || 'Payment failed'}`;
      
      case 'schedule_conflict':
        return `⏰ Schedule conflict detected: ${payload.message || 'Conflict found'}`;
      
      case 'compliance_violation':
        return `⚖️ Compliance issue: ${payload.message || 'Violation detected'}`;
      
      case 'timecard_anomaly':
        return `🕐 Timecard anomaly: ${payload.message || 'Unusual activity detected'}`;
      
      default:
        return `🔔 ${alert.alertType}: ${payload.message || 'Alert triggered'}`;
    }
  }
}
