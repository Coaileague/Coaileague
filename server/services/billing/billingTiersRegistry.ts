import {
  BILLING,
  getClientPortalSeatLimit,
  hasClientPortalAccess,
} from '@shared/billingConfig';
import {
  type TierName,
  getMinimumTierForFeature,
  tierMeetsOrExceeds,
} from '../../lib/tiers/tierDefinitions';
import { usageMeteringService, type UsageEventInput } from './usageMetering';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('billingTiersRegistry');

export type BillingTierKey = TierName;
export type BillingFeatureDecision = 'allowed' | 'denied' | 'addon_required';

export interface BillingFeatureGateContext {
  tier: string | null | undefined;
  featureKey: string;
  activeAddons?: string[];
}

export interface BillingFeatureGateResult {
  decision: BillingFeatureDecision;
  allowed: boolean;
  tier: BillingTierKey;
  featureKey: string;
  requiredTier?: BillingTierKey;
  requiredAddon?: string;
  reason?: string;
}

export interface ClientPortalSeatPolicyContext {
  tier: string | null | undefined;
  currentClientPortalSeats: number;
  seatsToAdd?: number;
}

export interface ClientPortalSeatPolicyResult {
  allowed: boolean;
  tier: BillingTierKey;
  hasAccess: boolean;
  seatLimit: number | null;
  currentClientPortalSeats: number;
  projectedClientPortalSeats: number;
  remainingSeats: number | null;
  requiredTier?: BillingTierKey;
  reason?: string;
}

export interface TokenUsagePolicyContext {
  workspaceId: string;
  tier: string | null | undefined;
  actionId: string;
  usedTokensBefore: number;
  additionalTokens: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  emitEvent?: boolean;
}

export interface TokenUsagePolicyResult {
  allowed: boolean;
  neverThrottle: boolean;
  tier: BillingTierKey;
  actionId: string;
  monthlyTokenLimit: number | null;
  hardTokenLimit: number | null;
  usedTokensBefore: number;
  projectedTokens: number;
  percentUsed: number | null;
  crossedWarningThresholds: number[];
  reason?: string;
}

export interface BillingUsageRecordInput extends Omit<UsageEventInput, 'workspaceId' | 'featureKey' | 'usageType' | 'usageUnit' | 'usageAmount'> {
  workspaceId: string;
  tier: string | null | undefined;
  featureKey: string;
  actionId?: string;
  tokens: number;
  usedTokensBefore?: number;
}

export interface BillingTierSnapshot {
  tier: BillingTierKey;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxEmployees: number;
  maxManagers: number;
  monthlyTokens: number | null;
  hardTokenLimit: number | null;
  clientPortalSeatLimit: number | null;
  clientPortalIncluded: boolean;
  features: string[];
}

const TIER_ALIASES: Record<string, BillingTierKey> = {
  free: 'free',
  free_trial: 'trial',
  trial: 'trial',
  starter: 'starter',
  professional: 'professional',
  business: 'business',
  enterprise: 'enterprise',
  strategic: 'strategic',
};

const DEFAULT_TOKEN_WARNING_THRESHOLDS = [70, 80, 95, 100];

const DEFAULT_NEVER_THROTTLE_ACTIONS = [
  'payroll',
  'payroll_run',
  'payroll.approve_run',
  'payroll.run_cycle',
  'calloff',
  'call_off',
  'calloff.cover_shift',
  'scheduling',
  'schedule',
  'schedule.fill_shift',
  'trinity.auto_schedule',
  'invoice',
  'invoicing',
  'billing.run_invoice_cycle',
  'billing.build_invoice_from_schedule',
  'panic',
  'panic_alert',
  'incident_report',
  'emergency_dispatch',
];

function configAny(): any {
  return BILLING as any;
}

export function normalizeBillingTier(tier: string | null | undefined): BillingTierKey {
  const normalized = String(tier || 'free').toLowerCase();
  return TIER_ALIASES[normalized] || 'free';
}

export function getBillingTierConfig(tier: string | null | undefined): any {
  const key = normalizeBillingTier(tier);
  const tiers = configAny().PLATFORM_TIERS || configAny().tiers || {};
  if (key === 'trial') return tiers.trial || tiers.free_trial || tiers.free;
  return tiers[key] || tiers.free;
}

export function getClientPortalSeatLimitForTier(tier: string | null | undefined): number | null {
  const key = normalizeBillingTier(tier);
  if (key === 'trial') {
    return getClientPortalSeatLimit('free_trial');
  }
  return getClientPortalSeatLimit(key);
}

