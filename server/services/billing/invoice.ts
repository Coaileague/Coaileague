import { db } from '../../db';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { createLogger } from '../../lib/logger';


import {
  subscriptionInvoices,
  subscriptionLineItems,
  subscriptionPayments,
  workspaceAddons,
  billingAddons,
  aiUsageDailyRollups,
  workspaces,
  billingAuditLog,
  invoiceAdjustments,
  invoices,
  invoiceLineItems,
  clients,
  type InsertSubscriptionInvoice,
  type SubscriptionInvoice,
  type InsertSubscriptionLineItem,
  type SubscriptionLineItem,
  type Invoice,
  type InvoiceLineItem,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { emailService } from '../emailService';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { isBillingExcluded } from './billingConstants';
import { saveToVault } from '../documents/businessFormsVaultService';
import {
  calculateInvoiceLineItem,
  calculateInvoiceTotal,
  sumFinancialValues,
  subtractFinancialValues,
  multiplyFinancialValues,
  toFinancialString,
  formatCurrency,
} from '../financialCalculator';

const log = createLogger('invoice');

export interface InvoiceLineItemInput {
  itemType: 'subscription' | 'addon' | 'usage' | 'overage' | 'credit' | 'adjustment';
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  addonId?: string;
  featureKey?: string;
  metadata?: any;
}

export interface GenerateInvoiceInput {
  workspaceId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueDate?: Date;
}

export interface ClientLineItemInput {
  description: string;
  quantity: number;
  rate: number;
}

export interface GenerateClientInvoiceInput {
  clientId: string;
  workspaceId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  lineItems: ClientLineItemInput[];
  notes?: string;
  dueDate?: Date;
}

export interface ClientInvoiceResult {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  calculations: {
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  };
}

export class InvoiceService {
  /**
   * Generate weekly invoice for a workspace
   * Aggregates subscription fees, add-on charges, and usage-based charges
   */
  async generateInvoice(input: GenerateInvoiceInput): Promise<SubscriptionInvoice> {
    const { workspaceId, billingPeriodStart, billingPeriodEnd } = input;

    const existing = await db.select()
      .from(subscriptionInvoices)
      .where(
        and(
          eq(subscriptionInvoices.workspaceId, workspaceId),
          eq(subscriptionInvoices.billingPeriodStart, billingPeriodStart),
          eq(subscriptionInvoices.billingPeriodEnd, billingPeriodEnd)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const invoiceNumber = await this.generateInvoiceNumber(workspaceId, billingPeriodStart);
    const dueDate = input.dueDate || new Date(billingPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const lineItems: InvoiceLineItemInput[] = [];
    const addons = await this.getActiveAddons(workspaceId, billingPeriodStart, billingPeriodEnd);
    for (const addon of addons) {
      lineItems.push({
        itemType: 'addon',
        description: `${addon.name} - ${this.formatPeriod(billingPeriodStart, billingPeriodEnd)}`,
        quantity: 1,
        unitPrice: addon.price,
        amount: addon.price,
        addonId: addon.id,
        metadata: {
          pricingType: addon.pricingType,
          usageUnit: addon.usageUnit,
        },
      });
    }

    const subOrgLineItems = await this.calculateSubOrgCharges(workspaceId, billingPeriodStart, billingPeriodEnd);
    lineItems.push(...subOrgLineItems);

    const usageCharges = await this.calculateUsageCharges(workspaceId, billingPeriodStart, billingPeriodEnd);
    lineItems.push(...usageCharges);

    const [workspace] = await db.select({
      defaultTaxRate: workspaces.defaultTaxRate,
      taxJurisdiction: workspaces.taxJurisdiction,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const parsedTaxRate = workspace?.defaultTaxRate ? (parseFloat(workspace.defaultTaxRate) || 0) : 0;
    // Guard: reject negative rates, or rates > 100% — fall back to 0 and log a warning.
    // Using a hardcoded fallback tax rate (e.g. NY 8.875%) for an unknown jurisdiction would
    // silently bill customers incorrectly. Safer to apply 0% and flag for human review.
    let taxRate = 0;
    if (parsedTaxRate >= 0 && parsedTaxRate <= 1) {
      taxRate = parsedTaxRate;
    } else if (parsedTaxRate > 1 && parsedTaxRate <= 100) {
      // Workspace stored rate as a percentage (e.g. 8.875) instead of decimal (0.08875)
      taxRate = parsedTaxRate / 100;
    } else {
      // Out-of-range: log warning and apply 0% to avoid silent mis-billing
      log.warn(`[InvoiceService] Workspace ${workspaceId} has invalid defaultTaxRate (${workspace?.defaultTaxRate}) — applying 0% and flagging for review`);
      taxRate = 0;
    }

    return await db.transaction(async (tx) => {
      const [invoice] = await tx.insert(subscriptionInvoices)
        .values({
          workspaceId,
          invoiceNumber,
          billingPeriodStart,
          billingPeriodEnd,
          subtotal: '0.00',
          taxAmount: '0.00',
          discountAmount: '0.00',
          totalAmount: '0.00',
          status: 'draft',
          dueDate,
          notes: `Generated by Trinity Subscription Automation | ${invoiceNumber}`,
        })
        .returning();

      const adjustments = await tx.select()
        .from(invoiceAdjustments)
        .where(and(
          eq(invoiceAdjustments.invoiceId, invoice.id),
          eq(invoiceAdjustments.status, 'approved')
        ));

      // RC4 (Phase 2): All billing arithmetic via FinancialCalculator (Decimal.js).
      // No native +/- on financial values — all accumulation through sumFinancialValues.
      const adjustmentParts: string[] = [];
      for (const adjustment of adjustments) {
        const adjustmentAmountStr = toFinancialString(String(Number(adjustment.amount) || 0));
        const signedAmount = adjustment.adjustmentType === 'credit'
          ? subtractFinancialValues('0', adjustmentAmountStr)
          : adjustmentAmountStr;
        adjustmentParts.push(signedAmount);

        await tx.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'invoice_adjustment',
          eventCategory: 'invoice',
          actorType: 'system',
          description: `Applied ${adjustment.adjustmentType}: ${adjustment.description}`,
          relatedEntityType: 'invoice_adjustment',
          relatedEntityId: adjustment.id,
          newState: {
            adjustmentAmount: Number(adjustment.amount) || 0,
            adjustmentType: adjustment.adjustmentType,
            status: 'applied',
          },
        });
      }
      const adjustmentTotalStr = adjustmentParts.length > 0 ? sumFinancialValues(adjustmentParts) : '0.0000';

      const lineItemAmounts: string[] = [];
      for (const item of lineItems) {
        const itemAmountStr = toFinancialString(String(item.amount));
        lineItemAmounts.push(itemAmountStr);
        await tx.insert(subscriptionLineItems).values({
          invoiceId: invoice.id,
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          amount: itemAmountStr,
          addonId: item.addonId,
          featureKey: item.featureKey,
          metadata: item.metadata,
        });
      }

      const rawSubtotalStr = lineItemAmounts.length > 0 ? sumFinancialValues(lineItemAmounts) : '0.0000';
      const subtotalWithAdjStr = sumFinancialValues([rawSubtotalStr, adjustmentTotalStr]);
      // Clamp to zero — credits cannot produce a negative total
      const subtotalAfterAdjStr = new Decimal(subtotalWithAdjStr).lt(0) ? '0.0000' : subtotalWithAdjStr;
      const taxAmountStr = multiplyFinancialValues(subtotalAfterAdjStr, toFinancialString(String(taxRate)));
      const totalAmountStr = sumFinancialValues([subtotalAfterAdjStr, taxAmountStr]);

      // OMEGA DIRECTIVE: 3-layer financial atomicity — invoice.status=PAID + fees + revenue in ONE transaction.
      // This is the generation phase, but we must ensure calculations are exact.
      // Transition to PAID happens in markInvoicePaid or stripeWebhooks.

      const [updatedInvoice] = await tx.update(subscriptionInvoices)
        .set({
          subtotal: rawSubtotalStr,
          taxAmount: taxAmountStr,
          totalAmount: totalAmountStr,
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(subscriptionInvoices.id, invoice.id))
        .returning();

      await tx.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'invoice_generated',
        eventCategory: 'subscription',
        actorType: 'system',
        description: `Generated invoice ${invoiceNumber} for ${this.formatPeriod(billingPeriodStart, billingPeriodEnd)}`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoice.id,
        newState: {
          invoiceNumber,
          subtotal,
          totalAmount,
          lineItemCount: lineItems.length,
        },
      });

      return updatedInvoice;
    });
  }

  /**
   * Get active add-ons for billing period
   */
  private async getActiveAddons(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Array<{ id: string; name: string; price: number; pricingType: string; usageUnit: string }>> {
    const activeAddons = await db.select({
      id: billingAddons.id,
      name: billingAddons.name,
      price: billingAddons.basePrice,
      pricingType: billingAddons.pricingType,
      usageUnit: billingAddons.usageUnit,
    })
      .from(workspaceAddons)
      .innerJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.status, 'active')
        )
      );

    return activeAddons.map(addon => ({
      id: addon.id,
      name: addon.name,
      price: Number(addon.price) || 0,
      pricingType: addon.pricingType,
      usageUnit: addon.usageUnit || 'session',
    }));
  }

  /**
   * Calculate usage charges from daily rollups
   */
  private async calculateSubOrgCharges(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<InvoiceLineItemInput[]> {
    const lineItems: InvoiceLineItemInput[] = [];

    try {
      const [parentWs] = await db.select({
        isSubOrg: workspaces.isSubOrg,
        consolidatedBillingEnabled: workspaces.consolidatedBillingEnabled,
        subscriptionTier: workspaces.subscriptionTier,
      }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

      if (!parentWs || parentWs.isSubOrg || !parentWs.consolidatedBillingEnabled) {
        return lineItems;
      }

      const subOrgs = await db.select({
        id: workspaces.id,
        name: workspaces.name,
        subOrgLabel: workspaces.subOrgLabel,
        primaryOperatingState: workspaces.primaryOperatingState,
        subOrgCreatedAt: workspaces.subOrgCreatedAt,
      }).from(workspaces).where(
        and(eq(workspaces.parentWorkspaceId, workspaceId), eq(workspaces.isSubOrg, true))
      );

      if (subOrgs.length === 0) return lineItems;

      const { BILLING: billingConfig } = await import('../../../shared/billingConfig');
      const subOrgConfig = (billingConfig as any).subOrgBilling;
      if (!subOrgConfig) return lineItems;

      const basePrice = subOrgConfig.perSubOrgMonthlyPrice || 19900;
      const tier = parentWs.subscriptionTier || 'professional';
      const discountPct = subOrgConfig.tierDiscounts?.[tier] || 0;
      const pricePerSubOrg = Math.round(basePrice * (1 - discountPct / 100));

      for (const sub of subOrgs) {
        const createdAt = sub.subOrgCreatedAt ? new Date(sub.subOrgCreatedAt) : null;
        const isNewThisPeriod = createdAt && createdAt > periodStart;
        let proratedAmount = pricePerSubOrg;

        if (isNewThisPeriod && createdAt) {
          const totalDays = (periodEnd.getTime() - periodStart.getTime()) / (86400000);
          const activeDays = (periodEnd.getTime() - createdAt.getTime()) / (86400000);
          proratedAmount = Math.round(pricePerSubOrg * (activeDays / totalDays));
        }

        const label = sub.subOrgLabel || sub.name;
        const stateTag = sub.primaryOperatingState ? ` (${sub.primaryOperatingState})` : '';

        lineItems.push({
          itemType: 'addon',
          description: `Sub-Organization: ${label}${stateTag} — ${this.formatPeriod(periodStart, periodEnd)}${isNewThisPeriod ? ' (prorated)' : ''}`,
          quantity: 1,
          unitPrice: proratedAmount,
          amount: proratedAmount,
          metadata: {
            type: 'sub_org_addon',
            subOrgId: sub.id,
            subOrgName: label,
            state: sub.primaryOperatingState,
            prorated: isNewThisPeriod || false,
          },
        });
      }

      const allStates = new Set<string>();
      for (const sub of subOrgs) {
        if (sub.primaryOperatingState) allStates.add(sub.primaryOperatingState);
      }

      const stateComplianceConfig = (billingConfig as any).stateComplianceFees;
      if (stateComplianceConfig?.enabled && allStates.size > (stateComplianceConfig.includedStates || 1)) {
        const extraStates = allStates.size - (stateComplianceConfig.includedStates || 1);
        const perStateFee = stateComplianceConfig.perStateComplianceMonitoring || 4900;
        lineItems.push({
          itemType: 'addon',
          description: `Multi-State Compliance Monitoring — ${extraStates} additional state(s)`,
          quantity: extraStates,
          unitPrice: perStateFee,
          amount: perStateFee * extraStates,
          metadata: {
            type: 'state_compliance',
            totalStates: allStates.size,
            extraStates,
            states: Array.from(allStates),
          },
        });
      }
    } catch (err) {
      log.warn('Failed to calculate sub-org charges (non-critical):', err);
    }

    return lineItems;
  }

  private async calculateUsageCharges(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<InvoiceLineItemInput[]> {
    const rollups = await db.select()
      .from(aiUsageDailyRollups)
      .where(
        and(
          eq(aiUsageDailyRollups.workspaceId, workspaceId),
          gte(aiUsageDailyRollups.usageDate, periodStart),
          lte(aiUsageDailyRollups.usageDate, periodEnd)
        )
      );

    // Group by feature
    const featureMap = new Map<string, { totalCost: number; totalUsage: number; totalEvents: number }>();

    for (const rollup of rollups) {
      const existing = featureMap.get(rollup.featureKey) || { totalCost: 0, totalUsage: 0, totalEvents: 0 };
      existing.totalCost += Number(rollup.totalCost) || 0;
      existing.totalUsage += Number(rollup.totalUsageAmount) || 0;
      existing.totalEvents += rollup.totalEvents || 0;
      featureMap.set(rollup.featureKey, existing);
    }

    // RC4 (Phase 2): All financial arithmetic via FinancialCalculator (Decimal.js).
    // Avoid native floating point division.
    const lineItems: InvoiceLineItemInput[] = [];

    const entries = Array.from(featureMap.entries());
    const { multiplyFinancialValues, toFinancialString } = await import('../financialCalculator');

    for (let i = 0; i < entries.length; i++) {
      const [featureKey, data] = entries[i];
      if (data.totalCost > 0) {
        const unitPrice = data.totalUsage > 0 
          ? parseFloat(multiplyFinancialValues(toFinancialString(String(data.totalCost)), toFinancialString(String(1 / data.totalUsage))))
          : 0;

        lineItems.push({
          itemType: 'usage',
          description: `${this.formatFeatureName(featureKey)} - ${data.totalEvents} events`,
          quantity: data.totalUsage,
          unitPrice,
          amount: data.totalCost,
          featureKey,
          metadata: {
            totalEvents: data.totalEvents,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
          },
        });
      }
    }

    return lineItems;
  }

  /**
   * Get invoice by ID with line items
   */
  async getInvoiceWithLineItems(invoiceId: string): Promise<{
    invoice: SubscriptionInvoice;
    lineItems: SubscriptionLineItem[];
  } | null> {
    const [invoice] = await db.select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return null;
    }

    const lineItems = await db.select()
      .from(subscriptionLineItems)
      .where(eq(subscriptionLineItems.invoiceId, invoiceId));

    return { invoice, lineItems };
  }

  /**
   * Get invoices for workspace
   */
  async getInvoicesForWorkspace(
    workspaceId: string,
    limit: number = 50
  ): Promise<SubscriptionInvoice[]> {
    return db.select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.workspaceId, workspaceId))
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(limit);
  }

  /**
   * Mark invoice as paid
   */
  async markInvoicePaid(
    invoiceId: string,
    paymentIntentId: string
  ): Promise<SubscriptionInvoice> {
    const [invoice] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(subscriptionInvoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptionInvoices.id, invoiceId),
          sql`${subscriptionInvoices.status} NOT IN ('paid', 'void', 'cancelled')`
        ))
        .returning();

      // Log audit event
      const [invoiceRecord] = await tx.select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.id, invoiceId))
        .limit(1);

      if (invoiceRecord) {
        await tx.insert(billingAuditLog).values({
          workspaceId: invoiceRecord.workspaceId,
          eventType: 'payment_succeeded',
          eventCategory: 'payment',
          actorType: 'webhook',
          description: `Invoice ${invoiceRecord.invoiceNumber} marked as paid`,
          relatedEntityType: 'invoice',
          relatedEntityId: invoiceId,
          newState: {
            status: 'paid',
            paidAt: new Date().toISOString(),
          },
        });
      }

      return [updated];
    });

    return invoice;
  }

  /**
   * Mark invoice as overdue
   */
  async markInvoiceOverdue(invoiceId: string): Promise<SubscriptionInvoice> {
    const [invoice] = await db.update(subscriptionInvoices)
      .set({
        status: 'overdue',
        updatedAt: new Date(),
      })
      .where(eq(subscriptionInvoices.id, invoiceId))
      .returning();

    if (invoice) {
      const { platformEventBus } = await import('../platformEventBus');
      platformEventBus.publish({
        type: 'invoice_overdue',
        category: 'billing',
        title: `Invoice Overdue — ${invoice.invoiceNumber}`,
        description: `Subscription invoice ${invoice.invoiceNumber} is now overdue`,
        workspaceId: invoice.workspaceId,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate, totalAmount: invoice.totalAmount },
      }).catch((err: any) => log.warn('[InvoiceService] publish invoice_overdue failed:', err.message));
    }

    return invoice;
  }

  /**
   * Generate unique invoice number
   */
  private async generateInvoiceNumber(workspaceId: string, date: Date): Promise<string> {
    const { generateTrinityInvoiceNumber } = await import('../trinityInvoiceNumbering');
    return generateTrinityInvoiceNumber(workspaceId, 'subscription', { date });
  }

  /**
   * Get week number of year
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Format period for display
   */
  private formatPeriod(start: Date, end: Date): string {
    const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC' };
    return `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)}`;
  }

  /**
   * Format feature name for display
   */
  private formatFeatureName(featureKey: string): string {
    const names: Record<string, string> = {
      'scheduleos_ai_generation': 'CoAIleague — Smart Scheduling AI',
      'scheduleos_optimization': 'CoAIleague — Smart Scheduling Optimization',
      'scheduleos_conflict_resolution': 'CoAIleague — Smart Scheduling Conflict Resolution',
      'scheduleos_coverage_analysis': 'CoAIleague — Smart Scheduling Coverage',
      'recordos_search': 'RecordOS — AI Records Search',
      'recordos_ai_query': 'RecordOS — Natural Language Query',
      'recordos_document_extraction': 'RecordOS — Document Extraction',
      'insightos_prediction': 'InsightOS — Predictive Analytics',
      'insightos_analytics': 'InsightOS — Analytics Engine',
      'insightos_forecasting': 'InsightOS — Workforce Forecasting',
      'payrollos_calculation': 'PayrollOS — AI Payroll Calculation',
      'payrollos_tax_computation': 'PayrollOS — Tax Computation',
      'payrollos_compliance_check': 'PayrollOS — Compliance Verification',
      'complianceos_audit': 'ComplianceOS — Compliance Audit',
      'complianceos_license_verify': 'ComplianceOS — License Verification',
      'complianceos_document_review': 'ComplianceOS — Document Review',
      'trinity_orchestration': 'Trinity — Multi-Domain Orchestration',
      'trinity_action_hub': 'Trinity — Platform Action Execution',
      'trinity_reasoning': 'Trinity — AI Reasoning Layer',
      'trinity_memory_search': 'Trinity — Knowledge Memory Search',
      'trinity_conversation': 'Trinity — Conversational AI',
      'trinity_visual_qa': 'Trinity — Visual QA Analysis',
      'clientos_proposal': 'ClientOS — Proposal Generation',
      'clientos_contract_analysis': 'ClientOS — Contract Analysis',
      'clientos_roi_calculation': 'ClientOS — ROI Calculator',
      'hrops_onboarding': 'HROps — AI Onboarding Assistant',
      'hrops_performance_review': 'HROps — Performance Review',
      'hrops_training_recommendation': 'HROps — Training Recommendations',
      'safetycheckos_incident_analysis': 'SafetyCheckOS — Incident Analysis',
      'safetycheckos_risk_assessment': 'SafetyCheckOS — Risk Assessment',
      'trinitystaffing_matching': 'Trinity Staffing — Candidate Matching',
      'trinitystaffing_gap_analysis': 'Trinity Staffing — Gap Analysis',
      'emailos_intelligence': 'EmailOS — Intelligent Triage',
      'emailos_drafting': 'EmailOS — Smart Reply Drafting',
    };

    if (names[featureKey]) return names[featureKey];

    // Fallback: humanize the key by splitting on underscores and capitalizing
    return featureKey
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Get upcoming invoices that need to be generated
   */
  async getUpcomingInvoices(): Promise<Array<{ workspaceId: string; dueDate: Date }>> {
    // Get all active workspaces that need weekly invoicing
    const workspacesList = await db.select({
      id: workspaces.id,
      billingCycleDay: workspaces.billingCycleDay,
      nextInvoiceAt: workspaces.nextInvoiceAt,
    })
      .from(workspaces)
      .where(eq(workspaces.accountState, 'active'));

    const now = new Date();
    const upcoming: Array<{ workspaceId: string; dueDate: Date }> = [];

    for (const workspace of workspacesList) {
      // Never generate invoices for platform, system, or support pool workspaces
      if (isBillingExcluded(workspace.id)) continue;

      const nextInvoice = workspace.nextInvoiceAt;
      if (!nextInvoice || nextInvoice <= now) {
        upcoming.push({
          workspaceId: workspace.id,
          dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }

    return upcoming;
  }

  // ============================================================================
  // CLIENT-FACING INVOICE GENERATION
  // ============================================================================

  /**
   * Generate a professional client-facing invoice
   * Uses the existing 'invoices' table for client billing
   * 
   * Invoice Number Format: CLT-INV-YYYY-MM-{sequence}
   * Tax Rate: Client-specific lookup or default 8.875%
   */
  async generateClientInvoice(input: GenerateClientInvoiceInput): Promise<ClientInvoiceResult> {
    const { 
      clientId, 
      workspaceId, 
      billingPeriodStart, 
      billingPeriodEnd, 
      lineItems, 
      notes, 
      dueDate 
    } = input;

    log.info('Starting client invoice generation', {
      clientId,
      workspaceId,
      billingPeriodStart: billingPeriodStart.toISOString(),
      billingPeriodEnd: billingPeriodEnd.toISOString(),
      lineItemCount: lineItems.length,
      notes: notes ? 'provided' : 'not provided',
      dueDate: dueDate ? dueDate.toISOString() : 'not provided',
    });

    // Step 1: Look up client for tax rate information
    const [client] = await db.select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    log.info('Client found', {
      id: client.id,
      name: `${client.firstName} ${client.lastName}`,
      companyName: client.companyName || 'N/A',
    });

    // Step 2: Determine tax rate
    // Priority: Client-specific rate > Workspace-configured rate > State-based lookup > Federal fallback

    // US state-level base sales/service tax rates (as of 2025)
    const US_STATE_TAX_RATES: Record<string, number> = {
      AL: 0.04,   AK: 0.00,  AZ: 0.056,  AR: 0.065,  CA: 0.0725, CO: 0.029,
      CT: 0.0635, DE: 0.00,  FL: 0.06,   GA: 0.04,   HI: 0.04,   ID: 0.06,
      IL: 0.0625, IN: 0.07,  IA: 0.06,   KS: 0.065,  KY: 0.06,   LA: 0.0445,
      ME: 0.055,  MD: 0.06,  MA: 0.0625, MI: 0.06,   MN: 0.06875, MS: 0.07,
      MO: 0.04225, MT: 0.00, NE: 0.055,  NV: 0.0685, NH: 0.00,   NJ: 0.06625,
      NM: 0.0513, NY: 0.04,  NC: 0.0475, ND: 0.05,   OH: 0.0575, OK: 0.045,
      OR: 0.00,   PA: 0.06,  RI: 0.07,   SC: 0.06,   SD: 0.045,  TN: 0.07,
      TX: 0.0825, UT: 0.0485, VT: 0.06,  VA: 0.053,  WA: 0.065,  WV: 0.06,
      WI: 0.05,   WY: 0.04,  DC: 0.06,
    };
    // Fallback: national average for B2B service contracts
    const FEDERAL_FALLBACK_RATE = 0.06;

    // Fetch workspace tax configuration
    const [workspace] = await db.select({
      defaultTaxRate: workspaces.defaultTaxRate,
      taxJurisdiction: workspaces.taxJurisdiction,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    let taxRate: number;
    let taxRateSource: string;

    const _parsedRate2 = workspace?.defaultTaxRate ? (parseFloat(workspace.defaultTaxRate) || 0) : 0;
    const _validRate2 = _parsedRate2 > 0 && _parsedRate2 <= 1 ? _parsedRate2 : null;
    if (_validRate2 !== null) {
      // Workspace admin has explicitly configured a rate — use it
      taxRate = _validRate2;
      taxRateSource = 'workspace_configured';
    } else if (workspace?.taxJurisdiction) {
      // Derive from jurisdiction: supports "NY", "CA", "US-CA", "US-NY" formats
      const jur = workspace.taxJurisdiction.toUpperCase().replace(/^US-/, '').trim();
      if (US_STATE_TAX_RATES[jur] !== undefined) {
        taxRate = US_STATE_TAX_RATES[jur];
        taxRateSource = `state_lookup:${jur}`;
      } else {
        taxRate = FEDERAL_FALLBACK_RATE;
        taxRateSource = 'federal_fallback';
      }
    } else if (client.state) {
      // Try client's state as last resort before fallback
      const stateCode = (client.state as string).toUpperCase().slice(0, 2);
      taxRate = US_STATE_TAX_RATES[stateCode] ?? FEDERAL_FALLBACK_RATE;
      taxRateSource = US_STATE_TAX_RATES[stateCode] !== undefined
        ? `client_state_lookup:${stateCode}`
        : 'federal_fallback';
    } else {
      taxRate = FEDERAL_FALLBACK_RATE;
      taxRateSource = 'federal_fallback';
    }

    log.info('Tax rate determination', {
      taxRateSource,
      jurisdiction: workspace?.taxJurisdiction || client.billingState || 'unknown',
      appliedRate: `${(taxRate * 100).toFixed(3)}%`,
    });

    // Step 3: Calculate line item amounts and subtotal.
    // RC4 (Phase 2): All arithmetic via FinancialCalculator (Decimal.js) — no native accumulation.
    log.info('Calculating line items');

    const lineItemAmountParts: string[] = [];
    const calculatedLineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      amount: string;
    }> = [];

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const lineAmountStr = calculateInvoiceLineItem(
        toFinancialString(String(item.quantity)),
        toFinancialString(String(item.rate)),
      );

      log.info('Line item calculated', {
        lineNumber: i + 1,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        amount: lineAmountStr,
      });

      calculatedLineItems.push({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.rate,
        amount: lineAmountStr,
      });

      lineItemAmountParts.push(lineAmountStr);
    }

    const subtotalStr = lineItemAmountParts.length > 0 ? calculateInvoiceTotal(lineItemAmountParts) : '0.0000';
    log.info('Subtotal calculated', { subtotal: subtotalStr });

    // Step 4: Calculate tax and total.
    const taxAmountStr = multiplyFinancialValues(subtotalStr, toFinancialString(String(taxRate)));
    const totalStr = sumFinancialValues([subtotalStr, taxAmountStr]);

    log.info('Tax and total calculated', {
      subtotal: subtotalStr,
      taxRate: `${(taxRate * 100).toFixed(3)}%`,
      taxAmount: taxAmountStr,
      total: totalStr,
    });

    // Step 5: Generate invoice number
    const invoiceNumber = await this.generateClientInvoiceNumber(workspaceId, billingPeriodStart);
    log.info('Generated invoice number', { invoiceNumber });

    // Step 6: Determine due date (default: 30 days from billing period end)
    const calculatedDueDate = dueDate || new Date(billingPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000);
    log.info('Due date set', { dueDate: calculatedDueDate.toISOString() });

    return await db.transaction(async (tx) => {
      const [invoice] = await tx.insert(invoices)
        .values({
          workspaceId,
          clientId,
          invoiceNumber,
          issueDate: new Date(),
          dueDate: calculatedDueDate,
          subtotal: subtotalStr,
          taxRate: multiplyFinancialValues(toFinancialString(String(taxRate)), '100'),
          taxAmount: taxAmountStr,
          total: totalStr,
          status: 'draft',
          notes: `Generated by Trinity Billing Automation | ${invoiceNumber}${notes ? '\n' + notes : ''}`,
        })
        .returning();

      log.info('Invoice created', { invoiceId: invoice.id });

      const createdLineItems: InvoiceLineItem[] = [];
      for (const item of calculatedLineItems) {
        const [lineItem] = await tx.insert(invoiceLineItems)
          .values({
            invoiceId: invoice.id,
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: toFinancialString(String(item.unitPrice)),
            amount: item.amount,
          })
          .returning();
        createdLineItems.push(lineItem);
      }

      log.info('Created line items', { count: createdLineItems.length });

      await tx.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'client_invoice_generated',
        eventCategory: 'invoice',
        actorType: 'system',
        description: `Generated client invoice ${invoiceNumber} for ${client.firstName} ${client.lastName}`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoice.id,
        newState: {
          invoiceNumber,
          clientId,
          subtotal: subtotalStr,
          taxRate: taxRate * 100,
          taxAmount: taxAmountStr,
          total: totalStr,
          lineItemCount: lineItems.length,
          billingPeriod: {
            start: billingPeriodStart.toISOString(),
            end: billingPeriodEnd.toISOString(),
          },
        },
      });

      log.info('Client invoice generation complete', {
        invoiceNumber,
        client: `${client.firstName} ${client.lastName}`,
        subtotal: subtotalStr,
        taxRate: `${(taxRate * 100).toFixed(3)}%`,
        taxAmount: taxAmountStr,
        total: totalStr,
      });

      return {
        invoice,
        lineItems: createdLineItems,
        calculations: {
          subtotal: subtotalStr,
          taxRate: taxRate * 100,
          taxAmount: taxAmountStr,
          total: totalStr,
        },
      };
    });
  }

  /**
   * Generate unique client invoice number
   * Format: CLT-INV-YYYY-MM-{sequence}
   */
  private async generateClientInvoiceNumber(workspaceId: string, date: Date): Promise<string> {
    const { generateTrinityInvoiceNumber } = await import('../trinityInvoiceNumbering');
    return generateTrinityInvoiceNumber(workspaceId, 'client', { date });
  }

  /**
   * Send invoice email notification to recipient
   * Uses the EmailService for delivery with audit trail
   */
  async sendInvoiceEmail(
    invoiceId: string,
    recipientEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    log.info('Sending invoice email', { invoiceId, recipientEmail });

    // Step 1: Fetch invoice details
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      log.error('Invoice not found', { invoiceId });
      return { success: false, error: 'Invoice not found' };
    }

    // Step 2: Fetch client details
    const [client] = await db.select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);

    if (!client) {
      log.error('Client not found for invoice', { clientId: invoice.clientId });
      return { success: false, error: 'Client not found' };
    }

    // Step 3: Fetch line items
    const lineItemsData = await db.select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    // Step 4: Build invoice view/pay link
    const baseUrl = getAppBaseUrl();
    const invoiceUrl = `${baseUrl}/invoices/${invoiceId}`;

    // Step 5: Format due date
    const dueDate = invoice.dueDate 
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'Upon Receipt';

    // Step 6: Build line items HTML table
    const lineItemsHtml = lineItemsData.map(item => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: left;">${item.description}</td>
        <td style="padding: 12px; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; text-align: right;">$${Number(item.unitPrice).toFixed(2)}</td>
        <td style="padding: 12px; text-align: right;">$${Number(item.amount).toFixed(2)}</td>
      </tr>
    `).join('');

    // Step 7: Build email HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">Invoice</h1>
          <p style="color: #64748b; margin: 5px 0;">${invoice.invoiceNumber}</p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; flex-wrap: wrap;">
            <div style="margin-bottom: 15px;">
              <h3 style="color: #334155; margin: 0 0 5px 0;">Bill To:</h3>
              <p style="margin: 0; color: #1e293b;">
                ${client.firstName} ${client.lastName}<br>
                ${client.companyName ? `${client.companyName}<br>` : ''}
                ${client.email || recipientEmail}
              </p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 5px 0; color: #64748b;">
                <strong>Issue Date:</strong> ${new Date(invoice.issueDate || new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p style="margin: 5px 0; color: #64748b;">
                <strong>Due Date:</strong> ${dueDate}
              </p>
            </div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 12px; text-align: left; color: #334155;">Description</th>
              <th style="padding: 12px; text-align: center; color: #334155;">Qty</th>
              <th style="padding: 12px; text-align: right; color: #334155;">Rate</th>
              <th style="padding: 12px; text-align: right; color: #334155;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 30px;">
          <table style="margin-left: auto;">
            <tr>
              <td style="padding: 8px 20px; color: #64748b;">Subtotal:</td>
              <td style="padding: 8px 0; text-align: right; color: #1e293b;">$${Number(invoice.subtotal).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 20px; color: #64748b;">Tax (${Number(invoice.taxRate).toFixed(2)}%):</td>
              <td style="padding: 8px 0; text-align: right; color: #1e293b;">$${Number(invoice.taxAmount).toFixed(2)}</td>
            </tr>
            <tr style="font-weight: bold; font-size: 18px;">
              <td style="padding: 12px 20px; color: #1e293b; border-top: 2px solid #e5e7eb;">Total Due:</td>
              <td style="padding: 12px 0; text-align: right; color: #2563eb; border-top: 2px solid #e5e7eb;">$${Number(invoice.total).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        ${invoice.notes ? `
          <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e;"><strong>Notes:</strong></p>
            <p style="margin: 5px 0 0 0; color: #78350f;">${invoice.notes}</p>
          </div>
        ` : ''}

        <div style="text-align: center; margin-top: 30px;">
          <a href="${invoiceUrl}" 
             style="background-color: #2563eb; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
            View Invoice & Pay Online
          </a>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 12px; text-align: center;">
          <p style="margin: 5px 0;">This is an automated invoice notification from your service provider</p>
          <p style="margin: 5px 0;">If you have questions about this invoice, please contact your service provider.</p>
        </div>
      </div>
    `;

    // Step 8: Send email using EmailService
    const notifId = await NotificationDeliveryService.send({
      type: 'invoice_notification',
      workspaceId: invoice.workspaceId,
      recipientUserId: recipientEmail,
      channel: 'email',
      body: { to: recipientEmail, subject: `Invoice ${invoice.invoiceNumber} - $${Number(invoice.total).toFixed(2)} Due`, html: emailHtml },
    });

    // Update invoice status + log audit event atomically
    // GAP-24 FIX: add workspaceId to WHERE — invoice.workspaceId is already loaded above.
    await db.transaction(async (tx) => {
      await tx.update(invoices)
        .set({
          status: 'sent',
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, invoice.workspaceId)));
      await tx.insert(billingAuditLog).values({
        workspaceId: invoice.workspaceId,
        eventType: 'invoice_email_sent',
        eventCategory: 'invoice',
        actorType: 'system',
        description: `Invoice ${invoice.invoiceNumber} sent to ${recipientEmail}`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        newState: {
          recipientEmail,
          sentAt: new Date().toISOString(),
          resendId: notifId,
        },
      });
    });

    log.info('Invoice email queued for delivery', { recipientEmail });

    return {
      success: true,
      error: undefined,
    };
  }

  /**
   * Get client invoice with all details
   */
  async getClientInvoice(invoiceId: string): Promise<ClientInvoiceResult | null> {
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return null;
    }

    const lineItemsData = await db.select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    return {
      invoice,
      lineItems: lineItemsData,
      calculations: {
        subtotal: Number(invoice.subtotal),
        taxRate: Number(invoice.taxRate),
        taxAmount: Number(invoice.taxAmount),
        total: Number(invoice.total),
      },
    };
  }

  /**
   * Get all invoices for a specific client
   */
  async getClientInvoices(
    clientId: string,
    limit: number = 50
  ): Promise<Invoice[]> {
    return db.select()
      .from(invoices)
      .where(eq(invoices.clientId, clientId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
  }

  async recordPartialPayment(
    invoiceId: string,
    workspaceId: string,
    amount: number,
    paymentMethod: string,
    payerEmail?: string,
    payerName?: string,
    notes?: string,
  ): Promise<{ payment: any; invoice: Invoice; remainingBalance: number }> {
    const { invoicePayments, paymentRecords } = await import('@shared/schema');

    const [invoice] = await db.select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
      .limit(1);

    if (!invoice) throw new Error('Invoice not found');

    const totalDue = Number(invoice.total);
    const currentPaid = Number(invoice.amountPaid || '0');
    const remaining = totalDue - currentPaid;

    if (amount <= 0) throw new Error('Payment amount must be positive');
    if (amount > remaining + 0.01) throw new Error(`Payment amount ($${amount.toFixed(2)}) exceeds remaining balance ($${remaining.toFixed(2)})`);

    const effectiveAmount = Math.min(amount, remaining);
    const newPaidTotal = currentPaid + effectiveAmount;
    const newRemaining = totalDue - newPaidTotal;
    const fullyPaid = newRemaining < 0.01;

    return await db.transaction(async (tx) => {
      const [payment] = await tx.insert(paymentRecords).values({
        workspaceId,
        invoiceId,
        amount: effectiveAmount.toFixed(2),
        paymentMethod: paymentMethod || 'manual',
        status: 'completed',
        paidAt: new Date(),
        notes: notes || `Partial payment of $${effectiveAmount.toFixed(2)}`,
      }).returning();

      const updateData: any = {
        amountPaid: newPaidTotal.toFixed(2),
        updatedAt: new Date(),
      };

      if (fullyPaid) {
        updateData.status = 'paid';
        updateData.paidAt = new Date();
      } else {
        updateData.status = 'partial';
      }

      // GAP-29 FIX: Guard against race condition where the invoice was voided or refunded
      // between the initial load and this transaction. Without the NOT IN guard, a
      // concurrent void could be overwritten and the invoice resurrected to 'paid'/'partial'.
      const [updatedInvoice] = await tx.update(invoices)
        .set(updateData)
        .where(and(
          eq(invoices.id, invoiceId),
          sql`${invoices.status} NOT IN ('void', 'cancelled', 'refunded')`
        ))
        .returning();

      await tx.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'partial_payment_recorded',
        eventCategory: 'payment',
        actorType: 'user',
        description: `Partial payment of $${effectiveAmount.toFixed(2)} recorded for invoice ${invoice.invoiceNumber}`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        newState: {
          paymentAmount: effectiveAmount,
          totalPaid: newPaidTotal,
          remainingBalance: newRemaining,
          fullyPaid,
        },
      });

      // Write org ledger entry inside the transaction so payment + ledger are atomic.
      // If ledger write fails, the entire payment rolls back — preventing the invoice
      // from showing as "paid" while the org ledger is out of sync.
      try {
        const { writeLedgerEntry } = await import('../orgLedgerService');
        await writeLedgerEntry({
          workspaceId,
          entryType: 'payment_received',
          direction: 'credit',
          amount: effectiveAmount,
          relatedEntityType: 'invoice',
          relatedEntityId: invoiceId,
          invoiceId,
          description: `Partial payment of $${effectiveAmount.toFixed(2)} received for invoice ${invoice.invoiceNumber} via ${paymentMethod}${fullyPaid ? ' (fully paid)' : ` — $${Math.max(0, newRemaining).toFixed(2)} remaining`}`,
          metadata: { paymentMethod, payerEmail, payerName, fullyPaid },
          tx,
        });
      } catch (ledgerErr: unknown) {
        log.error('[InvoiceService] Ledger write failed — rolling back payment transaction:', ledgerErr.message);
        throw ledgerErr; // re-throw to abort the transaction
      }

      return {
        payment,
        invoice: updatedInvoice,
        remainingBalance: Math.max(0, newRemaining),
      };
    }).then(async (result) => {

      // DUAL-EMIT LAW (defense-in-depth): emit events directly from the service layer so any caller
      // outside invoiceRoutes (Trinity subagents, scheduled automations, future API paths) gets
      // real-time WebSocket + Trinity event bus notification — not just the route-level caller.
      try {
        const { broadcastToWorkspace } = await import('../../websocket');
        broadcastToWorkspace(workspaceId, { type: 'invoices_updated', action: fullyPaid ? 'paid' : 'partial_payment' });
      } catch (_wsErr) { log.warn('[InvoiceService] WebSocket broadcast failed after payment record:', _wsErr instanceof Error ? _wsErr.message : String(_wsErr)); }
      try {
        const { platformEventBus } = await import('../platformEventBus');
        const eventType = fullyPaid ? 'invoice_paid' : 'payment_received_partial';
        platformEventBus.publish({
          type: eventType,
          category: 'automation',
          title: fullyPaid ? 'Invoice Fully Paid' : 'Partial Payment Recorded',
          description: fullyPaid
            ? `Invoice ${invoice.invoiceNumber} fully paid — $${effectiveAmount.toFixed(2)} final payment via ${paymentMethod}`
            : `Partial payment of $${effectiveAmount.toFixed(2)} recorded — $${Math.max(0, newRemaining).toFixed(2)} remaining`,
          workspaceId,
          metadata: {
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            amountReceived: effectiveAmount,
            totalPaid: newPaidTotal,
            remainingBalance: Math.max(0, newRemaining),
            paymentMethod,
            payerEmail,
            fullyPaid,
            paymentId: result.payment?.id,
          },
          visibility: 'manager',
        }).catch((err) => log.warn('[invoice] Fire-and-forget failed:', err));
      } catch (_busErr) { log.warn('[InvoiceService] Event bus publish failed after payment record:', _busErr instanceof Error ? _busErr.message : String(_busErr)); }

      return result;
    });
  }

  async applyLateFees(workspaceId: string, options?: {
    gracePeriodDays?: number;
    lateFeeType?: 'percentage' | 'flat';
    lateFeeAmount?: number;
  }): Promise<Array<{ invoiceId: string; invoiceNumber: string; lateFeeAmount: number; daysOverdue: number }>> {
    const gracePeriod = options?.gracePeriodDays ?? 30;
    const feeType = options?.lateFeeType ?? 'percentage';
    const feeAmount = options?.lateFeeAmount ?? (feeType === 'percentage' ? 1.5 : 25);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - gracePeriod * 24 * 60 * 60 * 1000);

    const overdueInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        sql`${invoices.status} IN ('sent', 'partial', 'overdue')`,
        lte(invoices.dueDate, cutoffDate),
      ));

    const results: Array<{ invoiceId: string; invoiceNumber: string; lateFeeAmount: number; daysOverdue: number }> = [];

    for (const invoice of overdueInvoices) {
      const dueDate = new Date(invoice.dueDate!);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const outstanding = Number(invoice.total) - Number(invoice.amountPaid || '0');

      if (outstanding <= 0) continue;

      let lateFee: number;
      if (feeType === 'percentage') {
        lateFee = Math.round((outstanding * (feeAmount / 100)) * 100) / 100;
      } else {
        lateFee = feeAmount;
      }

      const newTotal = Number(invoice.total) + lateFee;

      await db.transaction(async (tx) => {
        await tx.update(invoices)
          .set({
            total: newTotal.toFixed(2),
            status: 'overdue',
            notes: `${invoice.notes || ''}\nLate fee of $${lateFee.toFixed(2)} applied on ${now.toLocaleDateString()} (${daysOverdue} days overdue)`.trim(),
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoice.id));
        await tx.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'late_fee_applied',
          eventCategory: 'invoice',
          actorType: 'system',
          description: `Late fee of $${lateFee.toFixed(2)} applied to invoice ${invoice.invoiceNumber} (${daysOverdue} days overdue)`,
          relatedEntityType: 'invoice',
          relatedEntityId: invoice.id,
          newState: {
            lateFee,
            daysOverdue,
            feeType,
            feeAmount,
            previousTotal: Number(invoice.total),
            newTotal,
          },
        });
      });

      const { platformEventBus } = await import('../platformEventBus');
      platformEventBus.publish({
        type: 'late_fee_applied',
        category: 'billing',
        title: `Late Fee Applied — ${invoice.invoiceNumber}`,
        description: `$${lateFee.toFixed(2)} late fee applied to invoice ${invoice.invoiceNumber} (${daysOverdue} days overdue)`,
        workspaceId,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, lateFee, daysOverdue, newTotal, feeType, feeAmount },
      }).catch((err: any) => log.warn('[InvoiceService] publish late_fee_applied failed:', err.message));

      results.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        lateFeeAmount: lateFee,
        daysOverdue,
      });
    }

    return results;
  }

  async createCreditMemo(
    workspaceId: string,
    originalInvoiceId: string,
    amount: number,
    reason: string,
    createdBy: string,
  ): Promise<{ creditMemo: Invoice; originalInvoice: Invoice }> {
    const [originalInvoice] = await db.select()
      .from(invoices)
      .where(and(eq(invoices.id, originalInvoiceId), eq(invoices.workspaceId, workspaceId)))
      .limit(1);

    if (!originalInvoice) throw new Error('Original invoice not found');
    if (amount <= 0) throw new Error('Credit memo amount must be positive');
    if (amount > Number(originalInvoice.total)) throw new Error('Credit memo amount cannot exceed original invoice total');

    const creditMemoNumber = `CM-${originalInvoice.invoiceNumber}-${Date.now().toString(36).toUpperCase()}`;

    return await db.transaction(async (tx) => {
      const [creditMemo] = await tx.insert(invoices).values({
        workspaceId,
        clientId: originalInvoice.clientId,
        invoiceNumber: creditMemoNumber,
        issueDate: new Date(),
        dueDate: new Date(),
        subtotal: (-amount).toFixed(2),
        taxRate: '0.00',
        taxAmount: '0.00',
        total: (-amount).toFixed(2),
        status: 'paid',
        paidAt: new Date(),
        amountPaid: (-amount).toFixed(2),
        notes: `Credit memo for invoice ${originalInvoice.invoiceNumber}. Reason: ${reason}`,
      }).returning();

      await tx.insert(invoiceLineItems).values({
        invoiceId: creditMemo.id,
        description: `Credit memo - ${reason}`,
        quantity: '1',
        unitPrice: (-amount).toFixed(2),
        amount: (-amount).toFixed(2),
      });

      const newAmountPaid = Number(originalInvoice.amountPaid || '0') + amount;
      const originalTotal = Number(originalInvoice.total);
      const fullyCredited = newAmountPaid >= originalTotal - 0.01;

      // GAP-29b FIX: Guard against race where the original invoice was voided or refunded
      // between the outer SELECT and this transaction. Without the guard, applying a credit
      // memo to a void/refunded invoice would reset its status to 'paid'.
      const [updatedOriginal] = await tx.update(invoices)
        .set({
          amountPaid: newAmountPaid.toFixed(2),
          status: fullyCredited ? 'paid' : originalInvoice.status,
          updatedAt: new Date(),
          notes: `${originalInvoice.notes || ''}\nCredit memo ${creditMemoNumber} applied: -$${amount.toFixed(2)}`.trim(),
        })
        .where(and(
          eq(invoices.id, originalInvoiceId),
          sql`${invoices.status} NOT IN ('void', 'cancelled', 'refunded')`
        ))
        .returning();

      await tx.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'credit_memo_created',
        eventCategory: 'invoice',
        actorType: 'user',
        actorId: createdBy,
        description: `Credit memo ${creditMemoNumber} created for $${amount.toFixed(2)} against invoice ${originalInvoice.invoiceNumber}`,
        relatedEntityType: 'invoice',
        relatedEntityId: creditMemo.id,
        newState: {
          creditMemoId: creditMemo.id,
          originalInvoiceId,
          amount,
          reason,
        },
      });

      const { platformEventBus } = await import('../platformEventBus');
      platformEventBus.publish({
        type: 'credit_memo_created',
        category: 'billing',
        title: `Credit Memo Created — ${creditMemoNumber}`,
        description: `Credit memo for $${amount.toFixed(2)} issued against invoice ${originalInvoice.invoiceNumber}. Reason: ${reason}`,
        workspaceId,
        metadata: { creditMemoId: creditMemo.id, creditMemoNumber, originalInvoiceId, originalInvoiceNumber: originalInvoice.invoiceNumber, amount, reason, createdBy },
      }).catch((err: any) => log.warn('[InvoiceService] publish credit_memo_created failed:', err.message));

      return { creditMemo, originalInvoice: updatedOriginal };
    });
  }

  async processPaymentReminders(workspaceId: string): Promise<{
    remindersSent: number;
    reminders: Array<{ invoiceId: string; invoiceNumber: string; type: string; clientEmail: string }>;
  }> {
    const { invoiceReminders } = await import('@shared/schema');
    const now = new Date();

    const activeInvoices = await db.select({
      invoice: invoices,
      client: clients,
    })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        sql`${invoices.status} IN ('sent', 'partial', 'overdue')`,
      ));

    const reminderSchedule = [
      { daysBefore: 7, type: 'pre_due_7', label: '7 days before due' },
      { daysBefore: 3, type: 'pre_due_3', label: '3 days before due' },
      { daysBefore: 1, type: 'pre_due_1', label: '1 day before due' },
      { daysBefore: -7, type: 'overdue_7', label: '7 days overdue' },
      { daysBefore: -14, type: 'overdue_14', label: '14 days overdue' },
      { daysBefore: -30, type: 'overdue_30', label: '30 days overdue' },
    ];

    const results: Array<{ invoiceId: string; invoiceNumber: string; type: string; clientEmail: string }> = [];

    for (const { invoice, client } of activeInvoices) {
      if (!invoice.dueDate) continue;
      const clientEmail = client.billingEmail || client.email;
      if (!clientEmail) continue;

      const dueDate = new Date(invoice.dueDate);
      const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      for (const schedule of reminderSchedule) {
        const shouldSend = schedule.daysBefore >= 0
          ? daysUntilDue <= schedule.daysBefore && daysUntilDue > schedule.daysBefore - 1
          : daysUntilDue <= schedule.daysBefore && daysUntilDue > schedule.daysBefore - 7;

        if (!shouldSend) continue;

        const existingReminder = await db.select()
          .from(invoiceReminders)
          .where(and(
            eq(invoiceReminders.invoiceId, invoice.id),
            eq(invoiceReminders.workspaceId, workspaceId),
            sql`${invoiceReminders.reminderType} = 'custom'`,
            sql`${invoiceReminders.emailSubject} LIKE ${'%' + schedule.type + '%'}`,
          ))
          .limit(1);

        if (existingReminder.length > 0) continue;

        const daysOverdue = Math.max(0, -daysUntilDue);
        const outstanding = Number(invoice.total) - Number(invoice.amountPaid || '0');
        const clientName = `${client.firstName} ${client.lastName}`.trim() || client.companyName || 'Valued Client';

        let subject: string;
        let body: string;

        if (schedule.daysBefore >= 0) {
          subject = `[Reminder] Invoice ${invoice.invoiceNumber} due in ${schedule.daysBefore} day(s) - $${outstanding.toFixed(2)}`;
          body = `Dear ${clientName},\n\nThis is a friendly reminder that invoice ${invoice.invoiceNumber} for $${outstanding.toFixed(2)} is due on ${dueDate.toLocaleDateString()}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you.`;
        } else {
          subject = `[Overdue] Invoice ${invoice.invoiceNumber} is ${daysOverdue} day(s) past due - $${outstanding.toFixed(2)}`;
          body = `Dear ${clientName},\n\nInvoice ${invoice.invoiceNumber} for $${outstanding.toFixed(2)} was due on ${dueDate.toLocaleDateString()} and is now ${daysOverdue} days past due.\n\nPlease arrange payment immediately to avoid any late fees.\n\nThank you.`;
        }

        try {
          await NotificationDeliveryService.send({
            type: 'invoice_notification',
            workspaceId: workspaceId || invoice.workspaceId,
            recipientUserId: clientEmail,
            channel: 'email',
            body: {
              to: clientEmail,
              subject,
              html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1e293b;">${schedule.daysBefore >= 0 ? 'Payment Reminder' : 'Overdue Notice'}</h2>
              <p>${body.replace(/\n/g, '<br>')}</p>
              <div style="margin-top: 20px; padding: 15px; background-color: #f8fafc; border-radius: 8px;">
                <p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
                <p><strong>Amount Due:</strong> $${outstanding.toFixed(2)}</p>
                <p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>
              </div>
            </div>`,
            },
          });

          await db.insert(invoiceReminders).values({
            workspaceId,
            invoiceId: invoice.id,
            reminderType: 'custom',
            daysOverdue,
            sentAt: new Date(),
            emailTo: clientEmail,
            emailSubject: `${subject} [${schedule.type}]`,
            emailBody: body,
            status: 'sent',
            needsHumanIntervention: daysOverdue >= 30,
          });

          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            type: schedule.type,
            clientEmail,
          });
        } catch (err: unknown) {
          log.error('Failed to send payment reminder', { invoiceId: invoice.id, error: (err instanceof Error ? err.message : String(err)) });
          await db.insert(invoiceReminders).values({
            workspaceId,
            invoiceId: invoice.id,
            reminderType: 'custom',
            daysOverdue,
            emailTo: clientEmail,
            emailSubject: `${subject} [${schedule.type}]`,
            emailBody: body,
            status: 'failed',
            failureReason: (err instanceof Error ? err.message : String(err)),
            needsHumanIntervention: daysOverdue >= 30,
          });
        }
      }
    }

    return { remindersSent: results.length, reminders: results };
  }

  async generateClientStatement(
    clientId: string,
    workspaceId: string,
    month?: number,
    year?: number,
  ): Promise<Buffer> {
    const { default: PDFDocument } = await import('pdfkit');
    const { paymentRecords } = await import('@shared/schema');

    const now = new Date();
    const targetMonth = month ?? now.getMonth() + 1;
    const targetYear = year ?? now.getFullYear();

    const periodStart = new Date(targetYear, targetMonth - 1, 1);
    const periodEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))).limit(1);
    if (!client) throw new Error('Client not found or does not belong to this workspace');

    const clientInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.clientId, clientId),
        eq(invoices.workspaceId, workspaceId),
        gte(invoices.issueDate, periodStart),
        lte(invoices.issueDate, periodEnd),
      ))
      .orderBy(desc(invoices.issueDate));

    const payments = await db.select()
      .from(paymentRecords)
      .where(and(
        eq(paymentRecords.workspaceId, workspaceId),
        sql`${paymentRecords.invoiceId} IN (SELECT id FROM invoices WHERE client_id = ${clientId} AND workspace_id = ${workspaceId})`,
        gte(paymentRecords.paidAt, periodStart),
        lte(paymentRecords.paidAt, periodEnd),
        eq(paymentRecords.status, 'completed'),
      ))
      .orderBy(desc(paymentRecords.paidAt));

    const [workspace] = await db.select({
      companyName: (await import('@shared/schema')).workspaces.companyName,
      address: (await import('@shared/schema')).workspaces.address,
    }).from((await import('@shared/schema')).workspaces).where(eq((await import('@shared/schema')).workspaces.id, workspaceId)).limit(1);

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(20).text(workspace?.companyName || 'Your Security Company', { align: 'center' });
    doc.fontSize(10).text(workspace?.address || '', { align: 'center' });
    doc.moveDown();

    const monthName = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    doc.fontSize(16).text(`Client Statement - ${monthName}`, { align: 'center' });
    doc.moveDown();

    const clientName = client.companyName || `${client.firstName} ${client.lastName}`;
    doc.fontSize(12).text(`Client: ${clientName}`);
    doc.fontSize(10).text(`Period: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`);
    doc.moveDown(2);

    let y = doc.y;
    doc.fontSize(11).font('Helvetica-Bold').text('INVOICES', 50, y);
    y += 20;
    doc.fontSize(9).font('Helvetica');
    doc.text('Date', 50, y);
    doc.text('Invoice #', 150, y);
    doc.text('Status', 300, y);
    doc.text('Total', 380, y, { align: 'right', width: 80 });
    doc.text('Paid', 460, y, { align: 'right', width: 80 });
    y += 5;
    doc.moveTo(50, y + 10).lineTo(550, y + 10).stroke();
    y += 18;

    let totalInvoiced = 0;
    let totalPaidOnInvoices = 0;

    for (const inv of clientInvoices) {
      const invTotal = Number(inv.total);
      const invPaid = Number(inv.amountPaid || '0');
      totalInvoiced += invTotal;
      totalPaidOnInvoices += invPaid;

      doc.text(inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : 'N/A', 50, y);
      doc.text(inv.invoiceNumber, 150, y);
      doc.text((inv.status || 'draft').toUpperCase(), 300, y);
      doc.text(`$${invTotal.toFixed(2)}`, 380, y, { align: 'right', width: 80 });
      doc.text(`$${invPaid.toFixed(2)}`, 460, y, { align: 'right', width: 80 });
      y += 18;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;
    doc.font('Helvetica-Bold');
    doc.text('Total Invoiced:', 300, y);
    doc.text(`$${totalInvoiced.toFixed(2)}`, 380, y, { align: 'right', width: 80 });
    doc.text(`$${totalPaidOnInvoices.toFixed(2)}`, 460, y, { align: 'right', width: 80 });
    y += 25;

    doc.font('Helvetica-Bold').fontSize(11).text('PAYMENTS RECEIVED', 50, y);
    y += 20;
    doc.fontSize(9).font('Helvetica');
    doc.text('Date', 50, y);
    doc.text('Method', 150, y);
    doc.text('Invoice', 280, y);
    doc.text('Amount', 450, y, { align: 'right', width: 90 });
    y += 5;
    doc.moveTo(50, y + 10).lineTo(550, y + 10).stroke();
    y += 18;

    let totalPayments = 0;
    for (const pmt of payments) {
      const pmtAmount = Number(pmt.amount);
      totalPayments += pmtAmount;

      doc.text(pmt.paidAt ? new Date(pmt.paidAt).toLocaleDateString() : 'N/A', 50, y);
      doc.text(pmt.paymentMethod || 'N/A', 150, y);
      doc.text(pmt.invoiceId?.substring(0, 12) || 'N/A', 280, y);
      doc.text(`$${pmtAmount.toFixed(2)}`, 450, y, { align: 'right', width: 90 });
      y += 18;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;
    doc.font('Helvetica-Bold');
    doc.text('Total Payments:', 350, y);
    doc.text(`$${totalPayments.toFixed(2)}`, 450, y, { align: 'right', width: 90 });
    y += 30;

    const outstandingBalance = totalInvoiced - totalPaidOnInvoices;
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Outstanding Balance: $${outstandingBalance.toFixed(2)}`, 50, y, { align: 'right' });

    y += 30;
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8');
    doc.text(`Statement generated on ${now.toLocaleDateString()} by ${workspace?.companyName || 'your service provider'}`, 50, y, { align: 'center' });

    doc.end();
    const rawBuffer = await pdfReady;

    // Stamp + save client statement to vault
    const vaultResult = await saveToVault({
      workspaceId,
      workspaceName: workspace?.companyName || workspaceId,
      documentTitle: `Client Statement — ${new Date(targetYear, targetMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      category: 'operations',
      relatedEntityType: 'client',
      relatedEntityId: clientId,
      generatedBy: 'system',
      rawBuffer,
    });
    if (!vaultResult.success) {
      log.warn('[InvoiceService] Client statement vault save failed:', vaultResult.error);
    }

    return vaultResult.stampedBuffer || rawBuffer;
  }

  /**
   * Generate a branded per-invoice PDF and save to the tenant vault.
   * This is the canonical invoice document for client-facing delivery.
   */
  async generateInvoicePDF(invoiceId: string, workspaceId: string): Promise<{
    success: boolean;
    pdfBuffer?: Buffer;
    vaultId?: string;
    documentNumber?: string;
    error?: string;
  }> {
    try {
      const { default: PDFDocument } = await import('pdfkit');

      const [invoice] = await db.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
        .limit(1);
      if (!invoice) return { success: false, error: 'Invoice not found' };

      const inv = invoice as any;

      const [client] = await db.select().from(clients)
        .where(and(eq(clients.id, inv.clientId), eq(clients.workspaceId, workspaceId)))
        .limit(1);

      const [ws] = await db.select().from((await import('@shared/schema')).workspaces)
        .where(eq((await import('@shared/schema')).workspaces.id, workspaceId))
        .limit(1);

      const lineItems = await db.select().from((await import('@shared/schema')).invoiceLineItems)
        .where(eq((await import('@shared/schema')).invoiceLineItems.invoiceId, invoiceId));

      const c = client as any;
      const w = ws as any;
      const clientName = c?.companyName || `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || 'Client';
      const workspaceName = w?.companyName || workspaceId;
      const issueDate = inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
      const dueDate   = inv.dueDate   ? new Date(inv.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
      const total     = Number(inv.totalAmount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 80, bottom: 80, left: 72, right: 72 } });
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      const bufReady = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

      // Header block
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#111827').text('INVOICE', { align: 'right' });
      doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
        .text(`Invoice #: ${inv.invoiceNumber || invoiceId.slice(-8)}`, { align: 'right' })
        .text(`Issue Date: ${issueDate}`, { align: 'right' })
        .text(`Due Date: ${dueDate}`, { align: 'right' });

      doc.moveDown(1.5);

      // Bill From / Bill To
      const y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
        .text('FROM:', 72, y)
        .moveDown(0.3)
        .font('Helvetica').fillColor('#111827')
        .text(workspaceName, 72)
        .text(w?.address || '', 72);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
        .text('BILL TO:', 300, y)
        .moveDown(0.3);
      doc.font('Helvetica').fillColor('#111827')
        .text(clientName, 300)
        .text(c?.address || c?.billingAddress || '', 300);

      doc.moveDown(2);

      // Line items table header
      doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#111827').lineWidth(1).stroke();
      doc.moveDown(0.3);
      const colX = [72, 300, 380, 460];
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
      ['Description', 'Qty', 'Rate', 'Amount'].forEach((h, i) => {
        doc.text(h, colX[i], doc.y, { width: i === 0 ? 210 : 80, continued: i < 3 });
      });
      doc.moveDown(0.3);
      doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      // Line items
      doc.fontSize(9).font('Helvetica').fillColor('#374151');
      for (const item of lineItems as any[]) {
        const lineY = doc.y;
        const qty    = Number(item.quantity || 1);
        const rate   = Number(item.unitPrice || item.rate || 0);
        const amount = Number(item.amount || qty * rate);
        doc.text(item.description || 'Service', colX[0], lineY, { width: 210 });
        doc.text(String(qty), colX[1], lineY, { width: 80 });
        doc.text(`$${rate.toFixed(2)}`, colX[2], lineY, { width: 80 });
        doc.text(`$${amount.toFixed(2)}`, colX[3], lineY, { width: 80 });
        doc.moveDown(0.6);
      }

      doc.moveDown(0.5);
      doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#111827').lineWidth(1).stroke();
      doc.moveDown(0.5);

      // Total
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827')
        .text(`TOTAL DUE: ${total}`, { align: 'right' });

      // Status badge
      const status = (inv.status || 'draft').toUpperCase();
      const statusColors: Record<string, string> = { PAID: '#059669', OVERDUE: '#dc2626', SENT: '#2563eb' };
      const statusColor = statusColors[status] || '#6b7280';
      doc.moveDown(0.5)
        .fontSize(10).fillColor(statusColor)
        .text(`Status: ${status}`, { align: 'right' });

      // Payment terms / notes
      if (inv.notes) {
        doc.moveDown(1).fontSize(8).fillColor('#6b7280').text(`Notes: ${inv.notes}`, { lineGap: 2 });
      }
      doc.moveDown(0.5).fontSize(8).fillColor('#9ca3af')
        .text('Thank you for your business. Please remit payment by the due date shown above.', { align: 'center' });

      doc.end();
      const rawBuffer = await bufReady;

      const vaultResult = await saveToVault({
        workspaceId,
        workspaceName,
        documentTitle: `Invoice ${inv.invoiceNumber || invoiceId.slice(-8)}`,
        category: 'operations',
        period: issueDate,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        generatedBy: 'trinity',
        rawBuffer,
      });

      if (!vaultResult.success) {
        log.warn('[InvoiceService] Invoice PDF vault save failed:', vaultResult.error);
      }

      return {
        success: true,
        pdfBuffer: vaultResult.stampedBuffer || rawBuffer,
        vaultId: vaultResult.vault?.id,
        documentNumber: vaultResult.vault?.documentNumber,
      };
    } catch (error: unknown) {
      log.error('[InvoiceService] Invoice PDF generation failed:', error?.message);
      return { success: false, error: error?.message };
    }
  }
}

// Singleton instance
export const invoiceService = new InvoiceService();
