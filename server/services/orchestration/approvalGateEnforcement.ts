/**
 * Approval Gate Enforcement Service
 * 
 * Enforces approval gates on high-risk operations before execution:
 * - Payroll runs
 * - Invoice generation
 * - Schedule publication
 * - Auto-fix deployments
 * - Credit adjustments
 * - Data exports
 * 
 * Integrates with AutomationGovernanceService for risk assessment
 * and blocks execution until proper approval is obtained.
 */

import { db } from '../../db';
import { approvalGates } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { trinityActionReasoner } from '../ai-brain/trinityActionReasoner';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { publishEvent } from './pipelineErrorHandler';
import { createLogger } from '../../lib/logger';
const log = createLogger('approvalGateEnforcement');


export type ApprovalCategory = 
  | 'payroll'
  | 'invoicing'
  | 'scheduling'
  | 'autofix'
  | 'credit_adjustment'
  | 'data_export'
  | 'integration_sync'
  | 'compliance_override';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';

export interface ApprovalGate {
  id: string;
  workspaceId: string;
  category: ApprovalCategory;
  actionId: string;
  actionName: string;
  requestedBy: string;
  requestedAt: Date;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  expiresAt: Date;
  riskScore: number;
  riskFactors: string[];
  payload: Record<string, any>;
  impactSummary: string;
  requiredApproverRole: string;
  escalationLevel: number;
  remindersSent: number;
  lastReminderAt?: Date;
}

export interface ApprovalPolicy {
  category: ApprovalCategory;
  riskThreshold: number;
  autoApproveBelow: number;
  requiredApproverRoles: string[];
  expirationHours: number;
  maxEscalationLevel: number;
  reminderIntervalHours: number;
}

const DEFAULT_POLICIES: ApprovalPolicy[] = [
  {
    category: 'payroll',
    riskThreshold: 30,
    autoApproveBelow: 20,
    requiredApproverRoles: ['org_owner', 'co_owner', 'manager'],
    expirationHours: 48,
    maxEscalationLevel: 3,
    reminderIntervalHours: 12,
  },
  {
    category: 'invoicing',
    riskThreshold: 40,
    autoApproveBelow: 25,
    requiredApproverRoles: ['org_owner', 'co_owner', 'manager'],
    expirationHours: 72,
    maxEscalationLevel: 2,
    reminderIntervalHours: 24,
  },
  {
    category: 'scheduling',
    riskThreshold: 50,
    autoApproveBelow: 40,
    requiredApproverRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    expirationHours: 24,
    maxEscalationLevel: 2,
    reminderIntervalHours: 8,
  },
  {
    category: 'autofix',
    riskThreshold: 20,
    autoApproveBelow: 10,
    requiredApproverRoles: ['org_owner', 'co_owner'],
    expirationHours: 24,
    maxEscalationLevel: 1,
    reminderIntervalHours: 4,
  },
  {
    category: 'credit_adjustment',
    riskThreshold: 25,
    autoApproveBelow: 15,
    requiredApproverRoles: ['org_owner', 'co_owner'],
    expirationHours: 48,
    maxEscalationLevel: 2,
    reminderIntervalHours: 12,
  },
  {
    category: 'data_export',
    riskThreshold: 35,
    autoApproveBelow: 20,
    requiredApproverRoles: ['org_owner', 'co_owner', 'manager'],
    expirationHours: 24,
    maxEscalationLevel: 2,
    reminderIntervalHours: 6,
  },
  {
    category: 'integration_sync',
    riskThreshold: 45,
    autoApproveBelow: 30,
    requiredApproverRoles: ['org_owner', 'co_owner'],
    expirationHours: 48,
    maxEscalationLevel: 2,
    reminderIntervalHours: 12,
  },
  {
    category: 'compliance_override',
    riskThreshold: 15,
    autoApproveBelow: 0,
    requiredApproverRoles: ['org_owner', 'co_owner'],
    expirationHours: 24,
    maxEscalationLevel: 3,
    reminderIntervalHours: 4,
  },
];