export function tierHasClientPortalAccess(tier: string | null | undefined): boolean {
  const key = normalizeBillingTier(tier);
  if (key === 'trial') {
    return hasClientPortalAccess('free_trial');
  }
  return hasClientPortalAccess(key);
}

export function getBillingTierSnapshot(tier: string | null | undefined): BillingTierSnapshot {
  const key = normalizeBillingTier(tier);
  const config = getBillingTierConfig(key) || {};
  return {
    tier: key,
    name: config.name || key,
    monthlyPrice: Number(config.monthlyPrice || config.startsAt || 0),
    yearlyPrice: Number(config.yearlyPrice || 0),
    maxEmployees: Number(config.maxEmployees || 0),
    maxManagers: Number(config.maxManagers || 0),
    monthlyTokens: typeof config.monthlyTokens === 'number' && config.monthlyTokens > 0 ? config.monthlyTokens : null,
    hardTokenLimit: getTierHardTokenLimit(key),
    clientPortalSeatLimit: getClientPortalSeatLimitForTier(key),
    clientPortalIncluded: tierHasClientPortalAccess(key),
    features: Array.isArray(config.features) ? config.features : [],
  };
}

export function getTokenWarningThresholds(): number[] {
  const configured = configAny().TOKEN_WARNING_THRESHOLDS || configAny().tokenWarningThresholds;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(Number).filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  }
  return DEFAULT_TOKEN_WARNING_THRESHOLDS;
}

export function getNeverThrottleActions(): string[] {
  const configured = configAny().NEVER_THROTTLE_ACTIONS || configAny().neverThrottleActions;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(String);
  }
  return DEFAULT_NEVER_THROTTLE_ACTIONS;
}

export function isNeverThrottleAction(actionId: string | null | undefined): boolean {
  const normalized = String(actionId || '').toLowerCase();
  if (!normalized) return false;
  return getNeverThrottleActions().some(action => normalized.includes(String(action).toLowerCase()));
}

export function getTierHardTokenLimit(tier: string | null | undefined): number | null {
  const config = getBillingTierConfig(tier) || {};
  if (typeof config.hardTokenLimit === 'number') return config.hardTokenLimit;
  if (typeof config.hardCapTokens === 'number') return config.hardCapTokens;
  if (typeof config.tokenHardCap === 'number') return config.tokenHardCap;
  if (typeof config.monthlyTokens !== 'number' || config.monthlyTokens <= 0) return null;

  const key = normalizeBillingTier(tier);
  if (key === 'free' || key === 'trial') return config.monthlyTokens;
  if (key === 'starter') return 8000;
  return config.monthlyTokens * 2;
}

function resolveAddonForFeature(featureKey: string): string | undefined {
  const addons = configAny().MONTHLY_FEATURE_ADDONS || configAny().monthlyFeatureAddons || configAny().addons || {};
  const direct = addons[featureKey];
  if (direct?.id) return direct.id;
  if (direct) return featureKey;

  const featureToAddon: Record<string, string> = {
    claude_premium_ai: 'claude_premium_unlimited',
    client_profitability: 'ai_cfo_insights',
    predictive_insights: 'ai_cfo_insights',
    multi_location: 'multi_location',
    fleet_management: 'fleet_management',
  };

  return featureToAddon[featureKey];
}

export function evaluateBillingFeatureGate({
  tier,
  featureKey,
  activeAddons = [],
}: BillingFeatureGateContext): BillingFeatureGateResult {
  const normalizedTier = normalizeBillingTier(tier);

  if (featureKey === 'client_portal' || featureKey === 'client_portal_access') {
    const portalPolicy = evaluateClientPortalSeatPolicy({
      tier: normalizedTier,
      currentClientPortalSeats: 0,
      seatsToAdd: 1,
    });
    return {
      decision: portalPolicy.allowed ? 'allowed' : 'denied',
      allowed: portalPolicy.allowed,
      tier: normalizedTier,
      featureKey,
      requiredTier: portalPolicy.requiredTier,
      reason: portalPolicy.reason,
    };
  }

  const featureMatrix = configAny().featureMatrix || {};
  const matrixEntry = featureMatrix[featureKey];

  if (matrixEntry) {
    const access = matrixEntry[normalizedTier];
    if (access === true) {
      return { decision: 'allowed', allowed: true, tier: normalizedTier, featureKey };
    }
    if (access === 'addon') {
      const requiredAddon = resolveAddonForFeature(featureKey) || featureKey;
      const hasAddon = activeAddons.includes(requiredAddon) || activeAddons.includes(featureKey);
      return {
        decision: hasAddon ? 'allowed' : 'addon_required',
        allowed: hasAddon,
        tier: normalizedTier,
        featureKey,
        requiredAddon,
        reason: hasAddon ? undefined : `Feature ${featureKey} requires add-on ${requiredAddon}`,
      };
    }
    if (access === false) {
      const requiredTier = (Object.keys(matrixEntry) as BillingTierKey[]).find(candidate => matrixEntry[candidate] === true) || getMinimumTierForFeature(featureKey);
      return {
        decision: 'denied',
        allowed: false,
        tier: normalizedTier,
        featureKey,
        requiredTier,
        reason: `Feature ${featureKey} requires ${requiredTier} tier`,
      };
    }
  }

  const requiredTier = getMinimumTierForFeature(featureKey);
  const allowed = tierMeetsOrExceeds(normalizedTier, requiredTier);
  return {
    decision: allowed ? 'allowed' : 'denied',
    allowed,
    tier: normalizedTier,
    featureKey,
    requiredTier,
    reason: allowed ? undefined : `Feature ${featureKey} requires ${requiredTier} tier`,
  };
}

