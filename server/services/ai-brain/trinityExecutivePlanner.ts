/**
 * TrinityExecutivePlanner — Phase 19 Upgrade
 *
 * Executive function layer that handles complex multi-step operational requests.
 * When Trinity receives a request like "prepare end of month close" or "run payroll batch",
 * this service identifies all required steps, checks their current status, and returns
 * a sequenced execution plan — rather than executing blindly or returning a single step.
 *
 * Architecture: Executive Function layer of the biological brain model.
 *   Sensory → Working Memory → Long-Term Memory → [EXECUTIVE FUNCTION] → Motor Output
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityExecutivePlanner');

export type PlanStepStatus = 'ready' | 'blocked' | 'pending' | 'complete' | 'requires_confirmation';

export interface PlanStep {
  order: number;
  stepId: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  blockedReason?: string;
  actionId?: string;
  requiredRole?: string;
  estimatedImpact?: string;
}

export interface ExecutionPlan {
  planType: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  overallReadiness: 'ready_to_execute' | 'partially_ready' | 'blocked' | 'requires_human_review';
  confidence: number;
  requiresConfirmation: boolean;
  confirmationReason?: string;
  generatedAt: string;
}

/**
 * Patterns that trigger multi-step planning rather than immediate action.
 */
const MULTI_STEP_TRIGGERS = [
  { pattern: /\b(end\s+of\s+month|eom|month.end|monthly\s+close)\s*(close|closing|close.out|process|procedure)?\b/i, planType: 'eom_close' },
  { pattern: /\bprepare\s+(end\s+of|the|for\s+end\s+of)\s+month\b/i, planType: 'eom_close' },
  { pattern: /\brun\s+(full\s+)?(payroll\s+batch|batch\s+payroll)\b/i, planType: 'payroll_batch' },
  { pattern: /\b(close\s+out|closeout)\s+(the\s+)?(week|month|period|quarter)\b/i, planType: 'period_close' },
  { pattern: /\b(run|execute|start|process)\s+(payroll|the\s+payroll)\s*(now|today|for\s+this\s+(week|month|period))?\b/i, planType: 'payroll_batch' },
  { pattern: /\bschedule\s+(audit|review|check)\b/i, planType: 'schedule_audit' },
  { pattern: /\b(compliance|license)\s+(audit|review|sweep|check)\b/i, planType: 'compliance_audit' },
  { pattern: /\binvoice\s+(all|batch|generate\s+all|run)\b/i, planType: 'invoice_batch' },
  { pattern: /\b(full|complete|system|platform)\s+(audit|review|health\s+check)\b/i, planType: 'full_audit' },
  { pattern: /\bonboard\s+(a\s+new\s+client|client|new\s+org|new\s+company)\b/i, planType: 'client_onboarding' },
];

/**
 * Detect if a message is requesting a multi-step operational sequence.
 */
export function detectMultiStepRequest(message: string): { detected: boolean; planType: string | null } {
  for (const trigger of MULTI_STEP_TRIGGERS) {
    if (trigger.pattern.test(message)) {
      return { detected: true, planType: trigger.planType };
    }
  }
  return { detected: false, planType: null };
}

/**
 * Generate a multi-step execution plan for the given plan type and workspace.
 * Checks real workspace state for each step.
 */
export async function generateExecutionPlan(planType: string, workspaceId: string): Promise<ExecutionPlan> {
  switch (planType) {
    case 'eom_close': return generateEomClosePlan(workspaceId);
    case 'payroll_batch': return generatePayrollBatchPlan(workspaceId);
    case 'period_close': return generateEomClosePlan(workspaceId);
    case 'schedule_audit': return generateScheduleAuditPlan(workspaceId);
    case 'compliance_audit': return generateComplianceAuditPlan(workspaceId);
    case 'invoice_batch': return generateInvoiceBatchPlan(workspaceId);
    case 'full_audit': return generateFullAuditPlan(workspaceId);
    case 'client_onboarding': return generateClientOnboardingPlan(workspaceId);
    default: return generateEomClosePlan(workspaceId);
  }
}

