/**
 * DOMAIN LEAD SUPERVISORS - FORTUNE 500 GRADE
 * =============================================
 * Specialized supervisors for high-value operational domains.
 * Each Lead Supervisor owns specialized subagents and coordinates
 * domain-specific workflows with escalation protocols.
 * 
 * Lead Supervisors:
 * - RevenueOps: Billing, credits, payroll, invoicing
 * - SecurityOps: ABAC enforcement, audit, compliance
 * - OnboardingOps: Integration setup, data migration, new org setup
 */

import { db, pool } from '../../db';
import { supervisorTelemetry } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { aiBrainService } from './aiBrainService';
import { promoteQualifiedFaqCandidates } from '../helpai/faqLearningService';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('domainLeadSupervisors');

// ============================================================================
// TYPES
// ============================================================================

export type SupervisorDomain = 'revenue_ops' | 'security_ops' | 'onboarding_ops' | 'data_ops' | 'communication_ops';

export interface DomainLeadSupervisor {
  id: string;
  domain: SupervisorDomain;
  name: string;
  description: string;
  subagents: SubagentConfig[];
  escalationPolicy: EscalationPolicy;
  status: 'active' | 'degraded' | 'offline';
  metrics: SupervisorMetrics;
}

export interface SubagentConfig {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  priority: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export interface EscalationPolicy {
  maxRetries: number;
  retryDelayMs: number;
  escalationThreshold: number; // Confidence below this triggers escalation
  humanApprovalRequired: string[]; // Actions requiring human approval
  notifyRoles: string[];
  autoRollbackEnabled: boolean;
}

export interface SupervisorMetrics {
  tasksAssigned: number;
  tasksCompleted: number;
  tasksFailed: number;
  avgExecutionTimeMs: number;
  escalationCount: number;
  lastHealthCheck: Date;
}

export interface DomainTask {
  id: string;
  domain: SupervisorDomain;
  action: string;
  payload: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  requestedBy: string;
  workspaceId?: string;
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed' | 'escalated';
  assignedSubagent?: string;
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  escalated?: boolean;
  humanApprovalNeeded?: boolean;
  metrics?: {
    executionTimeMs: number;
    confidenceScore: number;
    subagentUsed: string;
  };
}

// ============================================================================
// DOMAIN LEAD SUPERVISOR SERVICE
// ============================================================================

class DomainLeadSupervisorService {
  private static instance: DomainLeadSupervisorService;
  
  private supervisors: Map<SupervisorDomain, DomainLeadSupervisor> = new Map();
  private taskQueue: Map<string, DomainTask> = new Map();
  private telemetryBuffer: Map<string, SupervisorMetrics> = new Map();

