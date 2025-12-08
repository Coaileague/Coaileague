/**
 * AUTOMATION GOVERNANCE SERVICE
 * =============================
 * Central governance layer for AI-driven automation with confidence-based tiers.
 * 
 * Automation Levels:
 * - HAND_HELD (0-40% confidence): All actions require explicit user confirmation
 * - GRADUATED (41-75% confidence): Routine actions auto-execute, high-risk requires confirmation
 * - FULL_AUTOMATION (76-100% confidence): All actions auto-execute with real-time notifications
 * 
 * Features:
 * - Workspace-level policy management
 * - User consent verification and tracking
 * - Action ledger for complete audit trail
 * - Confidence scoring and tier evaluation
 * - Human escalation bridge for low-confidence scenarios
 */

import { db } from '../../db';
import { eq, and, desc, gte, isNull, sql } from 'drizzle-orm';
import {
  workspaceAutomationPolicies,
  userAutomationConsents,
  automationActionLedger,
  automationAcknowledgments,
  systemAuditLogs,
  type WorkspaceAutomationPolicy,
  type UserAutomationConsent,
  type AutomationActionLedger,
  type InsertAutomationActionLedger,
  type InsertUserAutomationConsent,
  type InsertWorkspaceAutomationPolicy,
} from '@shared/schema';
import { trinityMemoryService } from './trinityMemoryService';

// ============================================================================
// TYPES
// ============================================================================

export type AutomationLevel = 'hand_held' | 'graduated' | 'full_automation';

export interface ConfidenceFactors {
  baseScore: number;
  historicalSuccessRate?: number;
  userFeedbackScore?: number;
  dataQualityScore?: number;
  contextCompleteness?: number;
  riskMultiplier?: number;
}

export interface ExecutionDecision {
  canExecute: boolean;
  requiresApproval: boolean;
  computedLevel: AutomationLevel;
  policyLevel: AutomationLevel;
  confidenceScore: number;
  confidenceFactors: ConfidenceFactors;
  isHighRisk: boolean;
  riskFactors: string[];
  blockingReason?: string;
  requiredConsents?: string[];
  ledgerEntryId?: string;
}

export interface ActionContext {
  actionId: string;
  actionName: string;
  actionCategory: string;
  toolName?: string;
  workspaceId?: string;
  userId?: string;
  isBot?: boolean;
  executorType?: 'user' | 'trinity' | 'helpai' | 'subagent' | 'automation_job';
  trinitySessionId?: string;
  conversationTurnId?: string;
  payload?: Record<string, any>;
}

export interface ConsentRequest {
  userId: string;
  workspaceId: string;
  consentType: string;
  sourceContext?: string;
  waiverVersion?: string;
}

export interface PolicyUpdateRequest {
  workspaceId: string;
  currentLevel?: AutomationLevel;
  handHeldThreshold?: number;
  graduatedThreshold?: number;
  highRiskCategories?: string[];
  minConfidenceForAutoExecute?: number;
  orgOwnerConsent?: boolean;
  orgOwnerConsentUserId?: string;
  waiverAccepted?: boolean;
  waiverVersion?: string;
}

// ============================================================================
// HIGH-RISK ACTION CATEGORIES
// Actions in these categories always require human approval in GRADUATED mode
// ============================================================================

const DEFAULT_HIGH_RISK_CATEGORIES = [
  'payroll',
  'billing',
  'termination',
  'data_deletion',
  'financial_transfer',
  'user_access_revocation',
  'compliance_override',
  'contract_modification',
];

// ============================================================================
// AUTOMATION GOVERNANCE SERVICE CLASS
// ============================================================================

class AutomationGovernanceService {
  private static instance: AutomationGovernanceService;
  private policyCache: Map<string, WorkspaceAutomationPolicy> = new Map();
  private consentCache: Map<string, UserAutomationConsent[]> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  static getInstance(): AutomationGovernanceService {
    if (!this.instance) {
      this.instance = new AutomationGovernanceService();
    }
    return this.instance;
  }

