/**
 * ELEVATED SESSION GUARDIAN - AI Brain Subagent
 * ==============================================
 * An AI-powered subagent that wraps elevatedSessionService with:
 * - Telemetry emissions for monitoring
 * - Dr. Holmes-style diagnostics
 * - Self-healing loop for auto-remediation
 * - Trinity integration for oversight
 * - Support ticket creation when intervention needed
 * 
 * This subagent ensures elevated sessions for support roles and AI services
 * run smoothly with full observability and automatic recovery.
 */

import { db } from '../../db';
import { eq, and, lt, desc, gt } from 'drizzle-orm';
import {
  supportSessionElevations,
  subagentTelemetry,
  supportInterventions,
  users,
  InsertSubagentTelemetry,
} from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { universalNotificationEngine } from '../universalNotificationEngine';
import * as elevatedSessionService from '../session/elevatedSessionService';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type SessionAnomalyCode = 
  | 'hmac_signature_mismatch'
  | 'idle_timeout_exceeded'
  | 'absolute_timeout_exceeded'
  | 'locked_account_detected'
  | 'elevation_rate_limit_hit'
  | 'concurrent_elevation_conflict'
  | 'ai_service_elevation_failed'
  | 'session_drift_detected'
  | 'validation_failed'
  | 'revocation_failed';

export type HealingAction =
  | 'revoke_and_reissue'
  | 'prompt_reauthentication'
  | 'force_revoke_and_notify'
  | 'revoke_all_elevations_for_user'
  | 'queue_and_retry'
  | 'keep_most_recent'
  | 'retry_with_diagnostics'
  | 'resync_session_state';

export interface SessionHealthStatus {
  healthy: boolean;
  activeElevations: number;
  expiredElevations: number;
  anomaliesDetected: SessionAnomalyCode[];
  lastCheckAt: Date;
  recommendations: string[];
}

export interface DiagnosticReport {
  executionId: string;
  phase: 'diagnose' | 'fix' | 'validate' | 'report';
  anomalyCode?: SessionAnomalyCode;
  diagnosis: string;
  fixAttempted: boolean;
  fixSucceeded?: boolean;
  fixDetails?: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  escalationRequired: boolean;
  timestamp: Date;
}

export interface TelemetryEvent {
  subagentId: string;
  subagentName: string;
  actionId: string;
  status: 'success' | 'failure' | 'warning';
  durationMs: number;
  anomalyCode?: SessionAnomalyCode;
  healingAction?: HealingAction;
  metadata?: Record<string, any>;
}

type ElevationReason = 'auto_support_login' | 'governance_approved' | 'mfa_verified' | 'bot_service' | 'subagent_service' | 'trinity_service' | 'helpai_service';

// ============================================================================
// ELEVATED SESSION GUARDIAN CLASS
// ============================================================================

class ElevatedSessionGuardian {
  private static instance: ElevatedSessionGuardian;
  private readonly SUBAGENT_ID = 'elevated-session-guardian';
  private readonly SUBAGENT_NAME = 'ElevatedSessionGuardian';
  private healingInProgress = false;
  private lastHealthCheck: Date | null = null;
  private anomalyHistory: Map<string, number> = new Map();

  static getInstance(): ElevatedSessionGuardian {
    if (!this.instance) {
      this.instance = new ElevatedSessionGuardian();
    }
    return this.instance;
  }

  // ============================================================================
  // ELEVATED SESSION OPERATIONS WITH TELEMETRY
  // ============================================================================

