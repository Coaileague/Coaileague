/**
 * Trinity Service Connector
 * =========================
 * Connects all 12 previously disconnected services to Trinity via platformEventBus.
 * 
 * Pattern: Service does work → Emit event → Trinity receives → Logs/Learns/Acts
 * 
 * Connected Services:
 * 1. Payroll Automation
 * 2. Email Automation  
 * 3. Dispute Resolution
 * 4. Compliance Monitoring
 * 5. Employee Patterns
 * 6. Report Workflow Engine
 * 7. PTO Accrual
 * 8. Breaks Service
 * 9. Heatmap Analytics
 * 10. Daily Digest
 * 11. Shift Reminders
 * 12. Performance Metrics
 */

import { platformEventBus } from './platformEventBus';

export interface TrinityServiceEvent {
  service: string;
  action: string;
  workspaceId: string;
  data: Record<string, any>;
  timestamp: Date;
}

/**
 * Emit payroll event to Trinity
 */
export async function emitPayrollEvent(
  workspaceId: string,
  employeeCount: number,
  totalAmount: number,
  exceptionsDetected: number,
  autoResolved: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Payroll Processed',
    description: `Payroll completed for ${employeeCount} employees - $${totalAmount.toLocaleString()}`,
    workspaceId,
    metadata: {
      automationType: 'payroll',
      employeeCount,
      totalAmount,
      exceptionsDetected,
      autoResolvedCount: autoResolved,
      autoResolveRate: exceptionsDetected > 0 ? Math.round((autoResolved / exceptionsDetected) * 100) : 100,
    },
  });
}

/**
 * Emit email automation event to Trinity
 */
export async function emitEmailEvent(
  workspaceId: string,
  emailType: string,
  recipientCount: number,
  successCount: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Emails Sent',
    description: `${emailType}: ${successCount}/${recipientCount} emails delivered`,
    workspaceId,
    metadata: {
      automationType: 'email',
      emailType,
      recipientCount,
      successCount,
      deliveryRate: recipientCount > 0 ? Math.round((successCount / recipientCount) * 100) : 0,
    },
  });
}

/**
 * Emit dispute resolution event to Trinity
 */
export async function emitDisputeEvent(
  workspaceId: string,
  disputeId: string,
  disputeType: string,
  resolution: 'approved' | 'denied' | 'escalated',
  autoResolved: boolean
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Dispute Resolved',
    description: `Time entry dispute ${resolution}${autoResolved ? ' (auto-resolved by Trinity)' : ''}`,
    workspaceId,
    metadata: {
      automationType: 'dispute_resolution',
      disputeId,
      disputeType,
      resolution,
      autoResolved,
    },
  });
}

/**
 * Emit compliance check event to Trinity
 */
export async function emitComplianceEvent(
  workspaceId: string,
  checksRun: number,
  violationsFound: number,
  criticalCount: number,
  autoRemediatedCount: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Compliance Check Complete',
    description: `${checksRun} checks run - ${violationsFound} violations${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}`,
    workspaceId,
    metadata: {
      automationType: 'compliance',
      complianceCheck: true,
      checksRun,
      violationsFound,
      criticalCount,
      autoRemediatedCount,
    },
  });
}

/**
 * Emit employee pattern analysis event to Trinity
 */
export async function emitPatternEvent(
  workspaceId: string,
  employeeId: string,
  patterns: {
    callInRate: number;
    preferredShifts: string[];
    performanceTrend: 'improving' | 'stable' | 'declining';
    reliabilityScore: number;
  }
): Promise<void> {
  await platformEventBus.publish({
    type: 'ai_brain_action',
    category: 'ai_brain',
    title: 'Employee Pattern Updated',
    description: `Pattern analysis for employee ${employeeId}`,
    workspaceId,
    metadata: {
      automationType: 'pattern_analysis',
      employeeId,
      ...patterns,
    },
  });
}

/**
 * Emit report generation event to Trinity
 */
export async function emitReportEvent(
  workspaceId: string,
  reportType: string,
  reportId: string,
  recipientCount: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Report Generated',
    description: `${reportType} report generated and sent to ${recipientCount} recipients`,
    workspaceId,
    metadata: {
      automationType: 'report_generation',
      reportType,
      reportId,
      recipientCount,
    },
  });
}

