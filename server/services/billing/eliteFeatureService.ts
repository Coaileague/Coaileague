/**
 * ELITE FEATURE PRICING SERVICE
 * =============================
 * Canonical lookup for per-tier USD surcharges on the 10 Elite features.
 *
 * Source of truth: `shared/config/premiumFeatures.ts` — each elite feature carries
 *   `monthlyLimits` (per-tier included quota) and
 *   `eliteSurchargeCents` (per-tier USD cents charged per additional use).
 *
 * Pricing philosophy (see CoAIleague Elite Feature Pricing — April 2026):
 *   1. Anchored to what a human professional charges for the same work.
 *   2. Anchored to the contract/revenue value the feature helps win or protect.
 *   3. Target ratio: 5–8% of the human professional cost.
 *
 * 1 credit = $0.01. Surcharge values are expressed in integer cents to avoid
 * floating-point drift across billing boundaries.
 */

import {
  PREMIUM_FEATURES,
  type SubscriptionTier,
  type PremiumFeatureDefinition,
} from '@shared/config/premiumFeatures';

export interface EliteFeaturePricingRow {
  featureId: string;
  name: string;
  category: string;
  tier: SubscriptionTier;
  monthlyIncluded: number;     // -1 means unlimited (included in tier)
  surchargeCents: number;      // 0 means "included" for the tier (usually enterprise)
  surchargeFormatted: string;  // e.g. "$149", "Included"
}

export interface EliteFeatureTenantUsage {
  featureId: string;
  currentUsage: number;        // count used this billing period
  tier: SubscriptionTier;
}

/** All elite features registered in the premium features registry. */
export function listEliteFeatures(): PremiumFeatureDefinition[] {
  return Object.values(PREMIUM_FEATURES).filter(f => f.featureType === 'elite');
}

/** Per-tier monthly included quota. -1 signals unlimited. */
export function getEliteMonthlyIncluded(
  featureId: string,
  tier: SubscriptionTier,
): number {
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature) return 0;
  // @ts-expect-error — monthlyLimits may not declare every tier key
  const limit = feature.monthlyLimits[tier];
  return typeof limit === 'number' ? limit : 0;
}

/**
 * Per-tier USD cents surcharge per additional use, once the monthly quota
 * is exhausted. Returns null if the tier has no configured price — meaning
 * the feature is unavailable at that tier.
 */
export function getEliteSurchargeCents(
  featureId: string,
  tier: SubscriptionTier,
): number | null {
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature || feature.featureType !== 'elite') return null;
  const surcharge = feature.eliteSurchargeCents;
  if (!surcharge) return null;
  const cents = surcharge[tier as keyof typeof surcharge];
  return typeof cents === 'number' ? cents : null;
}

/** Is this tier allowed to use the feature at all? */
export function isTierEligibleForElite(
  featureId: string,
  tier: SubscriptionTier,
): boolean {
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature) return false;
  const tierOrder: SubscriptionTier[] = [
    'free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic',
  ];
  const required = tierOrder.indexOf(feature.minimumTier);
  const current = tierOrder.indexOf(tier);
  return current >= 0 && current >= required;
}

/**
 * Calculate the overage charge (in USD cents) a tenant owes for `requestedUnits`
 * additional uses of an elite feature given their `currentUsage` this period.
 *
 * - Units that fit inside the tier's `monthlyIncluded` quota cost 0.
 * - Units beyond the quota are charged at `eliteSurchargeCents[tier]` each.
 * - If the tier quota is unlimited (-1), the charge is always 0.
 * - If the tier has no surcharge configured, null is returned — the caller
 *   must block the request rather than silently bill $0.
 */
export function calculateEliteCharge(params: {
  featureId: string;
  tier: SubscriptionTier;
  currentUsage: number;
  requestedUnits?: number;
}): { totalCents: number; billableUnits: number; surchargeCents: number } | null {
  const { featureId, tier, currentUsage, requestedUnits = 1 } = params;
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature || feature.featureType !== 'elite') return null;

  const included = getEliteMonthlyIncluded(featureId, tier);
  if (included === -1) {
    return { totalCents: 0, billableUnits: 0, surchargeCents: 0 };
  }

  const surchargeCents = getEliteSurchargeCents(featureId, tier);
  if (surchargeCents === null) return null;

  const remainingFree = Math.max(0, included - currentUsage);
  const billableUnits = Math.max(0, requestedUnits - remainingFree);
  return {
    totalCents: billableUnits * surchargeCents,
    billableUnits,
    surchargeCents,
  };
}

/** Human-readable price label for a tier surcharge. */
export function formatEliteSurcharge(cents: number | null): string {
  if (cents === null) return 'Not available';
  if (cents === 0) return 'Included';
  const dollars = cents / 100;
  return dollars >= 1 && dollars === Math.floor(dollars)
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

/**
 * Build a display-ready pricing matrix for the billing UI and the
 * Trinity marketing page. Returns one row per (feature × tier) pair.
 */
export function getEliteFeeSchedule(): EliteFeaturePricingRow[] {
  const rows: EliteFeaturePricingRow[] = [];
  const tiers: SubscriptionTier[] = ['starter', 'professional', 'business', 'enterprise'];

  for (const feature of listEliteFeatures()) {
    for (const tier of tiers) {
      if (!feature.eliteSurchargeCents) continue;
      const surcharge = feature.eliteSurchargeCents[tier as keyof typeof feature.eliteSurchargeCents];
      if (typeof surcharge !== 'number') continue;
      rows.push({
        featureId: feature.id,
        name: feature.name,
        category: feature.category,
        tier,
        monthlyIncluded: getEliteMonthlyIncluded(feature.id, tier),
        surchargeCents: surcharge,
        surchargeFormatted: formatEliteSurcharge(surcharge),
      });
    }
  }
  return rows;
}