class ApprovalGateEnforcementService {
  private gates = new Map<string, ApprovalGate>();
  private policies = new Map<ApprovalCategory, ApprovalPolicy>();
  private expirationCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    DEFAULT_POLICIES.forEach(policy => {
      this.policies.set(policy.category, policy);
    });

    this.expirationCheckInterval = setInterval(() => this.checkExpirations(), 3600000);
  }

  /**
   * Compute a risk score (0–100) for an action based on category, payload values, and context.
   * This replaces the hardcoded default of 50 for all unspecified requests.
   */
  computeRiskScore(
    category: ApprovalCategory,
    payload: Record<string, any>,
    requestedBy?: string,
  ): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    // === CATEGORY BASE RISK ===
    const categoryBaseRisk: Record<ApprovalCategory, number> = {
      payroll: 35,
      invoicing: 30,
      scheduling: 20,
      autofix: 15,
      credit_adjustment: 40,
      data_export: 25,
      integration_sync: 20,
      compliance_override: 55,
    };
    score += categoryBaseRisk[category] ?? 25;

    // === FINANCIAL MAGNITUDE ===
    const amount = payload.amount || payload.totalAmount || payload.netPay || payload.subtotal || 0;
    if (amount > 0) {
      if (amount > 100000) { score += 30; factors.push(`high_value:$${Math.round(amount).toLocaleString()}`); }
      else if (amount > 25000) { score += 20; factors.push(`elevated_value:$${Math.round(amount).toLocaleString()}`); }
      else if (amount > 5000) { score += 10; factors.push(`moderate_value:$${Math.round(amount).toLocaleString()}`); }
    }

    // === EMPLOYEE/RECORD COUNT ===
    const recordCount = payload.employeeCount || payload.guardCount || payload.recordCount || payload.lineItems?.length || 0;
    if (recordCount > 100) { score += 15; factors.push(`bulk_operation:${recordCount}_records`); }
    else if (recordCount > 20) { score += 8; factors.push(`batch_operation:${recordCount}_records`); }

    // === OFF-HOURS PENALTY (unusual execution times raise risk) ===
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) {
      score += 12;
      factors.push('off_hours_execution');
    }

    // === RETROACTIVE / BACKDATED ACTIONS ===
    const targetDate = payload.periodStart || payload.shiftDate || payload.invoiceDate;
    if (targetDate) {
      const ageMs = Date.now() - new Date(targetDate).getTime();
      const ageDays = ageMs / 86400000;
      if (ageDays > 60) { score += 15; factors.push(`retroactive_90d`); }
      else if (ageDays > 30) { score += 8; factors.push('retroactive_30d'); }
    }

    // === BULK OVERRIDE / FORCE FLAGS ===
    if (payload.force === true || payload.override === true) {
      score += 20;
      factors.push('force_override_flag');
    }
    if (payload.skipValidation === true || payload.bypassCompliance === true) {
      score += 25;
      factors.push('compliance_bypass_requested');
    }

    // === DATA SENSITIVITY ===
    if (category === 'data_export') {
      const exportType = (payload.exportType || '').toLowerCase();
      if (['payroll', 'ssn', 'tax', 'w2', '1099', 'personal'].some(t => exportType.includes(t))) {
        score += 20;
        factors.push('sensitive_data_export');
      }
    }

    // === COMPLIANCE OVERRIDE DETAIL ===
    if (category === 'compliance_override') {
      factors.push('compliance_bypass_requested');
      score += 15;
    }

    // Cap at 100
    return { score: Math.min(100, score), factors };
  }

  /**
   * AI-augmented risk assessment using Trinity's reasoning pipeline.
   * Combines heuristic computeRiskScore (70%) with Trinity's qualitative
   * reasoning (30%, capped ±15 points) for a final blended risk score.
   * Graceful fallback: if AI reasoning fails, heuristic score is used as-is.
   */
  private async reasonAboutRisk(
    category: ApprovalCategory,
    payload: Record<string, any>,
    workspaceId: string,
    heuristicScore: number,
    heuristicFactors: string[]
  ): Promise<{ finalScore: number; finalFactors: string[]; aiImpactSummary: string }> {
    try {
      const domainMap: Record<ApprovalCategory, import('../ai-brain/trinityActionReasoner').ActionDomain> = {
        payroll: 'payroll_execute',
        invoicing: 'invoice_generate',
        scheduling: 'scheduling_fill',
        autofix: 'compliance_check',
        credit_adjustment: 'compliance_check',
        data_export: 'compliance_check',
        integration_sync: 'compliance_check',
        compliance_override: 'compliance_check',
      };

      const reasoning = await trinityActionReasoner.reason({
        domain: domainMap[category] || 'compliance_check',
        workspaceId,
        actionSummary: `Approval gate risk assessment for category "${category}"`,
        payload,
        riskSignals: heuristicFactors,
      });

      // Blend: 70% heuristic + 30% AI adjustment, capped at ±15 points
      const aiRiskHint = reasoning.decision === 'block' ? 85
        : reasoning.decision === 'escalate' ? heuristicScore + 12
        : heuristicScore - 5;
      const aiWeight = 0.30;
      const blend = Math.round(heuristicScore * 0.70 + aiRiskHint * aiWeight);
      const finalScore = Math.max(0, Math.min(100,
        blend,
        heuristicScore + 15,
        Math.max(heuristicScore - 15, blend)
      ));

      const aiFactors = reasoning.laborLawFlags.map(f => `ai:${f}`);
      if (reasoning.decision === 'escalate') aiFactors.push('ai:escalation_recommended');
      if (reasoning.decision === 'block') aiFactors.push('ai:block_recommended');

      const aiImpactSummary = reasoning.reasoning
        ? `${reasoning.profitImpact.detail ? `[Profit: ${reasoning.profitImpact.detail}] ` : ''}${reasoning.reasoning}`
        : '';

      return {
        finalScore,
        finalFactors: [...heuristicFactors, ...aiFactors],
        aiImpactSummary,
      };
    } catch {
      return {
        finalScore: heuristicScore,
        finalFactors: heuristicFactors,
        aiImpactSummary: '',
      };
    }
  }

  async requestApproval(params: {
    workspaceId: string;
    category: ApprovalCategory;
    actionId: string;
    actionName: string;
    requestedBy: string;
    payload: Record<string, any>;
    riskScore?: number;
    riskFactors?: string[];
    impactSummary?: string;
  }): Promise<{ gateId: string; status: ApprovalStatus; message: string }> {
    const {
      workspaceId,
      category,
      actionId,
      actionName,
      requestedBy,
      payload,
      riskScore: providedRiskScore,
      riskFactors: providedRiskFactors,
      impactSummary = '',
    } = params;

    // Step 1: Compute heuristic risk score
    let riskScore = providedRiskScore ?? -1;
    let riskFactors = providedRiskFactors ?? [];
    if (riskScore < 0 || (riskScore === 50 && riskFactors.length === 0)) {
      const computed = this.computeRiskScore(category, payload, requestedBy);
      riskScore = computed.score;
      riskFactors = [...riskFactors, ...computed.factors];
    }

    // Step 2: Augment with AI reasoning (non-blocking — falls back to heuristic)
    let aiImpactSummary = '';
    try {
      const augmented = await this.reasonAboutRisk(category, payload, workspaceId, riskScore, riskFactors);
      riskScore = augmented.finalScore;
      riskFactors = augmented.finalFactors;
      aiImpactSummary = augmented.aiImpactSummary;
    } catch {
      // Heuristic score stands
    }

    const policy = this.policies.get(category);
    if (!policy) {
      log.warn(`[ApprovalGate] No policy defined for category '${category}' — blocking action for manual review (workspaceId=${workspaceId}, actionId=${actionId})`);
      const gateId = this.generateGateId();
      const gate: ApprovalGate = {
        id: gateId,
        workspaceId,
        category,
        actionId,
        actionName,
        requestedBy,
        requestedAt: new Date(),
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 3600000),
        riskScore,
        riskFactors,
        payload,
        impactSummary: aiImpactSummary || `Manual review required — no policy defined for category '${category}'.`,
        requiredApproverRole: 'org_owner',
        escalationLevel: 0,
        remindersSent: 0,
      };
      this.gates.set(gateId, gate);
      return {
        gateId,
        status: 'pending',
        message: `No approval policy defined for category '${category}' — manual review required`,
      };
    }

    if (riskScore < policy.autoApproveBelow) {
      const gateId = this.generateGateId();
      const gate: ApprovalGate = {
        id: gateId,
        workspaceId,
        category,
        actionId,
        actionName,
        requestedBy,
        requestedAt: new Date(),
        status: 'auto_approved',
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + policy.expirationHours * 3600000),
        riskScore,
        riskFactors,
        payload,
        impactSummary,
        requiredApproverRole: policy.requiredApproverRoles[0],
        escalationLevel: 0,
        remindersSent: 0,
      };

      this.gates.set(gateId, gate);
      await this.persistGate(gate);

      log.info(`[ApprovalGate] Auto-approved ${actionName} (risk: ${riskScore})`);
      return {
        gateId,
        status: 'auto_approved',
        message: `Auto-approved: risk score ${riskScore} below threshold ${policy.autoApproveBelow}`,
      };
    }

    const gateId = this.generateGateId();
    const gate: ApprovalGate = {
      id: gateId,
      workspaceId,
      category,
      actionId,
      actionName,
      requestedBy,
      requestedAt: new Date(),
      status: 'pending',
      expiresAt: new Date(Date.now() + policy.expirationHours * 3600000),
      riskScore,
      riskFactors,
      payload,
      impactSummary: impactSummary || aiImpactSummary || this.generateImpactSummary(category, payload),
      requiredApproverRole: policy.requiredApproverRoles[0],
      escalationLevel: 0,
      remindersSent: 0,
    };

    this.gates.set(gateId, gate);
    await this.persistGate(gate);

    publishEvent(
      () => platformEventBus.publish({
        type: 'approval_requested',
        title: `Approval Required: ${actionName}`,
        description: gate.impactSummary || `${actionName} requires ${gate.requiredApproverRole} approval (risk: ${riskScore})`,
        category: 'announcement',
        workspaceId,
        payload: {
          gateId,
          category,
          actionName,
          riskScore,
          impactSummary: gate.impactSummary,
          expiresAt: gate.expiresAt,
          requiredRole: gate.requiredApproverRole,
        },
        metadata: { source: 'ApprovalGateEnforcement', priority: 'high' },
      }),
      '[ApprovalGateEnforcement] event publish',
    );

    log.info(`[ApprovalGate] Approval requested for ${actionName} (risk: ${riskScore}, gate: ${gateId})`);

    return {
      gateId,
      status: 'pending',
      message: `Approval required: ${actionName} (risk score: ${riskScore})`,
    };
  }

  async approve(params: {
    gateId: string;
    approverId: string;
    approverRole: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { gateId, approverId, approverRole, notes } = params;

    const gate = this.gates.get(gateId);
    if (!gate) {
      return { success: false, message: 'Approval gate not found' };
    }

    if (gate.status !== 'pending') {
      return { success: false, message: `Gate already ${gate.status}` };
    }

    const policy = this.policies.get(gate.category);
    if (policy && !policy.requiredApproverRoles.includes(approverRole)) {
      return {
        success: false,
        message: `Insufficient permissions. Required roles: ${policy.requiredApproverRoles.join(', ')}`,
      };
    }

    gate.status = 'approved';
    gate.approvedBy = approverId;
    gate.approvedAt = new Date();

    this.gates.set(gateId, gate);
    await this.persistGate(gate);

    publishEvent(
      () => platformEventBus.publish({
        type: 'approval_granted',
        category: 'announcement',
        title: `Approved: ${gate.actionName}`,
        description: `${gate.actionName} approved by ${approverId}${notes ? ` — ${notes}` : ''}`,
        workspaceId: gate.workspaceId,
        payload: {
          gateId,
          actionId: gate.actionId,
          actionName: gate.actionName,
          approvedBy: approverId,
          notes,
        },
        metadata: { source: 'ApprovalGateEnforcement' },
      }),
      '[ApprovalGateEnforcement] event publish',
    );

    log.info(`[ApprovalGate] Approved: ${gate.actionName} by ${approverId}`);

    return { success: true, message: 'Approval granted' };
  }

  async reject(params: {
    gateId: string;
    rejectorId: string;
    reason: string;
  }): Promise<{ success: boolean; message: string }> {
    const { gateId, rejectorId, reason } = params;

    const gate = this.gates.get(gateId);
    if (!gate) {
      return { success: false, message: 'Approval gate not found' };
    }

    if (gate.status !== 'pending') {
      return { success: false, message: `Gate already ${gate.status}` };
    }

    gate.status = 'rejected';
    gate.rejectedBy = rejectorId;
    gate.rejectedAt = new Date();
    gate.rejectionReason = reason;

    this.gates.set(gateId, gate);
    await this.persistGate(gate);

    publishEvent(
      () => platformEventBus.publish({
        type: 'approval_rejected',
        category: 'announcement',
        title: `Rejected: ${gate.actionName}`,
        description: `${gate.actionName} rejected by ${rejectorId}: ${reason}`,
        workspaceId: gate.workspaceId,
        payload: {
          gateId,
          actionId: gate.actionId,
          actionName: gate.actionName,
          rejectedBy: rejectorId,
          reason,
        },
        metadata: { source: 'ApprovalGateEnforcement' },
      }),
      '[ApprovalGateEnforcement] event publish',
    );

    log.info(`[ApprovalGate] Rejected: ${gate.actionName} by ${rejectorId} - ${reason}`);

    return { success: true, message: 'Approval rejected' };
  }

  async checkApprovalStatus(gateId: string): Promise<ApprovalGate | null> {
    return this.gates.get(gateId) || null;
  }

  async isApproved(gateId: string): Promise<boolean> {
    const gate = this.gates.get(gateId);
    return gate?.status === 'approved' || gate?.status === 'auto_approved';
  }

  async getPendingApprovals(workspaceId: string): Promise<ApprovalGate[]> {
    return Array.from(this.gates.values())
      .filter(gate => gate.workspaceId === workspaceId && gate.status === 'pending');
  }

  async escalate(gateId: string): Promise<{ success: boolean; newLevel: number }> {
    const gate = this.gates.get(gateId);
    if (!gate || gate.status !== 'pending') {
      return { success: false, newLevel: 0 };
    }

    const policy = this.policies.get(gate.category);
    if (!policy || gate.escalationLevel >= policy.maxEscalationLevel) {
      return { success: false, newLevel: gate.escalationLevel };
    }

    gate.escalationLevel += 1;
    gate.lastReminderAt = new Date();
    gate.remindersSent += 1;

    this.gates.set(gateId, gate);
    await this.persistGate(gate);

    publishEvent(
      () => platformEventBus.publish({
        type: 'approval_escalated',
        category: 'announcement',
        title: `Escalated to Level ${gate.escalationLevel}: ${gate.actionName}`,
        description: `${gate.actionName} approval escalated to level ${gate.escalationLevel} (risk: ${gate.riskScore}) — higher authority required`,
        workspaceId: gate.workspaceId,
        payload: {
          gateId,
          actionName: gate.actionName,
          newLevel: gate.escalationLevel,
          riskScore: gate.riskScore,
        },
        metadata: { source: 'ApprovalGateEnforcement', priority: 'critical' },
      }),
      '[ApprovalGateEnforcement] event publish',
    );

    log.info(`[ApprovalGate] Escalated: ${gate.actionName} to level ${gate.escalationLevel}`);

    return { success: true, newLevel: gate.escalationLevel };
  }

  private async checkExpirations(): Promise<void> {
    const now = new Date();

    for (const [gateId, gate] of this.gates.entries()) {
      if (gate.status === 'pending' && gate.expiresAt < now) {
        gate.status = 'expired';
        this.gates.set(gateId, gate);
        await this.persistGate(gate);

        publishEvent(
          () => platformEventBus.publish({
            type: 'approval_expired',
            category: 'announcement',
            title: `Approval Window Closed: ${gate.actionName}`,
            description: `${gate.actionName} approval request expired without a decision — operation blocked`,
            workspaceId: gate.workspaceId,
            payload: {
              gateId,
              actionName: gate.actionName,
              requestedBy: gate.requestedBy,
            },
            metadata: { source: 'ApprovalGateEnforcement' },
          }),
          '[ApprovalGateEnforcement] event publish',
        );

        log.info(`[ApprovalGate] Expired: ${gate.actionName}`);
      }
    }
  }

  private generateGateId(): string {
    return `gate-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  private generateImpactSummary(category: ApprovalCategory, payload: Record<string, any>): string {
    const summaries: Record<ApprovalCategory, (p: Record<string, any>) => string> = {
      payroll: (p) => `Process payroll for ${p.employeeCount || 'all'} employees totaling $${p.totalAmount || 'TBD'}`,
      invoicing: (p) => `Generate ${p.invoiceCount || 1} invoice(s) totaling $${p.totalAmount || 'TBD'}`,
      scheduling: (p) => `Publish schedule affecting ${p.employeeCount || 'multiple'} employees for ${p.period || 'upcoming period'}`,
      autofix: (p) => `Apply automated fix to ${p.component || 'system component'}: ${p.fixDescription || 'code changes'}`,
      credit_adjustment: (p) => `Adjust credits by ${p.amount || 0} for workspace ${p.workspaceId || 'unknown'}`,
      data_export: (p) => `Export ${p.dataType || 'data'} containing ${p.recordCount || 'multiple'} records`,
      integration_sync: (p) => `Sync data with ${p.integrationName || 'external system'}`,
      compliance_override: (p) => `Override compliance rule: ${p.ruleName || 'unknown rule'}`,
    };

    return summaries[category]?.(payload) || 'Action requires approval';
  }

  private async persistGate(gate: ApprovalGate): Promise<void> {
    try {
      const gateJson = JSON.stringify(gate);
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(approvalGates).values({
        id: gate.id,
        workspaceId: gate.workspaceId,
        gateData: gateJson,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoUpdate({
        target: approvalGates.id,
        set: { gateData: gateJson, updatedAt: sql`now()` },
      });
    } catch (error: any) {
      log.error('[ApprovalGate] Failed to persist gate:', (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Load pending gates from DB into memory on server restart.
   * Returns the list of gates rehydrated so callers can rebuild their in-memory indices.
   */
  async loadPendingGates(): Promise<ApprovalGate[]> {
    try {
      // Converted to Drizzle ORM: loadPendingGates → INTERVAL
      const { approvalGates } = await import('@shared/schema');
      const { and, gt, sql: drizzleSql } = await import('drizzle-orm');
      const results = await db
        .select({ gateData: approvalGates.gateData })
        .from(approvalGates)
        .where(and(
          drizzleSql`(${approvalGates.gateData}->>'status') = 'pending'`,
          gt(approvalGates.updatedAt, drizzleSql`NOW() - INTERVAL '7 days'`),
        ));

      const gates: ApprovalGate[] = [];
      for (const row of results) {
        try {
          const gate: ApprovalGate = typeof row.gateData === 'string'
            ? JSON.parse(row.gateData)
            : row.gateData;
          this.gates.set(gate.id, gate);
          gates.push(gate);
        } catch { /* skip malformed rows */ }
      }
      if (gates.length > 0) {
        log.info(`[ApprovalGate] Recovered ${gates.length} pending gate(s) from DB on startup`);
      }
      return gates;
    } catch (error: any) {
      log.warn('[ApprovalGate] Could not load pending gates from DB:', (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  getStats(): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    autoApproved: number;
    byCategory: Record<string, number>;
  } {
    const gates = Array.from(this.gates.values());
    const byCategory: Record<string, number> = {};
    
    gates.forEach(gate => {
      byCategory[gate.category] = (byCategory[gate.category] || 0) + 1;
    });

    return {
      total: gates.length,
      pending: gates.filter(g => g.status === 'pending').length,
      approved: gates.filter(g => g.status === 'approved').length,
      rejected: gates.filter(g => g.status === 'rejected').length,
      expired: gates.filter(g => g.status === 'expired').length,
      autoApproved: gates.filter(g => g.status === 'auto_approved').length,
      byCategory,
    };
  }

  shutdown(): void {
    if (this.expirationCheckInterval) {
      clearInterval(this.expirationCheckInterval);
      this.expirationCheckInterval = null;
    }
  }
}

export const approvalGateEnforcementService = new ApprovalGateEnforcementService();

export function registerApprovalGateActions(orchestrator: typeof helpaiOrchestrator): void {
  orchestrator.registerAction({
    actionId: 'approval_gate.request',
    name: 'Request Approval',
    category: 'automation',
    description: 'Request approval for a high-risk operation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      const { category, actionId, actionName, payload, riskScore, riskFactors, impactSummary } = request.payload || {};
      
      if (!request.workspaceId || !category || !actionId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId, category, and actionId are required',
          executionTimeMs: 0,
        };
      }

      const result = await approvalGateEnforcementService.requestApproval({
        workspaceId: request.workspaceId,
        category,
        actionId,
        actionName: actionName || actionId,
        requestedBy: request.userId,
        payload: payload || {},
        riskScore,
        riskFactors,
        impactSummary,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: result.message,
        data: { gateId: result.gateId, status: result.status },
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'approval_gate.approve',
    name: 'Approve Request',
    category: 'automation',
    description: 'Approve a pending approval request',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      const { gateId, notes } = request.payload || {};

      if (!gateId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'gateId is required',
          executionTimeMs: 0,
        };
      }

      const result = await approvalGateEnforcementService.approve({
        gateId,
        approverId: request.userId,
        approverRole: request.userRole,
        notes,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'approval_gate.reject',
    name: 'Reject Request',
    category: 'automation',
    description: 'Reject a pending approval request',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      const { gateId, reason } = request.payload || {};

      if (!gateId || !reason) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'gateId and reason are required',
          executionTimeMs: 0,
        };
      }

      const result = await approvalGateEnforcementService.reject({
        gateId,
        rejectorId: request.userId,
        reason,
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.message,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'approval_gate.check_status',
    name: 'Check Approval Status',
    category: 'automation',
    description: 'Check the status of an approval request',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      const { gateId } = request.payload || {};

      if (!gateId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'gateId is required',
          executionTimeMs: 0,
        };
      }

      const gate = await approvalGateEnforcementService.checkApprovalStatus(gateId);

      return {
        success: !!gate,
        actionId: request.actionId,
        message: gate ? `Status: ${gate.status}` : 'Gate not found',
        data: gate,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'approval_gate.get_pending',
    name: 'Get Pending Approvals',
    category: 'automation',
    description: 'Get all pending approval requests for a workspace',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const pending = await approvalGateEnforcementService.getPendingApprovals(request.workspaceId);

      return {
        success: true,
        actionId: request.actionId,
        message: `${pending.length} pending approvals`,
        data: pending,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'approval_gate.get_stats',
    name: 'Get Approval Stats',
    category: 'analytics',
    description: 'Get platform-wide approval statistics',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const stats = approvalGateEnforcementService.getStats();
      return {
        success: true,
        actionId: request.actionId,
        message: 'Approval stats retrieved',
        data: stats,
        executionTimeMs: 0,
      };
    },
  });

  log.info('[ApprovalGateEnforcement] Registered 6 AI Brain actions');
}