export function evaluateClientPortalSeatPolicy({
  tier,
  currentClientPortalSeats,
  seatsToAdd = 1,
}: ClientPortalSeatPolicyContext): ClientPortalSeatPolicyResult {
  const normalizedTier = normalizeBillingTier(tier);
  const seatLimit = getClientPortalSeatLimitForTier(normalizedTier);
  const hasAccess = tierHasClientPortalAccess(normalizedTier);
  const current = Math.max(0, Number(currentClientPortalSeats || 0));
  const requested = Math.max(0, Number(seatsToAdd || 0));
  const projected = current + requested;

  if (!hasAccess) {
    return {
      allowed: false,
      tier: normalizedTier,
      hasAccess,
      seatLimit,
      currentClientPortalSeats: current,
      projectedClientPortalSeats: projected,
      remainingSeats: 0,
      requiredTier: 'professional',
      reason: 'Client Portal is included in Professional and above. Upgrade to enable client logins.',
    };
  }

  if (seatLimit === null) {
    return {
      allowed: true,
      tier: normalizedTier,
      hasAccess,
      seatLimit,
      currentClientPortalSeats: current,
      projectedClientPortalSeats: projected,
      remainingSeats: null,
    };
  }

  const remainingSeats = Math.max(0, seatLimit - current);
  if (projected > seatLimit) {
    return {
      allowed: false,
      tier: normalizedTier,
      hasAccess,
      seatLimit,
      currentClientPortalSeats: current,
      projectedClientPortalSeats: projected,
      remainingSeats,
      requiredTier: normalizedTier === 'professional' ? 'business' : 'enterprise',
      reason: `Client Portal seat limit exceeded for ${normalizedTier}: ${projected}/${seatLimit}. Upgrade to add more client logins.`,
    };
  }

  return {
    allowed: true,
    tier: normalizedTier,
    hasAccess,
    seatLimit,
    currentClientPortalSeats: current,
    projectedClientPortalSeats: projected,
    remainingSeats: Math.max(0, seatLimit - projected),
  };
}

export function evaluateTokenUsagePolicy(context: TokenUsagePolicyContext): TokenUsagePolicyResult {
  const tier = normalizeBillingTier(context.tier);
  const config = getBillingTierConfig(tier) || {};
  const monthlyTokenLimit = typeof config.monthlyTokens === 'number' && config.monthlyTokens > 0 ? config.monthlyTokens : null;
  const hardTokenLimit = getTierHardTokenLimit(tier);
  const projectedTokens = Math.max(0, Number(context.usedTokensBefore || 0) + Number(context.additionalTokens || 0));
  const basis = hardTokenLimit ?? monthlyTokenLimit;
  const percentUsed = basis ? Math.round((projectedTokens / basis) * 10000) / 100 : null;
  const neverThrottle = isNeverThrottleAction(context.actionId);
  const previousPercent = basis ? Math.round((Number(context.usedTokensBefore || 0) / basis) * 10000) / 100 : 0;

  const crossedWarningThresholds = percentUsed == null ? [] : getTokenWarningThresholds().filter(threshold => (
    previousPercent < threshold && percentUsed >= threshold
  ));

  if (hardTokenLimit !== null && projectedTokens > hardTokenLimit && !neverThrottle) {
    return {
      allowed: false,
      neverThrottle,
      tier,
      actionId: context.actionId,
      monthlyTokenLimit,
      hardTokenLimit,
      usedTokensBefore: Number(context.usedTokensBefore || 0),
      projectedTokens,
      percentUsed,
      crossedWarningThresholds,
      reason: `Token hard cap exceeded for ${tier} tier`,
    };
  }

  return {
    allowed: true,
    neverThrottle,
    tier,
    actionId: context.actionId,
    monthlyTokenLimit,
    hardTokenLimit,
    usedTokensBefore: Number(context.usedTokensBefore || 0),
    projectedTokens,
    percentUsed,
    crossedWarningThresholds,
    reason: neverThrottle && hardTokenLimit !== null && projectedTokens > hardTokenLimit
      ? 'Never-throttle action allowed beyond token cap; usage must be billed/reviewed'
      : undefined,
  };
}

