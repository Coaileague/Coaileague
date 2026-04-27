export const PAYROLL_TERMINAL_STATUSES = ['approved', 'processed', 'paid', 'completed'] as const;
export const PAYROLL_DRAFT_STATUSES = ['draft', 'pending'] as const;

export type PayrollTerminalStatus = typeof PAYROLL_TERMINAL_STATUSES[number];
export type PayrollDraftStatus = typeof PAYROLL_DRAFT_STATUSES[number];

export type PayrollLifecycleStatus = 'pending_review' | 'approved' | 'processing' | 'paid';

export const PAYROLL_LIFECYCLE_FLOW: PayrollLifecycleStatus[] = [
  'pending_review',
  'approved',
  'processing',
  'paid',
];

export const PAYROLL_DB_TO_LIFECYCLE_STATUS: Record<string, PayrollLifecycleStatus> = {
  pending: 'pending_review',
  draft: 'pending_review',
  approved: 'approved',
  processed: 'processing',
  disbursing: 'processing',
  paid: 'paid',
  completed: 'paid',
};

export const PAYROLL_LIFECYCLE_TO_DB_STATUS: Record<PayrollLifecycleStatus, string> = {
  pending_review: 'pending',
  approved: 'approved',
  processing: 'processed',
  paid: 'paid',
};

export function isTerminalPayrollStatus(status: string | null | undefined): status is PayrollTerminalStatus {
  return PAYROLL_TERMINAL_STATUSES.includes(status as PayrollTerminalStatus);
}

export function isDraftPayrollStatus(status: string | null | undefined): status is PayrollDraftStatus {
  return PAYROLL_DRAFT_STATUSES.includes(status as PayrollDraftStatus);
}

export function resolvePayrollLifecycleStatus(dbStatus?: string | null): PayrollLifecycleStatus | null {
  if (!dbStatus) return null;
  return PAYROLL_DB_TO_LIFECYCLE_STATUS[dbStatus] || null;
}

export function resolvePayrollDbStatus(lifecycleStatus: PayrollLifecycleStatus): string {
  return PAYROLL_LIFECYCLE_TO_DB_STATUS[lifecycleStatus];
}

export function isValidPayrollTransition(currentDbStatus: string, nextLifecycle: PayrollLifecycleStatus): boolean {
  const current = resolvePayrollLifecycleStatus(currentDbStatus);
  if (!current) return false;
  const currentIdx = PAYROLL_LIFECYCLE_FLOW.indexOf(current);
  const nextIdx = PAYROLL_LIFECYCLE_FLOW.indexOf(nextLifecycle);
  return nextIdx === currentIdx + 1;
}
