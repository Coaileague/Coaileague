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
import type { ActionRequest, ActionResult } from '../../helpai/helpaiActionOrchestrator';

export interface CoreSubagentActionContext {
  userId: string;
  userRole: string;
  workspaceId: string;
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
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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
      
      const forecasts = await schedulingSubagent.generateStaffingForecast(workspaceId, weeksAhead);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Generated ${forecasts.length}-week staffing forecast with ${forecasts.reduce((sum, f) => sum + f.recommendations.length, 0)} recommendations`,
        data: { forecasts },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'scheduling.resolve_conflicts',
    name: 'Intelligent Conflict Resolution',
    category: 'scheduling',
    description: 'Resolve scheduling conflicts with AI-powered alternative suggestions',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, proposedShifts } = request.payload || {};
      
      if (!workspaceId || !proposedShifts) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, proposedShifts',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const resolutions = await schedulingSubagent.resolveSchedulingConflicts(workspaceId, proposedShifts);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Resolved ${resolutions.length} scheduling conflicts`,
        data: { resolutions, conflictCount: resolutions.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'scheduling.validate_compliance',
    name: 'Schedule Compliance Check',
    category: 'scheduling',
    description: 'Validate schedule against labor law compliance guardrails',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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
      
      const compliance = await schedulingSubagent.validateScheduleCompliance(workspaceId, scheduleData);
      
      return {
        success: true,
        actionId: request.actionId,
        message: compliance.isCompliant 
          ? `Schedule is compliant (${compliance.appliedRules.length} rules validated)`
          : `${compliance.violations.length} compliance violations found`,
        data: { compliance },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'scheduling.suggest_swap',
    name: 'Intelligent Shift Swap',
    category: 'scheduling',
    description: 'Suggest qualified replacements for shift swapping',
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin', 'owner'],
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
      
      const suggestion = await schedulingSubagent.suggestShiftReplacements(workspaceId, shiftId);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${suggestion.suggestedReplacements.length} qualified replacements`,
        data: { suggestion },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'scheduling.generate_optimized',
    name: 'AI-Optimized Schedule Generation',
    category: 'scheduling',
    description: 'Generate optimized weekly schedule using Gemini 3 Pro Deep Think mode',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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
        data: { result },
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
    description: 'Execute payroll with distributed tracing, circuit breaker, and idempotency',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, payPeriodStart, payPeriodEnd, validateOnly, forceReprocess } = request.payload || {};
      
      if (!workspaceId || !payPeriodStart || !payPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, payPeriodStart, payPeriodEnd',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const result = await payrollSubagent.executePayroll(
        workspaceId,
        new Date(payPeriodStart),
        new Date(payPeriodEnd),
        { validateOnly, forceReprocess }
      );
      
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Payroll executed: $${result.totalGross.toFixed(2)} gross for ${result.employeeCount} employees (Trace: ${result.traceId})`
          : `Payroll failed: ${result.issues[0]?.description || 'Unknown error'}`,
        data: { 
          result,
          circuitBreakerState: payrollSubagent.getCircuitBreakerState(),
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
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'payroll.get_circuit_status',
    name: 'Payroll Circuit Breaker Status',
    category: 'payroll',
    description: 'Get current circuit breaker state for payroll service',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
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
    actionId: 'invoice.generate_traced',
    name: 'Generate Invoice (Traced)',
    category: 'invoicing',
    description: 'Generate invoice with distributed tracing and idempotency protection',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, clientId, billingPeriodStart, billingPeriodEnd, includeUnbilledOnly, dueInDays } = request.payload || {};
      
      if (!workspaceId || !clientId || !billingPeriodStart || !billingPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, clientId, billingPeriodStart, billingPeriodEnd',
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
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'invoice.batch_generate',
    name: 'Batch Invoice Generation',
    category: 'invoicing',
    description: 'Generate invoices for all clients with unbilled work',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, billingPeriodStart, billingPeriodEnd } = request.payload || {};
      
      if (!workspaceId || !billingPeriodStart || !billingPeriodEnd) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, billingPeriodStart, billingPeriodEnd',
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
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'invoice.reconcile_payments',
    name: 'Payment Reconciliation',
    category: 'invoicing',
    description: 'Reconcile payments with invoices and identify discrepancies',
    requiredRoles: ['admin', 'super_admin', 'owner'],
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
      
      const result = await invoiceSubagent.reconcilePayments(workspaceId);
      
      return {
        success: true,
        actionId: request.actionId,
        message: result.reconciled 
          ? `All payments reconciled (${result.invoicesMatched} invoices matched)`
          : `${result.discrepancies.length} discrepancies found ($${result.revenueAtRisk.toFixed(2)} at risk)`,
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'invoice.detect_revenue_gaps',
    name: 'Revenue Gap Detection',
    category: 'invoicing',
    description: 'Detect unbilled revenue gaps with AI insights',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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
      
      const result = await invoiceSubagent.detectRevenueGaps(workspaceId, lookbackDays);
      
      return {
        success: true,
        actionId: request.actionId,
        message: result.unbilledRevenue > 0 
          ? `$${result.unbilledRevenue.toFixed(2)} unbilled revenue detected across ${result.clientGaps.length} clients`
          : 'No unbilled revenue gaps detected',
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // NOTIFICATION SUBAGENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'notify.send_priority',
    name: 'Send Priority Notification',
    category: 'notifications',
    description: 'Send tiered notification (P0/P1/P2) with smart bundling',
    requiredRoles: ['manager', 'admin', 'super_admin', 'owner'],
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

  orchestrator.registerAction({
    actionId: 'notify.send_critical',
    name: 'Send Critical Alert (P0)',
    category: 'notifications',
    description: 'Send P0 critical alert to multiple users immediately',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
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

  orchestrator.registerAction({
    actionId: 'notify.bulk_by_role',
    name: 'Bulk Notify by Role',
    category: 'notifications',
    description: 'Send personalized notifications to users by role',
    requiredRoles: ['admin', 'super_admin', 'owner'],
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

  orchestrator.registerAction({
    actionId: 'notify.get_stats',
    name: 'Notification Statistics',
    category: 'notifications',
    description: 'Get notification delivery statistics by priority tier',
    requiredRoles: ['admin', 'super_admin', 'owner'],
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

  console.log('[AI Brain Master Orchestrator] Registered 17 Core Subagent actions (Scheduling: 5, Payroll: 3, Invoice: 4, Notification: 5)');
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
    { id: 'scheduling.resolve_conflicts', description: 'Resolve scheduling conflicts with AI suggestions', category: 'scheduling', requiredRole: 'manager' },
    { id: 'scheduling.validate_compliance', description: 'Validate schedule against labor law compliance', category: 'scheduling', requiredRole: 'manager' },
    { id: 'scheduling.suggest_swap', description: 'Suggest qualified shift swap replacements', category: 'scheduling', requiredRole: 'employee' },
    { id: 'scheduling.generate_optimized', description: 'Generate AI-optimized schedule (Deep Think)', category: 'scheduling', requiredRole: 'manager' },
    // Payroll
    { id: 'payroll.execute_with_tracing', description: 'Execute payroll with tracing and idempotency', category: 'payroll', requiredRole: 'admin' },
    { id: 'payroll.detect_anomalies_ai', description: 'AI-powered payroll anomaly detection', category: 'payroll', requiredRole: 'manager' },
    { id: 'payroll.get_circuit_status', description: 'Payroll service circuit breaker status', category: 'payroll', requiredRole: 'admin' },
    // Invoice
    { id: 'invoice.generate_traced', description: 'Generate invoice with tracing and idempotency', category: 'invoicing', requiredRole: 'manager' },
    { id: 'invoice.batch_generate', description: 'Batch generate invoices for all clients', category: 'invoicing', requiredRole: 'admin' },
    { id: 'invoice.reconcile_payments', description: 'Reconcile payments and identify discrepancies', category: 'invoicing', requiredRole: 'admin' },
    { id: 'invoice.detect_revenue_gaps', description: 'Detect unbilled revenue with AI insights', category: 'invoicing', requiredRole: 'manager' },
    // Notifications
    { id: 'notify.send_priority', description: 'Send tiered notification with smart bundling', category: 'notifications', requiredRole: 'manager' },
    { id: 'notify.send_critical', description: 'Send P0 critical alert immediately', category: 'notifications', requiredRole: 'admin' },
    { id: 'notify.bulk_by_role', description: 'Bulk notify users by role with personalization', category: 'notifications', requiredRole: 'admin' },
    { id: 'notify.get_stats', description: 'Get notification statistics by tier', category: 'notifications', requiredRole: 'admin' },
  ];
}