async function publishTokenWarning(context: TokenUsagePolicyContext, policy: TokenUsagePolicyResult): Promise<void> {
  if (context.emitEvent === false || policy.crossedWarningThresholds.length === 0) return;
  await platformEventBus.publish({
    type: 'billing_token_threshold_crossed',
    category: 'billing',
    title: 'AI Token Threshold Crossed',
    description: `Workspace crossed ${policy.crossedWarningThresholds.join(', ')}% token usage for ${policy.tier} tier`,
    workspaceId: context.workspaceId,
    userId: context.userId,
    metadata: {
      actionId: context.actionId,
      tier: policy.tier,
      monthlyTokenLimit: policy.monthlyTokenLimit,
      hardTokenLimit: policy.hardTokenLimit,
      usedTokensBefore: policy.usedTokensBefore,
      projectedTokens: policy.projectedTokens,
      percentUsed: policy.percentUsed,
      crossedWarningThresholds: policy.crossedWarningThresholds,
      neverThrottle: policy.neverThrottle,
      ...context.metadata,
    },
  });
}

export async function recordBillingTokenUsage(input: BillingUsageRecordInput) {
  const policy = evaluateTokenUsagePolicy({
    workspaceId: input.workspaceId,
    tier: input.tier,
    actionId: input.actionId || input.featureKey,
    usedTokensBefore: input.usedTokensBefore || 0,
    additionalTokens: input.tokens,
    userId: input.userId,
    sessionId: input.sessionId,
    metadata: input.metadata,
    emitEvent: input.emitEvent,
  });

  if (!policy.allowed) {
    return { recorded: false, policy };
  }

  const event = await usageMeteringService.recordUsage({
    workspaceId: input.workspaceId,
    userId: input.userId,
    featureKey: input.featureKey,
    addonId: input.addonId,
    usageType: 'token',
    usageAmount: input.tokens,
    usageUnit: 'tokens',
    unitPrice: input.unitPrice,
    sessionId: input.sessionId,
    activityType: input.activityType || input.actionId,
    metadata: {
      ...(input.metadata || {}),
      actionId: input.actionId,
      billingTier: policy.tier,
      tokenPolicy: policy,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    emitEvent: input.emitEvent,
    skipBillingDeduction: input.skipBillingDeduction,
    aiModel: input.aiModel,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    creditsDeducted: input.creditsDeducted,
  });

  publishTokenWarning({
    workspaceId: input.workspaceId,
    tier: input.tier,
    actionId: input.actionId || input.featureKey,
    usedTokensBefore: input.usedTokensBefore || 0,
    additionalTokens: input.tokens,
    userId: input.userId,
    sessionId: input.sessionId,
    metadata: input.metadata,
    emitEvent: input.emitEvent,
  }, policy).catch((err) => log.warn('[billingTiersRegistry] token warning publish failed:', err?.message));

  return { recorded: true, event, policy };
}

export function getPremiumEventCatalog(): Record<string, unknown> {
  return configAny().PREMIUM_EVENTS || configAny().premiumEvents || {};
}

export function getMonthlyFeatureAddonCatalog(): Record<string, unknown> {
  return configAny().MONTHLY_FEATURE_ADDONS || configAny().monthlyFeatureAddons || configAny().addons || {};
}

export const billingTiersRegistry = {
  normalizeBillingTier,
  getBillingTierConfig,
  getBillingTierSnapshot,
  evaluateBillingFeatureGate,
  evaluateClientPortalSeatPolicy,
  evaluateTokenUsagePolicy,
  recordBillingTokenUsage,
  getClientPortalSeatLimitForTier,
  tierHasClientPortalAccess,
  getTokenWarningThresholds,
  getNeverThrottleActions,
  isNeverThrottleAction,
  getPremiumEventCatalog,
  getMonthlyFeatureAddonCatalog,
};
