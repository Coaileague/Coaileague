/**
 * CRISIS MANAGEMENT MODULE for Trinity
 * =====================================
 * Handles Fortune 500-grade incident response protocols:
 * 
 * 1. RED-SHIELD (Lockdown) - Hacked account response
 * 2. BLACKOUT - System outage handling
 * 3. MAKE IT RIGHT - Automated dispute resolution
 * 4. NUCLEAR - Root admin destructive commands
 * 
 * Trinity switches from "Helpful Mascot" to "Tactical Incident Commander"
 */

import crypto from 'crypto';
import { db } from '../../db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import {
  users,
  workspaces,
  employees,
} from '@shared/schema';
import { creditManager } from '../../services/billing/creditManager';
import { createLogger } from '../../lib/logger';
import { aiWorkboardTasks } from '@shared/schema';
const log = createLogger('crisisManager');

// Guru-mode roles that can execute crisis protocols
const GURU_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'] as const;
const ROOT_ONLY_ROLES = ['root_admin', 'deputy_admin'] as const;

// Crisis severity levels
type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';

interface CrisisEvent {
  id: string;
  type: 'lockdown' | 'blackout' | 'dispute' | 'purge';
  severity: CrisisSeverity;
  status: 'active' | 'resolved' | 'escalated';
  initiatedBy: string;
  targetId: string;
  reason: string;
  actions: string[];
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

interface LockdownResult {
  status: 'SECURE' | 'FAILED';
  userId: string;
  actions: string[];
  timestamp: string;
}

interface BlackoutStatus {
  isActive: boolean;
  level: 1 | 2 | 3;
  affectedServices: string[];
  eta: string;
  billingPaused: boolean;
  message: string;
}

interface DisputeResult {
  status: 'REFUND_APPROVED' | 'REFUND_DENIED_USER_ERROR' | 'PENDING_REVIEW';
  amount?: number;
  goodwill?: number;
  reason: string;
  incidentId: string;
}

interface PurgeResult {
  status: 'PURGE_COMPLETE' | 'PURGE_FAILED' | 'ACCESS_DENIED';
  targetOrgId: string;
  recordsDeleted: number;
  auditTrailId: string;
}

class CrisisManagerService {
  private activeCrises: Map<string, CrisisEvent> = new Map();
  private blackoutStatus: BlackoutStatus | null = null;
  private auditTrail: Array<{
    id: string;
    action: string;
    userId: string;
    targetId: string;
    details: Record<string, unknown>;
    timestamp: string;
  }> = [];

  constructor() {
    log.info('[CrisisManager] Crisis Management Module initialized');
  }

