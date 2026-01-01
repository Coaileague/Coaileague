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
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';

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
    requiredApproverRoles: ['admin', 'super_admin', 'owner'],
    expirationHours: 48,
    maxEscalationLevel: 3,
    reminderIntervalHours: 12,
  },
  {
    category: 'invoicing',
    riskThreshold: 40,
    autoApproveBelow: 25,
    requiredApproverRoles: ['admin', 'super_admin', 'owner', 'manager'],
    expirationHours: 72,
    maxEscalationLevel: 2,
    reminderIntervalHours: 24,
  },
  {
    category: 'scheduling',
    riskThreshold: 50,
    autoApproveBelow: 40,
    requiredApproverRoles: ['admin', 'super_admin', 'owner', 'manager'],
    expirationHours: 24,
    maxEscalationLevel: 2,
    reminderIntervalHours: 8,
  },
  {
    category: 'autofix',
    riskThreshold: 20,
    autoApproveBelow: 10,
    requiredApproverRoles: ['super_admin'],
    expirationHours: 24,
    maxEscalationLevel: 1,
    reminderIntervalHours: 4,
  },
  {
    category: 'credit_adjustment',
    riskThreshold: 25,
    autoApproveBelow: 15,
    requiredApproverRoles: ['admin', 'super_admin'],
    expirationHours: 48,
    maxEscalationLevel: 2,
    reminderIntervalHours: 12,
  },
  {
    category: 'data_export',
    riskThreshold: 35,
    autoApproveBelow: 20,
    requiredApproverRoles: ['admin', 'super_admin', 'owner'],
    expirationHours: 24,
    maxEscalationLevel: 2,
    reminderIntervalHours: 6,
  },
  {
    category: 'integration_sync',
    riskThreshold: 45,
    autoApproveBelow: 30,
    requiredApproverRoles: ['admin', 'super_admin'],
    expirationHours: 48,
    maxEscalationLevel: 2,
    reminderIntervalHours: 12,
  },
  {
    category: 'compliance_override',
    riskThreshold: 15,
    autoApproveBelow: 0,
    requiredApproverRoles: ['super_admin'],
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
      riskScore = 50,
      riskFactors = [],
      impactSummary = '',
    } = params;

    const policy = this.policies.get(category);
    if (!policy) {
      return {
        gateId: '',
        status: 'auto_approved',
        message: 'No approval policy defined for this category',
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

      console.log(`[ApprovalGate] Auto-approved ${actionName} (risk: ${riskScore})`);
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
      impactSummary: impactSummary || this.generateImpactSummary(category, payload),
      requiredApproverRole: policy.requiredApproverRoles[0],
      escalationLevel: 0,
      remindersSent: 0,
    };

    this.gates.set(gateId, gate);
    await this.persistGate(gate);

    platformEventBus.publish({
      type: 'approval_requested',
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
    });

    console.log(`[ApprovalGate] Approval requested for ${actionName} (risk: ${riskScore}, gate: ${gateId})`);

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

    platformEventBus.publish({
      type: 'approval_granted',
      workspaceId: gate.workspaceId,
      payload: {
        gateId,
        actionId: gate.actionId,
        actionName: gate.actionName,
        approvedBy: approverId,
        notes,
      },
      metadata: { source: 'ApprovalGateEnforcement' },
    });

    console.log(`[ApprovalGate] Approved: ${gate.actionName} by ${approverId}`);

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

    platformEventBus.publish({
      type: 'approval_rejected',
      workspaceId: gate.workspaceId,
      payload: {
        gateId,
        actionId: gate.actionId,
        actionName: gate.actionName,
        rejectedBy: rejectorId,
        reason,
      },
      metadata: { source: 'ApprovalGateEnforcement' },
    });

    console.log(`[ApprovalGate] Rejected: ${gate.actionName} by ${rejectorId} - ${reason}`);

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

    platformEventBus.publish({
      type: 'approval_escalated',
      workspaceId: gate.workspaceId,
      payload: {
        gateId,
        actionName: gate.actionName,
        newLevel: gate.escalationLevel,
        riskScore: gate.riskScore,
      },
      metadata: { source: 'ApprovalGateEnforcement', priority: 'critical' },
    });

    console.log(`[ApprovalGate] Escalated: ${gate.actionName} to level ${gate.escalationLevel}`);

    return { success: true, newLevel: gate.escalationLevel };
  }

  private async checkExpirations(): Promise<void> {
    const now = new Date();

    for (const [gateId, gate] of this.gates.entries()) {
      if (gate.status === 'pending' && gate.expiresAt < now) {
        gate.status = 'expired';
        this.gates.set(gateId, gate);
        await this.persistGate(gate);

        platformEventBus.publish({
          type: 'approval_expired',
          workspaceId: gate.workspaceId,
          payload: {
            gateId,
            actionName: gate.actionName,
            requestedBy: gate.requestedBy,
          },
          metadata: { source: 'ApprovalGateEnforcement' },
        });

        console.log(`[ApprovalGate] Expired: ${gate.actionName}`);
      }
    }
  }

  private generateGateId(): string {
    return `gate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      await db.execute(`
        INSERT INTO approval_gates (id, workspace_id, gate_data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE SET gate_data = $3, updated_at = NOW()
      `, [gate.id, gate.workspaceId, JSON.stringify(gate)]);
    } catch (error) {
      console.warn('[ApprovalGate] Failed to persist gate (table may not exist):', error);
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
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin', 'owner'],
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
    requiredRoles: ['admin', 'super_admin', 'owner', 'manager'],
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
    requiredRoles: ['admin', 'super_admin', 'owner', 'manager'],
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
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin', 'owner'],
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
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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
    requiredRoles: ['support', 'admin', 'super_admin'],
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

  console.log('[ApprovalGateEnforcement] Registered 6 AI Brain actions');
}
