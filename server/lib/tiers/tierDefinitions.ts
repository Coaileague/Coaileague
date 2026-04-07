/**
 * CANONICAL TIER DEFINITIONS — Phase 30
 * =======================================
 * Single authoritative source of truth for subscription tier enforcement.
 *
 * This file governs route-level feature gating across the entire platform.
 * Pricing and seat limits come from shared/billingConfig.ts (no duplication).
 * Feature-to-tier mapping in server/config/features.ts agrees with this file.
 *
 * TIER HIERARCHY (lowest → highest):
 *   free < trial < starter < professional < business < enterprise < strategic
 *
 * PERMANENT ARCHITECTURE TRUTH:
 *   The grandfathered founding tenant (GRANDFATHERED_TENANT_ID) has permanent
 *   Enterprise access and passes ALL tier checks regardless of stored tier value.
 *   This exemption cannot be overridden by any code, webhook, or cron.
 *   See server/services/billing/founderExemption.ts for the full contract.
 */

import { BILLING } from '@shared/billingConfig';
import { GRANDFATHERED_TENANT_ID, STATEWIDE_WS_ID } from '../../services/billing/founderExemption';

// ── Re-export constants so importing from tierDefinitions is the canonical path ──
export { GRANDFATHERED_TENANT_ID, STATEWIDE_WS_ID };

// ── Tier type and hierarchy ────────────────────────────────────────────────────

export type TierName =
  | 'free'
  | 'trial'
  | 'starter'
  | 'professional'
  | 'business'
  | 'enterprise'
  | 'strategic';

export const TIER_HIERARCHY: Record<TierName, number> = {
  free:         1,
  trial:        2,
  starter:      3,
  professional: 4,
  business:     5,
  enterprise:   6,
  strategic:    7,
};

/**
 * Compare two tiers. Returns true if current >= required.
 */
export function tierMeetsOrExceeds(current: string, required: TierName): boolean {
  const currentLevel = TIER_HIERARCHY[current as TierName] ?? 0;
  const requiredLevel = TIER_HIERARCHY[required];
  return currentLevel >= requiredLevel;
}

// ── Seat limits (sourced from shared/billingConfig.ts) ─────────────────────────

export const TIER_SEAT_LIMITS: Record<TierName, number> = {
  free:         BILLING.tiers.free.maxEmployees,           //   5
  trial:        BILLING.tiers.free.maxEmployees,           //   5
  starter:      BILLING.tiers.starter.maxEmployees,        //  10
  professional: BILLING.tiers.professional.maxEmployees,   //  100
  business:     BILLING.tiers.business.maxEmployees,       //  300
  enterprise:   BILLING.tiers.enterprise.maxEmployees,     // 1000
  strategic:    999999,                                     // custom — no ceiling
};

export const SEAT_WARNING_THRESHOLD_PERCENT = 0.80; // trigger NDS at 80% capacity

// ── Monthly pricing (cents) ────────────────────────────────────────────────────

export const TIER_MONTHLY_PRICE_CENTS: Record<TierName, number> = {
  free:         0,
  trial:        0,
  starter:      BILLING.tiers.starter.monthlyPrice,        //  $299
  professional: BILLING.tiers.professional.monthlyPrice,   //  $999
  business:     BILLING.tiers.business.monthlyPrice,       // $2,999
  enterprise:   BILLING.tiers.enterprise.monthlyPrice,     // $7,999
  strategic:    0,  // custom — negotiated
};

// ── Feature gate registry ─────────────────────────────────────────────────────
//
// Maps feature_key → minimum tier required.
// These gates are enforced at the route level via checkTierAccess() middleware.
//
// STARTER (all paid workspaces):
//   basic scheduling, clock-in/out, incident reporting, basic invoicing,
//   officer management, basic compliance, GPS time tracking, mobile app
//
// PROFESSIONAL:
//   QuickBooks sync, advanced analytics, client portal, document signing/vault,
//   inbound email routing, custom notification templates, payroll processing,
//   invoice automation, multi-state compliance, e-signatures, contract pipeline
//
// BUSINESS:
//   SRA regulatory auditor portal, advanced Trinity AI (executive planner),
//   bulk payroll export (ADP/Gusto), API access, multi-workspace management,
//   full financial suite, social graph, custom reporting, outbound webhooks
//
// ENTERPRISE:
//   Custom compliance rules, advanced BI dashboard, white-label,
//   priority Trinity AI, dedicated support SLA, federal compliance,
//   custom AI fine-tuning

