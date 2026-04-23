/**
 * Founder Exemption Service
 *
 * PERMANENT PLATFORM RULE — Grandfathered Founding Tenant
 *
 * The founding client of this platform receives permanent enterprise
 * access with zero charges — forever. This is a hard-coded business rule,
 * not configuration. It cannot be overridden by any automated process.
 *
 * The tenant's identity is provided EXCLUSIVELY via the GRANDFATHERED_TENANT_ID
 * environment variable. No UUID, company name, or initials are stored in
 * source files. If the variable is absent the exemption is inactive (safe in dev).
 *
 * Enforcement contract:
 *  - billingExempt = true  → skip ALL Stripe charges (invoiceItems, subscriptions, overages)
 *  - billingExempt = true  → skip ALL credit deductions; allow all AI actions
 *  - founderExemption = true → subscription_tier is permanently 'enterprise'
 *  - founderExemption = true → no seat ceiling, no plan expiry, no suspension
 *  - Every exempted event is logged in the audit trail with reason: 'founder_exemption'
 *
 * CRITICAL: These flags may ONLY be unset by a human with direct DB access.
 * No webhook, no cron job, no API endpoint may unset them.
 */

import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { workspaces } from '@shared/schema';
import { creditBalances, workspaceUsageTracking } from '@shared/schema/domains/billing';
import { eq, sql } from 'drizzle-orm';
import { universalAudit } from '../universalAuditService';
import { GRANDFATHERED_TENANT_ID } from './billingConstants';

const log = createLogger('founderExemption');

export { GRANDFATHERED_TENANT_ID };

/**
 * Legacy alias kept for backward compatibility with existing imports.
 * Prefer GRANDFATHERED_TENANT_ID in all new code.
 * @deprecated Use GRANDFATHERED_TENANT_ID instead.
 */
export const STATEWIDE_WS_ID = GRANDFATHERED_TENANT_ID;

export const FOUNDER_EXEMPTION_REASON = 'founder_exemption';

/**
 * Check if a workspace is founder-exempt by workspace ID.
 * Queries the DB directly. Use isBillingExemptByRecord() if you already have the workspace.
 */
export async function isBillingExempt(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;
  try {
    const [ws] = await db
      .select({ billingExempt: workspaces.billingExempt, founderExemption: workspaces.founderExemption })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return !!(ws?.billingExempt || ws?.founderExemption);
  } catch {
    return false;
  }
}

/**
 * Check exemption from a workspace record already in memory (avoids extra DB hit).
 */
export function isBillingExemptByRecord(workspace: { billingExempt?: boolean | null; founderExemption?: boolean | null }): boolean {
  return !!(workspace?.billingExempt || workspace?.founderExemption);
}

/**
 * Log an exempted billing action to the audit trail.
 * Called whenever a charge or credit deduction is skipped due to founder exemption.
 */
export async function logExemptedAction(params: {
  workspaceId: string;
  action: string;
  skippedAmount?: number;
  skippedAmountUnit?: 'credits' | 'cents' | 'dollars';
  metadata?: Record<string, unknown>;
  performedBy?: string;
}): Promise<void> {
  try {
    await universalAudit.log({
      workspaceId: params.workspaceId,
      actorId: params.performedBy ?? 'system',
      actorType: 'system',
      changeType: 'action',
      action: `EXEMPTED:${params.action}`,
      entityType: 'workspace',
      entityId: params.workspaceId,
      entityName: 'Grandfathered Tenant',
      metadata: {
        reason: FOUNDER_EXEMPTION_REASON,
        skippedAmount: params.skippedAmount,
        skippedAmountUnit: params.skippedAmountUnit,
        note: 'Permanent founder exemption — charge/deduction skipped',
        ...params.metadata,
      },
    });
  } catch {
    // Non-fatal: exemption logging must never block the action it's logging
  }
}

/**
 * Startup guarantee: ensure the grandfathered tenant's flags are correctly set.
 * Called once on server start. Safe in dev — if GRANDFATHERED_TENANT_ID is not
 * set, this function exits immediately without touching the database.
 * Initializes all dependent records (credit_balances, workspace_usage_tracking) if missing.
 */
