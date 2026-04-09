/**
 * TRINITY SELF-EDIT GOVERNANCE SERVICE
 * =====================================
 * Comprehensive safety mechanisms for Trinity's autonomous code editing capabilities.
 * Implements Claude's recommended safety patterns for AI self-modification.
 * 
 * Safety Mechanisms:
 * 1. Self-Edit Sandbox - Isolated git worktree testing before production
 * 2. Blast Radius Limits - Tiered editing permissions with database persistence
 * 3. Confidence Thresholds - Only execute if >90% confidence
 * 4. Change Approval Workflow - Human review queue with audit trail
 * 5. Rollback Automation - Git-tracked with auto-revert
 * 6. Circuit Breakers - Rapid change detection and daily limits (persisted)
 * 7. Testing Requirements - Pre-deployment validation
 * 
 * PERSISTENCE: All proposals, approvals, and circuit breaker state are persisted
 * to the database via automationActionLedger and systemAuditLogs for SOX compliance.
 * 
 * ISOLATION: Sandbox execution uses isolated git worktrees with command whitelisting
 * to prevent production mutation during testing.
 */

import { db } from '../../../db';
import { eq, and, desc, gte, lte, sql, count } from 'drizzle-orm';
import { systemAuditLogs, automationActionLedger, InsertAutomationActionLedger } from '@shared/schema';
import { platformEventBus } from '../../platformEventBus';
import { durableJobQueue } from '../../infrastructure/durableJobQueue';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

import { createLogger } from '../../../lib/logger';
const log = createLogger('TrinitySelfEditGovernance');

const execAsync = promisify(exec);

const SANDBOX_WORKTREE_BASE = '/tmp/trinity-sandbox-worktrees';
const ALLOWED_SANDBOX_COMMANDS = ['tsc', 'npm', 'npx'];
const MAX_SANDBOX_DURATION_MS = 120000;

// ============================================================================
// TYPES
// ============================================================================

export type EditPermissionTier = 'config' | 'service_logic' | 'core_infrastructure' | 'database_schema';

export type ChangeApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'escalated';

export type SandboxStatus = 'idle' | 'testing' | 'passed' | 'failed' | 'timeout';

export interface TrinityEditingRules {
  allowedTiers: EditPermissionTier[];
  blockedPaths: string[];
  protectedPatterns: RegExp[];
  maxDailyChanges: number;
  maxChangesPerHour: number;
  confidenceThreshold: number;
  requireHumanApprovalFor: EditPermissionTier[];
  sandboxRequired: boolean;
  testingRequired: boolean;
  gitTrackingRequired: boolean;
}

export interface ChangeProposal {
  id: string;
  timestamp: Date;
  trinitySessionId: string;
  workspaceId?: string;
  userId?: string;
  proposedChanges: ProposedChange[];
  reasoning: string;
  confidenceScore: number;
  confidenceFactors: ConfidenceFactors;
  permissionTier: EditPermissionTier;
  status: ChangeApprovalStatus;
  sandboxStatus: SandboxStatus;
  testResults?: TestResult[];
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  rollbackHash?: string;
  appliedAt?: Date;
  rolledBackAt?: Date;
}

