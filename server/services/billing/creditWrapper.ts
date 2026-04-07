/**
 * Credit Wrapper — No-Op Stub
 * workspace_credits / credit_transactions tables were dropped (Phase 16).
 * withCreditGuard is a passthrough — function executes unconditionally.
 */
import { createLogger } from '../../lib/logger';
import { creditManager, CREDIT_COSTS } from './creditManager';

const log = createLogger('creditWrapper');

export type FeatureKey = keyof typeof CREDIT_COSTS;

export interface CreditWrapperOptions {
  workspaceId: string;
  featureKey: FeatureKey;
  description: string;
  userId?: string;
  quantity?: number;
  stateSnapshot?: Record<string, unknown>;
  resumeParameters?: Record<string, unknown>;
  completedSteps?: string[];
  progressPercentage?: number;
}

export interface CreditWrapperResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  creditsDeducted?: number;
  transactionId?: string | null;
}

export async function withCreditGuard<T>(
  options: CreditWrapperOptions,
  fn: () => Promise<T>
): Promise<CreditWrapperResult<T>> {
  try {
    const result = await fn();
    return { success: true, result, creditsDeducted: 0, transactionId: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ options, err }, 'withCreditGuard fn threw');
    return { success: false, error: msg };
  }
}

export async function checkCreditsAvailable(
  workspaceId: string,
  featureKey: FeatureKey,
  quantity: number = 1
): Promise<boolean> {
  const result = await creditManager.checkCredits(workspaceId, featureKey, undefined, quantity);
  return result.hasEnoughCredits;
}

// Alias for backward compatibility — some callers import `withCredits` instead of `withCreditGuard`
export const withCredits = withCreditGuard;
