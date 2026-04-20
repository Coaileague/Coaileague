/**
 * Upsell Service
 *
 * Monitors credit usage patterns per workspace and automatically:
 * 1. Suggests tier upgrades when orgs consistently hit 0 credits
 * 2. Recommends monthly feature addons for heavily-used premium features
 * 3. Manages the feature_addons table (addon allotment checked BEFORE main pool)
 *
 * Trigger thresholds:
 *  - TIER UPGRADE: 3+ depletions in 30 days → notify org owner to upgrade
 *  - ADDON SUGGESTION: 1 specific feature causes 3+ depletions in 30 days →
 *    suggest that feature's addon plan
 *  - LOW BALANCE EARLY WARNING: balance < 10% of monthly allocation for 3+ days
 */

import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import {
  upsellEvents,
  featureAddons,
  workspaces,
  users,
} from '@shared/schema';
import { eq, and, gte, sql, desc, count, lt } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';

const log = createLogger('upsellService');
// ============================================================================
// CONSTANTS
// ============================================================================

const DEPLETION_THRESHOLD = 3;          // depletions in window to trigger upsell
const ADDON_FEATURE_THRESHOLD = 3;      // times one feature causes depletion
const WINDOW_DAYS = 30;                 // rolling window for analysis
const TIER_ORDER = ['free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic'];
const MIN_NOTIFICATION_GAP_HOURS = 72; // min hours between upsell notifications

/** Addon plans keyed by featureKey → plan details */
export const ADDON_PLANS: Record<string, {
  planName: string;
  monthlyAllotmentCredits: number;
  monthlyFeeCents: number;
  description: string;
}> = {
  ai_scheduling:            { planName: 'Scheduling Boost',        monthlyAllotmentCredits: 1000, monthlyFeeCents: 1900, description: '1,000 extra scheduling credits/month' },
  ai_payroll_processing:    { planName: 'Payroll Boost',           monthlyAllotmentCredits: 800,  monthlyFeeCents: 1500, description: '800 extra payroll credits/month' },
  ai_invoicing:             { planName: 'Invoicing Boost',         monthlyAllotmentCredits: 600,  monthlyFeeCents: 1200, description: '600 extra invoicing credits/month' },
  client_portal_helpai:     { planName: 'DockChat Boost',          monthlyAllotmentCredits: 300,  monthlyFeeCents: 900,  description: '300 extra DockChat credits/month' },
  financial_insights:       { planName: 'Analytics Boost',         monthlyAllotmentCredits: 400,  monthlyFeeCents: 1400, description: '400 extra analytics credits/month' },
  employee_behavior_scoring:{ planName: 'Scoring Boost',           monthlyAllotmentCredits: 500,  monthlyFeeCents: 1100, description: '500 extra scoring credits/month' },
  guard_tour_tracking:      { planName: 'Guard Tour Boost',        monthlyAllotmentCredits: 700,  monthlyFeeCents: 1300, description: '700 extra guard tour credits/month' },
  document_pipeline:        { planName: 'Document Pipeline Boost', monthlyAllotmentCredits: 400,  monthlyFeeCents: 1000, description: '400 extra document credits/month' },
  quickbooks_sync:          { planName: 'QuickBooks Boost',        monthlyAllotmentCredits: 300,  monthlyFeeCents: 800,  description: '300 extra QuickBooks sync credits/month' },
};

// ============================================================================
// ADDON ALLOTMENT (checked before main credit pool in tokenManager)
// ============================================================================

/**
 * Check if a workspace has an active addon with remaining allotment for a feature.
 * Returns credits available from addon, or 0 if no addon.
 */
export async function getAddonAllotment(workspaceId: string, featureKey: string): Promise<{
  addonId: string | null;
  available: number;
}> {
  const now = new Date();
  const [addon] = await db
    .select()
    .from(featureAddons)
    .where(and(
      eq(featureAddons.workspaceId, workspaceId),
      eq(featureAddons.featureKey, featureKey),
      eq(featureAddons.status, 'active'),
      gte(featureAddons.renewsAt, now),
    ))
    .limit(1);

  if (!addon) return { addonId: null, available: 0 };

  const available = Math.max(0, addon.monthlyAllotmentCredits - addon.creditsUsedThisPeriod);
  return { addonId: addon.id, available };
}

/**
 * Deduct credits from a feature addon's monthly allotment.
 * Returns how many were actually deducted from the addon (may be partial).
 */
