/**
 * TRINITY ORCHESTRATION GOVERNANCE SERVICE
 * ==========================================
 * Fortune 500-grade orchestration governance implementing:
 * 1. 99% Automation / 1% Human Approval pattern for all automation jobs
 * 2. Hotpatch Cadence Control (1 patch/day during non-busy hours)
 * 3. Email notification integration for escalations
 * 4. Gemini tier telemetry for compliance
 * 
 * This service wraps all automation actions with governance checkpoints.
 */

import { db } from '../../db';
import { 
  systemAuditLogs, 
  notifications, 
  users, 
  employees,
  workspaces,
  aiWorkflowApprovals,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { OWNER_ROLES, APPROVER_ROLES } from '@shared/platformConfig';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { createNotification } from '../notificationService';
import { sendAutomationEmail } from '../emailService';
import { PLATFORM_WORKSPACE_ID } from '../../services/billing/billingConstants';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityOrchestrationGovernance');

// ============================================================================
// TYPES
// ============================================================================

export type AutomationDomain = 'scheduling' | 'payroll' | 'invoicing' | 'hotpatch' | 'diagnostic';

export type ApprovalDecision = 'auto_approved' | 'approval_required' | 'rejected';

export interface GovernanceCheckResult {
  decision: ApprovalDecision;
  confidence: number;
  riskSignals: string[];
  requiresHumanApproval: boolean;
  approvalId?: string;
  reason: string;
  geminiTier: 'tier1_flash_8b' | 'tier2_flash' | 'tier3_pro';
}

export interface HotpatchWindow {
  allowed: boolean;
  nextWindowStart: Date;
  nextWindowEnd: Date;
  reason: string;
  patchesToday: number;
  dailyLimit: number;
}

// ============================================================================
// GRADUATED AUTO MODE TYPES
// ============================================================================

export type AutoModeLevel = 'manual' | 'supervised' | 'full_auto';

export interface OrgAutomationSettings {
  workspaceId: string;
  autoModeLevel: AutoModeLevel;
  reviewWindowMinutes: number; // Time before auto-publish (0 = immediate)
  successThresholdForAutoMode: number; // Success rate required (0.95 = 95%)
  minSuccessfulRunsForAutoMode: number; // Minimum successful runs before auto mode
  enabledDomains: AutomationDomain[];
  requireReviewForFinancial: boolean; // Always require review for payroll/invoicing
  notifyBeforeAutoExecute: boolean;
  lastUpdated: Date;
  updatedBy: string;
}

export interface AutomationHistoryStats {
  domain: AutomationDomain;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  lastRunAt: Date | null;
  averageConfidence: number;
  qualifiesForAutoMode: boolean;
}

export interface ReviewWindowStatus {
  orchestrationId: string;
  workspaceId: string;
  domain: AutomationDomain;
  stagedAt: Date;
  reviewWindowEndsAt: Date;
  autoExecuteScheduled: boolean;
  executedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  status: 'pending_review' | 'auto_executed' | 'manually_approved' | 'cancelled';
}

export interface GraduatedModeCheckResult extends GovernanceCheckResult {
  autoModeLevel: AutoModeLevel;
  reviewWindowMinutes: number;
  reviewWindowEndsAt: Date | null;
  historyStats: AutomationHistoryStats | null;
  canAutoExecute: boolean;
  userNotified: boolean;
}

interface GeminiTierTelemetry {
  requestId: string;
  tier: string;
  domain: AutomationDomain;
  tokensUsed: number;
  responseTimeMs: number;
  timestamp: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const GOVERNANCE_CONFIG = {
  autoApprovalThreshold: 0.99,
  highRiskThreshold: 0.95,
  
  hotpatchWindow: {
    startHour: 2,
    endHour: 5,
    timezone: 'UTC',
    dailyLimit: 1,
  },
  
  domainRiskWeights: {
    scheduling: 0.3,
    payroll: 0.8,
    invoicing: 0.7,
    hotpatch: 0.9,
    diagnostic: 0.2,
  },
  
  escalationRoles: ['root_admin', 'support', 'org_owner', 'co_owner'],
  
  // GRADUATED AUTO MODE CONFIGURATION
  graduatedAutoMode: {
    // Thresholds for progression to full auto
    minSuccessfulRuns: 50, // Minimum runs before considering auto mode
    successRateThreshold: 0.95, // 95% success rate required
    confidenceFloor: 0.90, // Minimum average confidence
    
    // Default review window (org can override)
    defaultReviewWindowMinutes: 15,
    maxReviewWindowMinutes: 1440, // 24 hours max
    minReviewWindowMinutes: 5,
    
    // Financial actions always get extra scrutiny
    financialDomains: ['payroll', 'invoicing'] as AutomationDomain[],
    financialReviewMultiplier: 2, // 2x review window for financial
    
    // Lookback period for history stats
    historyLookbackDays: 30,
  },
};

// Default org automation settings for new organizations
const DEFAULT_ORG_AUTOMATION_SETTINGS: Omit<OrgAutomationSettings, 'workspaceId' | 'lastUpdated' | 'updatedBy'> = {
  autoModeLevel: 'manual', // Start in manual mode
  reviewWindowMinutes: 15,
  successThresholdForAutoMode: 0.95,
  minSuccessfulRunsForAutoMode: 50,
  enabledDomains: ['scheduling', 'diagnostic'], // Start with low-risk domains
  requireReviewForFinancial: true,
  notifyBeforeAutoExecute: true,
};

// ============================================================================
// GEMINI TIER TELEMETRY
// ============================================================================

class GeminiTelemetryService {
  private telemetryBuffer: GeminiTierTelemetry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startFlushInterval();
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => this.flush(), 60000);
  }

  record(telemetry: Omit<GeminiTierTelemetry, 'timestamp'>) {
    this.telemetryBuffer.push({
      ...telemetry,
      timestamp: new Date(),
    });
  }

  async flush() {
    if (this.telemetryBuffer.length === 0) return;
    
    // Don't flush to DB when circuit breaker is open — keep buffer for later
    try {
      const { isDbCircuitOpen } = await import('../../db');
      if (isDbCircuitOpen()) return;
    } catch { /* ignore */ }
    
    const batch = [...this.telemetryBuffer];
    this.telemetryBuffer = [];

    try {
      for (const entry of batch) {
        await db.insert(systemAuditLogs).values({
          workspaceId: PLATFORM_WORKSPACE_ID,
          userId: 'system-trinity',
          action: 'gemini_tier_telemetry',
          entityType: 'ai_request',
          entityId: entry.requestId,
          metadata: {
            tier: entry.tier,
            domain: entry.domain,
            tokensUsed: entry.tokensUsed,
            responseTimeMs: entry.responseTimeMs,
            timestamp: entry.timestamp.toISOString(),
          },
          ipAddress: 'internal',
        });
      }
      log.info(`[GeminiTelemetry] Flushed ${batch.length} telemetry entries`);
    } catch (error) {
      log.error('[GeminiTelemetry] Failed to flush telemetry:', error);
      this.telemetryBuffer.push(...batch);
    }
  }

  getStats() {
    const byTier: Record<string, number> = {};
    const byDomain: Record<string, number> = {};
    
    for (const entry of this.telemetryBuffer) {
      byTier[entry.tier] = (byTier[entry.tier] || 0) + 1;
      byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1;
    }
    
    return { byTier, byDomain, pending: this.telemetryBuffer.length };
  }
}