  // ============================================================================
  // POLICY MANAGEMENT
  // ============================================================================

  async getOrCreatePolicy(workspaceId: string): Promise<WorkspaceAutomationPolicy> {
    // Check cache first
    const cached = this.policyCache.get(workspaceId);
    if (cached) {
      return cached;
    }

    try {
      // Try to get existing policy
      const [existing] = await db
        .select()
        .from(workspaceAutomationPolicies)
        .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId))
        .limit(1);

      if (existing) {
        this.policyCache.set(workspaceId, existing);
        setTimeout(() => this.policyCache.delete(workspaceId), this.cacheTimeout);
        return existing;
      }

      // Create default policy
      const [newPolicy] = await db
        .insert(workspaceAutomationPolicies)
        .values({
          workspaceId,
          currentLevel: 'hand_held',
          handHeldThreshold: 40,
          graduatedThreshold: 75,
          highRiskCategories: DEFAULT_HIGH_RISK_CATEGORIES,
        })
        .returning();

      this.policyCache.set(workspaceId, newPolicy);
      setTimeout(() => this.policyCache.delete(workspaceId), this.cacheTimeout);
      return newPolicy;
    } catch (error) {
      console.error('[AutomationGovernance] Error getting policy:', error);
      // Return default policy structure if DB fails
      return {
        id: 'fallback',
        workspaceId,
        currentLevel: 'hand_held',
        handHeldThreshold: 40,
        graduatedThreshold: 75,
        reviewCadenceDays: 30,
        lastReviewedAt: null,
        lastReviewedBy: null,
        nextReviewAt: null,
        highRiskCategories: DEFAULT_HIGH_RISK_CATEGORIES,
        autoEscalateOnLowConfidence: true,
        minConfidenceForAutoExecute: 60,
        enableAuditNotifications: true,
        orgOwnerConsent: false,
        orgOwnerConsentAt: null,
        orgOwnerConsentUserId: null,
        waiverAccepted: false,
        waiverAcceptedAt: null,
        waiverVersion: '1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  async updatePolicy(request: PolicyUpdateRequest): Promise<WorkspaceAutomationPolicy | null> {
    try {
      const updates: Partial<InsertWorkspaceAutomationPolicy> = {};
      
      if (request.currentLevel) updates.currentLevel = request.currentLevel;
      if (request.handHeldThreshold !== undefined) updates.handHeldThreshold = request.handHeldThreshold;
      if (request.graduatedThreshold !== undefined) updates.graduatedThreshold = request.graduatedThreshold;
      if (request.highRiskCategories) updates.highRiskCategories = request.highRiskCategories;
      if (request.minConfidenceForAutoExecute !== undefined) updates.minConfidenceForAutoExecute = request.minConfidenceForAutoExecute;
      
      if (request.orgOwnerConsent !== undefined) {
        updates.orgOwnerConsent = request.orgOwnerConsent;
        if (request.orgOwnerConsent) {
          updates.orgOwnerConsentAt = new Date();
          updates.orgOwnerConsentUserId = request.orgOwnerConsentUserId || null;
        }
      }
      
      if (request.waiverAccepted !== undefined) {
        updates.waiverAccepted = request.waiverAccepted;
        if (request.waiverAccepted) {
          updates.waiverAcceptedAt = new Date();
          updates.waiverVersion = request.waiverVersion || '1.0';
        }
      }

      const [updated] = await db
        .update(workspaceAutomationPolicies)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workspaceAutomationPolicies.workspaceId, request.workspaceId))
        .returning();

      if (updated) {
        this.policyCache.set(request.workspaceId, updated);
      }
      
      return updated || null;
    } catch (error) {
      console.error('[AutomationGovernance] Error updating policy:', error);
      return null;
    }
  }

  // ============================================================================
  // CONSENT MANAGEMENT
  // ============================================================================

  async hasUserConsent(userId: string, workspaceId: string, consentType: string): Promise<boolean> {
    try {
      const [consent] = await db
        .select()
        .from(userAutomationConsents)
        .where(
          and(
            eq(userAutomationConsents.userId, userId),
            eq(userAutomationConsents.workspaceId, workspaceId),
            eq(userAutomationConsents.consentType, consentType),
            eq(userAutomationConsents.consentGranted, true),
            isNull(userAutomationConsents.revokedAt)
          )
        )
        .limit(1);

      if (!consent) return false;

      // Check if consent has expired
      if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AutomationGovernance] Error checking consent:', error);
      return false;
    }
  }

  async grantUserConsent(request: ConsentRequest): Promise<UserAutomationConsent | null> {
    try {
      // Check for existing consent
      const [existing] = await db
        .select()
        .from(userAutomationConsents)
        .where(
          and(
            eq(userAutomationConsents.userId, request.userId),
            eq(userAutomationConsents.workspaceId, request.workspaceId),
            eq(userAutomationConsents.consentType, request.consentType)
          )
        )
        .limit(1);

      if (existing) {
        // Update existing consent
        const [updated] = await db
          .update(userAutomationConsents)
          .set({
            consentGranted: true,
            consentGrantedAt: new Date(),
            revokedAt: null,
            revokedReason: null,
            sourceContext: request.sourceContext,
            waiverVersion: request.waiverVersion,
            waiverAccepted: !!request.waiverVersion,
            waiverAcceptedAt: request.waiverVersion ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(userAutomationConsents.id, existing.id))
          .returning();
        return updated;
      }

      // Create new consent
      const [newConsent] = await db
        .insert(userAutomationConsents)
        .values({
          userId: request.userId,
          workspaceId: request.workspaceId,
          consentType: request.consentType,
          consentGranted: true,
          consentGrantedAt: new Date(),
          sourceContext: request.sourceContext,
          waiverVersion: request.waiverVersion,
          waiverAccepted: !!request.waiverVersion,
          waiverAcceptedAt: request.waiverVersion ? new Date() : null,
        })
        .returning();

      return newConsent;
    } catch (error) {
      console.error('[AutomationGovernance] Error granting consent:', error);
      return null;
    }
  }

  async revokeUserConsent(userId: string, workspaceId: string, consentType: string, reason?: string): Promise<boolean> {
    try {
      await db
        .update(userAutomationConsents)
        .set({
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userAutomationConsents.userId, userId),
            eq(userAutomationConsents.workspaceId, workspaceId),
            eq(userAutomationConsents.consentType, consentType)
          )
        );
      return true;
    } catch (error) {
      console.error('[AutomationGovernance] Error revoking consent:', error);
      return false;
    }
  }

  async getUserConsents(userId: string, workspaceId: string): Promise<UserAutomationConsent[]> {
    try {
      return await db
        .select()
        .from(userAutomationConsents)
        .where(
          and(
            eq(userAutomationConsents.userId, userId),
            eq(userAutomationConsents.workspaceId, workspaceId),
            eq(userAutomationConsents.consentGranted, true),
            isNull(userAutomationConsents.revokedAt)
          )
        );
    } catch (error) {
      console.error('[AutomationGovernance] Error getting consents:', error);
      return [];
    }
  }

  // ============================================================================
  // CONFIDENCE SCORING
  // ============================================================================

  computeConfidenceScore(factors: ConfidenceFactors): number {
    let score = factors.baseScore;

    // Apply adjustments
    if (factors.historicalSuccessRate !== undefined) {
      score = score * 0.6 + factors.historicalSuccessRate * 0.4;
    }

    if (factors.userFeedbackScore !== undefined) {
      score = score * 0.8 + factors.userFeedbackScore * 0.2;
    }

    if (factors.dataQualityScore !== undefined) {
      score = score * 0.85 + factors.dataQualityScore * 0.15;
    }

    if (factors.contextCompleteness !== undefined) {
      score = score * 0.9 + factors.contextCompleteness * 0.1;
    }

    // Apply risk multiplier (reduces confidence for risky operations)
    if (factors.riskMultiplier !== undefined) {
      score = score * factors.riskMultiplier;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  computeAutomationLevel(confidenceScore: number, policy: WorkspaceAutomationPolicy): AutomationLevel {
    const handHeldThreshold = policy.handHeldThreshold || 40;
    const graduatedThreshold = policy.graduatedThreshold || 75;

    if (confidenceScore <= handHeldThreshold) {
      return 'hand_held';
    } else if (confidenceScore <= graduatedThreshold) {
      return 'graduated';
    } else {
      return 'full_automation';
    }
  }

  // ============================================================================
  // EXECUTION DECISION ENGINE
  // ============================================================================

  async evaluateExecution(
    context: ActionContext,
    confidenceFactors: ConfidenceFactors
  ): Promise<ExecutionDecision> {
    // SECURITY: Require workspaceId for all non-system actions
    if (!context.workspaceId && context.executorType !== 'automation_job') {
      return {
        canExecute: false,
        requiresApproval: true,
        computedLevel: 'hand_held',
        policyLevel: 'hand_held',
        confidenceScore: 0,
        confidenceFactors,
        isHighRisk: true,
        riskFactors: ['Missing workspace context - cannot determine policy'],
        blockingReason: 'Workspace ID is required for automation governance',
      };
    }
    
    const workspaceId = context.workspaceId || 'system-automation';
    
    // Get policy
    const policy = await this.getOrCreatePolicy(workspaceId);
    
    // Compute confidence score
    const confidenceScore = this.computeConfidenceScore(confidenceFactors);
    
    // Determine automation level
    const computedLevel = this.computeAutomationLevel(confidenceScore, policy);
    const policyLevel = policy.currentLevel;
    
    // Check if action is high-risk
    const highRiskCategories = (policy.highRiskCategories as string[]) || DEFAULT_HIGH_RISK_CATEGORIES;
    const isHighRisk = highRiskCategories.includes(context.actionCategory);
    
    const riskFactors: string[] = [];
    if (isHighRisk) {
      riskFactors.push(`Category '${context.actionCategory}' is flagged as high-risk`);
    }
    if (confidenceScore < (policy.minConfidenceForAutoExecute || 60)) {
      riskFactors.push(`Confidence ${confidenceScore}% is below auto-execute threshold`);
    }

    // Determine if execution can proceed
    let canExecute = true;
    let requiresApproval = false;
    let blockingReason: string | undefined;
    const requiredConsents: string[] = [];

    // Check org owner consent for automation features
    if (!policy.orgOwnerConsent) {
      canExecute = false;
      blockingReason = 'Organization owner has not consented to automation features';
      requiredConsents.push('org_automation');
    }

    // Check waiver acceptance for high-risk actions
    if (isHighRisk && !policy.waiverAccepted) {
      canExecute = false;
      blockingReason = 'Liability waiver not accepted for high-risk automation';
      requiredConsents.push('high_risk_waiver');
    }

    // Determine approval requirements based on levels
    if (canExecute) {
      switch (policyLevel) {
        case 'hand_held':
          // All actions require explicit approval
          requiresApproval = true;
          break;
          
        case 'graduated':
          // High-risk or low-confidence actions require approval
          if (isHighRisk || computedLevel === 'hand_held') {
            requiresApproval = true;
          }
          break;
          
        case 'full_automation':
          // Only extremely low confidence requires approval
          if (confidenceScore < 20) {
            requiresApproval = true;
            riskFactors.push('Extremely low confidence score');
          }
          break;
      }
    }

    // Bots with elevated sessions can bypass APPROVAL checks only if policy allows automation
    // They still cannot bypass org consent and waiver requirements
    if (context.isBot && context.executorType === 'automation_job') {
      // Only skip approval if org has consented to automation
      if (policy.orgOwnerConsent && canExecute) {
        requiresApproval = false; // Automated jobs run without individual approval
      }
      // If high-risk, still require waiver acceptance
      if (isHighRisk && !policy.waiverAccepted) {
        requiresApproval = true;
        riskFactors.push('Bot action in high-risk category without waiver');
      }
    }

    return {
      canExecute,
      requiresApproval,
      computedLevel,
      policyLevel,
      confidenceScore,
      confidenceFactors,
      isHighRisk,
      riskFactors,
      blockingReason,
      requiredConsents: requiredConsents.length > 0 ? requiredConsents : undefined,
    };
  }

  // ============================================================================
  // LEDGER MANAGEMENT
  // ============================================================================

  async createLedgerEntry(
    context: ActionContext,
    decision: ExecutionDecision
  ): Promise<AutomationActionLedger | null> {
    try {
      const entry: InsertAutomationActionLedger = {
        workspaceId: context.workspaceId || null,
        actionId: context.actionId,
        actionName: context.actionName,
        actionCategory: context.actionCategory,
        toolName: context.toolName,
        confidenceScore: decision.confidenceScore,
        computedLevel: decision.computedLevel,
        policyLevel: decision.policyLevel,
        requiresHumanApproval: decision.requiresApproval,
        approvalState: decision.requiresApproval ? 'pending' : 'auto_approved',
        executedBy: context.userId || null,
        executedByBot: context.isBot || false,
        executorType: context.executorType,
        inputPayload: context.payload,
        executionStatus: 'pending',
        isHighRisk: decision.isHighRisk,
        riskFactors: decision.riskFactors,
        trinitySessionId: context.trinitySessionId,
        conversationTurnId: context.conversationTurnId,
      };

      const [ledgerEntry] = await db
        .insert(automationActionLedger)
        .values(entry)
        .returning();

      return ledgerEntry;
    } catch (error) {
      console.error('[AutomationGovernance] Error creating ledger entry:', error);
      return null;
    }
  }

  async updateLedgerEntry(
    ledgerEntryId: string,
    updates: Partial<{
      approvalState: string;
      approvedBy: string;
      approvalNotes: string;
      executionStatus: string;
      outputResult: Record<string, any>;
      errorDetails: string;
      executionTimeMs: number;
      auditLogId: string;
    }>
  ): Promise<boolean> {
    try {
      await db
        .update(automationActionLedger)
        .set({
          ...updates,
          completedAt: updates.executionStatus === 'completed' || updates.executionStatus === 'failed' 
            ? new Date() 
            : undefined,
          approvedAt: updates.approvalState === 'approved' ? new Date() : undefined,
        })
        .where(eq(automationActionLedger.id, ledgerEntryId));
      return true;
    } catch (error) {
      console.error('[AutomationGovernance] Error updating ledger entry:', error);
      return false;
    }
  }

  async approveLedgerEntry(
    ledgerEntryId: string,
    approvedBy: string,
    notes?: string
  ): Promise<boolean> {
    return this.updateLedgerEntry(ledgerEntryId, {
      approvalState: 'approved',
      approvedBy,
      approvalNotes: notes,
    });
  }

  async rejectLedgerEntry(
    ledgerEntryId: string,
    rejectedBy: string,
    reason: string
  ): Promise<boolean> {
    return this.updateLedgerEntry(ledgerEntryId, {
      approvalState: 'rejected',
      approvedBy: rejectedBy,
      approvalNotes: reason,
      executionStatus: 'cancelled',
    });
  }

  async getLedgerEntries(
    workspaceId: string,
    options?: {
      status?: string;
      approvalState?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<AutomationActionLedger[]> {
    try {
      let query = db
        .select()
        .from(automationActionLedger)
        .where(eq(automationActionLedger.workspaceId, workspaceId))
        .orderBy(desc(automationActionLedger.createdAt))
        .limit(options?.limit || 50)
        .offset(options?.offset || 0);

      return await query;
    } catch (error) {
      console.error('[AutomationGovernance] Error getting ledger entries:', error);
      return [];
    }
  }

  async getPendingApprovals(workspaceId: string): Promise<AutomationActionLedger[]> {
    try {
      return await db
        .select()
        .from(automationActionLedger)
        .where(
          and(
            eq(automationActionLedger.workspaceId, workspaceId),
            eq(automationActionLedger.approvalState, 'pending'),
            eq(automationActionLedger.requiresHumanApproval, true)
          )
        )
        .orderBy(automationActionLedger.createdAt);
    } catch (error) {
      console.error('[AutomationGovernance] Error getting pending approvals:', error);
      return [];
    }
  }

  // ============================================================================
  // AUDIT TRAIL INTEGRATION
  // ============================================================================

  async linkToAuditLog(ledgerEntryId: string, auditLogId: string): Promise<boolean> {
    return this.updateLedgerEntry(ledgerEntryId, { auditLogId });
  }

  async createAuditTrailEntry(
    context: ActionContext,
    decision: ExecutionDecision,
    result: { success: boolean; message: string; data?: any }
  ): Promise<string | null> {
    try {
      const [auditLog] = await db
        .insert(systemAuditLogs)
        .values({
          userId: context.userId,
          action: context.actionId,
          entityType: context.actionCategory,
          entityId: context.trinitySessionId || undefined,
          workspaceId: context.workspaceId,
          metadata: {
            actionName: context.actionName,
            executorType: context.executorType || 'user',
            confidenceScore: decision.confidenceScore,
            computedLevel: decision.computedLevel,
            policyLevel: decision.policyLevel,
            isHighRisk: decision.isHighRisk,
            riskFactors: decision.riskFactors,
            requiresApproval: decision.requiresApproval,
            result,
          },
        })
        .returning();

      return auditLog?.id || null;
    } catch (error) {
      console.error('[AutomationGovernance] Error creating audit trail:', error);
      return null;
    }
  }

  // ============================================================================
  // ANALYTICS & METRICS
  // ============================================================================

  async getGovernanceMetrics(workspaceId: string, daysBack: number = 30): Promise<{
    totalActions: number;
    autoApproved: number;
    humanApproved: number;
    rejected: number;
    avgConfidenceScore: number;
    highRiskActions: number;
    levelBreakdown: Record<AutomationLevel, number>;
  }> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const entries = await db
        .select()
        .from(automationActionLedger)
        .where(
          and(
            eq(automationActionLedger.workspaceId, workspaceId),
            gte(automationActionLedger.createdAt, since)
          )
        );

      const levelBreakdown: Record<AutomationLevel, number> = {
        hand_held: 0,
        graduated: 0,
        full_automation: 0,
      };

      let totalConfidence = 0;
      let autoApproved = 0;
      let humanApproved = 0;
      let rejected = 0;
      let highRiskActions = 0;

      for (const entry of entries) {
        totalConfidence += entry.confidenceScore;
        levelBreakdown[entry.computedLevel]++;
        
        if (entry.isHighRisk) highRiskActions++;
        
        switch (entry.approvalState) {
          case 'auto_approved':
            autoApproved++;
            break;
          case 'approved':
            humanApproved++;
            break;
          case 'rejected':
            rejected++;
            break;
        }
      }

      return {
        totalActions: entries.length,
        autoApproved,
        humanApproved,
        rejected,
        avgConfidenceScore: entries.length > 0 ? Math.round(totalConfidence / entries.length) : 0,
        highRiskActions,
        levelBreakdown,
      };
    } catch (error) {
      console.error('[AutomationGovernance] Error getting metrics:', error);
      return {
        totalActions: 0,
        autoApproved: 0,
        humanApproved: 0,
        rejected: 0,
        avgConfidenceScore: 0,
        highRiskActions: 0,
        levelBreakdown: { hand_held: 0, graduated: 0, full_automation: 0 },
      };
    }
  }

  // ============================================================================
  // LEARNING FEEDBACK LOOP
  // Feeds automation outcomes back to Trinity Memory Service for pattern learning
  // ============================================================================

  async recordOutcomeForLearning(params: {
    context: ActionContext;
    decision: ExecutionDecision;
    outcome: 'success' | 'failure' | 'partial';
    errorMessage?: string;
    lessonsLearned?: string;
  }): Promise<void> {
    try {
      // Calculate confidence adjustment based on outcome
      let confidenceAdjustment = 0;
      if (params.outcome === 'success') {
        // Boost confidence for successful actions
        confidenceAdjustment = Math.min(10, (100 - params.decision.confidenceScore) / 10);
      } else if (params.outcome === 'failure') {
        // Reduce confidence for failed actions (more severe reduction for high-confidence failures)
        confidenceAdjustment = -Math.max(5, params.decision.confidenceScore / 10);
      }

      // Generate lesson learned if not provided
      let lessonsLearned = params.lessonsLearned;
      if (!lessonsLearned && params.outcome === 'failure' && params.errorMessage) {
        lessonsLearned = `${params.context.actionName} failed: ${params.errorMessage}`;
      } else if (!lessonsLearned && params.outcome === 'success') {
        lessonsLearned = `${params.context.actionName} executed successfully with ${params.decision.confidenceScore}% confidence`;
      }

      // Feed to Trinity Memory Service
      if (params.context.userId) {
        await trinityMemoryService.recordInteractionOutcome({
          userId: params.context.userId,
          workspaceId: params.context.workspaceId,
          actionName: params.context.actionName,
          category: params.context.actionCategory,
          outcome: params.outcome,
          confidenceAdjustment,
          lessonsLearned,
        });
      }

      // Share insight for cross-bot learning if significant
      if (params.decision.isHighRisk || Math.abs(confidenceAdjustment) >= 5) {
        const insightType = params.outcome === 'success' ? 'resolution' : 'warning';
        await trinityMemoryService.shareInsight({
          sourceAgent: params.context.executorType === 'trinity' ? 'trinity' 
            : params.context.executorType === 'helpai' ? 'helpai'
            : params.context.executorType === 'subagent' ? 'subagent'
            : 'automation',
          insightType,
          workspaceScope: params.context.workspaceId || null,
          title: `${params.context.actionCategory}.${params.context.actionName} ${params.outcome}`,
          content: lessonsLearned || `Action ${params.outcome} with confidence ${params.decision.confidenceScore}%`,
          confidence: params.decision.confidenceScore / 100,
          applicableScenarios: [
            params.context.actionCategory,
            params.context.actionName,
            ...(params.decision.isHighRisk ? ['high_risk'] : []),
          ],
        });
      }

      console.log(`[AutomationGovernance] Learning recorded: ${params.context.actionName} - ${params.outcome} (conf adjustment: ${confidenceAdjustment})`);
    } catch (error) {
      console.error('[AutomationGovernance] Error recording outcome for learning:', error);
    }
  }

  // Get historical success rate for a specific action type
  async getHistoricalSuccessRate(
    workspaceId: string,
    actionCategory: string,
    actionName: string
  ): Promise<number> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const entries = await db
        .select()
        .from(automationActionLedger)
        .where(
          and(
            eq(automationActionLedger.workspaceId, workspaceId),
            eq(automationActionLedger.actionCategory, actionCategory),
            eq(automationActionLedger.actionName, actionName),
            gte(automationActionLedger.createdAt, sevenDaysAgo)
          )
        )
        .limit(100);

      if (entries.length === 0) return 50; // Default neutral success rate

      const successCount = entries.filter(e => 
        e.approvalState === 'executed' || e.approvalState === 'approved'
      ).length;

      return Math.round((successCount / entries.length) * 100);
    } catch (error) {
      console.error('[AutomationGovernance] Error getting historical success rate:', error);
      return 50;
    }
  }

  // Refresh tool catalog with latest metrics
  async refreshToolCatalogMetrics(): Promise<void> {
    try {
      await trinityMemoryService.refreshToolCatalog();
      console.log('[AutomationGovernance] Tool catalog metrics refreshed');
    } catch (error) {
      console.error('[AutomationGovernance] Error refreshing tool catalog:', error);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const automationGovernanceService = AutomationGovernanceService.getInstance();
export { AutomationGovernanceService };
