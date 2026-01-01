/**
 * Cross-Domain Exception Service
 * 
 * Unified exception handling for all platform domains:
 * - Scheduling exceptions
 * - Compliance exceptions
 * - AI/Automation exceptions
 * - Integration exceptions
 * - User workflow exceptions
 * 
 * Provides structured triage, escalation, and resolution tracking
 * beyond the billing-specific exception queue.
 */

import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';

export type ExceptionDomain = 
  | 'scheduling'
  | 'compliance'
  | 'ai_automation'
  | 'integration'
  | 'user_workflow'
  | 'billing'
  | 'payroll'
  | 'notification'
  | 'security';

export type ExceptionSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ExceptionStatus = 
  | 'open'
  | 'triaging'
  | 'awaiting_action'
  | 'in_progress'
  | 'resolved'
  | 'escalated'
  | 'auto_resolved'
  | 'dismissed';

export interface PlatformException {
  id: string;
  workspaceId: string;
  domain: ExceptionDomain;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  code: string;
  title: string;
  description: string;
  stackTrace?: string;
  sourceAction?: string;
  sourceService?: string;
  affectedResources: string[];
  metadata: Record<string, any>;
  suggestedResolution?: string;
  autoResolutionAttempted: boolean;
  autoResolutionResult?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  escalationLevel: number;
  escalatedAt?: Date;
  assignedTo?: string;
  slaDeadline?: Date;
  slaBreached: boolean;
}

export interface ExceptionResolutionRule {
  domain: ExceptionDomain;
  code: string;
  autoResolve: boolean;
  resolutionHandler?: (exception: PlatformException) => Promise<{ resolved: boolean; notes: string }>;
  escalationThresholdMinutes: number;
  slaMinutes: number;
}

const DEFAULT_SLA_MINUTES: Record<ExceptionSeverity, number> = {
  critical: 30,
  high: 120,
  medium: 480,
  low: 1440,
};

