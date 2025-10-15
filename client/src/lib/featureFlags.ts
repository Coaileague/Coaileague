/**
 * Feature Flag System - Tier-based access control
 * Determines which features are available based on workspace subscription tier
 */

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'fortune500';

export interface FeatureFlags {
  // Portal Access
  employeePortal: boolean;
  clientPortal: boolean;
  auditorPortal: boolean;
  
  // Core Features
  timeTracking: boolean;
  scheduling: boolean;
  invoicing: boolean;
  analytics: boolean;
  
  // Advanced Features
  gpsClockIn: boolean;
  automatedPayroll: boolean;
  rmsReports: boolean;
  shiftOrders: boolean;
  
  // Export & Integration
  csvExports: boolean;
  pdfExports: boolean;
  apiAccess: boolean;
  webhooks: boolean;
  
  // Support & SLA
  prioritySupport: boolean;
  dedicatedAccountManager: boolean;
  customIntegrations: boolean;
  whiteLabel: boolean;
  
  // Limits
  maxEmployees: number;
  maxClients: number;
  maxReportsPerMonth: number;
}

/**
 * Feature availability matrix by subscription tier
 */
export const TIER_FEATURES: Record<SubscriptionTier, FeatureFlags> = {
  free: {
    // Portal Access
    employeePortal: true,
    clientPortal: false,
    auditorPortal: false,
    
    // Core Features
    timeTracking: true,
    scheduling: true,
    invoicing: false,
    analytics: false,
    
    // Advanced Features
    gpsClockIn: false,
    automatedPayroll: false,
    rmsReports: false,
    shiftOrders: false,
    
    // Export & Integration
    csvExports: false,
    pdfExports: false,
    apiAccess: false,
    webhooks: false,
    
    // Support & SLA
    prioritySupport: false,
    dedicatedAccountManager: false,
    customIntegrations: false,
    whiteLabel: false,
    
    // Limits
    maxEmployees: 5,
    maxClients: 3,
    maxReportsPerMonth: 10,
  },
  
  starter: {
    // Portal Access
    employeePortal: true,
    clientPortal: true,
    auditorPortal: false,
    
    // Core Features
    timeTracking: true,
    scheduling: true,
    invoicing: true,
    analytics: true,
    
    // Advanced Features
    gpsClockIn: true,
    automatedPayroll: false,
    rmsReports: true,
    shiftOrders: false,
    
    // Export & Integration
    csvExports: true,
    pdfExports: false,
    apiAccess: false,
    webhooks: false,
    
    // Support & SLA
    prioritySupport: false,
    dedicatedAccountManager: false,
    customIntegrations: false,
    whiteLabel: false,
    
    // Limits
    maxEmployees: 25,
    maxClients: 15,
    maxReportsPerMonth: 50,
  },
  
  professional: {
    // Portal Access
    employeePortal: true,
    clientPortal: true,
    auditorPortal: true,
    
    // Core Features
    timeTracking: true,
    scheduling: true,
    invoicing: true,
    analytics: true,
    
    // Advanced Features
    gpsClockIn: true,
    automatedPayroll: true,
    rmsReports: true,
    shiftOrders: true,
    
    // Export & Integration
    csvExports: true,
    pdfExports: true,
    apiAccess: false,
    webhooks: false,
    
    // Support & SLA
    prioritySupport: true,
    dedicatedAccountManager: false,
    customIntegrations: false,
    whiteLabel: false,
    
    // Limits
    maxEmployees: 100,
    maxClients: 50,
    maxReportsPerMonth: 200,
  },
  
  enterprise: {
    // Portal Access
    employeePortal: true,
    clientPortal: true,
    auditorPortal: true,
    
    // Core Features
    timeTracking: true,
    scheduling: true,
    invoicing: true,
    analytics: true,
    
    // Advanced Features
    gpsClockIn: true,
    automatedPayroll: true,
    rmsReports: true,
    shiftOrders: true,
    
    // Export & Integration
    csvExports: true,
    pdfExports: true,
    apiAccess: true,
    webhooks: true,
    
    // Support & SLA
    prioritySupport: true,
    dedicatedAccountManager: true,
    customIntegrations: true,
    whiteLabel: false,
    
    // Limits
    maxEmployees: 500,
    maxClients: 200,
    maxReportsPerMonth: 1000,
  },
  
  fortune500: {
    // Portal Access - All enabled
    employeePortal: true,
    clientPortal: true,
    auditorPortal: true,
    
    // Core Features - All enabled
    timeTracking: true,
    scheduling: true,
    invoicing: true,
    analytics: true,
    
    // Advanced Features - All enabled
    gpsClockIn: true,
    automatedPayroll: true,
    rmsReports: true,
    shiftOrders: true,
    
    // Export & Integration - All enabled
    csvExports: true,
    pdfExports: true,
    apiAccess: true,
    webhooks: true,
    
    // Support & SLA - Premium
    prioritySupport: true,
    dedicatedAccountManager: true,
    customIntegrations: true,
    whiteLabel: true,
    
    // Limits - Unlimited
    maxEmployees: 9999,
    maxClients: 9999,
    maxReportsPerMonth: 9999,
  },
};

/**
 * Get feature flags for a given subscription tier
 */
export function getFeatureFlags(tier: string | null | undefined): FeatureFlags {
  const normalizedTier = (tier?.toLowerCase() || 'free') as SubscriptionTier;
  return TIER_FEATURES[normalizedTier] || TIER_FEATURES.free;
}

/**
 * Check if a specific feature is available for a tier
 */
export function hasFeature(tier: string | null | undefined, feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags(tier);
  return Boolean(flags[feature]);
}

/**
 * Get upgrade message for locked features
 */
export function getUpgradeMessage(currentTier: string | null | undefined, feature: keyof FeatureFlags): string {
  const tier = currentTier?.toLowerCase() || 'free';
  
  const upgradeMap: Record<string, string> = {
    free: 'Upgrade to Starter ($299/mo) to unlock this feature',
    starter: 'Upgrade to Professional ($799/mo) to unlock this feature',
    professional: 'Upgrade to Enterprise ($2,999/mo) to unlock this feature',
    enterprise: 'Upgrade to Fortune 500 ($7,999/mo) for unlimited access',
  };
  
  return upgradeMap[tier] || 'Upgrade your plan to unlock this feature';
}

/**
 * Get tier display name
 */
export function getTierDisplayName(tier: string | null | undefined): string {
  const tierNames: Record<string, string> = {
    free: 'Free Plan',
    starter: 'Starter Plan',
    professional: 'Professional Plan',
    enterprise: 'Enterprise Plan',
    fortune500: 'Fortune 500 Plan',
  };
  
  return tierNames[tier?.toLowerCase() || 'free'] || 'Free Plan';
}