export async function ensureFounderExemption(): Promise<void> {
  if (!GRANDFATHERED_TENANT_ID) {
    log.info('[FounderExemption] GRANDFATHERED_TENANT_ID not configured — exemption inactive in this environment');
    return;
  }

  try {
    // 1. Ensure workspace flags are enterprise-level
    const result = await db
      .update(workspaces)
      .set({
        founderExemption: true,
        billingExempt: true,
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
        maxEmployees: 999999,
        maxClients: 999999,
      })
      .where(eq(workspaces.id, GRANDFATHERED_TENANT_ID));
    if ((result as any).rowCount > 0) {
      log.info('[FounderExemption] Grandfathered tenant exemption verified and enforced');
    }

    // Load workspace context once for downstream bootstrap/repair checks.
    const [workspace] = await db
      .select({
        id: workspaces.id,
        ownerId: workspaces.ownerId,
        name: workspaces.name,
        companyName: workspaces.companyName,
      })
      .from(workspaces)
      .where(eq(workspaces.id, GRANDFATHERED_TENANT_ID))
      .limit(1);

    if (!workspace) {
      log.warn('[FounderExemption] Grandfathered tenant row not found — skipping onboarding bootstrap');
      return;
    }

    // 2. Ensure credit_balances record exists with generous enterprise credits
    await db
      .insert(creditBalances)
      .values({
        workspaceId: GRANDFATHERED_TENANT_ID,
        subscriptionCredits: 999999,
        carryoverCredits: 0,
        purchasedCredits: 0,
      })
      .onConflictDoUpdate({
        target: creditBalances.workspaceId,
        set: { subscriptionCredits: 999999, updatedAt: sql`now()` },
      });

    // 3. Ensure workspace_usage_tracking exists with enterprise unlimited caps
    const billingPeriodStart = new Date();
    billingPeriodStart.setDate(1);
    billingPeriodStart.setHours(0, 0, 0, 0);
    const billingPeriodEnd = new Date(billingPeriodStart);
    billingPeriodEnd.setMonth(billingPeriodEnd.getMonth() + 1);

    await db
      .insert(workspaceUsageTracking)
      .values({
        workspaceId: GRANDFATHERED_TENANT_ID,
        planTier: 'enterprise',
        interactionsIncludedMonthly: 999999,
        interactionsUsedCurrentPeriod: 0,
        interactionsRemaining: 999999,
        hardCapLimit: 999999,
        overageInteractions: 0,
        overageRatePerInteraction: '0.0000',
        billingPeriodStart,
        billingPeriodEnd,
      })
      .onConflictDoUpdate({
        target: workspaceUsageTracking.workspaceId,
        set: {
          planTier: 'enterprise',
          interactionsIncludedMonthly: 999999,
          interactionsRemaining: 999999,
          hardCapLimit: 999999,
          overageRatePerInteraction: '0.0000',
          lastUpdated: sql`now()`,
        },
      });

    log.info('[FounderExemption] Grandfathered tenant credit_balances and usage_tracking initialized');

    // 4. Ensure onboarding scaffolding exists even if tenant was manually seeded.
    // This keeps grandfathered tenants aligned with normal registration flows.
    const { onboardingPipelineService } = await import('../onboardingPipelineService');
    await onboardingPipelineService.initializeOnboarding(GRANDFATHERED_TENANT_ID);

    // 5. Ensure the owner has an employee record for compliance/onboarding parity.
    if (workspace.ownerId) {
      const { ensureUserHasEmployeeRecord } = await import('../ownerManagerEmployeeService');
      await ensureUserHasEmployeeRecord(workspace.ownerId, GRANDFATHERED_TENANT_ID);
    }

    // 6. Ensure unified onboarding state exists for the workspace-level checklist.
    const { onboardingStateMachine } = await import('../orchestration/onboardingStateMachine');
    const existingState = await onboardingStateMachine.getState(GRANDFATHERED_TENANT_ID);
    if (!existingState && workspace.ownerId) {
      await onboardingStateMachine.initializeOnboarding({
        workspaceId: GRANDFATHERED_TENANT_ID,
        organizationId: workspace.companyName || workspace.name || GRANDFATHERED_TENANT_ID,
        ownerId: workspace.ownerId,
      });
      log.info('[FounderExemption] Grandfathered tenant onboarding state initialized');
    }
  } catch {
    // Non-fatal: tenant may not exist in this environment
  }
}

/**
 * Legacy alias kept for backward compatibility with existing callers.
 * @deprecated Use ensureFounderExemption() instead.
 */
export const ensureStatewideExemption = ensureFounderExemption;