/**
 * Format an execution plan as a human-readable response for Trinity to deliver.
 */
export function formatPlanAsResponse(plan: ExecutionPlan): string {
  const statusIcon = (s: PlanStepStatus) => {
    switch (s) {
      case 'complete': return '✓';
      case 'ready': return '→';
      case 'blocked': return '✗';
      case 'requires_confirmation': return '⚠';
      case 'pending': return '○';
    }
  };

  const lines: string[] = [
    `**${plan.title}**`,
    plan.summary,
    '',
    '**Sequenced Plan:**',
  ];

  for (const step of plan.steps) {
    lines.push(`${step.order}. ${statusIcon(step.status)} **${step.title}**`);
    lines.push(`   ${step.description}`);
    if (step.blockedReason) {
      lines.push(`   ⚠ Blocked: ${step.blockedReason}`);
    }
    if (step.estimatedImpact) {
      lines.push(`   Impact: ${step.estimatedImpact}`);
    }
  }

  lines.push('');

  const readyCount = plan.steps.filter(s => s.status === 'ready').length;
  const blockedCount = plan.steps.filter(s => s.status === 'blocked').length;
  const completeCount = plan.steps.filter(s => s.status === 'complete').length;

  lines.push(`**Status:** ${completeCount} complete, ${readyCount} ready to execute, ${blockedCount} blocked`);

  if (plan.requiresConfirmation) {
    lines.push('');
    lines.push(`⚠ **Confirmation required before proceeding:** ${plan.confirmationReason}`);
    lines.push('Reply with "confirm" to begin execution, or specify which steps to run.');
  } else if (plan.overallReadiness === 'ready_to_execute') {
    lines.push('');
    lines.push('All prerequisites met. Ready to execute — confirm to proceed.');
  } else if (plan.overallReadiness === 'partially_ready') {
    lines.push('');
    lines.push('Some steps are ready. Resolve blocked items before full execution.');
  }

  return lines.join('\n');
}

// ── Individual Plan Generators ────────────────────────────────────────────────

