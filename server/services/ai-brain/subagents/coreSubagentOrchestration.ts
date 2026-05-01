/**
 * CORE SUBAGENT ORCHESTRATION ACTIONS
 * ====================================
 * Registers Fortune 500-grade core subagent actions with Trinity AI Brain.
 * Enables Trinity to orchestrate Scheduling, Payroll, and Invoice operations.
 */

import { schedulingSubagent } from './schedulingSubagent';
import { payrollSubagent } from './payrollSubagent';
import { invoiceSubagent } from './invoiceSubagent';
import { notificationSubagent, NotificationPriority } from './notificationSubagent';
import type { ActionRequest, ActionResult } from '../../helpai/platformActionHub';
import { trinityActionReasoner, ActionDomain } from '../trinityActionReasoner';
import { storage } from '../../../storage';
import { generateWithOpenAI } from '../providers/openaiClient';
import { createLogger } from '../../../lib/logger';
const log = createLogger('coreSubagentOrchestration');

export interface CoreSubagentActionContext {
  userId: string;
  userRole: string;
  workspaceId: string;
}

/**
 * Run Trinity's pre-action reasoning before delegating to a subagent.
 * Returns a blocked ActionResult if Trinity says 'block', null otherwise.
 * Escalation decisions are non-blocking — the handler proceeds but adds metadata.
 */
async function trinityReason(
  request: ActionRequest,
  domain: ActionDomain,
  actionSummary: string,
  startTime: number
): Promise<{ blocked: ActionResult | null; escalated: boolean; reasoning?: { laborLawFlags: string[]; recommendations: string[] } }> {
  try {
    const workspaceId = request.workspaceId || request.payload?.workspaceId;
    if (!workspaceId) return { blocked: null, escalated: false };

    const reasoning = await trinityActionReasoner.reason({
      domain,
      workspaceId,
      userId: request.userId,
      actionSummary,
      payload: request.payload || {},
    });

    if (reasoning.decision === 'block') {
      return {
        blocked: {
          success: false,
          actionId: request.actionId,
          message: `Trinity blocked this action: ${reasoning.blockReason || reasoning.reasoning}`,
          data: {
            blockedBy: 'trinity_action_reasoner',
            laborLawFlags: reasoning.laborLawFlags,
            recommendations: reasoning.recommendations,
            confidence: reasoning.confidence,
          },
          executionTimeMs: Date.now() - startTime,
        },
        escalated: false,
      };
    }

    return {
      blocked: null,
      escalated: reasoning.decision === 'escalate',
      reasoning: { laborLawFlags: reasoning.laborLawFlags, recommendations: reasoning.recommendations },
    };
  } catch {
    return { blocked: null, escalated: false };
  }
}

/**
 * Register Core Subagent actions with Platform Action Hub
 */
