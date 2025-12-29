/**
 * MVP Feature Flag System
 * Controls which features are enabled for MVP launch vs Enterprise tier
 * 
 * IMPORTANT: Do NOT delete any enterprise code - just wrap in feature flag checks
 * These features will be reactivated for Fortune 500 customers (Securitas, Allied Universal)
 */

export const FEATURE_FLAGS = {
  // =============================================
  // MVP Features (ENABLED) - Core Workforce Management
  // =============================================
  CORE_SCHEDULING: true,
  BASIC_PAYROLL: true,
  TIME_TRACKING: true,
  STRIPE_PAYMENTS: true,
  EMAIL_NOTIFICATIONS: true,
  TRINITY_AI_BASIC: true,
  EMPLOYEE_MANAGEMENT: true,
  CLIENT_MANAGEMENT: true,
  BASIC_INVOICING: true,
  BASIC_REPORTS: true,
  CHATROOMS: true,
  HELPDESK: true,
  
  // =============================================
  // Enterprise Features (DISABLED for MVP)
  // Reactivate when targeting Fortune 500 customers
  // =============================================
  
  // Infrastructure Services (Q1-Q4)
  DISASTER_RECOVERY: false,        // ENTERPRISE FEATURE - Disabled for MVP
  CHAOS_TESTING: false,            // ENTERPRISE FEATURE - Disabled for MVP
  SLA_MONITORING: false,           // ENTERPRISE FEATURE - Disabled for MVP
  LAUNCH_READINESS_CHECKS: false,  // ENTERPRISE FEATURE - Disabled for MVP
  CIRCUIT_BREAKERS: false,         // Keep in code, just bypass for MVP
  DISTRIBUTED_TRACING: false,      // ENTERPRISE FEATURE - Disabled for MVP
  CDN_EDGE_CACHING: false,         // ENTERPRISE FEATURE - Disabled for MVP
  LOG_AGGREGATION: false,          // ENTERPRISE FEATURE - Disabled for MVP
  SECURITY_HARDENING: false,       // ENTERPRISE FEATURE - Disabled for MVP
  AUDIT_TRAIL_EXPORT: false,       // ENTERPRISE FEATURE - Disabled for MVP
  
  // Compliance Features
  SOX_COMPLIANCE: false,           // ENTERPRISE FEATURE - Disabled for MVP
  GDPR_COMPLIANCE: false,          // ENTERPRISE FEATURE - Disabled for MVP
  HIPAA_COMPLIANCE: false,         // ENTERPRISE FEATURE - Disabled for MVP
  PCI_DSS_COMPLIANCE: false,       // ENTERPRISE FEATURE - Disabled for MVP
  
  // Advanced Analytics
  ADVANCED_ANALYTICS: false,       // ENTERPRISE FEATURE - Disabled for MVP
  AI_PREDICTIVE_ANALYTICS: false,  // ENTERPRISE FEATURE - Disabled for MVP
  HEAT_MAP_VISUALIZATIONS: false,  // ENTERPRISE FEATURE - Disabled for MVP
  
  // Advanced Integrations
  HRIS_INTEGRATION: false,         // ENTERPRISE FEATURE - 8 provider integrations
  COGNITIVE_ONBOARDING: false,     // ENTERPRISE FEATURE - Auto-extraction
  ADVANCED_API_ACCESS: false,      // ENTERPRISE FEATURE - Disabled for MVP
  WEBHOOKS: false,                 // ENTERPRISE FEATURE - Disabled for MVP
  WHITE_LABEL: false,              // ENTERPRISE FEATURE - Disabled for MVP
  
  // Platform Admin Features (keep enabled for internal use)
  INFRASTRUCTURE_DASHBOARD: false, // Hide from regular users for MVP
  PLATFORM_ADMIN: true,            // Keep for internal ops
};

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature] ?? false;
}

/**
 * Get all enabled features
 */
export function getEnabledFeatures(): string[] {
  return Object.entries(FEATURE_FLAGS)
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature);
}

/**
 * Get all disabled features (enterprise tier)
 */
export function getDisabledFeatures(): string[] {
  return Object.entries(FEATURE_FLAGS)
    .filter(([, enabled]) => !enabled)
    .map(([feature]) => feature);
}

/**
 * Feature tier requirements
 * Maps features to minimum subscription tier needed
 */
export const FEATURE_TIERS: Record<string, 'free' | 'starter' | 'professional' | 'enterprise'> = {
  CORE_SCHEDULING: 'free',
  TIME_TRACKING: 'free',
  EMPLOYEE_MANAGEMENT: 'free',
  BASIC_REPORTS: 'starter',
  BASIC_INVOICING: 'starter',
  BASIC_PAYROLL: 'professional',
  TRINITY_AI_BASIC: 'professional',
  ADVANCED_ANALYTICS: 'enterprise',
  SLA_MONITORING: 'enterprise',
  DISASTER_RECOVERY: 'enterprise',
  SOX_COMPLIANCE: 'enterprise',
  HRIS_INTEGRATION: 'enterprise',
};

console.log('[Features] MVP Feature Flags loaded:', getEnabledFeatures().length, 'enabled,', getDisabledFeatures().length, 'disabled for enterprise tier');