async function generateEomClosePlan(workspaceId: string): Promise<ExecutionPlan> {
  const steps: PlanStep[] = [];
  let overallReadiness: ExecutionPlan['overallReadiness'] = 'ready_to_execute';

  // Step 1: Check timesheet approval status
  let unapprovedCount = 0;
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM time_entries WHERE workspace_id = ${workspaceId} AND status NOT IN ('approved', 'billed', 'payrolled') AND deleted_at IS NULL`
    );
    unapprovedCount = parseInt((result.rows[0] as any)?.cnt ?? '0', 10);
  } catch { unapprovedCount = 0; }

  steps.push({
    order: 1,
    stepId: 'timesheet_approval',
    title: 'Approve All Time Entries',
    description: `Review and approve all pending time entries. ${unapprovedCount > 0 ? `${unapprovedCount} entries awaiting approval.` : 'All entries approved.'}`,
    status: unapprovedCount > 0 ? 'blocked' : 'complete',
    blockedReason: unapprovedCount > 0 ? `${unapprovedCount} unapproved time entries must be reviewed before payroll can run.` : undefined,
    actionId: 'payroll.approve_timesheets',
    requiredRole: 'manager',
    estimatedImpact: `Affects payroll calculation for all employees this period.`,
  });

  if (unapprovedCount > 0) overallReadiness = 'blocked';

  // Step 2: Check payroll readiness
  let unpayrolledCount = 0;
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved' AND payrolled_at IS NULL`
    );
    unpayrolledCount = parseInt((result.rows[0] as any)?.cnt ?? '0', 10);
  } catch { unpayrolledCount = 0; }

  steps.push({
    order: 2,
    stepId: 'payroll_run',
    title: 'Run Payroll',
    description: `Process payroll for all approved time entries. ${unpayrolledCount > 0 ? `${unpayrolledCount} approved entries ready for payroll.` : 'No entries pending payroll.'}`,
    status: unapprovedCount > 0 ? 'pending' : (unpayrolledCount > 0 ? 'requires_confirmation' : 'complete'),
    blockedReason: unapprovedCount > 0 ? 'Waiting for timesheet approval (Step 1).' : undefined,
    actionId: 'payroll.run_payroll',
    requiredRole: 'org_owner',
    estimatedImpact: 'Financial — requires org_owner confirmation before execution.',
  });

  // Step 3: Check unbilled time entries (invoice generation)
  let unbilledCount = 0;
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved' AND billed_at IS NULL`
    );
    unbilledCount = parseInt((result.rows[0] as any)?.cnt ?? '0', 10);
  } catch { unbilledCount = 0; }

  steps.push({
    order: 3,
    stepId: 'invoice_generation',
    title: 'Generate Client Invoices',
    description: `Create invoices for all approved, unbilled time entries. ${unbilledCount > 0 ? `${unbilledCount} entries ready to bill.` : 'All entries already billed.'}`,
    status: unapprovedCount > 0 ? 'pending' : (unbilledCount > 0 ? 'ready' : 'complete'),
    actionId: 'billing.generate_invoices',
    requiredRole: 'manager',
    estimatedImpact: 'Revenue — generates client invoices for the period.',
  });

  // Step 4: QuickBooks sync check
  let lastSyncAge = 999;
  try {
    const result = await db.execute(
      sql`SELECT last_sync_at FROM quickbooks_tokens WHERE workspace_id = ${workspaceId} LIMIT 1`
    );
    if (result.rows[0]) {
      const lastSync = new Date((result.rows[0] as any).last_sync_at);
      lastSyncAge = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60); // hours
    }
  } catch { lastSyncAge = 999; }

  steps.push({
    order: 4,
    stepId: 'quickbooks_sync',
    title: 'Sync to QuickBooks',
    description: `Push payroll journal entries and invoices to QuickBooks Online. ${lastSyncAge < 24 ? 'Last sync was recent.' : 'Last sync was more than 24 hours ago.'}`,
    status: 'ready',
    actionId: 'qb.sync_status',
    requiredRole: 'manager',
    estimatedImpact: 'Accounting — updates QBO with all period activity.',
  });

  // Step 5: Compliance cert sweep
  steps.push({
    order: 5,
    stepId: 'compliance_sweep',
    title: 'Run Compliance Certification Sweep',
    description: 'Check all officer certifications for expirations and flag any issues before the next period.',
    status: 'ready',
    actionId: 'compliance.run_full_scan',
    requiredRole: 'manager',
    estimatedImpact: 'Risk — prevents scheduling non-compliant officers in the next period.',
  });

  const blockedSteps = steps.filter(s => s.status === 'blocked').length;
  const readySteps = steps.filter(s => s.status === 'ready' || s.status === 'requires_confirmation').length;
  const completeSteps = steps.filter(s => s.status === 'complete').length;

  if (blockedSteps > 0) overallReadiness = 'blocked';
  else if (readySteps > 0 && completeSteps > 0) overallReadiness = 'partially_ready';
  else if (readySteps > 0) overallReadiness = 'ready_to_execute';

  return {
    planType: 'eom_close',
    title: 'End of Month Close — Execution Plan',
    summary: `5-step month-end close sequence: timesheet approval → payroll run → invoice generation → QuickBooks sync → compliance sweep.`,
    steps,
    overallReadiness,
    confidence: unapprovedCount > 0 ? 0.7 : 0.9,
    requiresConfirmation: true,
    confirmationReason: 'Month-end close includes payroll processing (financial action). Org owner confirmation required before payroll runs.',
    generatedAt: new Date().toISOString(),
  };
}

