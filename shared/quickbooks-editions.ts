/**
 * QuickBooks Edition Compatibility Configuration
 * 
 * CoAIleague supports ALL QuickBooks editions for seamless integration and migration.
 * This file defines edition capabilities, API requirements, and feature availability.
 * 
 * CRITICAL: As of August 1, 2025, QuickBooks Online API requires minor version 75+
 * 
 * @see https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/minor-versions
 */

import { INTEGRATIONS } from './platformConfig';

export const QB_API_VERSION = {
  REQUIRED_MINOR_VERSION: 75,
  EFFECTIVE_DATE: '2025-08-01',
  RATE_LIMIT: 500, // requests per minute per realm
};

export type QBEditionType = 
  | 'qbo_simple_start'
  | 'qbo_essentials'
  | 'qbo_plus'
  | 'qbo_advanced'
  | 'qb_desktop_pro'
  | 'qb_desktop_premier'
  | 'qb_desktop_enterprise'
  | 'qb_self_employed'
  | 'unknown';

export type QBApiType = 'rest' | 'soap' | 'graphql';

export interface QBEditionConfig {
  id: QBEditionType;
  name: string;
  displayName: string;
  family: 'online' | 'desktop' | 'self_employed';
  apiType: QBApiType;
  apiSupported: boolean;
  maxUsers: number | 'unlimited';
  features: {
    classes: boolean;
    locations: boolean;
    projects: boolean;
    inventory: boolean;
    customFields: boolean;
    timeTracking: boolean;
    billPay: boolean;
    payroll: boolean;
    budgeting: boolean;
    batchTransactions: boolean;
    advancedReporting: boolean;
  };
  syncCapabilities: {
    customers: boolean;
    vendors: boolean;
    employees: boolean;
    invoices: boolean;
    payments: boolean;
    timeActivities: boolean;
    estimates: boolean;
    purchaseOrders: boolean;
    items: boolean;
    accounts: boolean;
  };
  notes: string;
}