// ============================================================================
// HOTPATCH CADENCE CONTROLLER
// ============================================================================

class HotpatchCadenceController {
  private todayPatchCount = 0;
  private lastResetDate: string = '';

  async checkWindow(): Promise<HotpatchWindow> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (this.lastResetDate !== today) {
      this.todayPatchCount = await this.countTodayPatches();
      this.lastResetDate = today;
    }

    const hour = now.getUTCHours();
    const { startHour, endHour, dailyLimit } = GOVERNANCE_CONFIG.hotpatchWindow;
    
    const isWithinWindow = hour >= startHour && hour < endHour;
    const hasCapacity = this.todayPatchCount < dailyLimit;

    const nextWindowStart = new Date(now);
    nextWindowStart.setUTCHours(startHour, 0, 0, 0);
    if (hour >= endHour) {
      nextWindowStart.setDate(nextWindowStart.getDate() + 1);
    }

    const nextWindowEnd = new Date(nextWindowStart);
    nextWindowEnd.setUTCHours(endHour, 0, 0, 0);

    let reason = '';
    if (!isWithinWindow) {
      reason = `Outside maintenance window (${startHour}:00-${endHour}:00 UTC)`;
    } else if (!hasCapacity) {
      reason = `Daily patch limit reached (${dailyLimit} patches/day)`;
    }