/**
 * Emit PTO accrual event to Trinity
 */
export async function emitPTOEvent(
  workspaceId: string,
  employeesProcessed: number,
  totalHoursAccrued: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'PTO Accrual Complete',
    description: `${totalHoursAccrued} hours accrued for ${employeesProcessed} employees`,
    workspaceId,
    metadata: {
      automationType: 'pto_accrual',
      employeesProcessed,
      totalHoursAccrued,
    },
  });
}

/**
 * Emit break compliance event to Trinity
 */
export async function emitBreakEvent(
  workspaceId: string,
  breaksScheduled: number,
  breaksTaken: number,
  complianceRate: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Break Compliance Update',
    description: `${breaksTaken}/${breaksScheduled} breaks taken (${complianceRate}% compliance)`,
    workspaceId,
    metadata: {
      automationType: 'break_compliance',
      breaksScheduled,
      breaksTaken,
      complianceRate,
    },
  });
}

/**
 * Emit heatmap analytics event to Trinity
 */
export async function emitHeatmapEvent(
  workspaceId: string,
  heatmapType: 'coverage' | 'demand' | 'performance',
  dataPoints: number,
  insights: string[]
): Promise<void> {
  await platformEventBus.publish({
    type: 'ai_brain_action',
    category: 'ai_brain',
    title: 'Heatmap Analysis Complete',
    description: `${heatmapType} heatmap generated with ${dataPoints} data points`,
    workspaceId,
    metadata: {
      automationType: 'heatmap_analysis',
      heatmapType,
      dataPoints,
      insights,
    },
  });
}

/**
 * Emit daily digest event to Trinity
 */
export async function emitDigestEvent(
  workspaceId: string,
  digestType: 'daily' | 'weekly',
  recipientCount: number,
  keyMetrics: Record<string, number>
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: 'Digest Sent',
    description: `${digestType} digest sent to ${recipientCount} users`,
    workspaceId,
    metadata: {
      automationType: 'digest',
      digestType,
      recipientCount,
      keyMetrics,
    },
  });
}

/**
 * Emit shift reminder event to Trinity
 */
export async function emitShiftReminderEvent(
  workspaceId: string,
  employeeId: string,
  shiftId: string,
  startTime: string,
  siteName: string,
  minutesUntilShift: number
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'schedule',
    title: 'Shift Reminder Sent',
    description: `Reminder sent for shift starting in ${minutesUntilShift} minutes`,
    workspaceId,
    metadata: {
      automationType: 'shift_reminder',
      shiftReminder: true,
      employeeId,
      shiftId,
      startTime,
      siteName,
      minutesUntilShift,
    },
  });
}

/**
 * Emit performance metrics event to Trinity
 */
export async function emitPerformanceEvent(
  workspaceId: string,
  employeeId: string,
  metrics: {
    attendanceRate: number;
    clientRating: number;
    reliabilityScore: number;
    overallScore: number;
  }
): Promise<void> {
  await platformEventBus.publish({
    type: 'ai_brain_action',
    category: 'ai_brain',
    title: 'Performance Metrics Updated',
    description: `Employee score: ${metrics.overallScore}/100`,
    workspaceId,
    metadata: {
      automationType: 'performance_metrics',
      employeeId,
      ...metrics,
    },
  });
}

/**
 * Generic service connector - use for any service
 */
export async function connectServiceToTrinity(
  serviceName: string,
  workspaceId: string,
  action: string,
  data: Record<string, any>
): Promise<void> {
  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: `${serviceName} Action`,
    description: `${serviceName}: ${action}`,
    workspaceId,
    metadata: {
      automationType: serviceName.toLowerCase().replace(/\s+/g, '_'),
      action,
      ...data,
    },
  });
}

export const trinityServiceConnector = {
  emitPayrollEvent,
  emitEmailEvent,
  emitDisputeEvent,
  emitComplianceEvent,
  emitPatternEvent,
  emitReportEvent,
  emitPTOEvent,
  emitBreakEvent,
  emitHeatmapEvent,
  emitDigestEvent,
  emitShiftReminderEvent,
  emitPerformanceEvent,
  connectServiceToTrinity,
};
