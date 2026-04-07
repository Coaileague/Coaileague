/**
 * Billing Constants — Single Source of Truth
 *
 * Workspace classification for billing purposes.
 *
 * NON_BILLING_WORKSPACE_IDS must be excluded from ALL billing operations:
 *   - Credit resets, usage caps, subscriptions
 *   - Invoice generation, overage billing, usage tracking
 *   - Any customer-facing charge or debit
 *
 * Workspace roles:
 *   coaileague-platform-workspace  — CoAI support org (HelpAI + Trinity support bots).
 *                                    Costs are internally absorbed, never customer-billed.
 *   system                         — Trinity's brain / automation engine.
 *                                    Runs crons, automation, orchestration. Never billed.
 *   PLATFORM_SUPPORT_POOL          — Internal credit sweep pool. Never billed.
 */

/**
 * Grandfathered founding tenant — permanent enterprise exemption.
 * Identity lives ONLY in the environment variable GRANDFATHERED_TENANT_ID.
 * No UUID, name, or initials are ever hardcoded in source files.
 * If this variable is unset the exemption is simply inactive (safe in dev).
 */
export const GRANDFATHERED_TENANT_ID: string | undefined =
  process.env.GRANDFATHERED_TENANT_ID || process.env.STATEWIDE_WORKSPACE_ID || undefined;

export const PLATFORM_WORKSPACE_ID = process.env.PLATFORM_WORKSPACE_ID || 'coaileague-platform-workspace';
export const SYSTEM_WORKSPACE_ID = 'system';
export const PLATFORM_SUPPORT_POOL_ID = 'PLATFORM_SUPPORT_POOL';

/**
 * Set of all workspace IDs that must be excluded from billing operations.
 * Use isBillingExcluded() rather than checking this set directly.
 */
export const NON_BILLING_WORKSPACE_IDS = new Set<string>([
  PLATFORM_WORKSPACE_ID,
  SYSTEM_WORKSPACE_ID,
  PLATFORM_SUPPORT_POOL_ID,
  // Legacy / alternative IDs that may appear in older data
  'platform',
  'platform-system',
  'platform-unattributed',
  'PLATFORM_COST_CENTER',
]);

/**
 * Returns true if the given workspace ID should be excluded from all billing.
 * Safe to call with null/undefined — returns true (treat as non-billing).
 */
export function isBillingExcluded(workspaceId: string | null | undefined): boolean {
  if (!workspaceId) return true;
  return NON_BILLING_WORKSPACE_IDS.has(workspaceId);
}
