import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { typedPool } from '../lib/typedSql';

const log = createLogger('DistributedLock');

export async function tryAcquireAdvisoryLock(lockKey: number): Promise<boolean> {
  try {
    const res = await typedPool<{ pg_try_advisory_lock: boolean }>('SELECT pg_try_advisory_lock($1)', [lockKey]);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return res[0]?.pg_try_advisory_lock === true;
  } catch (err) {
    log.error('Advisory lock error', { lockKey, error: String(err) });
    return false;
  }
}

export async function releaseAdvisoryLock(lockKey: number): Promise<void> {
  try {
    // CATEGORY C — Raw SQL retained: pg_advisory | Tables:  | Verified: 2026-03-23
    await typedPool('SELECT pg_advisory_unlock($1)', [lockKey]);
  } catch (err) {
    log.warn('Advisory lock release error', { lockKey, error: String(err) });
  }
}

export async function withDistributedLock<T>(lockKey: number, jobName: string, fn: () => Promise<T>): Promise<T | null> {
  const acquired = await tryAcquireAdvisoryLock(lockKey);
  if (!acquired) { 
    log.debug('Skipping job, lock held elsewhere', { jobName }); 
    return null; 
  }
  try { 
    return await fn(); 
  } finally { 
    await releaseAdvisoryLock(lockKey); 
  }
}

export const LOCK_KEYS = { 
  DAILY_BILLING: 1001, 
  COLLECTIONS_SWEEP: 1002, 
  SHIFT_MONITORING: 1003, 
  SHIFT_REMINDERS: 1004, 
  LONE_WORKER_SAFETY: 1005,
  PAYROLL_AUTO_CLOSE: 1006, 
  EMPLOYEE_PAYMENT_NOTIFICATIONS: 1007,
  COVERAGE_PIPELINE: 1008,
  STRIPE_WEBHOOK_CLEANUP: 1009,
  TRIAL_EXPIRY: 1010,
  VOICE_SESSION_CLEANUP: 1011,
} as const;