  async issueElevation(
    userId: string,
    sessionId: string,
    platformRole: string,
    reason: string
  ): Promise<{ success: boolean; elevationId?: string; expiresAt?: Date; error?: string; telemetry: TelemetryEvent }> {
    const startTime = Date.now();
    const executionId = `esg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    try {
      // Map reason string to valid ElevationReason
      const elevationReason: ElevationReason = this.mapToElevationReason(reason);
      
      const result = await elevatedSessionService.issueElevation(userId, sessionId, elevationReason);
      
      const telemetry = await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.elevate',
        status: result.success ? 'success' : 'failure',
        durationMs: Date.now() - startTime,
        metadata: { userId, platformRole, elevationId: result.elevationId }
      });

      if (result.success) {
        console.log(`[ElevatedSessionGuardian] Elevation issued for user ${userId} (${platformRole})`);
      }
      
      return { 
        success: result.success, 
        elevationId: result.elevationId,
        expiresAt: result.expiresAt,
        error: result.error,
        telemetry 
      };
    } catch (error: any) {
      const anomalyCode = this.classifyError(error);
      
      const telemetry = await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.elevate',
        status: 'failure',
        durationMs: Date.now() - startTime,
        anomalyCode,
        metadata: { userId, platformRole, error: error.message }
      });

      this.recordAnomaly(anomalyCode);
      await this.attemptHealing(anomalyCode, { userId, sessionId, platformRole, executionId });

      return { success: false, error: error.message, telemetry };
    }
  }

  async validateElevation(userId: string, sessionId: string): Promise<{ isElevated: boolean; context?: any; anomaly?: SessionAnomalyCode; telemetry: TelemetryEvent }> {
    const startTime = Date.now();

    try {
      const result = await elevatedSessionService.validateElevation(userId, sessionId);
      
      const telemetry = await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.validate',
        status: result.isElevated ? 'success' : 'warning',
        durationMs: Date.now() - startTime,
        anomalyCode: result.isElevated ? undefined : 'validation_failed',
        metadata: { userId, sessionId, isElevated: result.isElevated }
      });

      if (!result.isElevated) {
        this.recordAnomaly('validation_failed');
      }

      return { isElevated: result.isElevated, context: result, telemetry };
    } catch (error: any) {
      const anomalyCode = this.classifyError(error);
      
      const telemetry = await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.validate',
        status: 'failure',
        durationMs: Date.now() - startTime,
        anomalyCode,
        metadata: { userId, sessionId, error: error.message }
      });

      this.recordAnomaly(anomalyCode);
      return { isElevated: false, anomaly: anomalyCode, telemetry };
    }
  }

  async revokeElevation(elevationId: string, revokedBy: string, reason: string): Promise<{ success: boolean; telemetry: TelemetryEvent }> {
    const startTime = Date.now();

    try {
      await elevatedSessionService.revokeElevation(elevationId, revokedBy, reason);
      
      const telemetry = await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.revoke',
        status: 'success',
        durationMs: Date.now() - startTime,
        metadata: { elevationId, revokedBy, reason }
      });

      console.log(`[ElevatedSessionGuardian] Elevation ${elevationId} revoked by ${revokedBy}: ${reason}`);
      
      return { success: true, telemetry };
    } catch (error: any) {
      const telemetry = await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.revoke',
        status: 'failure',
        durationMs: Date.now() - startTime,
        anomalyCode: 'revocation_failed',
        metadata: { elevationId, revokedBy, error: error.message }
      });

      this.recordAnomaly('revocation_failed');
      return { success: false, telemetry };
    }
  }

  // ============================================================================
  // DIAGNOSTICS (Dr. Holmes Style)
  // ============================================================================

  async runDiagnostics(): Promise<DiagnosticReport> {
    const executionId = `diag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    console.log(`[ElevatedSessionGuardian] Running diagnostics (${executionId})...`);

    const anomalies: SessionAnomalyCode[] = [];
    const recommendations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    try {
      const now = new Date();
      
      // 1. Check for expired elevations that weren't cleaned up (isActive=true but expiresAt < now)
      const expiredElevations = await db.select().from(supportSessionElevations)
        .where(and(
          eq(supportSessionElevations.isActive, true),
          lt(supportSessionElevations.expiresAt, now)
        ));

      if (expiredElevations.length > 0) {
        anomalies.push('absolute_timeout_exceeded');
        recommendations.push(`Found ${expiredElevations.length} expired elevations that need cleanup`);
        riskLevel = 'medium';
      }

      // 2. Check for idle timeout violations (4 hours)
      const idleThreshold = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // 4 hours
      const idleElevations = await db.select().from(supportSessionElevations)
        .where(and(
          eq(supportSessionElevations.isActive, true),
          lt(supportSessionElevations.lastActivityAt, idleThreshold)
        ));

      if (idleElevations.length > 0) {
        anomalies.push('idle_timeout_exceeded');
        recommendations.push(`Found ${idleElevations.length} idle elevations exceeding 4-hour threshold`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      // 3. Check for locked accounts with active elevations
      const activeElevations = await db.select().from(supportSessionElevations)
        .where(eq(supportSessionElevations.isActive, true));

      for (const elevation of activeElevations) {
        const [user] = await db.select().from(users)
          .where(eq(users.id, elevation.userId))
          .limit(1);
        
        if (!user) {
          anomalies.push('locked_account_detected');
          recommendations.push(`User ${elevation.userId} not found but has active elevation ${elevation.id}`);
          riskLevel = 'critical';
        } else if (user.lockedUntil && new Date(user.lockedUntil) > now) {
          anomalies.push('locked_account_detected');
          recommendations.push(`User ${elevation.userId} is locked until ${user.lockedUntil.toISOString()} but has active elevation ${elevation.id}`);
          riskLevel = 'critical';
        }
      }

      // 4. Check anomaly frequency (repeated failures = higher risk)
      const frequentAnomalies = Array.from(this.anomalyHistory.entries())
        .filter(([_, count]) => count >= 3);
      
      if (frequentAnomalies.length > 0) {
        recommendations.push(`Repeated anomalies detected: ${frequentAnomalies.map(([code]) => code).join(', ')}`);
        if (riskLevel !== 'critical') riskLevel = 'high';
      }

      const diagnosis = anomalies.length > 0
        ? `Detected ${anomalies.length} anomalies requiring attention`
        : 'No anomalies detected - session management healthy';

      const report: DiagnosticReport = {
        executionId,
        phase: 'diagnose',
        diagnosis,
        anomalyCode: anomalies[0],
        fixAttempted: false,
        riskLevel,
        recommendations,
        escalationRequired: riskLevel === 'critical' || riskLevel === 'high',
        timestamp: new Date()
      };

      // Emit telemetry for diagnostics
      await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.diagnose',
        status: anomalies.length > 0 ? 'warning' : 'success',
        durationMs: Date.now() - startTime,
        metadata: { anomalyCount: anomalies.length, riskLevel }
      });

      // Broadcast to Trinity if escalation required
      if (report.escalationRequired) {
        await this.broadcastToTrinity(report);
      }

      this.lastHealthCheck = new Date();
      return report;
    } catch (error: any) {
      console.error('[ElevatedSessionGuardian] Diagnostics failed:', error);
      return {
        executionId,
        phase: 'diagnose',
        diagnosis: `Diagnostics failed: ${error.message}`,
        fixAttempted: false,
        riskLevel: 'critical',
        recommendations: ['Manual review required - diagnostics system error'],
        escalationRequired: true,
        timestamp: new Date()
      };
    }
  }

