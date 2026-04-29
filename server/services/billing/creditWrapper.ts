/**
 * creditWrapper — LEGACY SHIM
 * The platform uses tokenManager for all AI usage gating. Credits are not used.
 * @see server/services/billing/tokenManager.ts
 */
import { tokenManager } from './tokenManager';

export async function withCredits<T>(
  workspaceId: string,
  _cost: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Real check via tokenManager tier allowance, not credit balance
  const state = await tokenManager.getWorkspaceTokenState(workspaceId).catch(() => null);
  if (state && !state.unlimited && state.currentBalance <= 0) {
    throw new Error(`Token allowance exhausted for workspace ${workspaceId} (tier-based limit)`);
  }
  return fn();
}
