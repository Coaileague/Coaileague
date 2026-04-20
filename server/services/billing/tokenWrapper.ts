/**
 * Token wrapper — thin pass-through used by automation entry points.
 * Runs the wrapped function and returns a uniform result envelope so callers
 * can branch on success without wiring token gating themselves (preAuthorize
 * + finalizeBilling are handled inside the AI providers).
 */
import { createLogger } from '../../lib/logger';
import { tokenManager, TOKEN_COSTS } from './tokenManager';

const log = createLogger('tokenWrapper');

export type FeatureKey = keyof typeof TOKEN_COSTS;

export interface TokenWrapperOptions {
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

export interface TokenWrapperResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  tokensUsed?: number;
  usageEventId?: string | null;
}

export async function withTokens<T>(
  options: TokenWrapperOptions,
  fn: () => Promise<T>,
): Promise<TokenWrapperResult<T>> {
  try {
    const result = await fn();
    return { success: true, result, tokensUsed: 0, usageEventId: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ options, err } as any, 'withTokens fn threw');
    return { success: false, error: msg };
  }
}

export async function checkTokensAvailable(
  workspaceId: string,
  featureKey: FeatureKey,
  quantity: number = 1,
): Promise<boolean> {
  const result = await tokenManager.checkTokens(workspaceId, featureKey, undefined, quantity);
  return result.hasAllowance;
}