  // ============================================================================
  // SELF-HEALING LOOP
  // ============================================================================

  async attemptHealing(
    anomalyCode: SessionAnomalyCode,
    context: { userId?: string; sessionId?: string; platformRole?: string; executionId?: string }
  ): Promise<{ healed: boolean; action: HealingAction; details: string }> {
    if (this.healingInProgress) {
      console.log('[ElevatedSessionGuardian] Healing already in progress, queuing...');
      return { healed: false, action: 'queue_and_retry', details: 'Queued for next healing cycle' };
    }

    this.healingInProgress = true;
    const startTime = Date.now();
    console.log(`[ElevatedSessionGuardian] Attempting healing for ${anomalyCode}...`);

    try {
      let action: HealingAction;
      let healed = false;
      let details = '';

      switch (anomalyCode) {
        case 'hmac_signature_mismatch':
          action = 'revoke_and_reissue';
          if (context.userId) {
            await this.revokeAllElevationsForUser(context.userId, 'signature_mismatch');
            details = `Revoked all elevations for user ${context.userId} due to signature mismatch`;
            healed = true;
          }
          break;

        case 'idle_timeout_exceeded':
        case 'absolute_timeout_exceeded':
          action = 'force_revoke_and_notify';
          const cleaned = await this.cleanupExpiredElevations();
          details = `Cleaned up ${cleaned} expired/idle elevations`;
          healed = cleaned > 0;
          break;

        case 'locked_account_detected':
          action = 'revoke_all_elevations_for_user';
          if (context.userId) {
            await this.revokeAllElevationsForUser(context.userId, 'account_locked');
            details = `Revoked all elevations for locked user ${context.userId}`;
            healed = true;
          }
          break;

        case 'concurrent_elevation_conflict':
          action = 'keep_most_recent';
          if (context.userId) {
            await this.keepMostRecentElevation(context.userId);
            details = `Kept only most recent elevation for user ${context.userId}`;
            healed = true;
          }
          break;

        case 'ai_service_elevation_failed':
          action = 'retry_with_diagnostics';
          details = 'Logged failure for manual review - AI service elevation requires retry';
          healed = false;
          break;

        default:
          action = 'resync_session_state';
          details = `Unknown anomaly ${anomalyCode}, logged for review`;
          healed = false;
      }

      // Emit telemetry for healing attempt
      await this.emitTelemetry({
        subagentId: this.SUBAGENT_ID,
        subagentName: this.SUBAGENT_NAME,
        actionId: 'session.auto_heal',
        status: healed ? 'success' : 'warning',
        durationMs: Date.now() - startTime,
        anomalyCode,
        healingAction: action,
        metadata: { context, healed, details }
      });

      console.log(`[ElevatedSessionGuardian] Healing ${healed ? 'succeeded' : 'incomplete'}: ${details}`);

      // If healing failed, create support ticket and notify Trinity
      if (!healed) {
        const riskLevel = this.anomalyToRiskLevel(anomalyCode);
        await this.createSupportTicket(anomalyCode, context, details, riskLevel);
        
        // Broadcast healing failure to Trinity for oversight
        await this.broadcastToTrinity({
          executionId: context.executionId || `heal-${Date.now()}`,
          phase: 'fix',
          anomalyCode,
          diagnosis: `Healing failed for ${anomalyCode}: ${details}`,
          fixAttempted: true,
          fixSucceeded: false,
          fixDetails: { action, details },
          riskLevel,
          recommendations: ['Manual intervention required'],
          escalationRequired: true,
          timestamp: new Date()
        });
      }

      return { healed, action, details };
    } finally {
      this.healingInProgress = false;
    }
  }