export async function deductFromAddon(addonId: string, amount: number): Promise<number> {
  const [addon] = await db
    .select()
    .from(featureAddons)
    .where(eq(featureAddons.id, addonId))
    .limit(1);

  if (!addon || addon.status !== 'active') return 0;

  const canDeduct = Math.min(amount, addon.monthlyAllotmentCredits - addon.creditsUsedThisPeriod);
  if (canDeduct <= 0) return 0;

  await db.update(featureAddons)
    .set({
      creditsUsedThisPeriod: sql`${featureAddons.creditsUsedThisPeriod} + ${canDeduct}`,
      updatedAt: new Date(),
    })
    .where(eq(featureAddons.id, addonId));

  log.info(`[UpsellService] Addon ${addonId}: deducted ${canDeduct} from allotment`);
  return canDeduct;
}

// ============================================================================
// DEPLETION TRACKING + UPSELL TRIGGER
// ============================================================================

/**
 * Called by tokenManager after a failed deduction (insufficient credits).
 * Logs the depletion event and checks if upsell thresholds are met.
 */
export async function onCreditDepletion(
  workspaceId: string,
  featureKey: string,
  currentBalance: number,
): Promise<void> {
  try {
    // Log the depletion event
    await db.insert(upsellEvents).values({
      workspaceId,
      eventType: 'depletion',
      featureKey,
      depletionCount: 1,
      metadata: { balance: currentBalance, featureKey, timestamp: new Date().toISOString() },
    });

    // Analyze depletion patterns in rolling 30-day window
    await _analyzeAndSuggest(workspaceId);
  } catch (err) {
    log.warn('[UpsellService] onCreditDepletion failed (non-critical):', err);
  }
}

/**
 * Called by tokenManager after a low-balance check (balance < threshold).
 * Proactively suggests upgrades before orgs hit 0.
 */
