/**
 * Platform Feature Flag System
 * Maps features to minimum subscription tier required.
 *
 * NEW TIERS (pricing overhaul):
 *   trial | starter | professional | business | enterprise
 *
 * Critical operations (panic alerts, incidents, compliance blocks)
 * are NEVER gated — they run regardless of tier or interaction cap.
 */

import { createLogger } from '../lib/logger';
const log = createLogger('features');
export const FEATURE_FLAGS = {
  // ── Always-on (every tier) ──────────────────────────────────────────────
  CORE_SCHEDULING: true,
  TIME_TRACKING: true,
  EMPLOYEE_MANAGEMENT: true,
  EMAIL_NOTIFICATIONS: true,
  CHATROOMS: true,
  HELPDESK: true,
  HELPAI_BASIC: true,           // basic commands: clock in/out, schedule view, post orders
  GPS_TIMEKEEPING: true,
  MORNING_BRIEFINGS: true,
  INCIDENT_REPORTING: true,
  PANIC_ALERTS: true,           // NEVER gated — critical safety
  COMPLIANCE_BLOCKS: true,      // NEVER gated — critical compliance

  // ── Starter+ ────────────────────────────────────────────────────────────
  TRINITY_AI_FULL: true,
  PERFORMANCE_SCORING: true,
  MILESTONE_RECOGNITION: true,
  BASIC_ANALYTICS: true,
  DOCUMENT_MANAGEMENT: true,
  SINGLE_STATE_COMPLIANCE: true,

  // ── Professional+ ───────────────────────────────────────────────────────
  PAYROLL_PROCESSING: true,
  INVOICE_GENERATION: true,
  VOICE_SYSTEM: true,
  FIFTY_STATE_COMPLIANCE: true,
  CLIENT_PORTAL: true,
  AUDITOR_PORTAL: true,
  RFP_GENERATION: true,
  ADVANCED_ANALYTICS: true,
  PREDICTIVE_BRAIN: true,
  FINANCIAL_INTELLIGENCE: true,
  DISCIPLINARY_ANALYZER: true,
  CONTRACT_HEALTH: true,
  MULTI_LOCATION: true,

  // ── Business+ ───────────────────────────────────────────────────────────
  MULTI_WORKSPACE: true,
  FULL_FINANCIAL_SUITE: true,
  SOCIAL_GRAPH: true,
  API_ACCESS: true,
  CUSTOM_REPORTING: true,
  SLACK_TEAMS_INTEGRATION: true,

  // ── Enterprise only ─────────────────────────────────────────────────────
  WHITE_LABEL: true,
  CUSTOM_INTEGRATIONS: true,
  ADVANCED_MULTI_AGENT: true,
  FEDERAL_COMPLIANCE: true,
  CUSTOM_AI_FINE_TUNING: true,
  SLA_MANAGEMENT: true,

  // ── Platform admin (internal) ───────────────────────────────────────────
  PLATFORM_ADMIN: true,
  STRIPE_PAYMENTS: true,
};

export type FeatureTier = 'trial' | 'starter' | 'professional' | 'business' | 'enterprise';

/**
 * Minimum tier required for each feature.
 * Unlocks cascade upward: business includes professional includes starter, etc.
 */
export const FEATURE_TIERS: Record<string, FeatureTier> = {
  // Always available (trial+)
  CORE_SCHEDULING:           'trial',
  TIME_TRACKING:             'trial',
  EMPLOYEE_MANAGEMENT:       'trial',
  EMAIL_NOTIFICATIONS:       'trial',
  CHATROOMS:                 'trial',
  HELPDESK:                  'trial',
  HELPAI_BASIC:              'trial',
  GPS_TIMEKEEPING:           'trial',
  MORNING_BRIEFINGS:         'trial',
  INCIDENT_REPORTING:        'trial',
  PANIC_ALERTS:              'trial',   // CRITICAL — never block
  COMPLIANCE_BLOCKS:         'trial',   // CRITICAL — never block

  // Starter+
  TRINITY_AI_FULL:           'starter',
  PERFORMANCE_SCORING:       'starter',
  MILESTONE_RECOGNITION:     'starter',
  BASIC_ANALYTICS:           'starter',
  DOCUMENT_MANAGEMENT:       'starter',
  SINGLE_STATE_COMPLIANCE:   'starter',

  // Professional+
  PAYROLL_PROCESSING:        'professional',
  INVOICE_GENERATION:        'professional',
  VOICE_SYSTEM:              'professional',
  FIFTY_STATE_COMPLIANCE:    'professional',
  CLIENT_PORTAL:             'professional',
  AUDITOR_PORTAL:            'professional',
  RFP_GENERATION:            'professional',
  ADVANCED_ANALYTICS:        'professional',
  PREDICTIVE_BRAIN:          'professional',
  FINANCIAL_INTELLIGENCE:    'professional',
  DISCIPLINARY_ANALYZER:     'professional',
  CONTRACT_HEALTH:           'professional',
  MULTI_LOCATION:            'professional',

  // Business+
  MULTI_WORKSPACE:           'business',
  FULL_FINANCIAL_SUITE:      'business',
  SOCIAL_GRAPH:              'business',
  API_ACCESS:                'business',
  CUSTOM_REPORTING:          'business',
  SLACK_TEAMS_INTEGRATION:   'business',

  // Enterprise only
  WHITE_LABEL:               'enterprise',
  CUSTOM_INTEGRATIONS:       'enterprise',
  ADVANCED_MULTI_AGENT:      'enterprise',
  FEDERAL_COMPLIANCE:        'enterprise',
  CUSTOM_AI_FINE_TUNING:     'enterprise',
  SLA_MANAGEMENT:            'enterprise',
};

const TIER_ORDER: FeatureTier[] = ['trial', 'starter', 'professional', 'business', 'enterprise', 'strategic' as FeatureTier];

/**
 * Returns true if the workspace's current tier meets the minimum required tier.
 */
export function tierMeetsRequirement(workspaceTier: string, requiredTier: FeatureTier): boolean {
  const workspaceIdx = TIER_ORDER.indexOf(workspaceTier as FeatureTier);
  const requiredIdx  = TIER_ORDER.indexOf(requiredTier);
  if (workspaceIdx === -1) return false;
  return workspaceIdx >= requiredIdx;
}

export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature] ?? false;
}

export function getEnabledFeatures(): string[] {
  return Object.entries(FEATURE_FLAGS)
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature);
}

export function getDisabledFeatures(): string[] {
  return Object.entries(FEATURE_FLAGS)
    .filter(([, enabled]) => !enabled)
    .map(([feature]) => feature);
}

export function getMinTierForFeature(feature: string): FeatureTier | null {
  return FEATURE_TIERS[feature] ?? null;
}

log.info('[Features] Tier-aware feature flags loaded:', Object.keys(FEATURE_TIERS).length, 'features mapped across 5 tiers');
