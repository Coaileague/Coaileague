/**
 * Monthly Credit Reset Cron — No-Op Stub
 * workspace_credits / credit_transactions tables were dropped (Phase 16).
 */
import { createLogger } from '../../lib/logger';
import { TIER_MONTHLY_CREDITS } from './creditManager';

const log = createLogger('creditResetCron');

export { TIER_MONTHLY_CREDITS };

export async function resetMonthlyCredits(): Promise<void> {
  log.info('creditResetCron.resetMonthlyCredits no-op — tables dropped');
}

export async function resetCreditsNow(_workspaceId: string): Promise<void> {
  log.info({ _workspaceId }, 'creditResetCron.resetCreditsNow no-op — tables dropped');
}