export async function onLowBalance(
  workspaceId: string,
  currentBalance: number,
  monthlyAllocation: number,
): Promise<void> {
  try {
    const pct = monthlyAllocation > 0 ? currentBalance / monthlyAllocation : 1;
    if (pct > 0.20) return; // Only fire when below 20% (Phase 16: production certification standard)

    // Log low-balance event
    await db.insert(upsellEvents).values({
      workspaceId,
      eventType: 'low_balance',
      metadata: { balance: currentBalance, pct: Math.round(pct * 100), monthlyAllocation },
    });

    // OMEGA-L2: IMMEDIATE NDS alert at <10% balance — fires directly to org owner
    // without waiting for 3 depletions. This is a critical early warning separate
    // from the upsell suggestion path.
    if (pct <= 0.10) {
      const [ws] = await db
        .select({ ownerId: workspaces.ownerId, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (ws?.ownerId) {
        const pctDisplay = Math.round(pct * 100);
        log.warn(`[UpsellService] LOW CREDIT ALERT: workspace ${workspaceId} (${ws.name}) is at ${pctDisplay}% of AI credit allocation (${currentBalance} / ${monthlyAllocation} remaining). NDS alert firing to owner ${ws.ownerId}.`);
        platformEventBus.publish({
          category: 'billing_alert',
          title: 'Low AI Credit Balance',
          description: `Your AI credit balance has dropped to ${pctDisplay}% (${currentBalance} credits remaining). AI brain features will be blocked at 0. Upgrade your plan or wait for monthly reset.`,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          priority: 'high',
          metadata: { workspaceId, ownerId: ws.ownerId, balance: currentBalance, pct: pctDisplay, monthlyAllocation, alertType: 'low_credit_10pct' },
        });
      }
    }

    await _analyzeAndSuggest(workspaceId);
  } catch (err) {
    log.warn('[UpsellService] onLowBalance failed (non-critical):', err);
  }
}

/** Core analysis: count recent depletions, pick tier, build notification */
async function _analyzeAndSuggest(workspaceId: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Count total depletions in window
  const [{ total }] = await db
    .select({ total: count() })
    .from(upsellEvents)
    .where(and(
      eq(upsellEvents.workspaceId, workspaceId),
      eq(upsellEvents.eventType, 'depletion'),
      gte(upsellEvents.createdAt, since),
    ));

  if (total < DEPLETION_THRESHOLD) return;

  // Check if we already sent a notification recently
  const recentNotif = await db
    .select()
    .from(upsellEvents)
    .where(and(
      eq(upsellEvents.workspaceId, workspaceId),
      eq(upsellEvents.eventType, 'tier_suggestion'),
      eq(upsellEvents.notificationSent, true),
      gte(upsellEvents.createdAt, new Date(Date.now() - MIN_NOTIFICATION_GAP_HOURS * 60 * 60 * 1000)),
    ))
    .limit(1);

  if (recentNotif.length > 0) return;

  // Get workspace subscription tier
  const [workspace] = await db
    .select({ subscriptionTier: workspaces.subscriptionTier, ownerId: workspaces.ownerId, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return;

  const currentTierIdx = TIER_ORDER.indexOf(workspace.subscriptionTier || 'free');
  const nextTier = TIER_ORDER[currentTierIdx + 1] || null;

  // Find the most-depleted feature (for addon suggestion)
  const featureDepletions = await db
    .select({
      featureKey: upsellEvents.featureKey,
      cnt: count(),
    })
    .from(upsellEvents)
    .where(and(
      eq(upsellEvents.workspaceId, workspaceId),
      eq(upsellEvents.eventType, 'depletion'),
      gte(upsellEvents.createdAt, since),
    ))
    .groupBy(upsellEvents.featureKey)
    .orderBy(desc(count()))
    .limit(3);

  const topFeature = featureDepletions[0]?.featureKey;
  const topFeatureCount = featureDepletions[0]?.cnt ?? 0;
  const addonPlan = topFeature ? ADDON_PLANS[topFeature] : null;

  // Create tier suggestion event
  const [suggestion] = await db.insert(upsellEvents).values({
    workspaceId,
    eventType: 'tier_suggestion',
    featureKey: topFeature || undefined,
    depletionCount: total,
    suggestedTier: nextTier || undefined,
    addonFeatureKey: (addonPlan && topFeatureCount >= ADDON_FEATURE_THRESHOLD) ? topFeature : undefined,
    notificationSent: false,
    metadata: {
      currentTier: workspace.subscriptionTier,
      nextTier,
      topFeatures: featureDepletions.map(f => ({ key: f.featureKey, count: f.cnt })),
      addonPlan: addonPlan || null,
    },
  }).returning();

  // Fire notification to org owner via platform event bus
  await _sendUpsellNotification(workspaceId, workspace.ownerId, workspace.name, suggestion, nextTier, addonPlan);
}

async function _sendUpsellNotification(
  workspaceId: string,
  ownerId: string | null,
  orgName: string,
  event: typeof upsellEvents.$inferSelect,
  nextTier: string | null,
  addonPlan: typeof ADDON_PLANS[string] | null,
): Promise<void> {
  try {
    const meta = event.metadata as any;
    const depletionCount = event.depletionCount ?? 0;

    let title = `Your team is running out of credits`;
    let message = `${orgName} has depleted its credit balance ${depletionCount} times in the last 30 days. `;

    if (nextTier) {
      const tierDisplay = nextTier.charAt(0).toUpperCase() + nextTier.slice(1);
      message += `Upgrading to the ${tierDisplay} plan gives you more monthly credits and unlocks additional features.`;
    }

    if (addonPlan) {
      const addonTitle = addonPlan.planName;
      message += ` Or add the "${addonTitle}" ($${(addonPlan.monthlyFeeCents / 100).toFixed(2)}/mo) to boost that feature specifically.`;
    }

    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title,
      description: message,
      workspaceId,
      metadata: {
        billingCategory: 'upsell_suggestion',
        userId: ownerId,
        severity: 'medium',
        actionRequired: true,
        suggestionId: event.id,
        currentTier: meta?.currentTier,
        nextTier,
        addonFeatureKey: event.addonFeatureKey,
        addonPlan,
        depletionCount,
      },
    }).catch((err) => log.warn('[upsellService] Fire-and-forget failed:', err));

    // Mark notification as sent
    await db.update(upsellEvents)
      .set({ notificationSent: true, updatedAt: new Date() })
      .where(eq(upsellEvents.id, event.id));

    log.info(`[UpsellService] Upsell notification sent to org ${workspaceId} (${depletionCount} depletions, next tier: ${nextTier})`);
  } catch (err) {
    log.warn('[UpsellService] Failed to send upsell notification:', err);
  }
}

// ============================================================================
// ADDON MANAGEMENT API
// ============================================================================

/** Get all active addons for a workspace */
export async function getWorkspaceAddons(workspaceId: string): Promise<typeof featureAddons.$inferSelect[]> {
  return db.select().from(featureAddons)
    .where(eq(featureAddons.workspaceId, workspaceId))
    .orderBy(desc(featureAddons.createdAt));
}

/** Activate a new addon plan for a workspace + feature */
export async function activateAddon(
  workspaceId: string,
  featureKey: string,
  options?: { stripePriceId?: string; stripeSubscriptionItemId?: string },
): Promise<typeof featureAddons.$inferSelect> {
  const plan = ADDON_PLANS[featureKey];
  if (!plan) throw new Error(`No addon plan available for feature: ${featureKey}`);

  const renewsAt = new Date();
  renewsAt.setDate(renewsAt.getDate() + 30);

  const [addon] = await db.insert(featureAddons).values({
    workspaceId,
    featureKey,
    planName: plan.planName,
    monthlyAllotmentCredits: plan.monthlyAllotmentCredits,
    creditsUsedThisPeriod: 0,
    monthlyFeeCents: plan.monthlyFeeCents,
    status: 'active',
    renewsAt,
    stripePriceId: options?.stripePriceId,
    stripeSubscriptionItemId: options?.stripeSubscriptionItemId,
  })
  .onConflictDoUpdate({
    target: [featureAddons.workspaceId, featureAddons.featureKey],
    set: {
      status: 'active',
      monthlyAllotmentCredits: plan.monthlyAllotmentCredits,
      monthlyFeeCents: plan.monthlyFeeCents,
      creditsUsedThisPeriod: 0,
      renewsAt,
      updatedAt: new Date(),
    },
  })
  .returning();

  log.info(`[UpsellService] Addon activated: ${featureKey} for workspace ${workspaceId}`);

  // Publish so billing dashboards and Trinity can track addon lifecycle
  platformEventBus.publish({
    type: 'addon_activated',
    category: 'automation',
    title: `Addon Activated: ${featureKey}`,
    description: `Addon "${plan.planName}" activated for workspace ${workspaceId}`,
    workspaceId,
    metadata: { featureKey, planName: plan.planName, monthlyAllotmentCredits: plan.monthlyAllotmentCredits, monthlyFeeCents: plan.monthlyFeeCents },
  }).catch(err => log.warn('[UpsellService] addon_activated publish failed:', err?.message));

  return addon;
}

/** Cancel an addon plan */
export async function cancelAddon(workspaceId: string, featureKey: string): Promise<void> {
  await db.update(featureAddons)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(featureAddons.workspaceId, workspaceId),
      eq(featureAddons.featureKey, featureKey),
    ));

  platformEventBus.publish({
    type: 'addon_cancelled',
    category: 'automation',
    title: `Addon Cancelled: ${featureKey}`,
    description: `Addon "${featureKey}" cancelled for workspace ${workspaceId}`,
    workspaceId,
    metadata: { featureKey },
  }).catch(err => log.warn('[UpsellService] addon_cancelled publish failed:', err?.message));
}