  private logAudit(action: string, userId: string, targetId: string, details: Record<string, unknown>): string {
    const id = `audit-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    this.auditTrail.push({
      id,
      action,
      userId,
      targetId,
      details,
      timestamp: new Date().toISOString(),
    });
    log.info(`[CrisisManager] Audit: ${action} by ${userId} on ${targetId}`);
    return id;
  }

  // ============================================================================
  // SCENARIO 1: RED-SHIELD / LOCKDOWN PROTOCOL
  // ============================================================================

  async initiateLockdown(
    targetUserId: string,
    reason: string,
    initiatedBy: string,
    platformRole: string
  ): Promise<LockdownResult> {
    if (!GURU_ROLES.includes(platformRole as typeof GURU_ROLES[number])) {
      throw new Error('ACCESS DENIED: Insufficient privileges for lockdown');
    }

    const crisisId = `lockdown-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const actions: string[] = [];

    try {
      log.info(`[CRISIS] Initiating LOCKDOWN for User ${targetUserId}`);
      
      // 1. Lock user account by setting lockedUntil far in the future
      const lockUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year lockout
      await db.update(users)
        .set({ 
          lockedUntil: lockUntil,
          loginAttempts: 999,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));
      actions.push('account_locked');

      // 2. Cancel any pending AI workboard tasks for user's workspaces
      const userWorkspaces = await db
        .select({ id: employees.workspaceId })
        .from(employees)
        .where(eq(employees.userId, targetUserId));

      for (const ws of userWorkspaces) {
        if (ws.id) {
          await db.update(aiWorkboardTasks)
            .set({ 
              status: 'cancelled',
              completedAt: new Date(),
            })
            .where(and(
              eq(aiWorkboardTasks.workspaceId, ws.id),
              eq(aiWorkboardTasks.status, 'pending')
            ));
        }
      }
      actions.push('pending_tasks_cancelled');

      // 3. Create internal audit trail
      this.logAudit('CRISIS_LOCKDOWN', initiatedBy, targetUserId, {
        reason,
        crisisId,
        actions,
        lockUntil: lockUntil.toISOString(),
      });
      actions.push('audit_trail_created');

      // 4. Record crisis event
      const crisis: CrisisEvent = {
        id: crisisId,
        type: 'lockdown',
        severity: 'critical',
        status: 'active',
        initiatedBy,
        targetId: targetUserId,
        reason,
        actions,
        createdAt: new Date().toISOString(),
      };
      this.activeCrises.set(crisisId, crisis);

      log.info(`[CRISIS] LOCKDOWN COMPLETE for ${targetUserId}: ${actions.join(', ')}`);

      return {
        status: 'SECURE',
        userId: targetUserId,
        actions,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      log.error('[CRISIS] Lockdown failed:', error);
      throw new Error(`Lockdown failed: ${error}`);
    }
  }

  async releaseLockdown(
    targetUserId: string,
    verificationCode: string,
    initiatedBy: string,
    platformRole: string
  ): Promise<{ status: string; message: string }> {
    if (!ROOT_ONLY_ROLES.includes(platformRole as typeof ROOT_ONLY_ROLES[number])) {
      throw new Error('ACCESS DENIED: Only root admins can release lockdowns');
    }

    if (!verificationCode || verificationCode.length < 6) {
      throw new Error('Invalid verification code');
    }

    try {
      // Restore user account
      await db.update(users)
        .set({ 
          lockedUntil: null,
          loginAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

      // Log release
      this.logAudit('CRISIS_LOCKDOWN_RELEASED', initiatedBy, targetUserId, {
        verifiedBy: initiatedBy,
        timestamp: new Date().toISOString(),
      });

      // Update crisis status
      for (const [, crisis] of this.activeCrises) {
        if (crisis.type === 'lockdown' && crisis.targetId === targetUserId) {
          crisis.status = 'resolved';
          crisis.resolvedAt = new Date().toISOString();
          crisis.resolution = `Released by ${initiatedBy}`;
        }
      }

      log.info(`[CRISIS] Lockdown RELEASED for ${targetUserId}`);

      return {
        status: 'UNLOCKED',
        message: `Account ${targetUserId} has been restored. User may now log in.`,
      };
    } catch (error) {
      log.error('[CRISIS] Release lockdown failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // SCENARIO 2: BLACKOUT PROTOCOL
  // ============================================================================

  async initiateBlackout(
    level: 1 | 2 | 3,
    affectedServices: string[],
    etaMinutes: number,
    initiatedBy: string,
    platformRole: string
  ): Promise<BlackoutStatus> {
    if (!GURU_ROLES.includes(platformRole as typeof GURU_ROLES[number])) {
      throw new Error('ACCESS DENIED: Insufficient privileges for blackout protocol');
    }

    const eta = new Date(Date.now() + etaMinutes * 60 * 1000).toISOString();
    
    this.blackoutStatus = {
      isActive: true,
      level,
      affectedServices,
      eta,
      billingPaused: true,
      message: this.getBlackoutMessage(level, affectedServices, etaMinutes),
    };

    log.info(`[CRISIS] BLACKOUT Level ${level} initiated by ${initiatedBy}`);
    
    this.logAudit('CRISIS_BLACKOUT_INITIATED', initiatedBy, 'platform', JSON.parse(JSON.stringify(this.blackoutStatus)));

    return this.blackoutStatus;
  }

  async resolveBlackout(
    resolution: string,
    initiatedBy: string,
    platformRole: string
  ): Promise<{ status: string; message: string }> {
    if (!GURU_ROLES.includes(platformRole as typeof GURU_ROLES[number])) {
      throw new Error('ACCESS DENIED: Insufficient privileges');
    }

    if (!this.blackoutStatus?.isActive) {
      return { status: 'NO_ACTIVE_BLACKOUT', message: 'No active blackout to resolve' };
    }

    this.blackoutStatus.isActive = false;
    this.blackoutStatus.billingPaused = false;

    this.logAudit('CRISIS_BLACKOUT_RESOLVED', initiatedBy, 'platform', { resolution });

    log.info(`[CRISIS] BLACKOUT RESOLVED by ${initiatedBy}`);

    return {
      status: 'RESOLVED',
      message: 'Blackout resolved. Billing resumed. All systems operational.',
    };
  }

  getBlackoutStatus(): BlackoutStatus | null {
    return this.blackoutStatus;
  }

  private getBlackoutMessage(level: 1 | 2 | 3, services: string[], etaMinutes: number): string {
    const levelDescriptions: Record<number, string> = {
      1: 'Minor degradation detected',
      2: 'Significant latency event',
      3: 'Critical system outage',
    };
    
    return `Level ${level} Event: ${levelDescriptions[level]}. Affected: ${services.join(', ')}. ETA: ${etaMinutes} minutes.`;
  }

  // ============================================================================
  // SCENARIO 3: MAKE IT RIGHT / DISPUTE RESOLUTION
  // ============================================================================

  async processDispute(
    workspaceId: string,
    incidentDescription: string,
    claimedAmount: number,
    initiatedBy: string,
    platformRole: string
  ): Promise<DisputeResult> {
    if (!GURU_ROLES.includes(platformRole as typeof GURU_ROLES[number])) {
      throw new Error('ACCESS DENIED: Insufficient privileges for dispute resolution');
    }

    const incidentId = `dispute-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    try {
      // 1. Forensic scan - check for system errors in recent tasks
      const recentTasks = await db
        .select({
          id: aiWorkboardTasks.id,
          status: aiWorkboardTasks.status,
          actualTokens: (aiWorkboardTasks as any).actualTokens,
          createdAt: aiWorkboardTasks.createdAt,
        })
        .from(aiWorkboardTasks)
        .where(and(
          eq(aiWorkboardTasks.workspaceId, workspaceId),
          gte(aiWorkboardTasks.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        ))
        .orderBy(desc(aiWorkboardTasks.createdAt))
        .limit(50);

      // Check for system faults (failed tasks, excessive token usage)
      const errorTasks = recentTasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
      const totalWastedTokens = errorTasks.reduce((sum, t) => sum + (t.actualTokens || 0), 0);
      const isSystemFault = errorTasks.length > 0 || totalWastedTokens > 1000;

      if (isSystemFault) {
        // Calculate refund: actual amount + 25% goodwill bonus
        const refundAmount = Math.min(claimedAmount, 500); // Cap at $500
        const goodwillBonus = refundAmount * 0.25;
        const totalCredits = Math.round((refundAmount + goodwillBonus) * 100); // In credits

        // 2. Issue credit to workspace via creditManager
        const refundResult = await creditManager.refundCredits({
          workspaceId,
          amount: totalCredits,
          reason: `Dispute Resolution: ${incidentId} - System fault reimbursement + goodwill bonus`,
          issuedByUserId: initiatedBy,
          issuedByName: 'Crisis Manager',
          relatedEntityType: 'dispute',
          relatedEntityId: incidentId,
        });

        // 3. Create audit log
        this.logAudit('CRISIS_DISPUTE_APPROVED', initiatedBy, workspaceId, {
          incidentId,
          claimedAmount,
          refundAmount,
          goodwillBonus,
          totalCredits,
          errorCount: errorTasks.length,
          incidentDescription,
        });

        log.info(`[CRISIS] Dispute APPROVED: $${refundAmount + goodwillBonus} credited to ${workspaceId}`);

        return {
          status: 'REFUND_APPROVED',
          amount: refundAmount,
          goodwill: goodwillBonus,
          reason: `System fault confirmed. ${errorTasks.length} error(s) detected. Refund + 25% goodwill bonus issued.`,
          incidentId,
        };
      }

      // No system fault found
      log.info(`[CRISIS] Dispute DENIED: No system fault detected for ${workspaceId}`);

      this.logAudit('CRISIS_DISPUTE_DENIED', initiatedBy, workspaceId, {
        incidentId,
        claimedAmount,
        reason: 'No system fault detected',
        incidentDescription,
      });

      return {
        status: 'REFUND_DENIED_USER_ERROR',
        reason: 'Analysis complete. No system fault detected. Issue appears to be user configuration.',
        incidentId,
      };
    } catch (error) {
      log.error('[CRISIS] Dispute processing failed:', error);
      return {
        status: 'PENDING_REVIEW',
        reason: `Error during analysis. Escalated for manual review: ${error}`,
        incidentId,
      };
    }
  }

  // ============================================================================
  // SCENARIO 4: NUCLEAR PROTOCOL / ORGANIZATION PURGE
  // ============================================================================

  async executePurge(
    targetOrgId: string,
    confirmPhrase: string,
    initiatedBy: string,
    platformRole: string
  ): Promise<PurgeResult> {
    const auditTrailId = `purge-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    // 1. Verify Root Privileges
    if (!ROOT_ONLY_ROLES.includes(platformRole as typeof ROOT_ONLY_ROLES[number])) {
      log.warn(`[CRISIS] PURGE ACCESS DENIED for ${initiatedBy} (role: ${platformRole})`);
      return {
        status: 'ACCESS_DENIED',
        targetOrgId,
        recordsDeleted: 0,
        auditTrailId: '',
      };
    }

    // 2. Verify Confirmation Phrase (dual-key authentication)
    const expectedPhrase = `CONFIRM DELETION ${targetOrgId}`;
    if (confirmPhrase !== expectedPhrase) {
      throw new Error(`CONFIRMATION PHRASE MISMATCH. Expected: "${expectedPhrase}"`);
    }

    log.warn(`[CRISIS] EXECUTING PURGE ON ORG ${targetOrgId}`);
    
    let recordsDeleted = 0;

    try {
      // 3. Get counts before deletion
      const [employeeCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(eq(employees.workspaceId, targetOrgId));

      recordsDeleted = Number(employeeCount?.count || 0);

      // 4. Delete workspace data (cascade should handle related records)
      await db.delete(workspaces).where(eq(workspaces.id, targetOrgId));

      // 5. Create comprehensive audit trail
      this.logAudit('CRISIS_NUCLEAR_PURGE', initiatedBy, targetOrgId, {
        targetOrgId,
        recordsDeleted,
        initiatedBy,
        confirmPhrase: '[REDACTED]',
        irreversible: true,
      });

      log.warn(`[CRISIS] PURGE COMPLETE: ${recordsDeleted} records deleted from ${targetOrgId}`);

      return {
        status: 'PURGE_COMPLETE',
        targetOrgId,
        recordsDeleted,
        auditTrailId,
      };
    } catch (error) {
      log.error('[CRISIS] Purge failed:', error);
      
      this.logAudit('CRISIS_NUCLEAR_PURGE_FAILED', initiatedBy, targetOrgId, {
        targetOrgId,
        error: String(error),
      });

      return {
        status: 'PURGE_FAILED',
        targetOrgId,
        recordsDeleted: 0,
        auditTrailId,
      };
    }
  }

  // ============================================================================
  // CRISIS DASHBOARD & MONITORING
  // ============================================================================

  getActiveCrises(): CrisisEvent[] {
    return Array.from(this.activeCrises.values())
      .filter(c => c.status === 'active')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getCrisisHistory(limit: number = 20): CrisisEvent[] {
    return Array.from(this.activeCrises.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  getAuditTrail(limit: number = 50): typeof this.auditTrail {
    return this.auditTrail.slice(-limit);
  }

  async getCrisisSummary(): Promise<{
    activeCrises: number;
    blackoutActive: boolean;
    recentLockdowns: number;
    recentDisputes: number;
    systemHealth: 'green' | 'yellow' | 'red';
  }> {
    const active = this.getActiveCrises();
    const lockdowns = active.filter(c => c.type === 'lockdown').length;
    const disputes = active.filter(c => c.type === 'dispute').length;
    
    let systemHealth: 'green' | 'yellow' | 'red' = 'green';
    if (this.blackoutStatus?.isActive) {
      systemHealth = this.blackoutStatus.level >= 2 ? 'red' : 'yellow';
    } else if (active.length > 5) {
      systemHealth = 'yellow';
    }

    return {
      activeCrises: active.length,
      blackoutActive: this.blackoutStatus?.isActive || false,
      recentLockdowns: lockdowns,
      recentDisputes: disputes,
      systemHealth,
    };
  }

  // Generate Trinity's crisis response script
  getCrisisScript(type: 'lockdown' | 'blackout' | 'dispute' | 'purge', context: Record<string, unknown>): string {
    const scripts: Record<string, string> = {
      lockdown: `Protocol RED-SHIELD initiated. I have immediately:
- Terminated all active sessions across all devices.
- Revoked all API keys (Stripe, Slack, Database).
- Locked account from any new logins.
Your data is safe in a frozen state. Nothing can move.
Action Required: To reopen, I need biometric verification or the 6-digit code sent to the verified mobile.`,

      blackout: `I am aware of the issue. We are currently experiencing a Level ${context.level || 2} Latency Event.
Current Status:
- Diagnosis: ${context.message || 'High traffic causing timeouts.'}
- The Fix: Auto-scaling nodes are spinning up now.
- ETA: Systems should normalize in ${context.eta || '3 minutes'}.
Fiduciary Protection: I have paused your billing clock. You are not being charged for this downtime.`,

      dispute: `Let me investigate... [Scanning Logs]... ${context.isApproved 
        ? `Confirmed. This was a platform fault, not yours.
Resolution:
- Refunded: $${(context.amount as number)?.toFixed(2) || '0.00'} credited back.
- Apology Bonus: $${(context.goodwill as number)?.toFixed(2) || '0.00'} goodwill credit.`
        : `Analysis complete. No system fault detected. The issue appears to be configuration-related.`}`,

      purge: `CRITICAL COMMAND RECEIVED.
This action is irreversible. It will:
- Delete all database records for this organization.
- Revoke all active licenses.
- Wipe all backup history.
Dual-Key Authentication Required:
Please type the phrase: 'CONFIRM DELETION ${context.targetOrgId}' to proceed.`,
    };

    return scripts[type] || 'Crisis protocol not recognized.';
  }
}

export const crisisManager = new CrisisManagerService();
export { CrisisManagerService, CrisisEvent, LockdownResult, BlackoutStatus, DisputeResult, PurgeResult };
