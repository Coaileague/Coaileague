export type PayrollLifecycleStatus = 'pending_review' | 'approved' | 'processing' | 'paid';

const FLOW_ORDER: PayrollLifecycleStatus[] = [
  'pending_review',
  'approved',
  'processing',
  'paid',
];

const DB_TO_FLOW: Record<string, PayrollLifecycleStatus> = {
  pending: 'pending_review',
  approved: 'approved',
  processed: 'processing',
  disbursing: 'processing',
  paid: 'paid',
  completed: 'paid',
};

const FLOW_TO_DB: Record<PayrollLifecycleStatus, string> = {
  pending_review: 'pending',
  approved: 'approved',
  processing: 'processed',
  paid: 'paid',
};

export function resolvePayrollLifecycleStatus(dbStatus?: string | null): PayrollLifecycleStatus | null {
  if (!dbStatus) return null;
  return DB_TO_FLOW[dbStatus] || null;
}

export function resolvePayrollDbStatus(lifecycleStatus: PayrollLifecycleStatus): string {
  return FLOW_TO_DB[lifecycleStatus];
}

export function isValidPayrollTransition(currentDbStatus: string, nextLifecycle: PayrollLifecycleStatus): boolean {
  const current = resolvePayrollLifecycleStatus(currentDbStatus);
  if (!current) return false;
  const currentIdx = FLOW_ORDER.indexOf(current);
  const nextIdx = FLOW_ORDER.indexOf(nextLifecycle);
  return nextIdx === currentIdx + 1;
}