  static getInstance(): DomainLeadSupervisorService {
    if (!this.instance) {
      this.instance = new DomainLeadSupervisorService();
      this.instance.initializeSupervisors();
    }
    return this.instance;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeSupervisors(): void {
    // RevenueOps Lead Supervisor
    this.supervisors.set('revenue_ops', {
      id: 'supervisor-revenue-ops',
      domain: 'revenue_ops',
      name: 'RevenueOps Lead',
      description: 'Manages billing, credits, payroll, and invoicing operations',
      subagents: [
        {
          id: 'billing-credit-auditor',
          name: 'Billing & Credit Auditor',
          role: 'Financial compliance and credit validation',
          capabilities: ['credit_validation', 'usage_tracking', 'overage_detection', 'billing_reconciliation'],
          priority: 1,
          healthStatus: 'healthy',
        },
        {
          id: 'payroll-processor',
          name: 'Payroll Processor',
          role: 'Automated payroll calculations and compliance',
          capabilities: ['payroll_calculation', 'tax_withholding', 'benefit_deductions', 'anomaly_detection'],
          priority: 2,
          healthStatus: 'healthy',
        },
        {
          id: 'invoice-generator',
          name: 'Invoice Generator',
          role: 'Invoice creation and payment tracking',
          capabilities: ['invoice_generation', 'payment_reconciliation', 'revenue_gap_detection', 'batch_processing'],
          priority: 3,
          healthStatus: 'healthy',
        },
        {
          id: 'stripe-gateway',
          name: 'Stripe Gateway Agent',
          role: 'Payment processing and gateway management',
          capabilities: ['payment_processing', 'refund_handling', 'subscription_management', 'dispute_resolution'],
          priority: 4,
          healthStatus: 'healthy',
        },
      ],
      escalationPolicy: {
        maxRetries: 3,
        retryDelayMs: 5000,
        escalationThreshold: 0.7,
        humanApprovalRequired: ['refund_over_1000', 'payroll_adjustment', 'credit_write_off'],
        notifyRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager'],
        autoRollbackEnabled: true,
      },
      status: 'active',
      metrics: this.initMetrics(),
    });

    // SecurityOps Lead Supervisor
    this.supervisors.set('security_ops', {
      id: 'supervisor-security-ops',
      domain: 'security_ops',
      name: 'SecurityOps Lead',
      description: 'Manages ABAC enforcement, audit compliance, and security operations',
      subagents: [
        {
          id: 'abac-enforcer',
          name: 'ABAC Policy Enforcer',
          role: 'Dynamic attribute-based access control',
          capabilities: ['policy_evaluation', 'permission_check', 'context_validation', 'access_decision'],
          priority: 1,
          healthStatus: 'healthy',
        },
        {
          id: 'audit-compliance',
          name: 'Audit & Compliance Agent',
          role: 'Regulatory compliance and audit trail management',
          capabilities: ['audit_logging', 'compliance_check', 'retention_management', 'report_generation'],
          priority: 2,
          healthStatus: 'healthy',
        },
        {
          id: 'threat-detector',
          name: 'Threat Detection Agent',
          role: 'Security threat identification and response',
          capabilities: ['anomaly_detection', 'intrusion_detection', 'rate_limiting', 'ip_blocking'],
          priority: 3,
          healthStatus: 'healthy',
        },
        {
          id: 'credential-guardian',
          name: 'Credential Guardian',
          role: 'Secret management and credential rotation',
          capabilities: ['secret_rotation', 'credential_validation', 'expiry_alerting', 'encryption_management'],
          priority: 4,
          healthStatus: 'healthy',
        },
      ],
      escalationPolicy: {
        maxRetries: 2,
        retryDelayMs: 1000,
        escalationThreshold: 0.9, // Higher threshold for security
        humanApprovalRequired: ['role_elevation', 'policy_modification', 'credential_access'],
        notifyRoles: ['org_owner', 'co_owner', 'org_admin', 'security_admin'],
        autoRollbackEnabled: true,
      },
      status: 'active',
      metrics: this.initMetrics(),
    });

    // OnboardingOps Lead Supervisor
    this.supervisors.set('onboarding_ops', {
      id: 'supervisor-onboarding-ops',
      domain: 'onboarding_ops',
      name: 'OnboardingOps Lead',
      description: 'Manages integration setup, data migration, and new organization onboarding',
      subagents: [
        {
          id: 'integration-connector',
          name: 'Integration Connector',
          role: 'Third-party API connections and OAuth flows',
          capabilities: ['oauth_flow', 'api_connection', 'credential_storage', 'health_monitoring'],
          priority: 1,
          healthStatus: 'healthy',
        },
        {
          id: 'data-migrator',
          name: 'Data Migration Agent',
          role: 'Automated data extraction and transformation',
          capabilities: ['data_extraction', 'field_mapping', 'validation', 'bulk_import'],
          priority: 2,
          healthStatus: 'healthy',
        },
        {
          id: 'org-provisioner',
          name: 'Organization Provisioner',
          role: 'New organization setup and configuration',
          capabilities: ['workspace_creation', 'default_setup', 'template_application', 'user_provisioning'],
          priority: 3,
          healthStatus: 'healthy',
        },
        {
          id: 'onboarding-assistant',
          name: 'Onboarding Assistant',
          role: 'Guided onboarding and feature discovery',
          capabilities: ['tour_management', 'progress_tracking', 'recommendation', 'gamification'],
          priority: 4,
          healthStatus: 'healthy',
        },
      ],
      escalationPolicy: {
        maxRetries: 3,
        retryDelayMs: 10000,
        escalationThreshold: 0.6,
        humanApprovalRequired: ['data_deletion', 'org_termination', 'bulk_user_creation'],
        notifyRoles: ['org_owner', 'co_owner', 'org_admin'],
        autoRollbackEnabled: true,
      },
      status: 'active',
      metrics: this.initMetrics(),
    });

    // DataOps Lead Supervisor - Analytics, Reporting, Knowledge Management
    this.supervisors.set('data_ops', {
      id: 'supervisor-data-ops',
      domain: 'data_ops',
      name: 'DataOps Lead',
      description: 'Manages analytics, reporting, knowledge graph, and data quality operations',
      subagents: [
        {
          id: 'analytics-engine',
          name: 'Analytics Engine',
          role: 'Business intelligence and metrics aggregation',
          capabilities: ['metric_aggregation', 'trend_analysis', 'report_generation', 'dashboard_data'],
          priority: 1,
          healthStatus: 'healthy',
        },
        {
          id: 'knowledge-curator',
          name: 'Knowledge Curator',
          role: 'Knowledge graph management and semantic queries',
          capabilities: ['entity_management', 'relationship_mapping', 'semantic_search', 'learning_extraction'],
          priority: 2,
          healthStatus: 'healthy',
        },
        {
          id: 'data-quality-monitor',
          name: 'Data Quality Monitor',
          role: 'Data validation and integrity checking',
          capabilities: ['schema_validation', 'anomaly_detection', 'duplicate_detection', 'consistency_check'],
          priority: 3,
          healthStatus: 'healthy',
        },
        {
          id: 'rl-optimizer',
          name: 'RL Optimization Agent',
          role: 'Reinforcement learning model optimization',
          capabilities: ['confidence_calibration', 'strategy_adaptation', 'experience_analysis', 'model_tuning'],
          priority: 4,
          healthStatus: 'healthy',
        },
      ],
      escalationPolicy: {
        maxRetries: 3,
        retryDelayMs: 5000,
        escalationThreshold: 0.65,
        humanApprovalRequired: ['data_purge', 'model_reset', 'bulk_correction'],
        notifyRoles: ['org_owner', 'co_owner', 'org_admin', 'data_analyst'],
        autoRollbackEnabled: true,
      },
      status: 'active',
      metrics: this.initMetrics(),
    });

    // CommunicationOps Lead Supervisor - Notifications, Chat, Collaboration
    this.supervisors.set('communication_ops', {
      id: 'supervisor-communication-ops',
      domain: 'communication_ops',
      name: 'CommunicationOps Lead',
      description: 'Manages notifications, chat, A2A communication, and collaboration workflows',
      subagents: [
        {
          id: 'notification-orchestrator',
          name: 'Notification Orchestrator',
          role: 'Multi-channel notification delivery',
          capabilities: ['email_dispatch', 'push_notification', 'sms_delivery', 'priority_routing'],
          priority: 1,
          healthStatus: 'healthy',
        },
        {
          id: 'chat-coordinator',
          name: 'Chat Coordinator',
          role: 'Chat room management and message routing',
          capabilities: ['room_management', 'message_routing', 'presence_tracking', 'thread_resolution'],
          priority: 2,
          healthStatus: 'healthy',
        },
        {
          id: 'a2a-broker',
          name: 'A2A Communication Broker',
          role: 'Agent-to-agent message routing and team coordination',
          capabilities: ['agent_messaging', 'team_formation', 'trust_evaluation', 'collaboration_protocol'],
          priority: 3,
          healthStatus: 'healthy',
        },
        {
          id: 'escalation-manager',
          name: 'Escalation Manager',
          role: 'Human escalation workflows and support routing',
          capabilities: ['escalation_routing', 'ticket_creation', 'priority_assessment', 'sla_tracking'],
          priority: 4,
          healthStatus: 'healthy',
        },
      ],
      escalationPolicy: {
        maxRetries: 2,
        retryDelayMs: 3000,
        escalationThreshold: 0.7,
        humanApprovalRequired: ['mass_notification', 'channel_shutdown', 'agent_termination'],
        notifyRoles: ['org_owner', 'co_owner', 'org_admin', 'support_manager'],
        autoRollbackEnabled: false,
      },
      status: 'active',
      metrics: this.initMetrics(),
    });

    log.info('[DomainLeadSupervisors] Initialized 5 domain lead supervisors');
    log.info('[DomainLeadSupervisors] - RevenueOps: 4 subagents');
    log.info('[DomainLeadSupervisors] - SecurityOps: 4 subagents');
    log.info('[DomainLeadSupervisors] - OnboardingOps: 4 subagents');
    log.info('[DomainLeadSupervisors] - DataOps: 4 subagents');
    log.info('[DomainLeadSupervisors] - CommunicationOps: 4 subagents');

    // Emit initialization event
    platformEventBus.publish({
      type: 'domain_supervisors_initialized',
      category: 'feature',
      title: 'Domain Lead Supervisors Active',
      description: '5 Fortune 500-grade domain supervisors initialized with 20 specialized subagents',
      metadata: {
        domains: ['revenue_ops', 'security_ops', 'onboarding_ops', 'data_ops', 'communication_ops'],
        totalSubagents: 20,
      },
    }).catch((err) => log.warn('[domainLeadSupervisors] Fire-and-forget failed:', err));
  }

  private initMetrics(): SupervisorMetrics {
    return {
      tasksAssigned: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      escalationCount: 0,
      lastHealthCheck: new Date(),
    };
  }

  // ============================================================================
  // TASK MANAGEMENT
  // ============================================================================

  async submitTask(
    domain: SupervisorDomain,
    action: string,
    payload: Record<string, unknown>,
    options: {
      priority?: 'critical' | 'high' | 'normal' | 'low';
      requestedBy: string;
      workspaceId?: string;
    }
  ): Promise<TaskResult> {
    const supervisor = this.supervisors.get(domain);
    if (!supervisor) {
      return { success: false, error: `Unknown domain: ${domain}` };
    }

    if (supervisor.status === 'offline') {
      return { success: false, error: `${supervisor.name} is currently offline` };
    }

    const task: DomainTask = {
      id: crypto.randomUUID(),
      domain,
      action,
      payload,
      priority: options.priority || 'normal',
      requestedBy: options.requestedBy,
      workspaceId: options.workspaceId,
      status: 'pending',
      createdAt: new Date(),
    };

    this.taskQueue.set(task.id, task);
    supervisor.metrics.tasksAssigned++;

    try {
      // Find best subagent for the action
      const subagent = this.selectSubagent(supervisor, action);
      if (!subagent) {
        return { success: false, error: `No capable subagent found for action: ${action}` };
      }

      task.assignedSubagent = subagent.id;
      task.status = 'executing';

      const startTime = Date.now();

      // Check if action requires human approval
      if (supervisor.escalationPolicy.humanApprovalRequired.includes(action)) {
        task.status = 'escalated';
        supervisor.metrics.escalationCount++;
        
        return {
          success: false,
          humanApprovalNeeded: true,
          error: `Action "${action}" requires human approval`,
          metrics: {
            executionTimeMs: Date.now() - startTime,
            confidenceScore: 0,
            subagentUsed: subagent.id,
          },
        };
      }

      // Execute concrete DB-backed handler first (no AI needed for known patterns)
      const concreteResult = await this.tryConcreteAction(domain, action, payload);
      if (concreteResult) {
        const executionTimeMs = Date.now() - startTime;
        this.updateMetrics(supervisor, executionTimeMs, concreteResult.success);
        task.status = concreteResult.success ? 'completed' : 'failed';
        task.completedAt = new Date();
        task.result = concreteResult.data;
        task.error = concreteResult.error;
        return { ...concreteResult, metrics: { executionTimeMs, confidenceScore: concreteResult.confidence || 0.9, subagentUsed: subagent.id } };
      }

      // Execute through AI Brain
      const result = await this.executeWithAI(domain, action, payload, subagent);
      const executionTimeMs = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(supervisor, executionTimeMs, result.success);

      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = new Date();
      task.result = result.data;
      task.error = result.error;

      return {
        ...result,
        metrics: {
          executionTimeMs,
          confidenceScore: result.confidence || 0.8,
          subagentUsed: subagent.id,
        },
      };
    } catch (error: unknown) {
      task.status = 'failed';
      task.error = (error instanceof Error ? error.message : String(error));
      supervisor.metrics.tasksFailed++;

      // Check if we should escalate
      if (this.shouldEscalate(supervisor, error)) {
        task.status = 'escalated';
        supervisor.metrics.escalationCount++;
        return {
          success: false,
          escalated: true,
          error: `Task escalated: ${(error instanceof Error ? error.message : String(error))}`,
        };
      }

      return { success: false, error: error.message };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // CONCRETE DB-BACKED ACTION HANDLERS
  // Returns null → falls through to AI. Returns a result → skips AI.
  // ────────────────────────────────────────────────────────────────────────

  private async tryConcreteAction(
    domain: SupervisorDomain,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: any; error?: string; confidence?: number } | null> {

    // ── data_ops / generate_faq_suggestion ──────────────────────────────
    if (domain === 'data_ops' && action === 'generate_faq_suggestion') {
      try {
        const workspaceId = payload?.workspaceId as string | undefined;
        const promoted = await promoteQualifiedFaqCandidates(workspaceId);
        return {
          success: true,
          confidence: 0.92,
          data: {
            promoted,
            message: promoted > 0
              ? `Published ${promoted} FAQ answer(s) from recurring question patterns`
              : 'No FAQ candidates ready for promotion yet (threshold: 3 occurrences)',
          },
        };
      } catch (err: unknown) {
        return { success: false, error: `FAQ promotion failed: ${err.message}`, confidence: 0 };
      }
    }

    // ── onboarding_ops / resume_onboarding_sequence ─────────────────────
    if (domain === 'onboarding_ops' && action === 'resume_onboarding_sequence') {
      const workspaceId = payload?.workspaceId as string | undefined;
      const employeeId = payload?.employeeId as string | undefined;

      if (!workspaceId) {
        return { success: false, error: 'resume_onboarding_sequence requires workspaceId', confidence: 0 };
      }

      try {
        const actionsPerformed: string[] = [];

        // 1. Reset stuck/errored onboarding tasks to in_progress
        const resetResult = await pool.query(`
          UPDATE employee_onboarding_progress
          SET status = 'in_progress', updated_at = NOW()
          WHERE workspace_id = $1
            ${employeeId ? 'AND employee_id = $2' : ''}
            AND status IN ('stuck', 'error', 'failed')
          RETURNING employee_id, task_type
        `, employeeId ? [workspaceId, employeeId] : [workspaceId]);

        if (resetResult.rows.length > 0) {
          actionsPerformed.push(`Reset ${resetResult.rows.length} stuck task(s) to in_progress`);
        }

        // 2. Find employees who are in 'invited' status for more than 24h → reactivate
        const staleEmployees = await pool.query(`
          SELECT e.id, e.email, e.first_name
          FROM employees e
          WHERE e.workspace_id = $1
            ${employeeId ? 'AND e.id = $2' : ''}
            AND e.status = 'invited'
            AND e.created_at < NOW() - INTERVAL '24 hours'
          LIMIT 20
        `, employeeId ? [workspaceId, employeeId] : [workspaceId]);

        for (const emp of staleEmployees.rows) {
          await pool.query(`
            UPDATE employees SET status = 'pending', updated_at = NOW() WHERE id = $1
          `, [emp.id]);
          actionsPerformed.push(`Reactivated onboarding for ${emp.first_name} (${emp.email})`);
        }

        // 3. Ensure employees with completed tasks get activated
        const completedEmployees = await pool.query(`
          SELECT DISTINCT eop.employee_id
          FROM employee_onboarding_progress eop
          JOIN employees e ON e.id = eop.employee_id
          WHERE eop.workspace_id = $1
            ${employeeId ? 'AND eop.employee_id = $2' : ''}
            AND e.status IN ('invited', 'pending')
            AND NOT EXISTS (
              SELECT 1 FROM employee_onboarding_progress eop2
              WHERE eop2.employee_id = eop.employee_id
                AND eop2.workspace_id = $1
                AND eop2.status NOT IN ('completed', 'skipped')
            )
          LIMIT 10
        `, employeeId ? [workspaceId, employeeId] : [workspaceId]);

        for (const row of completedEmployees.rows) {
          await pool.query(`
            UPDATE employees SET status = 'active', updated_at = NOW() WHERE id = $1
          `, [row.employee_id]);
          actionsPerformed.push(`Activated employee ${row.employee_id} (all tasks complete)`);
        }

        return {
          success: true,
          confidence: 0.9,
          data: {
            actionsPerformed,
            message: actionsPerformed.length > 0
              ? `Onboarding resumed: ${actionsPerformed.join('; ')}`
              : 'No stalled onboarding sequences found for this workspace',
          },
        };
      } catch (err: unknown) {
        return { success: false, error: `Onboarding resume failed: ${err.message}`, confidence: 0 };
      }
    }

    // No concrete handler — fall through to AI
    return null;
  }

  private selectSubagent(supervisor: DomainLeadSupervisor, action: string): SubagentConfig | null {
    // Find subagent with matching capability
    const capableSubagents = supervisor.subagents.filter(
      sa => sa.healthStatus !== 'unhealthy' && 
            sa.capabilities.some(cap => action.toLowerCase().includes(cap.replace('_', '')))
    );

    if (capableSubagents.length === 0) {
      // Fall back to first healthy subagent
      return supervisor.subagents.find(sa => sa.healthStatus !== 'unhealthy') || null;
    }

    // Return highest priority capable subagent
    return capableSubagents.sort((a, b) => a.priority - b.priority)[0];
  }

  private async executeWithAI(
    domain: SupervisorDomain,
    action: string,
    payload: Record<string, unknown>,
    subagent: SubagentConfig
  ): Promise<{ success: boolean; data?: any; error?: string; confidence?: number }> {
    const prompt = `
You are the ${subagent.name} subagent operating under the ${domain} domain supervisor.

Your role: ${subagent.role}
Your capabilities: ${subagent.capabilities.join(', ')}

Execute the following action:
Action: ${action}
Payload: ${JSON.stringify(payload, null, 2)}

Provide a JSON response with:
{
  "success": boolean,
  "data": any result data,
  "confidence": number between 0 and 1,
  "reasoning": brief explanation
}
`;

    try {
      const response = await (aiBrainService as any).processRequest({
        type: 'domain_task_execution',
        prompt,
        context: { domain, action, subagent: subagent.id },
      });

      if (response.success && response.data) {
        return {
          success: true,
          data: response.data,
          confidence: 0.85,
        };
      }

      return {
        success: false,
        error: response.error || 'AI execution failed',
        confidence: 0.3,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        confidence: 0,
      };
    }
  }

  private shouldEscalate(supervisor: DomainLeadSupervisor, error: any): boolean {
    // Escalate on critical errors or repeated failures
    const recentFailures = supervisor.metrics.tasksFailed;
    const totalTasks = supervisor.metrics.tasksAssigned;
    
    if (totalTasks === 0) return false;
    
    const failureRate = recentFailures / totalTasks;
    return failureRate > (1 - supervisor.escalationPolicy.escalationThreshold);
  }

  private updateMetrics(supervisor: DomainLeadSupervisor, executionTimeMs: number, success: boolean): void {
    if (success) {
      supervisor.metrics.tasksCompleted++;
    } else {
      supervisor.metrics.tasksFailed++;
    }

    // Update average execution time
    const total = supervisor.metrics.tasksCompleted + supervisor.metrics.tasksFailed;
    supervisor.metrics.avgExecutionTimeMs = 
      (supervisor.metrics.avgExecutionTimeMs * (total - 1) + executionTimeMs) / total;
  }

  // ============================================================================
  // TELEMETRY PERSISTENCE
  // ============================================================================

  async persistTelemetry(): Promise<void> {
    const periodStart = new Date();
    periodStart.setHours(periodStart.getHours() - 1); // Last hour

    for (const [domain, supervisor] of this.supervisors) {
      try {
        await db.insert(supervisorTelemetry).values({
          supervisorId: supervisor.id,
          workspaceId: 'system',
          domain,
          tasksAssigned: supervisor.metrics.tasksAssigned,
          tasksCompleted: supervisor.metrics.tasksCompleted,
          tasksFailed: supervisor.metrics.tasksFailed,
          avgExecutionTimeMs: supervisor.metrics.avgExecutionTimeMs,
          escalationCount: supervisor.metrics.escalationCount,
          activeSubagents: supervisor.subagents.filter(s => s.healthStatus !== 'unhealthy').length,
          pendingTasks: Array.from(this.taskQueue.values()).filter(t => t.domain === domain && t.status === 'pending').length,
          lastHealthCheck: supervisor.metrics.lastHealthCheck,
          healthStatus: supervisor.status,
          periodStart,
          periodEnd: new Date(),
        });
      } catch (error) {
        log.error(`[DomainLeadSupervisors] Failed to persist telemetry for ${domain}:`, error);
      }
    }
  }

  // ============================================================================
  // SUPERVISOR MANAGEMENT
  // ============================================================================

  getSupervisor(domain: SupervisorDomain): DomainLeadSupervisor | undefined {
    return this.supervisors.get(domain);
  }

  getAllSupervisors(): DomainLeadSupervisor[] {
    return Array.from(this.supervisors.values());
  }

  getSupervisorHealth(): Record<SupervisorDomain, { status: string; subagentHealth: Record<string, string> }> {
    const health: Record<string, unknown> = {};
    
    for (const [domain, supervisor] of this.supervisors) {
      health[domain] = {
        status: supervisor.status,
        subagentHealth: Object.fromEntries(
          supervisor.subagents.map(sa => [sa.id, sa.healthStatus])
        ),
      };
    }

    return health as Record<SupervisorDomain, { status: string; subagentHealth: Record<string, string> }>;
  }

  updateSubagentHealth(domain: SupervisorDomain, subagentId: string, status: 'healthy' | 'degraded' | 'unhealthy'): void {
    const supervisor = this.supervisors.get(domain);
    if (!supervisor) return;

    const subagent = supervisor.subagents.find(sa => sa.id === subagentId);
    if (subagent) {
      subagent.healthStatus = status;

      // Update supervisor status based on subagent health
      const unhealthyCount = supervisor.subagents.filter(sa => sa.healthStatus === 'unhealthy').length;
      if (unhealthyCount === supervisor.subagents.length) {
        supervisor.status = 'offline';
      } else if (unhealthyCount > 0) {
        supervisor.status = 'degraded';
      } else {
        supervisor.status = 'active';
      }
    }
  }

  // ============================================================================
  // ACTION ROUTING
  // ============================================================================

  routeAction(action: string): SupervisorDomain | null {
    // Revenue operations
    if (/billing|credit|payroll|invoice|payment|refund|subscription/i.test(action)) {
      return 'revenue_ops';
    }

    // Security operations
    if (/security|access|permission|audit|compliance|threat|credential|abac|rbac/i.test(action)) {
      return 'security_ops';
    }

    // Onboarding operations
    if (/onboarding|integration|migration|setup|provision|connect|import/i.test(action)) {
      return 'onboarding_ops';
    }

    return null;
  }

  // ============================================================================
  // AI BRAIN REGISTRATION
  // ============================================================================

  getRegisteredActions(): { domain: SupervisorDomain; actions: string[] }[] {
    return [
      {
        domain: 'security_ops',
        actions: [
          'security.evaluate_policy',
          'security.check_permissions',
          'security.audit_access',
          'security.detect_threats',
          'security.rotate_credentials',
          'security.validate_compliance',
        ],
      },
      {
        domain: 'onboarding_ops',
        actions: [
          'onboarding.connect_integration',
          'onboarding.migrate_data',
          'onboarding.provision_workspace',
          'onboarding.setup_defaults',
          'onboarding.track_progress',
          'onboarding.recommend_features',
        ],
      },
    ];
  }
}

export const domainLeadSupervisorService = DomainLeadSupervisorService.getInstance();