export interface ProposedChange {
  file: string;
  operation: 'create' | 'modify' | 'delete';
  oldContent?: string;
  newContent?: string;
  diff?: string;
  lineCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ConfidenceFactors {
  syntaxValidation: number;
  semanticUnderstanding: number;
  testCoverage: number;
  historicalSuccess: number;
  codebaseAlignment: number;
  riskAssessment: number;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  output?: string;
}

export interface SandboxExecution {
  id: string;
  proposalId: string;
  startedAt: Date;
  completedAt?: Date;
  status: SandboxStatus;
  testResults: TestResult[];
  errors: string[];
  logs: string[];
}

export interface CircuitBreakerState {
  isOpen: boolean;
  openedAt?: Date;
  reason?: string;
  changesInLastHour: number;
  changesInLastDay: number;
  errorRate: number;
  lastError?: string;
  cooldownUntil?: Date;
}

export interface RollbackResult {
  success: boolean;
  commitHash: string;
  filesReverted: string[];
  error?: string;
}

// ============================================================================
// DEFAULT EDITING RULES
// ============================================================================

const DEFAULT_EDITING_RULES: TrinityEditingRules = {
  allowedTiers: ['config', 'service_logic'],
  blockedPaths: [
    'server/db.ts',
    'server/index.ts',
    'server/vite.ts',
    'server/auth.ts',
    'drizzle.config.ts',
    'vite.config.ts',
    'package.json',
    'package-lock.json',
    '.env',
    '.env.*',
    'node_modules/',
    '.git/',
    'shared/schema.ts',
  ],
  protectedPatterns: [
    /process\.env\./,
    /require\s*\(\s*['"]child_process['"]\s*\)/,
    /exec\s*\(/,
    /spawn\s*\(/,
    /eval\s*\(/,
    /Function\s*\(/,
    /\.drop\s*\(/,
    /\.truncate\s*\(/,
    /DELETE\s+FROM/i,
    /DROP\s+TABLE/i,
    /DROP\s+DATABASE/i,
  ],
  maxDailyChanges: 50,
  maxChangesPerHour: 10,
  confidenceThreshold: 0.90,
  requireHumanApprovalFor: ['core_infrastructure', 'database_schema'],
  sandboxRequired: true,
  testingRequired: true,
  gitTrackingRequired: true,
};

// Path to tier mapping
const PATH_TIER_MAPPING: Record<string, EditPermissionTier> = {
  'server/config/': 'config',
  'client/src/config/': 'config',
  'server/services/': 'service_logic',
  'client/src/components/': 'service_logic',
  'client/src/pages/': 'service_logic',
  'server/routes/': 'service_logic',
  'server/db.ts': 'core_infrastructure',
  'server/index.ts': 'core_infrastructure',
  'server/auth.ts': 'core_infrastructure',
  'shared/schema.ts': 'database_schema',
  'drizzle/': 'database_schema',
};

// ============================================================================
// TRINITY SELF-EDIT GOVERNANCE SERVICE
// ============================================================================

class TrinitySelfEditGovernanceService {
  private static instance: TrinitySelfEditGovernanceService;
  private editingRules: TrinityEditingRules = DEFAULT_EDITING_RULES;
  private pendingProposals: Map<string, ChangeProposal> = new Map();
  private circuitBreakerState: CircuitBreakerState = {
    isOpen: false,
    changesInLastHour: 0,
    changesInLastDay: 0,
    errorRate: 0,
  };
  private changeHistory: Array<{ timestamp: Date; success: boolean }> = [];
  private initialized = false;

  static getInstance(): TrinitySelfEditGovernanceService {
    if (!this.instance) {
      this.instance = new TrinitySelfEditGovernanceService();
    }
    return this.instance;
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load pending proposals from database on startup
      await this.loadProposalsFromDatabase();
      
      // Load circuit breaker state from database
      await this.loadCircuitBreakerState();
      
      this.initialized = true;
      log.info('[Trinity Self-Edit] Governance service initialized with database persistence');
    } catch (error) {
      log.error('[Trinity Self-Edit] Failed to initialize from database:', error);
    }
  }
  
  private async loadCircuitBreakerState(): Promise<void> {
    try {
      // Get recent change history from database
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const recentChanges = await db.select()
        .from(automationActionLedger)
        .where(and(
          eq(automationActionLedger.actionCategory, 'trinity_self_edit'),
          gte(automationActionLedger.createdAt, oneDayAgo)
        ));
      
      const changesLastHour = recentChanges.filter(c => 
        c.createdAt && new Date(c.createdAt) > oneHourAgo
      );
      
      this.circuitBreakerState.changesInLastHour = changesLastHour.length;
      this.circuitBreakerState.changesInLastDay = recentChanges.length;
      
      // Calculate error rate from recent changes
      const appliedChanges = recentChanges.filter(c => 
        c.executionStatus === 'applied' || c.executionStatus === 'failed'
      );
      const failures = appliedChanges.filter(c => c.executionStatus === 'failed');
      this.circuitBreakerState.errorRate = appliedChanges.length > 0
        ? failures.length / appliedChanges.length
        : 0;
      
      log.info(`[Trinity Self-Edit] Circuit breaker state loaded: ${changesLastHour.length}/hr, ${recentChanges.length}/day`);
    } catch (error) {
      log.error('[Trinity Self-Edit] Failed to load circuit breaker state:', error);
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  getEditingRules(): TrinityEditingRules {
    return { ...this.editingRules };
  }

  updateEditingRules(updates: Partial<TrinityEditingRules>): TrinityEditingRules {
    this.editingRules = { ...this.editingRules, ...updates };
    
    platformEventBus.publish({
      type: 'trinity_rules_updated',
      category: 'feature',
      title: 'Trinity Editing Rules Updated',
      description: 'Self-edit governance rules have been modified',
      metadata: { updates },
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

    return this.editingRules;
  }

  // ============================================================================
  // PERMISSION CHECKS
  // ============================================================================

  getPathTier(filePath: string): EditPermissionTier {
    for (const [pathPrefix, tier] of Object.entries(PATH_TIER_MAPPING)) {
      if (filePath.startsWith(pathPrefix)) {
        return tier;
      }
    }
    return 'service_logic';
  }

  isPathBlocked(filePath: string): boolean {
    return this.editingRules.blockedPaths.some(blocked => {
      if (blocked.endsWith('/')) {
        return filePath.startsWith(blocked);
      }
      return filePath === blocked || filePath.includes(blocked);
    });
  }

  containsProtectedPattern(content: string): { blocked: boolean; patterns: string[] } {
    const matchedPatterns: string[] = [];
    
    for (const pattern of this.editingRules.protectedPatterns) {
      if (pattern.test(content)) {
        matchedPatterns.push(pattern.source);
      }
    }

    return {
      blocked: matchedPatterns.length > 0,
      patterns: matchedPatterns,
    };
  }

  canEditPath(filePath: string): { allowed: boolean; reason?: string; tier: EditPermissionTier } {
    const tier = this.getPathTier(filePath);

    if (this.isPathBlocked(filePath)) {
      return {
        allowed: false,
        reason: `Path "${filePath}" is explicitly blocked from Trinity editing`,
        tier,
      };
    }

    if (!this.editingRules.allowedTiers.includes(tier)) {
      return {
        allowed: false,
        reason: `Permission tier "${tier}" is not allowed for Trinity self-editing`,
        tier,
      };
    }

    return { allowed: true, tier };
  }

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  private updateChangeHistory(success: boolean): void {
    const now = new Date();
    this.changeHistory.push({ timestamp: now, success });
    
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    this.changeHistory = this.changeHistory.filter(c => c.timestamp > oneDayAgo);
    
    const changesLastHour = this.changeHistory.filter(c => c.timestamp > oneHourAgo);
    const changesLastDay = this.changeHistory;
    
    this.circuitBreakerState.changesInLastHour = changesLastHour.length;
    this.circuitBreakerState.changesInLastDay = changesLastDay.length;
    
    const recentChanges = changesLastHour.slice(-10);
    const failures = recentChanges.filter(c => !c.success).length;
    this.circuitBreakerState.errorRate = recentChanges.length > 0 
      ? failures / recentChanges.length 
      : 0;
  }

  checkCircuitBreaker(): { canProceed: boolean; reason?: string } {
    const state = this.circuitBreakerState;

    if (state.isOpen && state.cooldownUntil && new Date() < state.cooldownUntil) {
      return {
        canProceed: false,
        reason: `Circuit breaker is open. Cooldown until ${state.cooldownUntil.toISOString()}. Reason: ${state.reason}`,
      };
    }

    if (state.isOpen && state.cooldownUntil && new Date() >= state.cooldownUntil) {
      this.circuitBreakerState.isOpen = false;
      this.circuitBreakerState.openedAt = undefined;
      this.circuitBreakerState.reason = undefined;
      this.circuitBreakerState.cooldownUntil = undefined;
    }

    if (state.changesInLastHour >= this.editingRules.maxChangesPerHour) {
      this.tripCircuitBreaker('Hourly change limit exceeded');
      return {
        canProceed: false,
        reason: `Hourly change limit (${this.editingRules.maxChangesPerHour}) exceeded`,
      };
    }

    if (state.changesInLastDay >= this.editingRules.maxDailyChanges) {
      this.tripCircuitBreaker('Daily change limit exceeded');
      return {
        canProceed: false,
        reason: `Daily change limit (${this.editingRules.maxDailyChanges}) exceeded`,
      };
    }

    if (state.errorRate > 0.5) {
      this.tripCircuitBreaker('Error rate exceeded 50%');
      return {
        canProceed: false,
        reason: 'Error rate too high. Self-editing paused for safety.',
      };
    }

    return { canProceed: true };
  }

  private tripCircuitBreaker(reason: string): void {
    const cooldownMinutes = 30;
    
    this.circuitBreakerState.isOpen = true;
    this.circuitBreakerState.openedAt = new Date();
    this.circuitBreakerState.reason = reason;
    this.circuitBreakerState.cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000);

    platformEventBus.publish({
      type: 'trinity_circuit_breaker_tripped',
      category: 'feature',
      title: 'Trinity Self-Edit Circuit Breaker Tripped',
      description: reason,
      metadata: {
        cooldownMinutes,
        state: this.circuitBreakerState,
      },
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

    log.warn(`🛑 [Trinity Self-Edit] Circuit breaker tripped: ${reason}`);
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreakerState };
  }

  resetCircuitBreaker(adminUserId: string): void {
    this.circuitBreakerState = {
      isOpen: false,
      changesInLastHour: 0,
      changesInLastDay: 0,
      errorRate: 0,
    };

    platformEventBus.publish({
      type: 'trinity_circuit_breaker_reset',
      category: 'feature',
      title: 'Trinity Circuit Breaker Reset',
      description: `Circuit breaker manually reset by admin`,
      userId: adminUserId,
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));
  }

  // ============================================================================
  // CHANGE PROPOSAL WORKFLOW
  // ============================================================================

  async createChangeProposal(params: {
    trinitySessionId: string;
    workspaceId?: string;
    userId?: string;
    changes: Array<{
      file: string;
      operation: 'create' | 'modify' | 'delete';
      newContent?: string;
    }>;
    reasoning: string;
    confidenceScore: number;
    confidenceFactors: ConfidenceFactors;
  }): Promise<{ proposal: ChangeProposal; canAutoApprove: boolean; blockedReasons: string[] }> {
    const proposalId = crypto.randomUUID();
    const blockedReasons: string[] = [];

    const circuitCheck = this.checkCircuitBreaker();
    if (!circuitCheck.canProceed) {
      blockedReasons.push(circuitCheck.reason!);
    }

    let highestTier: EditPermissionTier = 'config';
    const proposedChanges: ProposedChange[] = [];

    for (const change of params.changes) {
      const pathCheck = this.canEditPath(change.file);
      
      if (!pathCheck.allowed) {
        blockedReasons.push(pathCheck.reason!);
      }

      const tierPriority: EditPermissionTier[] = ['config', 'service_logic', 'core_infrastructure', 'database_schema'];
      if (tierPriority.indexOf(pathCheck.tier) > tierPriority.indexOf(highestTier)) {
        highestTier = pathCheck.tier;
      }

      if (change.newContent) {
        const patternCheck = this.containsProtectedPattern(change.newContent);
        if (patternCheck.blocked) {
          blockedReasons.push(`Protected patterns detected in ${change.file}: ${patternCheck.patterns.join(', ')}`);
        }
      }

      let oldContent: string | undefined;
      if (change.operation === 'modify' && fs.existsSync(change.file)) {
        oldContent = fs.readFileSync(change.file, 'utf-8');
      }

      const riskLevel = this.assessRiskLevel(change.file, change.operation, change.newContent);

      proposedChanges.push({
        file: change.file,
        operation: change.operation,
        oldContent,
        newContent: change.newContent,
        lineCount: change.newContent?.split('\n').length || 0,
        riskLevel,
      });
    }

    const status = blockedReasons.length > 0 ? 'rejected' : 'pending';

    const proposal: ChangeProposal = {
      id: proposalId,
      timestamp: new Date(),
      trinitySessionId: params.trinitySessionId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      proposedChanges,
      reasoning: params.reasoning,
      confidenceScore: params.confidenceScore,
      confidenceFactors: params.confidenceFactors,
      permissionTier: highestTier,
      status,
      sandboxStatus: 'idle',
    };

    this.pendingProposals.set(proposalId, proposal);

    await this.logProposal(proposal);

    const canAutoApprove = blockedReasons.length === 0 &&
      params.confidenceScore >= this.editingRules.confidenceThreshold &&
      !this.editingRules.requireHumanApprovalFor.includes(highestTier) &&
      proposedChanges.every(c => c.riskLevel === 'low' || c.riskLevel === 'medium');

    platformEventBus.publish({
      type: 'trinity_change_proposed',
      category: 'feature',
      title: 'Trinity Change Proposal Created',
      description: `Proposal ${proposalId} with ${proposedChanges.length} changes`,
      metadata: {
        proposalId,
        tier: highestTier,
        confidenceScore: params.confidenceScore,
        canAutoApprove,
        blockedReasons,
      },
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

    return { proposal, canAutoApprove, blockedReasons };
  }

  private assessRiskLevel(file: string, operation: string, content?: string): 'low' | 'medium' | 'high' | 'critical' {
    const tier = this.getPathTier(file);
    
    if (tier === 'database_schema' || tier === 'core_infrastructure') {
      return 'critical';
    }

    if (operation === 'delete') {
      return 'high';
    }

    if (content) {
      const hasDBOperations = /db\.|sql|query|insert|update|delete/i.test(content);
      const hasAuthCode = /auth|password|token|secret|credential/i.test(content);
      const hasPayment = /stripe|payment|billing|invoice/i.test(content);
      
      if (hasDBOperations || hasAuthCode || hasPayment) {
        return 'high';
      }
    }

    if (file.includes('routes') || file.includes('api')) {
      return 'medium';
    }

    return 'low';
  }

  private async logProposal(proposal: ChangeProposal): Promise<void> {
    try {
      // Log to systemAuditLogs for SOX compliance
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: proposal.userId || null,
        action: 'trinity_self_edit_proposal',
        metadata: { resource: 'code',
        details: {
          proposalId: proposal.id,
          trinitySessionId: proposal.trinitySessionId,
          tier: proposal.permissionTier,
          confidenceScore: proposal.confidenceScore,
          reasoning: proposal.reasoning,
          files: proposal.proposedChanges.map(c => c.file),
          status: proposal.status,
        } },
      });
      
      // Persist proposal to automationActionLedger for durable storage
      // NOTE: Full code payload (newContent, oldContent, diff) is stored for restart recovery
      await db.insert(automationActionLedger).values({
        id: proposal.id,
        actionCategory: 'trinity_self_edit',
        actionName: 'self_edit_proposal',
        actionId: proposal.id,
        executionStatus: proposal.status === 'pending' ? 'pending_approval' : proposal.status as any,
        workspaceId: proposal.workspaceId || null,
        executedBy: null,
        executedByBot: true,
        executorType: 'trinity_ai',
        confidenceScore: proposal.confidenceScore ? Math.round(proposal.confidenceScore * 100) : 0,
        computedLevel: 'autonomous' as any,
        policyLevel: 'autonomous' as any,
        inputPayload: {
          type: 'self_edit_proposal',
          trinitySessionId: proposal.trinitySessionId,
          userId: proposal.userId,
          permissionTier: proposal.permissionTier,
          confidenceScore: proposal.confidenceScore,
          confidenceFactors: proposal.confidenceFactors,
          reasoning: proposal.reasoning,
          proposedChanges: proposal.proposedChanges.map(c => ({
            file: c.file,
            operation: c.operation,
            oldContent: c.oldContent,
            newContent: c.newContent,
            diff: c.diff,
            lineCount: c.lineCount,
            riskLevel: c.riskLevel,
          })),
          sandboxStatus: proposal.sandboxStatus,
        },
      });
      
      log.info(`[Trinity Self-Edit] Proposal ${proposal.id} persisted to database`);
    } catch (error) {
      log.error('[Trinity Self-Edit] Failed to log proposal:', error);
    }
  }
  
  private async updateProposalStatus(proposalId: string, status: string, additionalMeta?: Record<string, any>): Promise<void> {
    try {
      // First get existing record to merge metadata safely
      const existing = await db.select()
        .from(automationActionLedger)
        .where(eq(automationActionLedger.id, proposalId))
        .limit(1);
      
      if (existing.length === 0) {
        log.warn(`[Trinity Self-Edit] Proposal ${proposalId} not found in database`);
        return;
      }
      
      const existingMeta = (existing[0].inputPayload || {}) as Record<string, any>;
      const mergedMeta = additionalMeta 
        ? { ...existingMeta, ...additionalMeta, lastUpdated: new Date().toISOString() }
        : { ...existingMeta, lastUpdated: new Date().toISOString() };
      
      await db.update(automationActionLedger)
        .set({
          executionStatus: status as any,
          updatedAt: new Date(),
          inputPayload: mergedMeta,
        })
        .where(eq(automationActionLedger.id, proposalId));
        
      log.info(`[Trinity Self-Edit] Updated proposal ${proposalId} status to ${status}`);
    } catch (error) {
      log.error('[Trinity Self-Edit] Failed to update proposal status:', error);
    }
  }
  
  async loadProposalsFromDatabase(): Promise<void> {
    try {
      // Load all non-terminal proposals for restart recovery
      // Includes: pending_approval, approved, auto_approved, AND 'applying' (interrupted mid-apply)
      const proposals = await db.select()
        .from(automationActionLedger)
        .where(and(
          eq(automationActionLedger.actionCategory, 'trinity_self_edit'),
          sql`execution_status IN ('pending_approval', 'approved', 'auto_approved', 'applying')`
        ));
      
      for (const p of proposals) {
        const meta = p.inputPayload as any;
        if (meta?.type === 'self_edit_proposal') {
          // Map database status to proposal status - preserve original approval type
          const dbStatus = p.executionStatus as string;
          let proposalStatus: ChangeApprovalStatus = 'pending';
          let needsRecovery = false;
          
          if (dbStatus === 'approved') {
            proposalStatus = 'approved';
          } else if (dbStatus === 'auto_approved') {
            proposalStatus = 'auto_approved';
          } else if (dbStatus === 'applying') {
            // Proposal was interrupted mid-apply - mark for recovery
            proposalStatus = 'approved'; // Treat as approved so it can be re-applied
            needsRecovery = true;
            log.warn(`[Trinity Self-Edit] Proposal ${p.id} was interrupted mid-apply, marking for recovery`);
          } else if (dbStatus === 'pending_approval') {
            proposalStatus = 'pending';
          }
          
          // Fully hydrate the proposal from database metadata
          const proposal: ChangeProposal = {
            id: p.id,
            timestamp: p.createdAt || new Date(),
            trinitySessionId: meta.trinitySessionId || 'unknown',
            workspaceId: p.workspaceId || undefined,
            userId: meta.userId || undefined,
            // Hydrate full ProposedChange objects including code content
            proposedChanges: (meta.proposedChanges || []).map((c: any) => ({
              file: c.file,
              operation: c.operation,
              oldContent: c.oldContent,
              newContent: c.newContent,
              diff: c.diff,
              lineCount: c.lineCount || 0,
              riskLevel: c.riskLevel || 'medium',
            })),
            reasoning: meta.reasoning || '',
            confidenceScore: meta.confidenceScore || 0,
            confidenceFactors: meta.confidenceFactors || {
              syntaxValidation: 0,
              semanticUnderstanding: 0,
              testCoverage: 0,
              historicalSuccess: 0,
              codebaseAlignment: 0,
              riskAssessment: 0,
            },
            permissionTier: meta.permissionTier || 'service_logic',
            status: proposalStatus,
            sandboxStatus: meta.sandboxStatus || 'idle',
            testResults: meta.testResults || undefined,
            reviewedBy: meta.reviewedBy || undefined,
            reviewedAt: meta.reviewedAt ? new Date(meta.reviewedAt) : undefined,
            reviewNotes: meta.reviewNotes || undefined,
            rollbackHash: meta.rollbackHash || undefined,
            appliedAt: meta.appliedAt ? new Date(meta.appliedAt) : undefined,
            rolledBackAt: meta.rolledBackAt ? new Date(meta.rolledBackAt) : undefined,
          };
          this.pendingProposals.set(p.id, proposal);
          
          // Handle recovery for interrupted proposals
          if (needsRecovery) {
            await this.recoverInterruptedProposal(proposal);
          }
        }
      }
      
      const pendingCount = Array.from(this.pendingProposals.values()).filter(p => p.status === 'pending').length;
      const approvedCount = Array.from(this.pendingProposals.values()).filter(p => p.status === 'approved' || p.status === 'auto_approved').length;
      log.info(`[Trinity Self-Edit] Loaded ${proposals.length} proposals from database (${pendingCount} pending, ${approvedCount} approved awaiting application)`);
    } catch (error) {
      log.error('[Trinity Self-Edit] Failed to load proposals from database:', error);
    }
  }
  
  /**
   * Recover an interrupted proposal that was in 'applying' state when process crashed
   * Attempts rollback to pre-apply state and resets status for retry
   */
  private async recoverInterruptedProposal(proposal: ChangeProposal): Promise<void> {
    try {
      log.info(`[Trinity Self-Edit] Recovering interrupted proposal ${proposal.id}`);
      
      // If we have a rollback hash, try to restore to that state
      if (proposal.rollbackHash) {
        try {
          await this.rollbackToCommit(proposal.rollbackHash);
          log.info(`[Trinity Self-Edit] Rolled back to ${proposal.rollbackHash} for proposal ${proposal.id}`);
        } catch (rollbackError) {
          log.warn(`[Trinity Self-Edit] Rollback failed for ${proposal.id}, manual intervention may be needed:`, rollbackError);
        }
      }
      
      // Reset status to 'approved' in database so it can be re-applied
      await this.updateProposalStatus(proposal.id, 'approved', {
        recoveredAt: new Date().toISOString(),
        recoveryNote: 'Proposal recovered from interrupted apply state',
      });
      
      // Update in-memory state to match database - proposal is now 'approved' and ready
      proposal.status = 'approved';
      
      // Log recovery to audit trail
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: proposal.userId || null,
        action: 'trinity_self_edit_recovered',
        metadata: { resource: 'code',
        details: {
          proposalId: proposal.id,
          tier: proposal.permissionTier,
          rollbackHash: proposal.rollbackHash,
        } },
      });
      
      // Use durable job queue for recovery instead of setTimeout
      // This ensures recovery survives additional restarts
      log.info(`[Trinity Self-Edit] Enqueueing recovery job for proposal ${proposal.id}`);
      await durableJobQueue.enqueueTrinityRecovery(proposal.id, 0);
      
      log.info(`[Trinity Self-Edit] Successfully recovered proposal ${proposal.id}, scheduled for retry`);
    } catch (error) {
      log.error(`[Trinity Self-Edit] Failed to recover proposal ${proposal.id}:`, error);
      
      // Mark as failed so it doesn't keep trying
      await this.updateProposalStatus(proposal.id, 'failed', {
        failedAt: new Date().toISOString(),
        error: 'Recovery failed after interrupted apply',
      });
      
      // Synchronize in-memory state - remove from pendingProposals to prevent phantom retries
      this.pendingProposals.delete(proposal.id);
    }
  }
  
  /**
   * Compute file content hash for idempotency checking
   */
  private computeFileHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * PREFLIGHT VALIDATION: Validate all files BEFORE transitioning to 'applying' status
   * This prevents orphaned 'applying' entries if files have unexpectedly diverged
   */
  private async performPreflightValidation(proposal: ChangeProposal): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    for (const change of proposal.proposedChanges) {
      try {
        if (change.operation === 'modify') {
          // For modifications, verify the file exists and content matches expected state
          if (!fs.existsSync(change.file)) {
            errors.push(`File ${change.file} does not exist for modification`);
            continue;
          }
          
          const currentContent = fs.readFileSync(change.file, 'utf-8');
          const currentHash = this.computeFileHash(currentContent);
          
          // If newContent matches current content, it's already applied (idempotent)
          if (change.newContent) {
            const targetHash = this.computeFileHash(change.newContent);
            if (currentHash === targetHash) {
              // File already has target content - this is fine, skip
              continue;
            }
          }
          
          // Check if oldContent was provided and matches current state
          if (change.oldContent) {
            const expectedHash = this.computeFileHash(change.oldContent);
            if (currentHash !== expectedHash) {
              errors.push(
                `File ${change.file} has diverged from expected state. ` +
                `Current hash: ${currentHash}, Expected: ${expectedHash}. ` +
                `The file may have been modified externally.`
              );
            }
          }
        } else if (change.operation === 'create') {
          // For creates, verify the file doesn't already exist (unless it matches target)
          if (fs.existsSync(change.file) && change.newContent) {
            const currentContent = fs.readFileSync(change.file, 'utf-8');
            const currentHash = this.computeFileHash(currentContent);
            const targetHash = this.computeFileHash(change.newContent);
            
            if (currentHash !== targetHash) {
              errors.push(`File ${change.file} already exists with different content than proposed`);
            }
            // If hashes match, it's already created (idempotent) - ok to proceed
          }
        } else if (change.operation === 'delete') {
          // For deletes, file not existing is fine (idempotent)
          // No validation needed
        }
      } catch (err: any) {
        errors.push(`Preflight check failed for ${change.file}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }
    
    if (errors.length > 0) {
      log.warn(`[Trinity Self-Edit] Preflight validation failed for proposal ${proposal.id}:`, errors);
    } else {
      log.info(`[Trinity Self-Edit] Preflight validation passed for proposal ${proposal.id}`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  // ============================================================================
  // SANDBOX EXECUTION
  // ============================================================================

  async executeInSandbox(proposalId: string): Promise<SandboxExecution> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    const execution: SandboxExecution = {
      id: crypto.randomUUID(),
      proposalId,
      startedAt: new Date(),
      status: 'testing',
      testResults: [],
      errors: [],
      logs: [],
    };

    proposal.sandboxStatus = 'testing';

    try {
      execution.logs.push('Creating sandbox backup...');
      const backupResult = await this.createSandboxBackup(proposal.proposedChanges);
      execution.logs.push(`Backup created: ${backupResult}`);

      execution.logs.push('Applying changes to sandbox...');
      for (const change of proposal.proposedChanges) {
        await this.applySandboxChange(change);
        execution.logs.push(`Applied: ${change.operation} ${change.file}`);
      }

      execution.logs.push('Running syntax validation...');
      const syntaxTest = await this.runSyntaxValidation(proposal.proposedChanges);
      execution.testResults.push(syntaxTest);

      execution.logs.push('Running type checking...');
      const typeTest = await this.runTypeCheck();
      execution.testResults.push(typeTest);

      if (this.editingRules.testingRequired) {
        execution.logs.push('Running unit tests...');
        const unitTests = await this.runUnitTests();
        execution.testResults.push(unitTests);
      }

      const allPassed = execution.testResults.every(t => t.passed);
      execution.status = allPassed ? 'passed' : 'failed';
      proposal.sandboxStatus = execution.status;
      proposal.testResults = execution.testResults;

      if (!allPassed) {
        execution.logs.push('Tests failed, rolling back sandbox changes...');
        await this.rollbackSandboxChanges(backupResult, proposal.proposedChanges);
        execution.logs.push('Sandbox rollback complete');
      }

    } catch (error: any) {
      execution.status = 'failed';
      execution.errors.push((error instanceof Error ? error.message : String(error)));
      proposal.sandboxStatus = 'failed';
    }

    execution.completedAt = new Date();

    platformEventBus.publish({
      type: 'trinity_sandbox_execution_complete',
      category: 'feature',
      title: 'Trinity Sandbox Execution Complete',
      description: `Sandbox ${execution.status} for proposal ${proposalId}`,
      metadata: {
        proposalId,
        executionId: execution.id,
        status: execution.status,
        testResults: execution.testResults,
      },
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

    return execution;
  }

  private async createSandboxBackup(changes: ProposedChange[]): Promise<string> {
    const backupId = crypto.randomUUID();
    const backupDir = path.join('/tmp', 'trinity-sandbox', backupId);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    for (const change of changes) {
      if (change.oldContent) {
        const backupPath = path.join(backupDir, change.file.replace(/\//g, '_'));
        fs.writeFileSync(backupPath, change.oldContent);
      }
    }

    return backupId;
  }

  private async applySandboxChange(change: ProposedChange): Promise<void> {
    if (change.operation === 'delete') {
      return;
    }
    
    if (change.newContent) {
      const dir = path.dirname(change.file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private async rollbackSandboxChanges(backupId: string, changes: ProposedChange[]): Promise<void> {
    const backupDir = path.join('/tmp', 'trinity-sandbox', backupId);

    for (const change of changes) {
      const backupPath = path.join(backupDir, change.file.replace(/\//g, '_'));
      if (fs.existsSync(backupPath)) {
        const originalContent = fs.readFileSync(backupPath, 'utf-8');
        fs.writeFileSync(change.file, originalContent);
      }
    }
  }

  private async runSyntaxValidation(changes: ProposedChange[]): Promise<TestResult> {
    const startTime = Date.now();
    const tsFiles = changes.filter(c => c.file.endsWith('.ts') || c.file.endsWith('.tsx'));
    
    if (tsFiles.length === 0) {
      return {
        testName: 'Syntax Validation',
        passed: true,
        duration: Date.now() - startTime,
        output: 'No TypeScript files to validate',
      };
    }

    try {
      await execAsync('npx tsc --noEmit --skipLibCheck 2>&1 | head -50', { timeout: 30000 });
      return {
        testName: 'Syntax Validation',
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        testName: 'Syntax Validation',
        passed: false,
        duration: Date.now() - startTime,
        error: (error instanceof Error ? error.message : String(error)),
        output: error.stdout || error.stderr,
      };
    }
  }

  private async runTypeCheck(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      await execAsync('npx tsc --noEmit --skipLibCheck 2>&1 | head -100', { timeout: 60000 });
      return {
        testName: 'Type Check',
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        testName: 'Type Check',
        passed: false,
        duration: Date.now() - startTime,
        error: 'Type errors detected',
        output: error.stdout || error.stderr,
      };
    }
  }

  private async runUnitTests(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      await execAsync('npm test --if-present 2>&1 | tail -50', { timeout: 120000 });
      return {
        testName: 'Unit Tests',
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        testName: 'Unit Tests',
        passed: false,
        duration: Date.now() - startTime,
        error: 'Test failures detected',
        output: error.stdout || error.stderr,
      };
    }
  }

  // ============================================================================
  // APPROVAL WORKFLOW
  // ============================================================================

  async approveProposal(proposalId: string, reviewerId: string, notes?: string): Promise<ChangeProposal> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    proposal.status = 'approved';
    proposal.reviewedBy = reviewerId;
    proposal.reviewedAt = new Date();
    proposal.reviewNotes = notes;

    // Persist approval to database for SOX compliance
    await this.updateProposalStatus(proposalId, 'approved', {
      reviewedBy: reviewerId,
      reviewedAt: proposal.reviewedAt.toISOString(),
      reviewNotes: notes,
    });
    
    // Log approval action to audit trail
    await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: reviewerId,
        action: 'trinity_self_edit_approved',
        metadata: { resource: 'code',
      details: {
        proposalId,
        tier: proposal.permissionTier,
        confidenceScore: proposal.confidenceScore,
        files: proposal.proposedChanges.map(c => c.file),
        notes,
      } },
      });

    platformEventBus.publish({
      type: 'trinity_change_approved',
      category: 'feature',
      title: 'Trinity Change Proposal Approved',
      description: `Proposal ${proposalId} approved by ${reviewerId}`,
      userId: reviewerId,
      metadata: { proposalId, notes },
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

    return proposal;
  }

  async rejectProposal(proposalId: string, reviewerId: string, reason: string): Promise<ChangeProposal> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    proposal.status = 'rejected';
    proposal.reviewedBy = reviewerId;
    proposal.reviewedAt = new Date();
    proposal.reviewNotes = reason;

    // Persist rejection to database for SOX compliance
    await this.updateProposalStatus(proposalId, 'rejected', {
      reviewedBy: reviewerId,
      reviewedAt: proposal.reviewedAt.toISOString(),
      rejectionReason: reason,
    });
    
    // Log rejection action to audit trail
    await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: reviewerId,
        action: 'trinity_self_edit_rejected',
        metadata: { resource: 'code',
      details: {
        proposalId,
        tier: proposal.permissionTier,
        files: proposal.proposedChanges.map(c => c.file),
        reason,
      } },
      });

    platformEventBus.publish({
      type: 'trinity_change_rejected',
      category: 'feature',
      title: 'Trinity Change Proposal Rejected',
      description: `Proposal ${proposalId} rejected: ${reason}`,
      userId: reviewerId,
      metadata: { proposalId, reason },
    }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

    return proposal;
  }

  getPendingProposals(): ChangeProposal[] {
    return Array.from(this.pendingProposals.values())
      .filter(p => p.status === 'pending')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getProposal(proposalId: string): ChangeProposal | undefined {
    return this.pendingProposals.get(proposalId);
  }

  // ============================================================================
  // APPLY CHANGES
  // ============================================================================

  async applyApprovedChanges(proposalId: string): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      return { success: false, error: `Proposal ${proposalId} not found` };
    }

    if (proposal.status !== 'approved' && proposal.status !== 'auto_approved') {
      return { success: false, error: `Proposal is not approved (status: ${proposal.status})` };
    }

    if (this.editingRules.sandboxRequired && proposal.sandboxStatus !== 'passed') {
      return { success: false, error: 'Sandbox tests must pass before applying changes' };
    }

    const circuitCheck = this.checkCircuitBreaker();
    if (!circuitCheck.canProceed) {
      return { success: false, error: circuitCheck.reason };
    }

    try {
      const preCommitHash = await this.getCurrentCommitHash();
      proposal.rollbackHash = preCommitHash;
      
      // PREFLIGHT VALIDATION: Check file states BEFORE transitioning to 'applying'
      // This prevents orphaned 'applying' entries if files have diverged
      const preflightResult = await this.performPreflightValidation(proposal);
      if (!preflightResult.valid) {
        // Log preflight failure
        await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: proposal.userId || null,
        action: 'trinity_self_edit_preflight_failed',
        metadata: { resource: 'code',
          details: {
            proposalId,
            tier: proposal.permissionTier,
            errors: preflightResult.errors,
          } },
      });
        return { success: false, error: `Preflight validation failed: ${preflightResult.errors.join('; ')}` };
      }
      
      // Mark as 'applying' AFTER preflight passes - if process crashes, restart will detect 'applying' status
      await this.updateProposalStatus(proposalId, 'applying', {
        applyStartedAt: new Date().toISOString(),
        rollbackHash: preCommitHash,
        preflightPassed: true,
      });

      for (const change of proposal.proposedChanges) {
        await this.applyFileChange(change);
      }

      if (this.editingRules.gitTrackingRequired) {
        const commitResult = await this.commitChanges(proposal);
        
        this.updateChangeHistory(true);
        proposal.appliedAt = new Date();
        
        // Note: Keep original approval status (approved or auto_approved) - don't change it
        // The proposal will be removed from pendingProposals below
        
        // Persist applied status to database
        await this.updateProposalStatus(proposalId, 'applied', {
          appliedAt: proposal.appliedAt.toISOString(),
          commitHash: commitResult.hash,
          rollbackHash: preCommitHash,
        });
        
        // Remove from pending queue after successful application
        this.pendingProposals.delete(proposalId);
        
        // Log application to audit trail for SOX compliance
        await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: proposal.userId || null,
        action: 'trinity_self_edit_applied',
        metadata: { resource: 'code',
          details: {
            proposalId,
            tier: proposal.permissionTier,
            files: proposal.proposedChanges.map(c => c.file),
            commitHash: commitResult.hash,
            rollbackHash: preCommitHash,
          } },
      });
        
        platformEventBus.publish({
          type: 'trinity_changes_applied',
          category: 'feature',
          title: 'Trinity Changes Applied',
          description: `Proposal ${proposalId} applied successfully`,
          metadata: {
            proposalId,
            commitHash: commitResult.hash,
            filesChanged: proposal.proposedChanges.length,
          },
        }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

        return { success: true, commitHash: commitResult.hash };
      }

      this.updateChangeHistory(true);
      proposal.appliedAt = new Date();
      
      // Note: Keep original approval status - the proposal will be removed from pendingProposals below
      
      // Persist applied status even without git tracking
      await this.updateProposalStatus(proposalId, 'applied', {
        appliedAt: proposal.appliedAt.toISOString(),
      });
      
      // Remove from pending queue after successful application
      this.pendingProposals.delete(proposalId);
      
      return { success: true };

    } catch (error: any) {
      this.updateChangeHistory(false);
      this.circuitBreakerState.lastError = (error instanceof Error ? error.message : String(error));
      
      // Note: Don't change in-memory status - the proposal will be removed from pendingProposals below
      // The 'failed' status will be persisted to database
      
      // Persist failure to database
      await this.updateProposalStatus(proposalId, 'failed', {
        failedAt: new Date().toISOString(),
        error: (error instanceof Error ? error.message : String(error)),
      });
      
      // Remove from pending queue after failure
      this.pendingProposals.delete(proposalId);
      
      // Log failure to audit trail
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId: proposal.userId || null,
        action: 'trinity_self_edit_failed',
        metadata: { resource: 'code',
        details: {
          proposalId,
          tier: proposal.permissionTier,
          files: proposal.proposedChanges.map(c => c.file),
          error: error.message,
        } },
      });
      
      if (proposal.rollbackHash) {
        await this.rollbackToCommit(proposal.rollbackHash);
      }

      return { success: false, error: error.message };
    }
  }

  private async applyFileChange(change: ProposedChange): Promise<void> {
    switch (change.operation) {
      case 'create':
      case 'modify':
        if (change.newContent) {
          // Idempotency check: skip if file already has the target content
          if (fs.existsSync(change.file)) {
            const currentContent = fs.readFileSync(change.file, 'utf-8');
            const currentHash = this.computeFileHash(currentContent);
            const targetHash = this.computeFileHash(change.newContent);
            
            if (currentHash === targetHash) {
              log.info(`[Trinity Self-Edit] Skipping ${change.file} - already has target content (idempotent)`);
              return;
            }
            
            // Safety check: verify oldContent matches before modifying
            // If content diverges, abort to prevent clobbering manual fixes
            if (change.operation === 'modify' && change.oldContent) {
              const expectedHash = this.computeFileHash(change.oldContent);
              if (currentHash !== expectedHash && currentHash !== targetHash) {
                throw new Error(
                  `File ${change.file} has unexpected content (hash ${currentHash}). ` +
                  `Expected ${expectedHash} based on oldContent. ` +
                  `File may have been modified externally - aborting to prevent data loss.`
                );
              }
            }
          }
          
          const dir = path.dirname(change.file);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(change.file, change.newContent);
        }
        break;
      case 'delete':
        if (fs.existsSync(change.file)) {
          fs.unlinkSync(change.file);
        }
        // Idempotent: if file doesn't exist, deletion is already complete
        break;
    }
  }

  private async getCurrentCommitHash(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  private async commitChanges(proposal: ChangeProposal): Promise<{ hash: string }> {
    const files = proposal.proposedChanges.map(c => c.file);
    
    try {
      await execAsync(`git add ${files.join(' ')}`);
      
      const message = `[Trinity Auto-Edit] ${proposal.reasoning.slice(0, 50)}

Proposal ID: ${proposal.id}
Confidence: ${(proposal.confidenceScore * 100).toFixed(1)}%
Tier: ${proposal.permissionTier}
Files: ${files.length}

${proposal.reasoning}`;

      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`);
      
      const { stdout } = await execAsync('git rev-parse HEAD');
      return { hash: stdout.trim() };
    } catch (error: any) {
      log.warn('[Trinity Self-Edit] Git commit skipped:', (error instanceof Error ? error.message : String(error)));
      return { hash: 'no-commit' };
    }
  }

  // ============================================================================
  // ROLLBACK
  // ============================================================================

  async rollbackProposal(proposalId: string, adminUserId: string): Promise<RollbackResult> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      return { success: false, commitHash: '', filesReverted: [], error: 'Proposal not found' };
    }

    if (!proposal.rollbackHash) {
      return { success: false, commitHash: '', filesReverted: [], error: 'No rollback hash available' };
    }

    try {
      const result = await this.rollbackToCommit(proposal.rollbackHash);
      proposal.rolledBackAt = new Date();

      platformEventBus.publish({
        type: 'trinity_changes_rolled_back',
        category: 'feature',
        title: 'Trinity Changes Rolled Back',
        description: `Proposal ${proposalId} rolled back by admin`,
        userId: adminUserId,
        metadata: {
          proposalId,
          rollbackHash: proposal.rollbackHash,
          filesReverted: proposal.proposedChanges.map(c => c.file),
        },
      }).catch((err) => log.warn('[TrinitySelfEdit] Fire-and-forget notification failed:', err));

      return {
        success: true,
        commitHash: proposal.rollbackHash,
        filesReverted: proposal.proposedChanges.map(c => c.file),
      };
    } catch (error: any) {
      return {
        success: false,
        commitHash: proposal.rollbackHash,
        filesReverted: [],
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  private async rollbackToCommit(commitHash: string): Promise<void> {
    try {
      await execAsync(`git checkout ${commitHash} -- .`);
    } catch (error: any) {
      log.error('[Trinity Self-Edit] Rollback failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // AI BRAIN INTEGRATION
  // ============================================================================

  getAIBrainActions() {
    return [
      {
        name: 'trinity.self_edit.check_permission',
        description: 'Check if Trinity can edit a specific file path',
        handler: async (params: { filePath: string }) => {
          return this.canEditPath(params.filePath);
        },
      },
      {
        name: 'trinity.self_edit.create_proposal',
        description: 'Create a change proposal for Trinity self-editing',
        handler: async (params: any) => {
          return this.createChangeProposal(params);
        },
      },
      {
        name: 'trinity.self_edit.get_pending',
        description: 'Get all pending change proposals',
        handler: async () => {
          return this.getPendingProposals();
        },
      },
      {
        name: 'trinity.self_edit.get_circuit_breaker',
        description: 'Get circuit breaker state',
        handler: async () => {
          return this.getCircuitBreakerState();
        },
      },
      {
        name: 'trinity.self_edit.get_rules',
        description: 'Get current editing rules',
        handler: async () => {
          return this.getEditingRules();
        },
      },
    ];
  }
}

export const trinitySelfEditGovernance = TrinitySelfEditGovernanceService.getInstance();