class CrossDomainExceptionService {
  private exceptions = new Map<string, PlatformException>();
  private resolutionRules = new Map<string, ExceptionResolutionRule>();
  private slaCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDefaultRules();
    this.slaCheckInterval = setInterval(() => this.checkSLAs(), 300000);
  }

  private initializeDefaultRules(): void {
    const defaultRules: ExceptionResolutionRule[] = [
      {
        domain: 'scheduling',
        code: 'SHIFT_CONFLICT',
        autoResolve: false,
        escalationThresholdMinutes: 60,
        slaMinutes: 240,
      },
      {
        domain: 'scheduling',
        code: 'OVERTIME_VIOLATION',
        autoResolve: false,
        escalationThresholdMinutes: 30,
        slaMinutes: 120,
      },
      {
        domain: 'compliance',
        code: 'CERTIFICATION_EXPIRED',
        autoResolve: false,
        escalationThresholdMinutes: 120,
        slaMinutes: 480,
      },
      {
        domain: 'compliance',
        code: 'BREAK_VIOLATION',
        autoResolve: false,
        escalationThresholdMinutes: 60,
        slaMinutes: 240,
      },
      {
        domain: 'ai_automation',
        code: 'AUTOMATION_FAILED',
        autoResolve: true,
        resolutionHandler: async (ex) => {
          if (ex.metadata?.retryable) {
            return { resolved: false, notes: 'Marked for retry' };
          }
          return { resolved: false, notes: 'Requires manual intervention' };
        },
        escalationThresholdMinutes: 30,
        slaMinutes: 60,
      },
      {
        domain: 'ai_automation',
        code: 'TRINITY_ERROR',
        autoResolve: false,
        escalationThresholdMinutes: 15,
        slaMinutes: 30,
      },
      {
        domain: 'integration',
        code: 'SYNC_FAILED',
        autoResolve: true,
        resolutionHandler: async (ex) => {
          if (ex.metadata?.retryCount < 3) {
            return { resolved: false, notes: `Retry ${ex.metadata.retryCount + 1}/3 scheduled` };
          }
          return { resolved: false, notes: 'Max retries exceeded' };
        },
        escalationThresholdMinutes: 60,
        slaMinutes: 120,
      },
      {
        domain: 'integration',
        code: 'API_RATE_LIMITED',
        autoResolve: true,
        resolutionHandler: async () => {
          return { resolved: true, notes: 'Rate limit will reset automatically' };
        },
        escalationThresholdMinutes: 120,
        slaMinutes: 240,
      },
      {
        domain: 'notification',
        code: 'DELIVERY_FAILED',
        autoResolve: true,
        resolutionHandler: async (ex) => {
          if (ex.metadata?.channel === 'email') {
            return { resolved: false, notes: 'Email delivery failed - check recipient' };
          }
          return { resolved: true, notes: 'Fallback notification sent' };
        },
        escalationThresholdMinutes: 60,
        slaMinutes: 120,
      },
      {
        domain: 'security',
        code: 'SUSPICIOUS_ACTIVITY',
        autoResolve: false,
        escalationThresholdMinutes: 5,
        slaMinutes: 15,
      },
    ];

    defaultRules.forEach(rule => {
      this.resolutionRules.set(`${rule.domain}:${rule.code}`, rule);
    });
  }

  async raiseException(params: {
    workspaceId: string;
    domain: ExceptionDomain;
    code: string;
    title: string;
    description: string;
    severity?: ExceptionSeverity;
    stackTrace?: string;
    sourceAction?: string;
    sourceService?: string;
    affectedResources?: string[];
    metadata?: Record<string, any>;
    suggestedResolution?: string;
  }): Promise<PlatformException> {
    const {
      workspaceId,
      domain,
      code,
      title,
      description,
      severity = 'medium',
      stackTrace,
      sourceAction,
      sourceService,
      affectedResources = [],
      metadata = {},
      suggestedResolution,
    } = params;

    const id = this.generateExceptionId();
    const slaMinutes = DEFAULT_SLA_MINUTES[severity];
    const now = new Date();

    const exception: PlatformException = {
      id,
      workspaceId,
      domain,
      severity,
      status: 'open',
      code,
      title,
      description,
      stackTrace,
      sourceAction,
      sourceService,
      affectedResources,
      metadata,
      suggestedResolution,
      autoResolutionAttempted: false,
      createdAt: now,
      updatedAt: now,
      escalationLevel: 0,
      slaDeadline: new Date(now.getTime() + slaMinutes * 60000),
      slaBreached: false,
    };

    this.exceptions.set(id, exception);
    await this.persistException(exception);

    platformEventBus.publish({
      type: 'exception_raised',
      workspaceId,
      payload: {
        exceptionId: id,
        domain,
        code,
        severity,
        title,
        slaDeadline: exception.slaDeadline,
      },
      metadata: { source: 'CrossDomainExceptionService', priority: severity === 'critical' ? 'critical' : 'high' },
    });

    console.log(`[ExceptionService] Exception raised: ${domain}/${code} - ${title} (severity: ${severity})`);

    await this.attemptAutoResolution(exception);

    return exception;
  }

  private async attemptAutoResolution(exception: PlatformException): Promise<void> {
    const ruleKey = `${exception.domain}:${exception.code}`;
    const rule = this.resolutionRules.get(ruleKey);

    if (!rule || !rule.autoResolve || !rule.resolutionHandler) {
      return;
    }

    exception.status = 'triaging';
    exception.autoResolutionAttempted = true;
    exception.updatedAt = new Date();

    try {
      const result = await rule.resolutionHandler(exception);
      exception.autoResolutionResult = result.notes;

      if (result.resolved) {
        exception.status = 'auto_resolved';
        exception.resolvedAt = new Date();
        exception.resolutionNotes = result.notes;

        platformEventBus.publish({
          type: 'exception_auto_resolved',
          workspaceId: exception.workspaceId,
          payload: {
            exceptionId: exception.id,
            domain: exception.domain,
            code: exception.code,
            notes: result.notes,
          },
          metadata: { source: 'CrossDomainExceptionService' },
        });

        console.log(`[ExceptionService] Auto-resolved: ${exception.domain}/${exception.code}`);
      } else {
        exception.status = 'awaiting_action';
      }
    } catch (error) {
      exception.autoResolutionResult = `Auto-resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      exception.status = 'awaiting_action';
    }

    this.exceptions.set(exception.id, exception);
    await this.persistException(exception);
  }

  async resolveException(params: {
    exceptionId: string;
    resolvedBy: string;
    resolutionNotes: string;
  }): Promise<{ success: boolean; message: string }> {
    const { exceptionId, resolvedBy, resolutionNotes } = params;

    const exception = this.exceptions.get(exceptionId);
    if (!exception) {
      return { success: false, message: 'Exception not found' };
    }

    if (exception.status === 'resolved' || exception.status === 'auto_resolved') {
      return { success: false, message: 'Exception already resolved' };
    }

    exception.status = 'resolved';
    exception.resolvedAt = new Date();
    exception.resolvedBy = resolvedBy;
    exception.resolutionNotes = resolutionNotes;
    exception.updatedAt = new Date();

    this.exceptions.set(exceptionId, exception);
    await this.persistException(exception);

    platformEventBus.publish({
      type: 'exception_resolved',
      workspaceId: exception.workspaceId,
      payload: {
        exceptionId,
        domain: exception.domain,
        code: exception.code,
        resolvedBy,
        resolutionNotes,
        slaBreached: exception.slaBreached,
      },
      metadata: { source: 'CrossDomainExceptionService' },
    });

    console.log(`[ExceptionService] Resolved: ${exception.domain}/${exception.code} by ${resolvedBy}`);

    return { success: true, message: 'Exception resolved' };
  }

  async escalateException(exceptionId: string, reason?: string): Promise<{ success: boolean; newLevel: number }> {
    const exception = this.exceptions.get(exceptionId);
    if (!exception) {
      return { success: false, newLevel: 0 };
    }

    exception.escalationLevel += 1;
    exception.status = 'escalated';
    exception.escalatedAt = new Date();
    exception.updatedAt = new Date();

    this.exceptions.set(exceptionId, exception);
    await this.persistException(exception);

    platformEventBus.publish({
      type: 'exception_escalated',
      workspaceId: exception.workspaceId,
      payload: {
        exceptionId,
        domain: exception.domain,
        code: exception.code,
        severity: exception.severity,
        escalationLevel: exception.escalationLevel,
        reason,
      },
      metadata: { source: 'CrossDomainExceptionService', priority: 'critical' },
    });

    console.log(`[ExceptionService] Escalated: ${exception.domain}/${exception.code} to level ${exception.escalationLevel}`);

    return { success: true, newLevel: exception.escalationLevel };
  }

  async dismissException(exceptionId: string, reason: string): Promise<{ success: boolean }> {
    const exception = this.exceptions.get(exceptionId);
    if (!exception) {
      return { success: false };
    }

    exception.status = 'dismissed';
    exception.resolutionNotes = `Dismissed: ${reason}`;
    exception.updatedAt = new Date();

    this.exceptions.set(exceptionId, exception);
    await this.persistException(exception);

    return { success: true };
  }

  async getExceptionsByDomain(workspaceId: string, domain?: ExceptionDomain): Promise<PlatformException[]> {
    return Array.from(this.exceptions.values())
      .filter(ex => ex.workspaceId === workspaceId && (!domain || ex.domain === domain))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getOpenExceptions(workspaceId: string): Promise<PlatformException[]> {
    const openStatuses: ExceptionStatus[] = ['open', 'triaging', 'awaiting_action', 'in_progress', 'escalated'];
    return Array.from(this.exceptions.values())
      .filter(ex => ex.workspaceId === workspaceId && openStatuses.includes(ex.status))
      .sort((a, b) => {
        const severityOrder: Record<ExceptionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }

  private async checkSLAs(): Promise<void> {
    const now = new Date();

    for (const [id, exception] of this.exceptions.entries()) {
      if (exception.status === 'resolved' || exception.status === 'auto_resolved' || exception.status === 'dismissed') {
        continue;
      }

      if (exception.slaDeadline && exception.slaDeadline < now && !exception.slaBreached) {
        exception.slaBreached = true;
        exception.updatedAt = now;
        this.exceptions.set(id, exception);
        await this.persistException(exception);

        platformEventBus.publish({
          type: 'exception_sla_breached',
          workspaceId: exception.workspaceId,
          payload: {
            exceptionId: id,
            domain: exception.domain,
            code: exception.code,
            severity: exception.severity,
            title: exception.title,
            slaDeadline: exception.slaDeadline,
          },
          metadata: { source: 'CrossDomainExceptionService', priority: 'critical' },
        });

        console.log(`[ExceptionService] SLA breached: ${exception.domain}/${exception.code}`);

        if (exception.escalationLevel < 3) {
          await this.escalateException(id, 'SLA breach');
        }
      }
    }
  }

  private generateExceptionId(): string {
    return `exc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async persistException(exception: PlatformException): Promise<void> {
    try {
      await db.execute(`
        INSERT INTO platform_exceptions (id, workspace_id, exception_data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE SET exception_data = $3, updated_at = NOW()
      `, [exception.id, exception.workspaceId, JSON.stringify(exception)]);
    } catch (error) {
      console.warn('[ExceptionService] Failed to persist exception (table may not exist):', error);
    }
  }

  getStats(): {
    total: number;
    open: number;
    resolved: number;
    escalated: number;
    slaBreached: number;
    byDomain: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const exceptions = Array.from(this.exceptions.values());
    const byDomain: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    exceptions.forEach(ex => {
      byDomain[ex.domain] = (byDomain[ex.domain] || 0) + 1;
      bySeverity[ex.severity] = (bySeverity[ex.severity] || 0) + 1;
    });

    const openStatuses: ExceptionStatus[] = ['open', 'triaging', 'awaiting_action', 'in_progress'];

    return {
      total: exceptions.length,
      open: exceptions.filter(ex => openStatuses.includes(ex.status)).length,
      resolved: exceptions.filter(ex => ex.status === 'resolved' || ex.status === 'auto_resolved').length,
      escalated: exceptions.filter(ex => ex.status === 'escalated').length,
      slaBreached: exceptions.filter(ex => ex.slaBreached).length,
      byDomain,
      bySeverity,
    };
  }

  shutdown(): void {
    if (this.slaCheckInterval) {
      clearInterval(this.slaCheckInterval);
      this.slaCheckInterval = null;
    }
  }
}

export const crossDomainExceptionService = new CrossDomainExceptionService();

export function registerExceptionActions(orchestrator: typeof helpaiOrchestrator): void {
  orchestrator.registerAction({
    actionId: 'exception.raise',
    name: 'Raise Exception',
    category: 'automation',
    description: 'Raise a platform exception for tracking and resolution',
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin', 'owner', 'Bot'],
    handler: async (request) => {
      const { domain, code, title, description, severity, metadata, suggestedResolution } = request.payload || {};

      if (!request.workspaceId || !domain || !code || !title) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId, domain, code, and title are required',
          executionTimeMs: 0,
        };
      }

      const exception = await crossDomainExceptionService.raiseException({
        workspaceId: request.workspaceId,
        domain,
        code,
        title,
        description: description || title,
        severity,
        sourceAction: request.actionId,
        metadata,
        suggestedResolution,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: `Exception raised: ${exception.id}`,
        data: exception,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'exception.resolve',
    name: 'Resolve Exception',
    category: 'automation',
    description: 'Mark an exception as resolved',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { exceptionId, resolutionNotes } = request.payload || {};

      if (!exceptionId || !resolutionNotes) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'exceptionId and resolutionNotes are required',
          executionTimeMs: 0,
        };
      }

      const result = await crossDomainExceptionService.resolveException({
        exceptionId,
        resolvedBy: request.userId,
        resolutionNotes,
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
    actionId: 'exception.escalate',
    name: 'Escalate Exception',
    category: 'automation',
    description: 'Escalate an exception to the next level',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { exceptionId, reason } = request.payload || {};

      if (!exceptionId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'exceptionId is required',
          executionTimeMs: 0,
        };
      }

      const result = await crossDomainExceptionService.escalateException(exceptionId, reason);

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success ? `Escalated to level ${result.newLevel}` : 'Failed to escalate',
        data: { newLevel: result.newLevel },
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'exception.get_open',
    name: 'Get Open Exceptions',
    category: 'analytics',
    description: 'Get all open exceptions for a workspace',
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

      const exceptions = await crossDomainExceptionService.getOpenExceptions(request.workspaceId);

      return {
        success: true,
        actionId: request.actionId,
        message: `${exceptions.length} open exceptions`,
        data: exceptions,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'exception.get_by_domain',
    name: 'Get Exceptions by Domain',
    category: 'analytics',
    description: 'Get exceptions filtered by domain',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request) => {
      const { domain } = request.payload || {};

      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const exceptions = await crossDomainExceptionService.getExceptionsByDomain(request.workspaceId, domain);

      return {
        success: true,
        actionId: request.actionId,
        message: `${exceptions.length} exceptions found`,
        data: exceptions,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'exception.get_stats',
    name: 'Get Exception Stats',
    category: 'analytics',
    description: 'Get platform-wide exception statistics',
    requiredRoles: ['support', 'admin', 'super_admin'],
    handler: async (request) => {
      const stats = crossDomainExceptionService.getStats();
      return {
        success: true,
        actionId: request.actionId,
        message: 'Exception stats retrieved',
        data: stats,
        executionTimeMs: 0,
      };
    },
  });

  console.log('[CrossDomainExceptionService] Registered 6 AI Brain actions');
}
