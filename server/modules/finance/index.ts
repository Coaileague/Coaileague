/**
 * Finance Module - Domain aggregator for financial functionality
 * 
 * This module provides a unified entry point for billing, invoicing,
 * payroll, and QuickBooks integration services.
 * 
 * Services:
 * - billing: Credit management, subscriptions, feature gates
 * - quickbooks: OAuth + sync integration
 * - automation: Billable hours, payroll hours, rate resolution
 * 
 * Routes: server/routes/invoice.ts, server/routes/payroll.ts
 * Types: shared/schema.ts (Invoice, Payroll, PayrollRecord)
 */

// Re-export billing services
export * from '../../services/billing';

// Module documentation for IDE navigation
export const FINANCE_MODULE = {
  services: {
    billing: '../../services/billing',
    quickbooks: '../../services/oauth/quickbooks',
    quickbooksPartner: '../../services/partners/quickbooks',
    billableHours: '../../services/automation/billableHoursAggregator',
    payrollHours: '../../services/automation/payrollHoursAggregator',
    rateResolver: '../../services/automation/rateResolver',
  },
  routes: {
    invoice: '../../routes/invoices',
    payroll: '../../routes/payroll',
    quickbooks: '../../routes/quickbooksRoutes',
    stripe: '../../routes/stripePayments',
  },
  schema: {
    types: 'shared/schema.ts',
    entities: ['invoices', 'invoiceLineItems', 'payrollRecords', 'billingCycles'],
  },
} as const;
