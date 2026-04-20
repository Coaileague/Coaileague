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

// ── Subscription status taxonomy (Phase 26) ─────────────────────────────────
// Canonical set of statuses that grant full Trinity service.
// Includes both the platform's own values (`active`, `trial`, `free_trial`) and
// the Stripe equivalents that propagate in via webhooks (`trialing`).
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set<string>([
  'active',
  'trial',
  'trialing',      // Stripe
  'free_trial',
]);

// Statuses that are recoverable: bill issue, lapsed payment, paused. Callers
// see the "on hold due to billing" message and are told to have their admin
// log in. Includes both platform values and Stripe webhook values.
export const SUSPENDED_SUBSCRIPTION_STATUSES = new Set<string>([
  'suspended',
  'past_due',            // Stripe
  'unpaid',              // Stripe
  'incomplete',          // Stripe
  'incomplete_expired',  // Stripe
  'paused',              // Stripe
]);

/**
 * Returns true if the given subscription status grants full Trinity service.
 * `null` / `undefined` / empty string is treated as active (schema default).
 */
export function isSubscriptionActive(status: string | null | undefined): boolean {
  if (!status) return true;
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

/**
 * Returns true if the given status is recoverable (billing/payment issue) —
 * used to pick between "on hold" and "no longer active" grace messaging.
 */
export function isSubscriptionSuspended(status: string | null | undefined): boolean {
  if (!status) return false;
  return SUSPENDED_SUBSCRIPTION_STATUSES.has(status);
}

/**
 * Async gate for any code path that performs Trinity work on behalf of a
 * specific workspace: AI invocations, outbound SMS / voice, proactive
 * automation. Returns true if the workspace should be served (protected /
 * active / unknown-but-fail-open), false if it should be blocked.
 *
 * Protected workspaces (platform support org, grandfathered tenant,
 * system) always return true — they are never blocked.
 *
 * Unknown workspaces (cache + DB lookup both return null) fail OPEN so a
 * transient DB outage cannot lock legitimate tenants out of Trinity.
 *
 * This is the canonical gate helper — prefer calling it over re-implementing
 * the tier-cache + protected-workspace logic in each caller.
 */
export async function isWorkspaceServiceable(
  workspaceId: string | null | undefined,
): Promise<boolean> {
  if (!workspaceId) return false;
  if (NON_BILLING_WORKSPACE_IDS.has(workspaceId)) return true;
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return true;

  // Lazy import to avoid a circular dependency (cacheManager → schema → …).
  const { cacheManager } = await import('../platform/cacheManager');
  const tierInfo = await cacheManager.getWorkspaceTierWithStatus(workspaceId);
  if (!tierInfo) return true; // fail open on unknown / DB miss
  return isSubscriptionActive(tierInfo.status);
}