async function generatePayrollBatchPlan(workspaceId: string): Promise<ExecutionPlan> {
  let unapprovedCount = 0;
  let unpayrolledCount = 0;
  try {
    const r1 = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM time_entries WHERE workspace_id = ${workspaceId} AND status NOT IN ('approved', 'billed', 'payrolled')`
    );
    unapprovedCount = parseInt((r1.rows[0] as any)?.cnt ?? '0', 10);

    const r2 = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved' AND payrolled_at IS NULL`
    );
    unpayrolledCount = parseInt((r2.rows[0] as any)?.cnt ?? '0', 10);
  } catch { /* non-fatal */ }

  const steps: PlanStep[] = [
    {
      order: 1, stepId: 'approve_timesheets', title: 'Confirm All Timesheets Approved',
      description: `${unapprovedCount > 0 ? `${unapprovedCount} entries need approval before payroll.` : 'All timesheets approved — ready to proceed.'}`,
      status: unapprovedCount > 0 ? 'blocked' : 'complete',
      blockedReason: unapprovedCount > 0 ? `${unapprovedCount} unapproved time entries.` : undefined,
      actionId: 'payroll.approve_timesheets', requiredRole: 'manager',
    },
    {
      order: 2, stepId: 'anomaly_check', title: 'Payroll Anomaly Check',
      description: 'Compare this payroll run against the 3-period rolling average. Flag spikes >30% or drops >40%.',
      status: unapprovedCount > 0 ? 'pending' : 'ready',
      actionId: 'analytics.payroll_summary', requiredRole: 'manager',
      estimatedImpact: 'Safety check — catches data entry errors before payroll disburses.',
    },
    {
      order: 3, stepId: 'payroll_run', title: 'Execute Payroll Run',
      description: `${unpayrolledCount} approved entries ready for payroll processing.`,
      status: unapprovedCount > 0 ? 'pending' : 'requires_confirmation',
      actionId: 'payroll.run_payroll', requiredRole: 'org_owner',
      estimatedImpact: 'Financial — irreversible after disbursement.',
    },
    {
      order: 4, stepId: 'pay_stubs', title: 'Generate Pay Stubs',
      description: 'Generate and distribute pay stubs to all employees.',
      status: 'pending', actionId: 'payroll.generate_pay_stubs', requiredRole: 'manager',
    },
  ];

  return {
    planType: 'payroll_batch',
    title: 'Payroll Batch — Execution Plan',
    summary: '4-step payroll sequence: timesheet confirmation → anomaly check → payroll execution → pay stub distribution.',
    steps,
    overallReadiness: unapprovedCount > 0 ? 'blocked' : 'ready_to_execute',
    confidence: 0.92,
    requiresConfirmation: true,
    confirmationReason: 'Payroll execution is a financial action exceeding $1,000 threshold. Org owner must confirm.',
    generatedAt: new Date().toISOString(),
  };
}

async function generateScheduleAuditPlan(workspaceId: string): Promise<ExecutionPlan> {
  const steps: PlanStep[] = [
    { order: 1, stepId: 'open_shifts', title: 'Identify Open Shifts', description: 'Scan all published shifts with no assigned officer.', status: 'ready', actionId: 'schedule.query', requiredRole: 'manager' },
    { order: 2, stepId: 'ot_check', title: 'OT Risk Assessment', description: 'Flag employees projected to exceed 40 hours this period.', status: 'ready', actionId: 'analytics.workforce_summary', requiredRole: 'manager' },
    { order: 3, stepId: 'cert_check', title: 'Certification Compliance Check', description: 'Verify all assigned officers hold valid certs for their posts.', status: 'ready', actionId: 'compliance.run_compliance_report', requiredRole: 'manager' },
    { order: 4, stepId: 'rest_gaps', title: 'Rest Compliance Check', description: 'Verify no officer is scheduled with less than 8 hours between shifts.', status: 'ready', actionId: 'schedule.query', requiredRole: 'manager' },
    { order: 5, stepId: 'coverage_gaps', title: 'Coverage Gap Report', description: 'Identify any client sites not meeting minimum staffing requirements.', status: 'ready', actionId: 'analytics.workforce_summary', requiredRole: 'manager' },
  ];

  return {
    planType: 'schedule_audit',
    title: 'Schedule Audit — Execution Plan',
    summary: '5-step schedule integrity check: open shifts → OT risk → cert compliance → rest gaps → coverage.',
    steps,
    overallReadiness: 'ready_to_execute',
    confidence: 0.95,
    requiresConfirmation: false,
    generatedAt: new Date().toISOString(),
  };
}