  async runHealingCycle(): Promise<{ healed: number; failures: number; details: string[] }> {
    console.log('[ElevatedSessionGuardian] Starting healing cycle...');
    
    const report = await this.runDiagnostics();
    const details: string[] = [];
    let healed = 0;
    let failures = 0;

    if (report.anomalyCode) {
      const result = await this.attemptHealing(report.anomalyCode, {});
      if (result.healed) {
        healed++;
        details.push(`Healed: ${result.action} - ${result.details}`);
      } else {
        failures++;
        details.push(`Failed: ${result.action} - ${result.details}`);
      }
    }

    // Clean up expired elevations regardless
    const cleaned = await this.cleanupExpiredElevations();
    if (cleaned > 0) {
      healed++;
      details.push(`Cleanup: Removed ${cleaned} expired elevations`);
    }

    // Clear old anomaly history (keep last 10 minutes)
    this.anomalyHistory.clear();

    console.log(`[ElevatedSessionGuardian] Healing cycle complete: ${healed} healed, ${failures} failures`);
    return { healed, failures, details };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mapToElevationReason(reason: string): ElevationReason {
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('bot')) return 'bot_service';
    if (lowerReason.includes('subagent')) return 'subagent_service';
    if (lowerReason.includes('trinity')) return 'trinity_service';
    if (lowerReason.includes('helpai')) return 'helpai_service';
    if (lowerReason.includes('mfa')) return 'mfa_verified';
    if (lowerReason.includes('governance')) return 'governance_approved';
    return 'auto_support_login';
  }