export const QB_EDITIONS: Record<QBEditionType, QBEditionConfig> = {
  qbo_simple_start: {
    id: 'qbo_simple_start',
    name: 'Simple Start',
    displayName: 'QuickBooks Online Simple Start',
    family: 'online',
    apiType: 'rest',
    apiSupported: true,
    maxUsers: 1,
    features: {
      classes: false,
      locations: false,
      projects: false,
      inventory: false,
      customFields: false,
      timeTracking: false,
      billPay: false,
      payroll: false,
      budgeting: false,
      batchTransactions: false,
      advancedReporting: false,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: false,
      invoices: true,
      payments: true,
      timeActivities: false,
      estimates: true,
      purchaseOrders: false,
      items: true,
      accounts: true,
    },
    notes: 'Basic edition - limited sync features. Ideal for solopreneurs.',
  },

  qbo_essentials: {
    id: 'qbo_essentials',
    name: 'Essentials',
    displayName: 'QuickBooks Online Essentials',
    family: 'online',
    apiType: 'rest',
    apiSupported: true,
    maxUsers: 3,
    features: {
      classes: false,
      locations: false,
      projects: false,
      inventory: false,
      customFields: false,
      timeTracking: true,
      billPay: true,
      payroll: false,
      budgeting: false,
      batchTransactions: false,
      advancedReporting: false,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: true,
      invoices: true,
      payments: true,
      timeActivities: true,
      estimates: true,
      purchaseOrders: false,
      items: true,
      accounts: true,
    },
    notes: 'Good for small teams. Supports time tracking and bill management.',
  },

  qbo_plus: {
    id: 'qbo_plus',
    name: 'Plus',
    displayName: 'QuickBooks Online Plus',
    family: 'online',
    apiType: 'rest',
    apiSupported: true,
    maxUsers: 5,
    features: {
      classes: true,
      locations: true,
      projects: true,
      inventory: true,
      customFields: true,
      timeTracking: true,
      billPay: true,
      payroll: false,
      budgeting: true,
      batchTransactions: false,
      advancedReporting: false,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: true,
      invoices: true,
      payments: true,
      timeActivities: true,
      estimates: true,
      purchaseOrders: true,
      items: true,
      accounts: true,
    },
    notes: 'Most popular edition. Full sync capabilities with class/location tracking.',
  },

  qbo_advanced: {
    id: 'qbo_advanced',
    name: 'Advanced',
    displayName: 'QuickBooks Online Advanced',
    family: 'online',
    apiType: 'rest',
    apiSupported: true,
    maxUsers: 25,
    features: {
      classes: true,
      locations: true,
      projects: true,
      inventory: true,
      customFields: true,
      timeTracking: true,
      billPay: true,
      payroll: true,
      budgeting: true,
      batchTransactions: true,
      advancedReporting: true,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: true,
      invoices: true,
      payments: true,
      timeActivities: true,
      estimates: true,
      purchaseOrders: true,
      items: true,
      accounts: true,
    },
    notes: 'Enterprise-grade QBO. All features available including batch operations.',
  },

  qb_desktop_pro: {
    id: 'qb_desktop_pro',
    name: 'Desktop Pro',
    displayName: 'QuickBooks Desktop Pro',
    family: 'desktop',
    apiType: 'soap',
    apiSupported: true,
    maxUsers: 3,
    features: {
      classes: true,
      locations: false,
      projects: false,
      inventory: true,
      customFields: true,
      timeTracking: true,
      billPay: false,
      payroll: false,
      budgeting: false,
      batchTransactions: false,
      advancedReporting: false,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: true,
      invoices: true,
      payments: true,
      timeActivities: true,
      estimates: true,
      purchaseOrders: true,
      items: true,
      accounts: true,
    },
    notes: 'Desktop edition. Requires Web Connector for API sync (SOAP-based).',
  },

  qb_desktop_premier: {
    id: 'qb_desktop_premier',
    name: 'Desktop Premier',
    displayName: 'QuickBooks Desktop Premier',
    family: 'desktop',
    apiType: 'soap',
    apiSupported: true,
    maxUsers: 5,
    features: {
      classes: true,
      locations: true,
      projects: false,
      inventory: true,
      customFields: true,
      timeTracking: true,
      billPay: false,
      payroll: false,
      budgeting: true,
      batchTransactions: false,
      advancedReporting: true,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: true,
      invoices: true,
      payments: true,
      timeActivities: true,
      estimates: true,
      purchaseOrders: true,
      items: true,
      accounts: true,
    },
    notes: 'Industry-specific editions available. Requires Web Connector.',
  },

  qb_desktop_enterprise: {
    id: 'qb_desktop_enterprise',
    name: 'Desktop Enterprise',
    displayName: 'QuickBooks Desktop Enterprise',
    family: 'desktop',
    apiType: 'soap',
    apiSupported: true,
    maxUsers: 40,
    features: {
      classes: true,
      locations: true,
      projects: true,
      inventory: true,
      customFields: true,
      timeTracking: true,
      billPay: true,
      payroll: true,
      budgeting: true,
      batchTransactions: true,
      advancedReporting: true,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: true,
      invoices: true,
      payments: true,
      timeActivities: true,
      estimates: true,
      purchaseOrders: true,
      items: true,
      accounts: true,
    },
    notes: 'Full enterprise desktop. Maximum capacity and all features.',
  },

  qb_self_employed: {
    id: 'qb_self_employed',
    name: 'Self-Employed',
    displayName: 'QuickBooks Self-Employed',
    family: 'self_employed',
    apiType: 'rest',
    apiSupported: false,
    maxUsers: 1,
    features: {
      classes: false,
      locations: false,
      projects: false,
      inventory: false,
      customFields: false,
      timeTracking: false,
      billPay: false,
      payroll: false,
      budgeting: false,
      batchTransactions: false,
      advancedReporting: false,
    },
    syncCapabilities: {
      customers: false,
      vendors: false,
      employees: false,
      invoices: false,
      payments: false,
      timeActivities: false,
      estimates: false,
      purchaseOrders: false,
      items: false,
      accounts: false,
    },
    notes: 'Self-Employed has no API access. Users should upgrade to Simple Start.',
  },

  unknown: {
    id: 'unknown',
    name: 'Unknown',
    displayName: 'Unknown QuickBooks Edition',
    family: 'online',
    apiType: 'rest',
    apiSupported: false,
    maxUsers: 1,
    features: {
      classes: false,
      locations: false,
      projects: false,
      inventory: false,
      customFields: false,
      timeTracking: false,
      billPay: false,
      payroll: false,
      budgeting: false,
      batchTransactions: false,
      advancedReporting: false,
    },
    syncCapabilities: {
      customers: true,
      vendors: true,
      employees: false,
      invoices: true,
      payments: true,
      timeActivities: false,
      estimates: false,
      purchaseOrders: false,
      items: true,
      accounts: true,
    },
    notes: 'Edition could not be determined. Using minimal sync capabilities.',
  },
};

export const QB_EDITION_FAMILIES = {
  online: {
    name: 'QuickBooks Online',
    description: 'Cloud-based accounting accessible from anywhere',
    apiType: 'rest' as QBApiType,
    editions: ['qbo_simple_start', 'qbo_essentials', 'qbo_plus', 'qbo_advanced'] as QBEditionType[],
    migrationPriority: 1,
  },
  desktop: {
    name: 'QuickBooks Desktop',
    description: 'Traditional installed accounting software',
    apiType: 'soap' as QBApiType,
    editions: ['qb_desktop_pro', 'qb_desktop_premier', 'qb_desktop_enterprise'] as QBEditionType[],
    migrationPriority: 2,
    webConnectorRequired: true,
  },
  self_employed: {
    name: 'QuickBooks Self-Employed',
    description: 'Simple tax and expense tracking for freelancers',
    apiType: 'rest' as QBApiType,
    editions: ['qb_self_employed'] as QBEditionType[],
    migrationPriority: 3,
    upgradeRecommendation: 'qbo_simple_start',
  },
};

