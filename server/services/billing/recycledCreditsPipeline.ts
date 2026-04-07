/**
 * Recycled Credits Pipeline — No-Op Stub
 * workspace_credits / credit_transactions tables were dropped (Phase 16).
 */
import { createLogger } from '../../lib/logger';
const log = createLogger('recycledCreditsPipeline');

export interface RecycledBatchEntry {
  workspaceId: string;
  unusedBalance: number;
  rolloverAmount: number;
  recycledAmount: number;
}

export async function sweepRecycledCredits(_entries: RecycledBatchEntry[]): Promise<void> {
  log.info('recycledCreditsPipeline.sweepRecycledCredits no-op');
}