    return {
      allowed: isWithinWindow && hasCapacity,
      nextWindowStart,
      nextWindowEnd,
      reason: reason || 'Hotpatch window available',
      patchesToday: this.todayPatchCount,
      dailyLimit,
    };
  }

  async recordPatch() {
    this.todayPatchCount++;
    
    await db.insert(systemAuditLogs).values({
      workspaceId: PLATFORM_WORKSPACE_ID,
      userId: 'system-trinity',
      action: 'hotpatch_applied',
      entityType: 'platform',
      entityId: `patch-${Date.now()}`,
      metadata: {
        patchNumber: this.todayPatchCount,
        appliedAt: new Date().toISOString(),
      },
      ipAddress: 'internal',
    });
  }

  async forceOverride(userId: string, reason: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || !['root_admin', 'support'].includes(user.role)) {
      log.info(`[HotpatchCadence] Override denied for user ${userId} - insufficient role`);
      return false;
    }

    await db.insert(systemAuditLogs).values({
      workspaceId: PLATFORM_WORKSPACE_ID,
      userId,
      action: 'hotpatch_override',
      entityType: 'platform',
      entityId: `override-${Date.now()}`,
      metadata: {
        reason,
        overrideAt: new Date().toISOString(),
        previousPatchCount: this.todayPatchCount,
      },
      ipAddress: 'internal',
    });

    log.info(`[HotpatchCadence] Override granted to ${userId}: ${reason}`);
    return true;
  }

  private async countTodayPatches(): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const patches = await db.select({ count: sql<number>`count(*)` })
      .from(systemAuditLogs)
      .where(and(
        eq(systemAuditLogs.action, 'hotpatch_applied'),
        gte(systemAuditLogs.createdAt, today)
      ));

    return Number(patches[0]?.count || 0);
  }
}

// ============================================================================
// AUTOMATION APPROVAL GATE
// ============================================================================