export interface QBMigrationAnalysis {
  sourceEdition: QBEditionType;
  targetCompatibility: 'full' | 'partial' | 'none';
  supportedFeatures: string[];
  unsupportedFeatures: string[];
  recommendations: string[];
  estimatedMigrationTime: string;
}

export function analyzeQBMigration(sourceEdition: QBEditionType): QBMigrationAnalysis {
  const edition = QB_EDITIONS[sourceEdition];
  const supportedFeatures: string[] = [];
  const unsupportedFeatures: string[] = [];
  const recommendations: string[] = [];

  if (!edition.apiSupported) {
    return {
      sourceEdition,
      targetCompatibility: 'none',
      supportedFeatures: [],
      unsupportedFeatures: ['API access not available for this edition'],
      recommendations: [
        `Upgrade to ${QB_EDITIONS.qbo_simple_start.displayName} or higher for API access`,
        'Manual data import via CSV may be required',
      ],
      estimatedMigrationTime: 'Manual process required',
    };
  }

  Object.entries(edition.syncCapabilities).forEach(([feature, supported]) => {
    if (supported) {
      supportedFeatures.push(feature);
    } else {
      unsupportedFeatures.push(feature);
    }
  });

  if (edition.family === 'desktop') {
    recommendations.push('Web Connector required for real-time sync');
    recommendations.push('Consider migrating to QuickBooks Online for cloud-based sync');
  }

  if (!edition.features.timeTracking) {
    recommendations.push('Time Activities sync limited - consider upgrading to Essentials or Plus');
  }

  if (!edition.features.classes) {
    recommendations.push('Class/department tracking not available - job costing may be limited');
  }

  const compatibility = unsupportedFeatures.length === 0 
    ? 'full' 
    : unsupportedFeatures.length <= 3 
      ? 'partial' 
      : 'none';

  const timeEstimates: Record<string, string> = {
    qbo_simple_start: '15-30 minutes',
    qbo_essentials: '30-45 minutes',
    qbo_plus: '45-60 minutes',
    qbo_advanced: '1-2 hours',
    qb_desktop_pro: '1-2 hours (Web Connector setup)',
    qb_desktop_premier: '1-2 hours (Web Connector setup)',
    qb_desktop_enterprise: '2-4 hours (Web Connector setup)',
    qb_self_employed: 'Not supported',
    unknown: 'Varies',
  };

  return {
    sourceEdition,
    targetCompatibility: compatibility,
    supportedFeatures,
    unsupportedFeatures,
    recommendations,
    estimatedMigrationTime: timeEstimates[sourceEdition] || 'Varies',
  };
}

export function getEditionByCompanyInfo(companyInfo: {
  subscriptionStatus?: string;
  offeringSku?: string;
  industryType?: string;
}): QBEditionType {
  const sku = companyInfo.offeringSku?.toLowerCase() || '';
  
  if (sku.includes('advanced')) return 'qbo_advanced';
  if (sku.includes('plus')) return 'qbo_plus';
  if (sku.includes('essentials')) return 'qbo_essentials';
  if (sku.includes('simple') || sku.includes('start')) return 'qbo_simple_start';
  if (sku.includes('self-employed') || sku.includes('selfemployed')) return 'qb_self_employed';
  if (sku.includes('enterprise')) return 'qb_desktop_enterprise';
  if (sku.includes('premier')) return 'qb_desktop_premier';
  if (sku.includes('pro') || sku.includes('desktop')) return 'qb_desktop_pro';
  
  return 'unknown';
}

export function buildApiUrl(
  realmId: string,
  entity: string,
  options: {
    sandbox?: boolean;
    minorVersion?: number;
  } = {}
): string {
  // Use centralized config helper - handles sandbox override via resolveApiBase
  const baseUrl = INTEGRATIONS.quickbooks.resolveApiBase({ 
    forceSandbox: options.sandbox 
  });
  
  const minorVersion = options.minorVersion ?? INTEGRATIONS.quickbooks.minorVersion;
  
  return `${baseUrl}/v3/company/${realmId}/${entity}?minorversion=${minorVersion}`;
}

export default {
  QB_API_VERSION,
  QB_EDITIONS,
  QB_EDITION_FAMILIES,
  analyzeQBMigration,
  getEditionByCompanyInfo,
  buildApiUrl,
};