export const TIER_FEATURE_GATES: Record<string, TierName> = {
  // ── Always-on (free/trial) ──────────────────────────────────────────────
  'core_scheduling':            'free',
  'time_tracking':              'free',
  'clock_in_out':               'free',
  'incident_reporting':         'free',   // CRITICAL — never block
  'panic_alerts':               'free',   // CRITICAL — never block
  'compliance_blocks':          'free',   // CRITICAL — never block
  'officer_management':         'free',
  'basic_helpdesk':             'free',
  'email_notifications':        'free',
  'chatrooms':                  'free',

  // ── Starter+ ────────────────────────────────────────────────────────────
  'gps_time_tracking':          'starter',
  'mobile_app':                 'starter',
  'basic_analytics':            'starter',
  'basic_invoicing':            'starter',
  'document_management':        'starter',
  'single_state_compliance':    'starter',
  'trinity_ai_basic':           'starter',
  'performance_scoring':        'starter',
  'shift_swapping':             'starter',
  'morning_briefings':          'starter',

  // ── Professional+ ───────────────────────────────────────────────────────
  'quickbooks_integration':     'professional',
  'advanced_analytics':         'professional',
  'client_portal':              'professional',
  'document_signing':           'professional',
  'document_vault':             'professional',
  'inbound_email_routing':      'professional',
  'custom_notification_templates': 'professional',
  'payroll_processing':         'professional',
  'invoice_automation':         'professional',
  'multi_state_compliance':     'professional',
  'e_signatures':               'professional',
  'contract_pipeline':          'professional',
  'rfp_generation':             'professional',
  'financial_intelligence':     'professional',
  'predictive_brain':           'professional',
  'auditor_portal_basic':       'professional',
  'multi_location':             'professional',
  'voice_system':               'professional',
  'disciplinary_analyzer':      'professional',

  // ── Business+ ───────────────────────────────────────────────────────────
  'sra_regulatory_portal':      'business',
  'advanced_trinity_ai':        'business',
  'bulk_payroll_export':        'business',
  'api_access':                 'business',
  'multi_workspace':            'business',
  'full_financial_suite':       'business',
  'social_graph':               'business',
  'custom_reporting':           'business',
  'outbound_webhooks':          'business',
  'slack_teams_integration':    'business',

  // ── Enterprise+ ─────────────────────────────────────────────────────────
  'custom_compliance_rules':    'enterprise',
  'advanced_bi_dashboard':      'enterprise',
  'white_label':                'enterprise',
  'priority_trinity_ai':        'enterprise',
  'dedicated_support_sla':      'enterprise',
  'federal_compliance':         'enterprise',
  'custom_ai_fine_tuning':      'enterprise',
  'unlimited_custom_posts':     'enterprise',
  'advanced_multi_agent':       'enterprise',
};

/**
 * Get the minimum tier required for a feature key.
 * Returns 'free' (always allowed) if the feature is not registered.
 */
export function getMinimumTierForFeature(featureKey: string): TierName {
  return TIER_FEATURE_GATES[featureKey] ?? 'free';
}

// ── Downgrade grace period ─────────────────────────────────────────────────────

export const DOWNGRADE_GRACE_PERIOD_DAYS = 30;

// ── Strategic tier definition ──────────────────────────────────────────────────
//
// Strategic tier is manually configured by platform staff only.
// It has custom pricing, custom seat limits, and all features enabled.
// It is positioned above Enterprise in the tier hierarchy (level 7).
// Workspace operators cannot self-serve upgrade to Strategic.

export const STRATEGIC_TIER_CONFIG = {
  name: 'strategic' as TierName,
  displayName: 'Strategic Partner',
  pricing: 'custom',
  seatLimit: 'custom',
  allFeaturesEnabled: true,
  requiresPlatformStaffConfiguration: true,
  description: 'Custom strategic partnership tier — manually configured per agreement.',
};

// ── Upgrade URL helper ─────────────────────────────────────────────────────────

export function getUpgradeUrl(requiredTier: TierName): string {
  return `/billing/upgrade?tier=${requiredTier}`;
}

// ── Tier display name helper ───────────────────────────────────────────────────

export const TIER_DISPLAY_NAMES: Record<TierName, string> = {
  free:         'Free Trial',
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  business:     'Business',
  enterprise:   'Enterprise',
  strategic:    'Strategic Partner',
};