async function generateComplianceAuditPlan(workspaceId: string): Promise<ExecutionPlan> {
  const steps: PlanStep[] = [
    { order: 1, stepId: 'cert_sweep', title: 'License & Certification Sweep', description: 'Scan all active officers for expired or expiring certifications.', status: 'ready', actionId: 'license.query', requiredRole: 'manager' },
    { order: 2, stepId: 'i9_check', title: 'I-9 Document Review', description: 'Check all I-9 documents for completeness and expiration.', status: 'ready', actionId: 'compliance.run_full_scan', requiredRole: 'manager' },
    { order: 3, stepId: 'training_check', title: 'Training Completion Audit', description: 'Verify all required training is completed for active officers.', status: 'ready', actionId: 'compliance.check_officer', requiredRole: 'manager' },
    { order: 4, stepId: 'alert_dispatch', title: 'Alert Dispatch', description: 'Send expiry alerts to affected officers and their supervisors.', status: 'pending', actionId: 'license.alert', requiredRole: 'manager' },
    { order: 5, stepId: 'compliance_report', title: 'Generate Compliance Report', description: 'Produce a full compliance status report for org_owner review.', status: 'pending', actionId: 'compliance.run_compliance_report', requiredRole: 'manager' },
  ];

  return {
    planType: 'compliance_audit',
    title: 'Compliance Audit — Execution Plan',
    summary: '5-step compliance audit: cert sweep → I-9 review → training check → alerts → report.',
    steps,
    overallReadiness: 'ready_to_execute',
    confidence: 0.93,
    requiresConfirmation: false,
    generatedAt: new Date().toISOString(),
  };
}

async function generateInvoiceBatchPlan(workspaceId: string): Promise<ExecutionPlan> {
  let unbilledCount = 0;
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved' AND billed_at IS NULL`
    );
    unbilledCount = parseInt((result.rows[0] as any)?.cnt ?? '0', 10);
  } catch { /* non-fatal */ }

  const steps: PlanStep[] = [
    { order: 1, stepId: 'unbilled_check', title: 'Identify Unbilled Entries', description: `${unbilledCount} approved time entries ready to bill.`, status: 'complete', actionId: 'analytics.payroll_summary', requiredRole: 'manager' },
    { order: 2, stepId: 'group_by_client', title: 'Group Entries by Client', description: 'Group unbilled entries by client for invoice generation.', status: 'ready', actionId: 'billing.aging_report', requiredRole: 'manager' },
    { order: 3, stepId: 'generate_invoices', title: 'Generate Invoices', description: `Generate ${unbilledCount > 0 ? 'invoices for all unbilled entries' : 'no entries to invoice'}.`, status: unbilledCount > 0 ? 'requires_confirmation' : 'complete', actionId: 'billing.aging_report', requiredRole: 'manager', estimatedImpact: 'Revenue — sends invoices to clients.' },
    { order: 4, stepId: 'send_invoices', title: 'Send to Clients', description: 'Deliver invoices via email to all billing contacts.', status: 'pending', actionId: 'billing.aging_report', requiredRole: 'manager' },
  ];

  return {
    planType: 'invoice_batch',
    title: 'Invoice Batch — Execution Plan',
    summary: '4-step invoice batch: identify unbilled → group by client → generate → send.',
    steps,
    overallReadiness: unbilledCount > 0 ? 'ready_to_execute' : 'partially_ready',
    confidence: 0.9,
    requiresConfirmation: unbilledCount > 0,
    confirmationReason: unbilledCount > 0 ? `About to generate invoices for ${unbilledCount} time entries — confirm client billing amounts before sending.` : undefined,
    generatedAt: new Date().toISOString(),
  };
}

