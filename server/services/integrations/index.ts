/**
 * External Integration Services
 * 
 * This module exports all third-party integration services.
 * These integrations handle OAuth flows, data synchronization,
 * and API communication with external platforms.
 * 
 * Available Integrations:
 * - QuickBooks: Accounting and invoicing sync
 * - Gusto: Payroll and HR data sync
 * 
 * Note: Each integration requires manual API key setup via environment variables
 * as there are no Replit-native integrations available for these services.
 */

export { quickbooksIntegration, QuickBooksIntegration } from './quickbooksIntegration';
export type { QuickBooksCredentials } from './quickbooksIntegration';

export { gustoIntegration, GustoIntegration } from './gustoIntegration';
export type { GustoConfig, GustoCredentials, GustoEmployee, GustoPayroll } from './gustoIntegration';

export const INTEGRATION_STATUS = {
  QUICKBOOKS: {
    name: 'QuickBooks Online',
    description: 'Sync invoices and financial data',
    requiredSecrets: [
      'QUICKBOOKS_DEV_CLIENT_ID', 'QUICKBOOKS_DEV_CLIENT_SECRET',
      'QUICKBOOKS_PROD_CLIENT_ID', 'QUICKBOOKS_PROD_CLIENT_SECRET',
    ],
    documentationUrl: 'https://developer.intuit.com/',
  },
  GUSTO: {
    name: 'Gusto Payroll',
    description: 'Sync payroll and employee data',
    requiredSecrets: ['GUSTO_CLIENT_ID', 'GUSTO_CLIENT_SECRET'],
    documentationUrl: 'https://dev.gusto.com/',
  },
};

export function getIntegrationStatus(): {
  quickbooks: { configured: boolean; name: string };
  gusto: { configured: boolean; name: string };
} {
  const hasDevCreds = !!(process.env.QUICKBOOKS_DEV_CLIENT_ID && process.env.QUICKBOOKS_DEV_CLIENT_SECRET);
  const hasProdCreds = !!(process.env.QUICKBOOKS_PROD_CLIENT_ID && process.env.QUICKBOOKS_PROD_CLIENT_SECRET);
  const hasLegacyCreds = !!(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);

  return {
    quickbooks: {
      configured: hasDevCreds || hasProdCreds || hasLegacyCreds,
      name: INTEGRATION_STATUS.QUICKBOOKS.name,
    },
    gusto: {
      configured: !!(process.env.GUSTO_CLIENT_ID && process.env.GUSTO_CLIENT_SECRET),
      name: INTEGRATION_STATUS.GUSTO.name,
    },
  };
}
