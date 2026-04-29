/**
 * creditResetCron — LEGACY SHIM
 * Monthly token allowances reset automatically per-period via tokenManager.
 * Handled by the period tracking in workspace_ai_periods / ai_usage_events.
 * @see server/services/billing/tokenManager.ts
 */
export const initCreditResetCron = () => {
  // No-op: token periods are managed by tokenManager.getWorkspaceTokenState()
  // which auto-detects period boundaries from TIER_TOKEN_ALLOCATIONS
};
export const runMonthlyReset = async (_workspaceId: string, _tier: string) => {
  // No-op: handled by tokenManager period detection
};
