/**
 * Provider Preference Service
 * 
 * Checks workspace billing settings to determine which providers to use
 * for invoicing, payroll, and other financial operations.
 * 
 * Enables Stripe-local mode where orgs can use Stripe instead of QuickBooks
 * while keeping Trinity automations functional.
 */

import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

const log = createLogger('providerPreferenceService');
export type InvoiceProvider = 'stripe' | 'quickbooks' | 'manual';
export type PayrollProvider = 'local' | 'quickbooks' | 'gusto' | 'adp';

export interface ProviderPreferences {
  invoiceProvider: InvoiceProvider;
  payrollProvider: PayrollProvider;
  qbAutoSync: boolean;
}

class ProviderPreferenceService {
  private cache: Map<string, { prefs: ProviderPreferences; expires: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get provider preferences for a workspace
   */
  async getPreferences(workspaceId: string): Promise<ProviderPreferences> {
    // Check cache
    const cached = this.cache.get(workspaceId);
    if (cached && cached.expires > Date.now()) {
      return cached.prefs;
    }

    try {
      const [ws] = await db.select({ blob: workspaces.billingSettingsBlob })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const settings = (ws?.blob || {}) as Record<string, any>;

      const prefs: ProviderPreferences = {
        invoiceProvider: (settings.invoiceProvider as InvoiceProvider) || 'stripe',
        payrollProvider: (settings.payrollProvider as PayrollProvider) || 'local',
        qbAutoSync: settings.qbAutoSync ?? false,
      };

      // Cache result
      this.cache.set(workspaceId, { prefs, expires: Date.now() + this.CACHE_TTL_MS });
      
      return prefs;
    } catch (error) {
      log.error('[ProviderPreference] Error fetching preferences:', error);
      return {
        invoiceProvider: 'stripe',
        payrollProvider: 'local',
        qbAutoSync: false,
      };
    }
  }

  /**
   * Check if QuickBooks sync should proceed for invoicing
   */
  async shouldSyncInvoicesToQB(workspaceId: string): Promise<boolean> {
    const prefs = await this.getPreferences(workspaceId);
    return prefs.invoiceProvider === 'quickbooks' && prefs.qbAutoSync;
  }

  /**
   * Check if QuickBooks sync should proceed for payroll
   */
  async shouldSyncPayrollToQB(workspaceId: string): Promise<boolean> {
    const prefs = await this.getPreferences(workspaceId);
    return prefs.payrollProvider === 'quickbooks' && prefs.qbAutoSync;
  }

  /**
   * Check if any QB sync is enabled
   */
  async isQBSyncEnabled(workspaceId: string): Promise<boolean> {
    const prefs = await this.getPreferences(workspaceId);
    return prefs.qbAutoSync && (
      prefs.invoiceProvider === 'quickbooks' || 
      prefs.payrollProvider === 'quickbooks'
    );
  }

  /**
   * Check if Stripe should be used for invoicing
   */
  async shouldUseStripeForInvoicing(workspaceId: string): Promise<boolean> {
    const prefs = await this.getPreferences(workspaceId);
    return prefs.invoiceProvider === 'stripe';
  }

  /**
   * Check if local payroll processing should be used
   */
  async shouldUseLocalPayroll(workspaceId: string): Promise<boolean> {
    const prefs = await this.getPreferences(workspaceId);
    return prefs.payrollProvider === 'local';
  }

  /**
   * Clear cache for a workspace (call after settings update)
   */
  clearCache(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  /**
   * Clear all cached preferences
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}

export const providerPreferenceService = new ProviderPreferenceService();