/** Get upsell recommendations for a workspace (unresolved suggestions) */
export async function getUpsellRecommendations(workspaceId: string): Promise<{
  suggestions: typeof upsellEvents.$inferSelect[];
  depletionCount30d: number;
  topFeatures: { featureKey: string | null; count: number }[];
  addonPlans: typeof ADDON_PLANS;
}> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [suggestions, depletionRows, topFeatureRows] = await Promise.all([
    db.select().from(upsellEvents)
      .where(and(
        eq(upsellEvents.workspaceId, workspaceId),
        eq(upsellEvents.eventType, 'tier_suggestion'),
        eq(upsellEvents.resolved, false),
      ))
      .orderBy(desc(upsellEvents.createdAt))
      .limit(5),

    db.select({ total: count() })
      .from(upsellEvents)
      .where(and(
        eq(upsellEvents.workspaceId, workspaceId),
        eq(upsellEvents.eventType, 'depletion'),
        gte(upsellEvents.createdAt, since),
      )),

    db.select({ featureKey: upsellEvents.featureKey, cnt: count() })
      .from(upsellEvents)
      .where(and(
        eq(upsellEvents.workspaceId, workspaceId),
        eq(upsellEvents.eventType, 'depletion'),
        gte(upsellEvents.createdAt, since),
      ))
      .groupBy(upsellEvents.featureKey)
      .orderBy(desc(count()))
      .limit(5),
  ]);

  return {
    suggestions,
    depletionCount30d: depletionRows[0]?.total ?? 0,
    topFeatures: topFeatureRows.map(r => ({ featureKey: r.featureKey, count: r.cnt })),
    addonPlans: ADDON_PLANS,
  };
}

/** Reset addon period (called monthly by cron) */
export async function resetAddonPeriods(): Promise<void> {
  const now = new Date();
  const expiredAddons = await db.select().from(featureAddons)
    .where(and(eq(featureAddons.status, 'active'), lt(featureAddons.renewsAt, now)));

  for (const addon of expiredAddons) {
    const newRenewsAt = new Date();
    newRenewsAt.setDate(newRenewsAt.getDate() + 30);
    await db.update(featureAddons)
      .set({ creditsUsedThisPeriod: 0, renewsAt: newRenewsAt, updatedAt: now })
      .where(eq(featureAddons.id, addon.id));
  }

  log.info(`[UpsellService] Reset ${expiredAddons.length} addon periods`);
}