  private async cleanupExpiredElevations(): Promise<number> {
    const now = new Date();
    const idleThreshold = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // 4 hours

    // Update expired elevations (absolute timeout)
    const expiredResult = await db.update(supportSessionElevations)
      .set({ 
        isActive: false,
        revokedAt: now,
        revocationReason: 'expired_timeout'
      })
      .where(and(
        eq(supportSessionElevations.isActive, true),
        lt(supportSessionElevations.expiresAt, now)
      ))
      .returning();

    // Update idle elevations
    const idleResult = await db.update(supportSessionElevations)
      .set({ 
        isActive: false,
        revokedAt: now,
        revocationReason: 'idle_timeout'
      })
      .where(and(
        eq(supportSessionElevations.isActive, true),
        lt(supportSessionElevations.lastActivityAt, idleThreshold)
      ))
      .returning();

    return expiredResult.length + idleResult.length;
  }

  private async revokeAllElevationsForUser(userId: string, reason: string): Promise<void> {
    await db.update(supportSessionElevations)
      .set({ 
        isActive: false,
        revokedAt: new Date(),
        revocationReason: reason
      })
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.isActive, true)
      ));
  }

  private async keepMostRecentElevation(userId: string): Promise<void> {
    const activeElevations = await db.select().from(supportSessionElevations)
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.isActive, true)
      ))
      .orderBy(desc(supportSessionElevations.createdAt));

    if (activeElevations.length > 1) {
      const idsToRevoke = activeElevations.slice(1).map(e => e.id);
      for (const id of idsToRevoke) {
        await db.update(supportSessionElevations)
          .set({ 
            isActive: false,
            revokedAt: new Date(),
            revocationReason: 'concurrent_elevation_cleanup'
          })
          .where(eq(supportSessionElevations.id, id));
      }
    }
  }

  private classifyError(error: any): SessionAnomalyCode {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('signature') || message.includes('hmac')) {
      return 'hmac_signature_mismatch';
    }
    if (message.includes('expired') || message.includes('timeout')) {
      return 'absolute_timeout_exceeded';
    }
    if (message.includes('locked')) {
      return 'locked_account_detected';
    }
    if (message.includes('rate') || message.includes('limit')) {
      return 'elevation_rate_limit_hit';
    }
    if (message.includes('ai') || message.includes('service')) {
      return 'ai_service_elevation_failed';
    }
    
    return 'session_drift_detected';
  }

  private recordAnomaly(code: SessionAnomalyCode): void {
    const count = this.anomalyHistory.get(code) || 0;
    this.anomalyHistory.set(code, count + 1);
  }

  private anomalyToRiskLevel(code: SessionAnomalyCode): 'low' | 'medium' | 'high' | 'critical' {
    const riskMap: Record<SessionAnomalyCode, 'low' | 'medium' | 'high' | 'critical'> = {
      'hmac_signature_mismatch': 'critical',
      'locked_account_detected': 'critical',
      'idle_timeout_exceeded': 'low',
      'absolute_timeout_exceeded': 'medium',
      'elevation_rate_limit_hit': 'medium',
      'concurrent_elevation_conflict': 'medium',
      'ai_service_elevation_failed': 'high',
      'session_drift_detected': 'medium',
      'validation_failed': 'low',
      'revocation_failed': 'high'
    };
    return riskMap[code] || 'medium';
  }

  // ============================================================================
  // TRINITY INTEGRATION & NOTIFICATIONS
  // ============================================================================

  private async broadcastToTrinity(report: DiagnosticReport): Promise<void> {
    console.log(`[ElevatedSessionGuardian] Broadcasting to Trinity: ${report.diagnosis}`);
    
    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title: 'Session Guardian Alert',
      description: `${report.diagnosis}. Risk level: ${report.riskLevel}`,
      metadata: {
        subagentId: this.SUBAGENT_ID,
        report,
        requiresIntervention: report.escalationRequired,
        severity: report.riskLevel
      }
    });

    // Also send system notification
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId: 'system',
        type: 'system',
        title: 'Session Guardian Alert',
        message: `${report.diagnosis}. Risk level: ${report.riskLevel}`,
        severity: report.riskLevel === 'critical' ? 'critical' : 'warning',
        targetRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager'],
        metadata: { report }
      });
    } catch (error) {
      console.error('[ElevatedSessionGuardian] Failed to send notification:', error);
    }
  }

  private async createSupportTicket(
    anomalyCode: SessionAnomalyCode,
    context: Record<string, any>,
    details: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    console.log(`[ElevatedSessionGuardian] Creating support ticket for ${anomalyCode}...`);
    
    // Map risk level to severity
    const severityMap: Record<string, string> = {
      'low': 'low',
      'medium': 'medium', 
      'high': 'high',
      'critical': 'critical'
    };
    
    try {
      await db.insert(supportInterventions).values({
        workspaceId: context.workspaceId || null,
        subagentId: this.SUBAGENT_ID,
        derailmentType: 'system_anomaly',
        severity: severityMap[riskLevel] || 'medium',
        description: `Elevated Session Guardian detected unresolved anomaly: ${anomalyCode}`,
        diagnosticSummary: details,
        proposedFix: { action: 'manual_review', anomalyCode, context, riskLevel }
      });

      console.log('[ElevatedSessionGuardian] Support ticket created');

      // Notify support staff via event bus
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'support',
        title: 'Support Ticket Created',
        description: `Session Guardian created ticket for anomaly: ${anomalyCode}`,
        metadata: { 
          action: 'support_ticket_created',
          anomalyCode, 
          details, 
          context 
        }
      });
    } catch (error) {
      console.error('[ElevatedSessionGuardian] Failed to create support ticket:', error);
    }
  }

  private async emitTelemetry(event: TelemetryEvent): Promise<TelemetryEvent> {
    try {
      const telemetryRecord: InsertSubagentTelemetry = {
        subagentId: event.subagentId,
        executionId: `tel-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        actionId: event.actionId,
        status: event.status === 'success' ? 'completed' : event.status === 'failure' ? 'failed' : 'escalating',
        phase: 'execute',
        durationMs: event.durationMs,
        errorCode: event.anomalyCode
      };

      await db.insert(subagentTelemetry).values(telemetryRecord);
    } catch (error) {
      console.error('[ElevatedSessionGuardian] Failed to emit telemetry:', error);
    }

    return event;
  }

  // ============================================================================
  // HEALTH STATUS
  // ============================================================================

  async getHealthStatus(): Promise<SessionHealthStatus> {
    const now = new Date();
    
    const activeElevations = await db.select().from(supportSessionElevations)
      .where(eq(supportSessionElevations.isActive, true));

    const expiredElevations = await db.select().from(supportSessionElevations)
      .where(and(
        eq(supportSessionElevations.isActive, true),
        lt(supportSessionElevations.expiresAt, now)
      ));

    const anomalies = Array.from(this.anomalyHistory.keys()) as SessionAnomalyCode[];

    return {
      healthy: anomalies.length === 0 && expiredElevations.length === 0,
      activeElevations: activeElevations.length,
      expiredElevations: expiredElevations.length,
      anomaliesDetected: anomalies,
      lastCheckAt: this.lastHealthCheck || now,
      recommendations: anomalies.length > 0 
        ? ['Run healing cycle to address detected anomalies']
        : ['System healthy - no action required']
    };
  }
}

// Export singleton instance
export const elevatedSessionGuardian = ElevatedSessionGuardian.getInstance();

// Export convenience methods
export const issueElevationWithGuardian = (userId: string, sessionId: string, platformRole: string, reason: string) =>
  elevatedSessionGuardian.issueElevation(userId, sessionId, platformRole, reason);

export const validateElevationWithGuardian = (userId: string, sessionId: string) =>
  elevatedSessionGuardian.validateElevation(userId, sessionId);

export const revokeElevationWithGuardian = (elevationId: string, revokedBy: string, reason: string) =>
  elevatedSessionGuardian.revokeElevation(elevationId, revokedBy, reason);

export const runSessionDiagnostics = () =>
  elevatedSessionGuardian.runDiagnostics();

export const runSessionHealingCycle = () =>
  elevatedSessionGuardian.runHealingCycle();

export const getSessionGuardianHealth = () =>
  elevatedSessionGuardian.getHealthStatus();