class AutomationApprovalGate {
  async evaluate(
    domain: AutomationDomain,
    workspaceId: string,
    actionDetails: {
      type: string;
      affectedRecords: number;
      estimatedImpact: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<GovernanceCheckResult> {
    const riskWeight = GOVERNANCE_CONFIG.domainRiskWeights[domain];
    const riskSignals: string[] = [];
    
    if (actionDetails.affectedRecords > 100) {
      riskSignals.push('LARGE_BATCH');
    }
    
    if (domain === 'payroll' || domain === 'invoicing') {
      riskSignals.push('FINANCIAL_IMPACT');
    }
    
    const isFirstRun = await this.isFirstAutomationRun(workspaceId, domain);
    if (isFirstRun) {
      riskSignals.push('FIRST_RUN');
    }

    const hasRecentErrors = await this.hasRecentErrors(workspaceId, domain);
    if (hasRecentErrors) {
      riskSignals.push('RECENT_ERRORS');
    }

    const confidence = this.calculateConfidence(riskWeight, riskSignals);
    const geminiTier = this.selectGeminiTier(domain, confidence);

    let decision: ApprovalDecision;
    let reason: string;
    let approvalId: string | undefined;

    if (confidence >= GOVERNANCE_CONFIG.autoApprovalThreshold && riskSignals.length === 0) {
      decision = 'auto_approved';
      reason = '99% automation: High confidence, no risk signals detected';
    } else {
      decision = 'approval_required';
      reason = `1% oversight required: ${riskSignals.join(', ') || 'Confidence below threshold'}`;
      
      approvalId = await this.createApprovalRequest(
        domain,
        workspaceId,
        actionDetails,
        riskSignals,
        confidence
      );
    }

    geminiTelemetryService.record({
      requestId: approvalId || `auto-${Date.now()}`,
      tier: geminiTier,
      domain,
      tokensUsed: 0,
      responseTimeMs: 0,
    });

    return {
      decision,
      confidence,
      riskSignals,
      requiresHumanApproval: decision === 'approval_required',
      approvalId,
      reason,
      geminiTier,
    };
  }

  private calculateConfidence(riskWeight: number, riskSignals: string[]): number {
    let confidence = 1.0 - (riskWeight * 0.05);
    
    for (const signal of riskSignals) {
      switch (signal) {
        case 'LARGE_BATCH': confidence -= 0.03; break;
        case 'FINANCIAL_IMPACT': confidence -= 0.02; break;
        case 'FIRST_RUN': confidence -= 0.05; break;
        case 'RECENT_ERRORS': confidence -= 0.08; break;
        default: confidence -= 0.01;
      }
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  private selectGeminiTier(domain: AutomationDomain, confidence: number): 'tier1_flash_8b' | 'tier2_flash' | 'tier3_pro' {
    if (domain === 'diagnostic' && confidence < 0.9) {
      return 'tier3_pro';
    }
    
    if (domain === 'payroll' || domain === 'invoicing') {
      return 'tier2_flash';
    }
    
    return 'tier1_flash_8b';
  }

  private async isFirstAutomationRun(workspaceId: string, domain: AutomationDomain): Promise<boolean> {
    const previousRuns = await db.select({ count: sql<number>`count(*)` })
      .from(systemAuditLogs)
      .where(and(
        eq(systemAuditLogs.workspaceId, workspaceId),
        eq(systemAuditLogs.action, `automation_${domain}_completed`)
      ));

    return Number(previousRuns[0]?.count || 0) === 0;
  }

  private async hasRecentErrors(workspaceId: string, domain: AutomationDomain): Promise<boolean> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const errors = await db.select({ count: sql<number>`count(*)` })
      .from(systemAuditLogs)
      .where(and(
        eq(systemAuditLogs.workspaceId, workspaceId),
        eq(systemAuditLogs.action, `automation_${domain}_failed`),
        gte(systemAuditLogs.createdAt, yesterday)
      ));

    return Number(errors[0]?.count || 0) > 0;
  }

  private async createApprovalRequest(
    domain: AutomationDomain,
    workspaceId: string,
    actionDetails: any,
    riskSignals: string[],
    confidence: number
  ): Promise<string> {
    const approvalId = `approval-${domain}-${Date.now()}`;
    
    await db.insert(aiWorkflowApprovals).values({
      id: approvalId,
      title: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Automation Approval Required`,
      description: `Action: ${actionDetails.type}\nAffected Records: ${actionDetails.affectedRecords}\nImpact: ${actionDetails.estimatedImpact}\nWorkspace: ${workspaceId}`,
      endUserSummary: `Automated ${domain} operation requires your approval before proceeding.`,
      riskLevel: confidence < GOVERNANCE_CONFIG.highRiskThreshold ? 'high' : 'medium',
      impactScope: 'workspace',
      affectedFiles: [],
      rollbackPlan: 'Revert to previous state via automation rollback',
      status: 'pending',
      requiredRole: 'co_owner',
      proposedChanges: {
        domain,
        workspaceId,
        riskSignals,
        confidence,
        actionDetails,
      },
    });

    await this.notifyApprovers(workspaceId, domain, approvalId, actionDetails);
    
    return approvalId;
  }

  private async notifyApprovers(
    workspaceId: string,
    domain: AutomationDomain,
    approvalId: string,
    actionDetails: any
  ) {
    const approvers = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, workspaceId),
        inArray(employees.workspaceRole, [...APPROVER_ROLES])
      ),
    });

    for (const approver of approvers) {
      if (!approver.userId) continue;

      await createNotification({
        workspaceId,
        userId: approver.userId,
        type: 'action_required',
        title: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Automation Needs Approval`,
        message: `Action: ${actionDetails.type} affecting ${actionDetails.affectedRecords} records requires your approval.`,
        actionUrl: `/settings/automation-approvals?id=${approvalId}`,
        relatedEntityType: 'automation',
        relatedEntityId: approvalId,
        metadata: { domain, approvalId },
        createdBy: 'system-trinity',
        idempotencyKey: `action_required-${approvalId}-${approver.userId}`
      });

      const user = await db.query.users.findFirst({
        where: eq(users.id, approver.userId),
      });

      if (user?.email) {
        try {
          await sendAutomationEmail({
            to: user.email,
            type: 'approval_required',
            data: {
              firstName: user.firstName || 'Admin',
              domain,
              actionType: actionDetails.type,
              affectedRecords: actionDetails.affectedRecords,
              approvalUrl: `/settings/automation-approvals?id=${approvalId}`,
            },
          });
        } catch (emailError) {
          log.error('[ApprovalGate] Failed to send email notification:', emailError);
        }
      }
    }
  }
}

// ============================================================================
// SERVICE INSTANCES
// ============================================================================

const geminiTelemetryService = new GeminiTelemetryService();
const hotpatchCadenceController = new HotpatchCadenceController();
const automationApprovalGate = new AutomationApprovalGate();

// ============================================================================
// ORCHESTRATION GOVERNANCE SERVICE
// ============================================================================

class TrinityOrchestrationGovernanceService {
  private static instance: TrinityOrchestrationGovernanceService;

  private constructor() {}

  static getInstance(): TrinityOrchestrationGovernanceService {
    if (!this.instance) {
      this.instance = new TrinityOrchestrationGovernanceService();
    }
    return this.instance;
  }

  async evaluateAutomation(
    domain: AutomationDomain,
    workspaceId: string,
    actionDetails: {
      type: string;
      affectedRecords: number;
      estimatedImpact: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<GovernanceCheckResult> {
    return automationApprovalGate.evaluate(domain, workspaceId, actionDetails);
  }

  async checkHotpatchWindow(): Promise<HotpatchWindow> {
    return hotpatchCadenceController.checkWindow();
  }

  async recordHotpatch() {
    return hotpatchCadenceController.recordPatch();
  }

  async overrideHotpatchLimit(userId: string, reason: string): Promise<boolean> {
    return hotpatchCadenceController.forceOverride(userId, reason);
  }

  getGeminiTelemetry() {
    return geminiTelemetryService.getStats();
  }

  async flushTelemetry() {
    return geminiTelemetryService.flush();
  }
}

// ============================================================================
// AI BRAIN ACTION REGISTRATION
// ============================================================================

export function registerOrchestrationGovernanceActions() {
  const service = TrinityOrchestrationGovernanceService.getInstance();

  helpaiOrchestrator.registerAction({
    actionId: 'governance.evaluate_automation',
    name: 'Evaluate Automation Approval',
    category: 'automation',
    description: 'Evaluate if an automation action should auto-execute or require human approval (99/1 pattern)',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'root_admin'],
    handler: async (params: {
      domain: AutomationDomain;
      workspaceId: string;
      type: string;
      affectedRecords: number;
      estimatedImpact: string;
    }) => {
      return await service.evaluateAutomation(params.domain, params.workspaceId, {
        type: params.type,
        affectedRecords: params.affectedRecords,
        estimatedImpact: params.estimatedImpact,
      });
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'governance.check_hotpatch_window',
    name: 'Check Hotpatch Window',
    category: 'automation',
    description: 'Check if hotpatches can be applied (daily limit + maintenance window)',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'root_admin'],
    handler: async () => {
      return await service.checkHotpatchWindow();
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'governance.record_hotpatch',
    name: 'Record Hotpatch Applied',
    category: 'automation',
    description: 'Record that a hotpatch was applied (increments daily counter)',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin', 'support_agent'],
    handler: async () => {
      await service.recordHotpatch();
      return { success: true, message: 'Hotpatch recorded' };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'governance.override_hotpatch_limit',
    name: 'Override Hotpatch Limit',
    category: 'automation',
    description: 'Force override the daily hotpatch limit (requires support role)',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin', 'support_agent'],
    handler: async (params: { userId: string; reason: string }) => {
      const success = await service.overrideHotpatchLimit(params.userId, params.reason);
      return { success, message: success ? 'Override granted' : 'Override denied - insufficient permissions' };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'governance.get_gemini_telemetry',
    name: 'Get Gemini Tier Telemetry',
    category: 'analytics',
    description: 'Get telemetry statistics for Gemini tier usage across automation domains',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'root_admin'],
    handler: async () => {
      return service.getGeminiTelemetry();
    },
  });

  log.info('[OrchestrationGovernance] Registered 5 AI Brain governance actions');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trinityOrchestrationGovernance = TrinityOrchestrationGovernanceService.getInstance();
export { hotpatchCadenceController, automationApprovalGate, geminiTelemetryService };