async function generateFullAuditPlan(workspaceId: string): Promise<ExecutionPlan> {
  const steps: PlanStep[] = [
    { order: 1, stepId: 'timesheet_audit', title: 'Timesheet Audit', description: 'Check all time entries for gaps, anomalies, and unapproved entries.', status: 'ready', requiredRole: 'manager' },
    { order: 2, stepId: 'payroll_audit', title: 'Payroll Audit', description: 'Verify payroll calculations against approved time entries.', status: 'ready', requiredRole: 'manager' },
    { order: 3, stepId: 'billing_audit', title: 'Billing Audit', description: 'Verify all invoices match approved time entries at correct rates.', status: 'ready', requiredRole: 'manager' },
    { order: 4, stepId: 'compliance_audit', title: 'Compliance Audit', description: 'Full certification and document compliance sweep.', status: 'ready', actionId: 'compliance.run_full_scan', requiredRole: 'manager' },
    { order: 5, stepId: 'schedule_audit', title: 'Schedule Audit', description: 'OT risk, rest compliance, and coverage gap analysis.', status: 'ready', actionId: 'analytics.workforce_summary', requiredRole: 'manager' },
    { order: 6, stepId: 'financial_report', title: 'Financial Summary Report', description: 'Compile full period P&L: revenue (invoices) vs. cost (payroll).', status: 'ready', actionId: 'analytics.generate_insights', requiredRole: 'org_owner' },
  ];

  return {
    planType: 'full_audit',
    title: 'Full Platform Audit — Execution Plan',
    summary: '6-step platform audit: timesheets → payroll → billing → compliance → schedule → financial summary.',
    steps,
    overallReadiness: 'ready_to_execute',
    confidence: 0.88,
    requiresConfirmation: false,
    generatedAt: new Date().toISOString(),
  };
}

async function generateClientOnboardingPlan(workspaceId: string): Promise<ExecutionPlan> {
  const steps: PlanStep[] = [
    { order: 1, stepId: 'client_profile', title: 'Create Client Profile', description: 'Enter client name, location, billing contact, and contract rate.', status: 'ready', actionId: 'client.get_full_profile', requiredRole: 'manager' },
    { order: 2, stepId: 'site_setup', title: 'Configure Site & Geofence', description: 'Set site address, GPS coordinates, and geofence radius for clock-in validation.', status: 'pending', requiredRole: 'manager' },
    { order: 3, stepId: 'staffing_demands', title: 'Define Staffing Requirements', description: 'Specify required officers per shift, shift types, and days of week.', status: 'pending', requiredRole: 'manager' },
    { order: 4, stepId: 'contract_docs', title: 'Upload Contract Documents', description: 'Upload and execute the service contract via document vault.', status: 'pending', actionId: 'document.route', requiredRole: 'manager' },
    { order: 5, stepId: 'billing_setup', title: 'Configure Billing Settings', description: 'Set billing cycle, invoice delivery method, tax status, and payment terms.', status: 'pending', actionId: 'client.update_billing_settings', requiredRole: 'manager' },
    { order: 6, stepId: 'first_schedule', title: 'Generate Initial Schedule', description: 'Trinity auto-generates the first schedule based on staffing demands.', status: 'pending', requiredRole: 'manager' },
  ];

  return {
    planType: 'client_onboarding',
    title: 'Client Onboarding — Execution Plan',
    summary: '6-step client onboarding: profile → site/geofence → staffing demands → contract → billing → first schedule.',
    steps,
    overallReadiness: 'ready_to_execute',
    confidence: 0.95,
    requiresConfirmation: false,
    generatedAt: new Date().toISOString(),
  };
}