export function registerCoreSubagentActions(orchestrator: any): void {
  // ============================================================================
  // SCHEDULING SUBAGENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'scheduling.forecast_staffing',
    name: 'AI Staffing Forecast',
    category: 'scheduling',
    description: 'Generate predictive staffing forecast using historical data and AI analysis',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, weeksAhead = 2 } = request.payload || {};
      
      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'scheduling_optimize', `Staffing forecast: ${weeksAhead} weeks ahead`, startTime);
      if (gate.blocked) return gate.blocked;

      const forecasts = await schedulingSubagent.generateStaffingForecast(workspaceId, weeksAhead);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Generated ${forecasts.length}-week staffing forecast with ${forecasts.reduce((sum, f) => sum + f.recommendations.length, 0)} recommendations`,
        data: { forecasts, trinityEscalated: gate.escalated, trinityFlags: gate.reasoning?.laborLawFlags },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // scheduling.resolve_conflicts removed — canonical: scheduling.resolve_conflict in trinityScheduleTimeclockActions.ts

  orchestrator.registerAction({
    actionId: 'scheduling.validate_compliance',
    name: 'Schedule Compliance Check',
    category: 'scheduling',
    description: 'Validate schedule against labor law compliance guardrails',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, scheduleData } = request.payload || {};
      
      if (!workspaceId || !scheduleData) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, scheduleData',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'compliance_check', 'Schedule compliance validation', startTime);
      if (gate.blocked) return gate.blocked;

      const compliance = await schedulingSubagent.validateScheduleCompliance(workspaceId, scheduleData);
      
      return {
        success: true,
        actionId: request.actionId,
        message: compliance.isCompliant 
          ? `Schedule is compliant (${compliance.appliedRules.length} rules validated)`
          : `${compliance.violations.length} compliance violations found`,
        data: { compliance, trinityFlags: gate.reasoning?.laborLawFlags },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'scheduling.suggest_swap',
    name: 'Intelligent Shift Swap',
    category: 'scheduling',
    description: 'Suggest qualified replacements for shift swapping',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, shiftId } = request.payload || {};
      
      if (!workspaceId || !shiftId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, shiftId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'scheduling_fill', `Suggest shift swap replacements for shift ${shiftId}`, startTime);
      if (gate.blocked) return gate.blocked;

      const suggestion = await schedulingSubagent.suggestShiftReplacements(workspaceId, shiftId);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${suggestion.suggestedReplacements.length} qualified replacements`,
        data: { suggestion, trinityEscalated: gate.escalated },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'scheduling.generate_optimized',
    name: 'AI-Optimized Schedule Generation',
    category: 'scheduling',
    description: 'Generate optimized weekly schedule using Gemini 3 Pro Deep Think mode',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, weekStart, constraints } = request.payload || {};
      
      if (!workspaceId || !weekStart) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, weekStart',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'scheduling_generate', `Generate optimized schedule for week of ${weekStart}`, startTime);
      if (gate.blocked) return gate.blocked;

      const result = await schedulingSubagent.generateOptimizedSchedule(
        workspaceId,
        new Date(weekStart),
        constraints || {
          minimumCoverage: 80,
          maxOvertimePercent: 10,
          prioritizePreferences: true,
          balanceWorkload: true,
        }
      );
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Generated optimized schedule with ${result.schedule.length} shifts (${result.metrics.coveragePercent.toFixed(0)}% coverage)`,
        data: { result, trinityEscalated: gate.escalated, trinityFlags: gate.reasoning?.laborLawFlags },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // PAYROLL SUBAGENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'payroll.execute_with_tracing',
    name: 'Execute Payroll (Traced)',
    category: 'payroll',
    description: 'Execute payroll with distributed tracing, circuit breaker, and idempotency. Requires humanConfirmed=true to run live — otherwise runs in preview (validateOnly) mode.',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, payPeriodStart, payPeriodEnd, validateOnly, forceReprocess, humanConfirmed } = request.payload || {};
      
      if (!workspaceId || !payPeriodStart || !payPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, payPeriodStart, payPeriodEnd',
          executionTimeMs: Date.now() - startTime
        };
      }

      // MONEY GATE: Trinity cannot self-approve a live payroll run.
      // If humanConfirmed is not explicitly true, force validateOnly=true (preview mode).
      // A human must review the preview result and re-invoke with humanConfirmed=true.
      const isLiveRun = !validateOnly && humanConfirmed === true;
      const effectiveValidateOnly = !isLiveRun;

      const gate = await trinityReason(request, 'payroll_execute',
        `${effectiveValidateOnly ? 'PREVIEW' : 'EXECUTE'} payroll for period ${payPeriodStart} – ${payPeriodEnd}`, startTime);
      if (gate.blocked) return gate.blocked;

      const result = await payrollSubagent.executePayroll(
        workspaceId,
        new Date(payPeriodStart),
        new Date(payPeriodEnd),
        { validateOnly: effectiveValidateOnly, forceReprocess }
      );

      if (effectiveValidateOnly && !validateOnly) {
        return {
          success: true,
          actionId: request.actionId,
          message: `Payroll preview ready: $${result.totalGross.toFixed(2)} gross for ${result.employeeCount} employees. To execute, a manager must re-run this action with humanConfirmed=true.`,
          data: {
            preview: true,
            requiresHumanConfirmation: true,
            result,
            circuitBreakerState: payrollSubagent.getCircuitBreakerState(),
            trinityEscalated: gate.escalated,
            trinityFlags: gate.reasoning?.laborLawFlags,
          },
          executionTimeMs: Date.now() - startTime
        };
      }
      
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Payroll executed: $${result.totalGross.toFixed(2)} gross for ${result.employeeCount} employees (Trace: ${result.traceId})`
          : `Payroll failed: ${result.issues[0]?.description || 'Unknown error'}`,
        data: { 
          result,
          circuitBreakerState: payrollSubagent.getCircuitBreakerState(),
          trinityEscalated: gate.escalated,
          trinityFlags: gate.reasoning?.laborLawFlags,
        },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'payroll.detect_anomalies_ai',
    name: 'AI Payroll Anomaly Detection',
    category: 'payroll',
    description: 'Detect payroll anomalies with AI-powered analysis',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, payPeriodStart, payPeriodEnd } = request.payload || {};
      
      if (!workspaceId || !payPeriodStart || !payPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, payPeriodStart, payPeriodEnd',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'payroll_anomaly',
        `Detect payroll anomalies for period ${payPeriodStart} – ${payPeriodEnd}`, startTime);
      if (gate.blocked) return gate.blocked;

      const result = await payrollSubagent.detectAnomalies(
        workspaceId,
        new Date(payPeriodStart),
        new Date(payPeriodEnd)
      );
      
      const highSeverity = result.anomalies.filter(a => a.severity === 'high').length;
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Detected ${result.anomalies.length} anomalies (${highSeverity} high severity)`,
        data: { result, trinityEscalated: gate.escalated, trinityRecommendations: gate.reasoning?.recommendations },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'payroll.get_circuit_status',
    name: 'Payroll Circuit Breaker Status',
    category: 'payroll',
    description: 'Get current circuit breaker state for payroll service',
    requiredRoles: ['org_owner', 'co_owner', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const state = payrollSubagent.getCircuitBreakerState();
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Circuit breaker state: ${state.state} (${state.failures} failures)`,
        data: { circuitBreakerState: state },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // INVOICE SUBAGENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'billing.generate_invoice_traced',
    name: 'Generate Invoice (Traced)',
    category: 'invoicing',
    description: 'Generate invoice with distributed tracing and idempotency protection',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, clientId, billingPeriodStart, billingPeriodEnd, includeUnbilledOnly, dueInDays, humanConfirmed } = request.payload || {};
      
      if (!workspaceId || !clientId || !billingPeriodStart || !billingPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, clientId, billingPeriodStart, billingPeriodEnd',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'invoice_generate',
        `Generate invoice for client ${clientId} — period ${billingPeriodStart} to ${billingPeriodEnd}`, startTime);
      if (gate.blocked) return gate.blocked;

      if (humanConfirmed !== true) {
        return {
          success: false,
          requiresHumanConfirmation: true,
          actionId: request.actionId,
          message: `Invoice generation queued for review: client ${clientId}, period ${billingPeriodStart} to ${billingPeriodEnd}. A manager must re-run this action with humanConfirmed: true to finalize.`,
          data: { previewOnly: true, requiresHumanConfirmation: true, clientId, billingPeriodStart, billingPeriodEnd, trinityReasoning: gate.reasoning },
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await invoiceSubagent.generateInvoice(
        workspaceId,
        clientId,
        new Date(billingPeriodStart),
        new Date(billingPeriodEnd),
        { includeUnbilledOnly, dueInDays }
      );
      
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Invoice ${result.invoiceNumber} generated: $${result.totalAmount.toFixed(2)} (${result.lineItemCount} items)`
          : `Invoice generation failed: ${result.issues[0]?.description || 'Unknown error'}`,
        data: { result, trinityEscalated: gate.escalated, trinityFlags: gate.reasoning?.laborLawFlags },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'billing.batch_generate_invoices',
    name: 'Batch Invoice Generation',
    category: 'invoicing',
    description: 'Generate invoices for all clients with unbilled work',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, billingPeriodStart, billingPeriodEnd, humanConfirmed } = request.payload || {};
      
      if (!workspaceId || !billingPeriodStart || !billingPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, billingPeriodStart, billingPeriodEnd',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'invoice_generate',
        `Batch invoice generation for period ${billingPeriodStart} – ${billingPeriodEnd}`, startTime);
      if (gate.blocked) return gate.blocked;

      if (humanConfirmed !== true) {
        return {
          success: false,
          requiresHumanConfirmation: true,
          actionId: request.actionId,
          message: `Batch invoice generation queued for review: period ${billingPeriodStart} to ${billingPeriodEnd}. A manager must re-run this action with humanConfirmed: true to finalize.`,
          data: { previewOnly: true, requiresHumanConfirmation: true, billingPeriodStart, billingPeriodEnd, trinityReasoning: gate.reasoning },
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await invoiceSubagent.generateBatchInvoices(
        workspaceId,
        new Date(billingPeriodStart),
        new Date(billingPeriodEnd)
      );
      
      return {
        success: result.failedClients.length === 0,
        actionId: request.actionId,
        message: `Generated ${result.totalGenerated} invoices ($${result.totalRevenue.toFixed(2)} total revenue)${result.failedClients.length > 0 ? `, ${result.failedClients.length} failed` : ''}`,
        data: { result, trinityEscalated: gate.escalated, trinityFlags: gate.reasoning?.laborLawFlags },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'billing.reconcile_payments',
    name: 'Payment Reconciliation',
    category: 'invoicing',
    description: 'Reconcile payments with invoices and identify discrepancies',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId } = request.payload || {};
      
      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'invoice_reconcile', 'Payment reconciliation — match invoices to payments', startTime);
      if (gate.blocked) return gate.blocked;

      const result = await invoiceSubagent.reconcilePayments(workspaceId);
      
      return {
        success: true,
        actionId: request.actionId,
        message: result.reconciled 
          ? `All payments reconciled (${result.invoicesMatched} invoices matched)`
          : `${result.discrepancies.length} discrepancies found ($${result.revenueAtRisk.toFixed(2)} at risk)`,
        data: { result, trinityEscalated: gate.escalated, trinityRecommendations: gate.reasoning?.recommendations },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'billing.detect_revenue_gaps',
    name: 'Revenue Gap Detection',
    category: 'invoicing',
    description: 'Detect unbilled revenue gaps with AI insights',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, lookbackDays = 90 } = request.payload || {};
      
      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const gate = await trinityReason(request, 'invoice_reconcile',
        `Revenue gap detection — ${lookbackDays} day lookback for unbilled work`, startTime);
      if (gate.blocked) return gate.blocked;

      const result = await invoiceSubagent.detectRevenueGaps(workspaceId, lookbackDays);
      
      return {
        success: true,
        actionId: request.actionId,
        message: result.unbilledRevenue > 0 
          ? `$${result.unbilledRevenue.toFixed(2)} unbilled revenue detected across ${result.clientGaps.length} clients`
          : 'No unbilled revenue gaps detected',
        data: { result, trinityEscalated: gate.escalated, trinityRecommendations: gate.reasoning?.recommendations },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // NOTIFICATION SUBAGENT ACTIONS
  // ============================================================================

  /* notify.send_priority — consolidated into notify.send (use priority='P0'/'P1'/'P2' param)
    orchestrator.registerAction({
      actionId: 'notify.send_priority',
      name: 'Send Priority Notification',
      category: 'notifications',
      description: 'Send tiered notification (P0/P1/P2) with smart bundling',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const startTime = Date.now();
        const { workspaceId, userId, priority, type, title, message, actionUrl } = request.payload || {};
        
        if (!workspaceId || !userId || !priority || !title || !message) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required fields: workspaceId, userId, priority, title, message',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        const result = await notificationSubagent.sendNotification(workspaceId, userId, {
          priority: priority as NotificationPriority,
          type: type || 'general',
          title,
          message,
          actionUrl,
        });
        
        return {
          success: result.success,
          actionId: request.actionId,
          message: result.success 
            ? (result.bundled ? `Notification bundled for delivery` : `Notification sent via ${result.deliveredVia.join(', ')}`)
            : (result.suppressedReason || 'Notification suppressed'),
          data: { result },
          executionTimeMs: Date.now() - startTime
        };
      }
    });
  */

  /* notify.send_critical — consolidated into notify.send (use priority='critical' or 'P0' param)
    orchestrator.registerAction({
      actionId: 'notify.send_critical',
      name: 'Send Critical Alert (P0)',
      category: 'notifications',
      description: 'Send P0 critical alert to multiple users immediately',
      requiredRoles: ['org_owner', 'co_owner', 'sysop', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const startTime = Date.now();
        const { workspaceId, userIds, title, message, actionUrl } = request.payload || {};
        
        if (!workspaceId || !userIds || !title || !message) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required fields: workspaceId, userIds, title, message',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        const result = await notificationSubagent.sendCriticalAlert(workspaceId, userIds, {
          title,
          message,
          actionUrl,
        });
        
        return {
          success: result.delivered > 0,
          actionId: request.actionId,
          message: `P0 CRITICAL: Delivered to ${result.delivered}/${userIds.length} users via ${result.channels.join(', ')}`,
          data: { result },
          executionTimeMs: Date.now() - startTime
        };
      }
    });
  */

  /* notify.bulk_by_role — consolidated into notify.broadcast (use scope='role' + targetRoles param)
    orchestrator.registerAction({
      actionId: 'notify.bulk_by_role',
      name: 'Bulk Notify by Role',
      category: 'notifications',
      description: 'Send personalized notifications to users by role',
      requiredRoles: ['org_owner', 'co_owner'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const startTime = Date.now();
        const { workspaceId, targetRoles, priority, type, title, message, personalizeByRole } = request.payload || {};
        
        if (!workspaceId || !targetRoles || !title || !message) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required fields: workspaceId, targetRoles, title, message',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        const result = await notificationSubagent.sendBulkNotification(
          workspaceId,
          targetRoles,
          {
            priority: priority || 'P2',
            type: type || 'announcement',
            title,
            message,
          },
          personalizeByRole !== false
        );
        
        return {
          success: true,
          actionId: request.actionId,
          message: `Sent: ${result.sent}, Bundled: ${result.bundled}, Suppressed: ${result.suppressed}`,
          data: { result },
          executionTimeMs: Date.now() - startTime
        };
      }
    });
  */

  orchestrator.registerAction({
    actionId: 'notify.stats', // renamed from notify.get_stats; consumed by notify.manage action='stats'
    name: 'Notification Statistics',
    category: 'notifications',
    description: 'Get notification delivery statistics by priority tier',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, hours = 24 } = request.payload || {};
      
      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const stats = await notificationSubagent.getNotificationStats(workspaceId, hours);
      const tierConfig = notificationSubagent.getTierConfiguration();
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Last ${hours}h: ${stats.total} notifications (P0:${stats.byPriority.P0}, P1:${stats.byPriority.P1}, P2:${stats.byPriority.P2})`,
        data: { stats, tierConfig },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // MILEAGE RECOMMENDATION ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'expense.mileage_recommend',
    name: 'Mileage Log Recommendation',
    category: 'workforce',
    description: 'Analyze employee mileage logs and generate AI-powered reimbursement recommendations, anomaly alerts, and optimization insights',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, employeeId, lookbackDays = 30 } = request.payload || {};

      if (!workspaceId) {
        return { success: false, actionId: request.actionId, message: 'Missing required field: workspaceId', executionTimeMs: Date.now() - startTime };
      }

      const gate = await trinityReason(request, 'workforce_analytics',
        `Mileage log analysis — ${lookbackDays} day lookback${employeeId ? ` for employee ${employeeId}` : ' for all employees'}`, startTime);
      if (gate.blocked) return gate.blocked;

      const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const logs = await storage.getMileageLogsByWorkspace(workspaceId, {
        employeeId: employeeId || undefined,
        startDate: cutoff,
      });

      const employees = await storage.getEmployee(workspaceId);
      const employeeMap = Object.fromEntries(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

      const IRS_RATE = 0.70;
      const logSummary = logs.map(l => ({
        employee: employeeMap[l.employeeId] || l.employeeId,
        date: l.tripDate,
        miles: parseFloat(String(l.miles)),
        ratePerMile: parseFloat(String(l.ratePerMile || 0.67)),
        reimbursement: parseFloat(String(l.reimbursementAmount || 0)),
        status: l.status,
        purpose: l.purpose,
        tripType: l.tripType,
        from: l.startLocation,
        to: l.endLocation,
      }));

      const totalMiles = logSummary.reduce((s, l) => s + l.miles, 0);
      const totalReimbursement = logSummary.reduce((s, l) => s + l.reimbursement, 0);
      const pendingLogs = logSummary.filter(l => l.status === 'submitted');
      const unsubmittedLogs = logSummary.filter(l => l.status === 'draft');

      const prompt = `You are Trinity, an AI workforce analyst for a security company. Analyze these mileage logs from the last ${lookbackDays} days and generate actionable recommendations.

DATA SUMMARY:
- Total logs: ${logs.length}
- Total miles: ${totalMiles.toFixed(1)} mi
- Total reimbursement value: $${totalReimbursement.toFixed(2)}
- Pending approval: ${pendingLogs.length} logs
- Unsubmitted drafts: ${unsubmittedLogs.length} logs
- Current workspace rate: $${logSummary[0]?.ratePerMile || 0.67}/mi
- IRS 2025 standard rate: $${IRS_RATE}/mi

DETAILED LOGS:
${JSON.stringify(logSummary.slice(0, 50), null, 2)}

Generate a JSON response with this exact structure:
{
  "recommendations": [
    {
      "type": "action" | "alert" | "insight" | "optimization",
      "priority": "high" | "medium" | "low",
      "title": "brief title",
      "description": "detailed description with specific data",
      "affectedEmployees": ["name1", "name2"],
      "estimatedImpact": "$X.XX or X miles"
    }
  ],
  "summary": {
    "totalMiles": number,
    "totalReimbursement": number,
    "pendingApproval": number,
    "flaggedAnomalies": number,
    "rateCompliant": boolean
  }
}

Focus on: pending approvals that need attention, unsubmitted drafts reminders, rate vs IRS standard gaps, duplicate or unusual trips, high-mileage employees who may need a company vehicle, patterns worth noting.`;

      let recommendations: any[] = [];
      let aiSummary: any = {};
      try {
        const aiResponse = await generateWithOpenAI({
          model: 'gpt-4o',
          prompt,
          systemPrompt: 'You are Trinity AI analyst. Return only valid JSON matching the requested structure.',
          maxTokens: 1500,
          temperature: 0.3,
        });
        const parsed = JSON.parse(aiResponse.content);
        recommendations = parsed.recommendations || [];
        aiSummary = parsed.summary || {};
      } catch {
        recommendations = [
          pendingLogs.length > 0 ? { type: 'action', priority: 'high', title: `${pendingLogs.length} Mileage Logs Pending Approval`, description: `${pendingLogs.length} submitted logs are awaiting manager approval totalling $${pendingLogs.reduce((s, l) => s + l.reimbursement, 0).toFixed(2)}.`, affectedEmployees: [...new Set(pendingLogs.map(l => l.employee))], estimatedImpact: `$${pendingLogs.reduce((s, l) => s + l.reimbursement, 0).toFixed(2)}` } : null,
          unsubmittedLogs.length > 0 ? { type: 'alert', priority: 'medium', title: `${unsubmittedLogs.length} Unsubmitted Draft Logs`, description: `${unsubmittedLogs.length} mileage logs are saved as drafts and have not been submitted for reimbursement.`, affectedEmployees: [...new Set(unsubmittedLogs.map(l => l.employee))], estimatedImpact: `$${unsubmittedLogs.reduce((s, l) => s + l.reimbursement, 0).toFixed(2)}` } : null,
        ].filter(Boolean) as any[];
        aiSummary = { totalMiles, totalReimbursement, pendingApproval: pendingLogs.length, flaggedAnomalies: 0, rateCompliant: (logSummary[0]?.ratePerMile || 0.67) >= IRS_RATE };
      }

      return {
        success: true,
        actionId: request.actionId,
        message: `Mileage analysis complete: ${totalMiles.toFixed(1)} miles, $${totalReimbursement.toFixed(2)} reimbursement value, ${recommendations.length} recommendations generated`,
        data: { recommendations, summary: { ...aiSummary, totalMiles, totalReimbursement }, trinityEscalated: gate.escalated, trinityFlags: gate.reasoning?.laborLawFlags },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  log.info('[AI Brain Master Orchestrator] Registered 18 Core Subagent actions (Scheduling: 5, Payroll: 3, Invoice: 4, Notification: 5, Mileage: 1)');
}

/**
 * Get Core Subagent action definitions for Trinity awareness
 */
export function getCoreSubagentActionDefinitions(): Array<{
  id: string;
  description: string;
  category: string;
  requiredRole: string;
}> {
  return [
    // Scheduling
    { id: 'scheduling.forecast_staffing', description: 'AI staffing forecast with recommendations', category: 'scheduling', requiredRole: 'manager' },
    { id: 'scheduling.validate_compliance', description: 'Validate schedule against labor law compliance', category: 'scheduling', requiredRole: 'manager' },
    { id: 'scheduling.suggest_swap', description: 'Suggest qualified shift swap replacements', category: 'scheduling', requiredRole: 'employee' },
    { id: 'scheduling.generate_optimized', description: 'Generate AI-optimized schedule (Deep Think)', category: 'scheduling', requiredRole: 'manager' },
    // Payroll
    { id: 'payroll.execute_with_tracing', description: 'Execute payroll with tracing and idempotency', category: 'payroll', requiredRole: 'org_owner' },
    { id: 'payroll.detect_anomalies_ai', description: 'AI-powered payroll anomaly detection', category: 'payroll', requiredRole: 'manager' },
    { id: 'payroll.get_circuit_status', description: 'Payroll service circuit breaker status', category: 'payroll', requiredRole: 'org_owner' },
    // Invoice
    { id: 'billing.generate_invoice_traced', description: 'Generate invoice with tracing and idempotency', category: 'invoicing', requiredRole: 'manager' },
    { id: 'billing.batch_generate_invoices', description: 'Batch generate invoices for all clients', category: 'invoicing', requiredRole: 'org_owner' },
    { id: 'billing.reconcile_payments', description: 'Reconcile payments and identify discrepancies', category: 'invoicing', requiredRole: 'org_owner' },
    { id: 'billing.detect_revenue_gaps', description: 'Detect unbilled revenue with AI insights', category: 'invoicing', requiredRole: 'manager' },
    // Notifications
    { id: 'notify.send_priority', description: 'Send tiered notification with smart bundling', category: 'notifications', requiredRole: 'manager' },
    { id: 'notify.send_critical', description: 'Send P0 critical alert immediately', category: 'notifications', requiredRole: 'org_owner' },
    { id: 'notify.bulk_by_role', description: 'Bulk notify users by role with personalization', category: 'notifications', requiredRole: 'org_owner' },
    { id: 'notify.get_stats', description: 'Get notification statistics by tier', category: 'notifications', requiredRole: 'org_owner' },
    // Mileage
    { id: 'mileage.recommend', description: 'AI mileage log analysis with reimbursement recommendations', category: 'workforce', requiredRole: 'manager' },
  ];
}
