/**
 * Stripe Connect Payout Service
 * 
 * Enables employee payroll payouts via Stripe Connect Custom accounts.
 * Provides an alternative to QuickBooks/Gusto for orgs using Stripe-local mode.
 * 
 * Features:
 * - Create Connect accounts for employees
 * - Process payroll payouts via Stripe Transfers
 * - Track payout status and history
 * - Handle compliance (1099 reporting)
 */

import { createLogger } from '../../lib/logger';
import Stripe from 'stripe';
import crypto from 'crypto';
import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { employees, payrollEntries, payrollRuns, employeePayrollInfo, payrollPayouts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { auditLogger } from '../audit-logger';
import { providerPreferenceService } from './providerPreferenceService';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';

const log = createLogger('stripeConnectPayoutService');
// Initialize Stripe with API key
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any, timeout: 10000, maxNetworkRetries: 2 })
  : null;

export interface ConnectAccountStatus {
  hasAccount: boolean;
  accountId?: string;
  payoutsEnabled: boolean;
  requiresOnboarding: boolean;
  onboardingUrl?: string;
}

export interface PayoutResult {
  success: boolean;
  transferId?: string;
  amount: number;
  currency: string;
  error?: string;
}

class StripeConnectPayoutService {
  /**
   * Check if Stripe Connect is available
   */
  isAvailable(): boolean {
    return !!stripe;
  }

  /**
   * Create or get Connect account for employee
   */
  async getOrCreateConnectAccount(
    employeeId: string,
    workspaceId: string,
    employeeEmail: string,
    employeeName: string
  ): Promise<ConnectAccountStatus> {
    if (!stripe) {
      return { 
        hasAccount: false, 
        payoutsEnabled: false, 
        requiresOnboarding: true,
        error: 'Stripe not configured'
      } as ConnectAccountStatus & { error: string };
    }

    try {
      // Check if employee already has a Connect account stored
      const [employee] = await db.select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!employee) {
        throw new Error('Employee not found');
      }

      const [payrollInfo] = await db.select()
        .from(employeePayrollInfo)
        .where(eq(employeePayrollInfo.employeeId, employeeId))
        .limit(1);

      const existingAccountId = payrollInfo?.stripeConnectAccountId || null;

      if (existingAccountId) {
        // Verify account still exists and get status
        try {
          const account = await stripe.accounts.retrieve(existingAccountId);
          return {
            hasAccount: true,
            accountId: account.id,
            payoutsEnabled: account.payouts_enabled || false,
            requiresOnboarding: !account.details_submitted,
            onboardingUrl: !account.details_submitted 
              ? await this.createOnboardingLink(account.id, workspaceId)
              : undefined
          };
        } catch (err: any) {
          // Account may have been deleted, create new one
          log.info('[StripeConnect] Previous account not found, creating new');
        }
      }

      // Create new Connect Custom account
      const account = await stripe.accounts.create({
        type: 'custom',
        country: 'US',
        email: employeeEmail,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        individual: {
          email: employeeEmail,
          first_name: employee.firstName || employeeName.split(' ')[0],
          last_name: employee.lastName || employeeName.split(' ').slice(1).join(' ') || 'Employee',
        },
        metadata: {
          employeeId,
          workspaceId,
          platform: 'coaileague'
        },
        tos_acceptance: {
          service_agreement: 'recipient',
        },
        // GAP-57 FIX: Use deterministic idempotency key scoped to employeeId.
        // crypto.randomUUID() would generate a new key on every retry, defeating deduplication.
        // If account creation fails and is retried, Stripe returns the same account (idempotent).
      }, { idempotencyKey: `connect-account-create-${employeeId}` });

      if (payrollInfo) {
        await db.update(employeePayrollInfo)
          .set({
            stripeConnectAccountId: account.id,
            stripeConnectPayoutsEnabled: false,
            stripeConnectOnboardingComplete: false,
            updatedAt: new Date(),
          })
          .where(eq(employeePayrollInfo.employeeId, employeeId));
      } else {
        await db.insert(employeePayrollInfo).values({
          workspaceId,
          employeeId,
          stripeConnectAccountId: account.id,
          stripeConnectPayoutsEnabled: false,
          stripeConnectOnboardingComplete: false,
        });
      }

      await auditLogger.logEvent(
        { actorId: 'system', actorType: 'SYSTEM', actorName: 'Stripe Connect', workspaceId },
        {
          eventType: 'stripe_connect.account_created',
          aggregateId: employeeId,
          aggregateType: 'employee',
          payload: { accountId: account.id },
        },
        { generateHash: true }
      ).catch((err: any) => log.warn('[StripeConnect] Audit log failed for account_created — operation succeeded but audit record missing', { employeeId, workspaceId, error: err?.message }));

      // Generate onboarding link
      const onboardingUrl = await this.createOnboardingLink(account.id, workspaceId);

      return {
        hasAccount: true,
        accountId: account.id,
        payoutsEnabled: false,
        requiresOnboarding: true,
        onboardingUrl,
      };
    } catch (error: any) {
      log.error('[StripeConnect] Error creating account:', error);
      return {
        hasAccount: false,
        payoutsEnabled: false,
        requiresOnboarding: true,
      };
    }
  }

  /**
   * Create onboarding link for employee to complete account setup
   */
  private async createOnboardingLink(accountId: string, workspaceId: string): Promise<string> {
    if (!stripe) throw new Error('Stripe not configured');

    const baseUrl = getAppBaseUrl();

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/employee/payroll/connect?refresh=true`,
      return_url: `${baseUrl}/employee/payroll/connect?success=true`,
      type: 'account_onboarding',
    // NOTE: randomUUID() is acceptable here — accountLinks are one-time URLs that expire
    // immediately and MUST be fresh per request. Reusing the same idempotency key would return
    // the same (potentially expired) URL from Stripe's cache. This is the correct pattern per
    // Stripe docs for accountLinks.create.
    }, { idempotencyKey: crypto.randomUUID() });

    return accountLink.url;
  }

  /**
   * Process payroll payout to employee via Stripe Connect
   */
  async processPayrollPayout(
    payrollEntryId: string,
    workspaceId: string
  ): Promise<PayoutResult> {
    if (!stripe) {
      return { success: false, amount: 0, currency: 'usd', error: 'Stripe not configured' };
    }

    try {
      // Verify provider preference
      const prefs = await providerPreferenceService.getPreferences(workspaceId);
      if (prefs.payrollProvider !== 'local') {
        return { 
          success: false, 
          amount: 0, 
          currency: 'usd', 
          error: `Payroll provider is ${prefs.payrollProvider}, not local/Stripe` 
        };
      }

      // Get payroll entry with employee details
      const [entry] = await db.select()
        .from(payrollEntries)
        .where(eq(payrollEntries.id, payrollEntryId))
        .limit(1);

      if (!entry) {
        return { success: false, amount: 0, currency: 'usd', error: 'Payroll entry not found' };
      }

      // Get employee Connect account
      const [employee] = await db.select()
        .from(employees)
        .where(eq(employees.id, entry.employeeId))
        .limit(1);

      if (!employee) {
        return { success: false, amount: 0, currency: 'usd', error: 'Employee not found' };
      }

      const [payrollInfo] = await db.select()
        .from(employeePayrollInfo)
        .where(eq(employeePayrollInfo.employeeId, entry.employeeId))
        .limit(1);

      const connectAccountId = payrollInfo?.stripeConnectAccountId || null;

      if (!connectAccountId) {
        return { success: false, amount: 0, currency: 'usd', error: 'Employee has no Connect account configured' };
      }

      // Verify account has payouts enabled
      const account = await stripe.accounts.retrieve(connectAccountId);
      if (!account.payouts_enabled) {
        return { success: false, amount: 0, currency: 'usd', error: 'Connect account payouts not enabled' };
      }

      // Calculate net pay (should already be calculated in entry)
      const netPay = parseFloat(entry.netPay?.toString() || '0');
      if (netPay <= 0) {
        return { success: false, amount: 0, currency: 'usd', error: 'No net pay to transfer' };
      }

      // Convert to cents for Stripe
      const amountCents = Math.round(netPay * 100);

      // Create transfer to employee's Connect account
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: connectAccountId,
        description: `Payroll: ${(entry as any).periodStart} - ${(entry as any).periodEnd}`,
        metadata: {
          payrollEntryId,
          employeeId: entry.employeeId,
          workspaceId,
          periodStart: (entry as any).periodStart?.toISOString() || '',
          periodEnd: (entry as any).periodEnd?.toISOString() || '',
        },
        // GAP-57 FIX: Deterministic idempotency key scoped to payrollEntryId.
        // crypto.randomUUID() generates a NEW key on every retry, so Stripe won't
        // deduplicate the call — a network timeout + app retry would create TWO transfers
        // (double payout to the employee). payrollEntryId is unique per payroll period
        // per employee, guaranteeing Stripe deduplication on any retry path.
      }, { idempotencyKey: `transfer-payroll-entry-${payrollEntryId}` });

      try {
        await db.update(payrollEntries)
          .set({
            stripeTransferId: transfer.id,
            disbursedAt: new Date(),
            disbursementMethod: 'stripe_connect',
            notes: `Paid via Stripe Connect: ${transfer.id}`,
          })
          .where(eq(payrollEntries.id, payrollEntryId));
      } catch (err: any) {
        log.error('[StripeConnect] Could not update payroll entry disbursement fields:', err);
        // Notify org owner — payout succeeded but tracking record failed (reconciliation risk)
        import('../notificationService').then(({ notificationService }) =>
          import('@shared/schema').then(({ workspaces }) =>
            import('drizzle-orm').then(({ eq: eqOp }) =>
              db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eqOp(workspaces.id, workspaceId)).limit(1)
                .then(([ws]) => ws?.ownerId && notificationService.createNotification({
                  userId: ws.ownerId, workspaceId,
                  type: 'payroll_tracking_error',
                  title: 'Payroll Tracking Error',
                  message: `Stripe payout ${transfer.id} succeeded for entry ${payrollEntryId}, but the internal tracking record failed to update. Please verify disbursement in your payroll records. Error: ${(err instanceof Error ? err.message : String(err))}`,
                  priority: 'high',
                }))
            )
          )
        ).catch((err) => log.warn('[stripeConnectPayoutService] Fire-and-forget failed:', err));
      }

      try {
        await db.insert(payrollPayouts).values({
          workspaceId,
          payrollRunId: entry.payrollRunId,
          payrollEntryId,
          employeeId: entry.employeeId,
          method: 'stripe_connect',
          amount: netPay.toFixed(2),
          currency: 'usd',
          status: 'completed',
          stripeTransferId: transfer.id,
          initiatedAt: new Date(),
          completedAt: new Date(),
        });
      } catch (err: any) {
        log.error('[StripeConnect] Could not insert payroll payout record:', err);
        // Notify org owner — payout succeeded but payout log insert failed (audit gap)
        import('../notificationService').then(({ notificationService }) =>
          import('@shared/schema').then(({ workspaces }) =>
            import('drizzle-orm').then(({ eq: eqOp }) =>
              db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eqOp(workspaces.id, workspaceId)).limit(1)
                .then(([ws]) => ws?.ownerId && notificationService.createNotification({
                  userId: ws.ownerId, workspaceId,
                  type: 'payroll_tracking_error',
                  title: 'Payroll Payout Log Error',
                  message: `Stripe payout ${transfer.id} succeeded for entry ${payrollEntryId}, but the payout audit log failed to record. Manual reconciliation may be needed. Error: ${(err instanceof Error ? err.message : String(err))}`,
                  priority: 'high',
                }))
            )
          )
        ).catch((err) => log.warn('[stripeConnectPayoutService] Fire-and-forget failed:', err));
      }

      try {
        const { chargePayoutMiddlewareFee } = await import('./middlewareTransactionFees');
        const feeResult = await chargePayoutMiddlewareFee({
          workspaceId,
          payoutId: payrollEntryId,
          payoutAmountCents: amountCents,
          recipientName: `${(entry as any).firstName || ''} ${(entry as any).lastName || ''}`.trim() || undefined,
        });
        if (feeResult.success && feeResult.amountCents > 0) {
          log.info(`[StripeConnect] Payout fee charged: $${(feeResult.amountCents / 100).toFixed(2)} for entry ${payrollEntryId}`);
          // Platform revenue tracking: write to platform_revenue table (non-blocking)
          import('../finance/middlewareFeeService').then(({ recordMiddlewareFeeCharge }) =>
            recordMiddlewareFeeCharge(workspaceId, 'payout_processing', feeResult.amountCents, payrollEntryId)
              .catch((err: Error) => log.warn('[StripeConnect] Payout revenue record failed (non-blocking):', err.message))
          ).catch((err: Error) => log.warn('[StripeConnect] Payout revenue import failed:', err.message));
        }
      } catch (feeErr) {
        log.warn('[StripeConnect] Payout middleware fee failed (non-blocking):', feeErr);
      }

      // Audit log
      await auditLogger.logEvent(
        { actorId: 'system', actorType: 'SYSTEM', actorName: 'Stripe Connect Payout', workspaceId },
        {
          eventType: 'stripe_connect.payout_sent',
          aggregateId: payrollEntryId,
          aggregateType: 'payroll_entry',
          payload: { 
            transferId: transfer.id, 
            amount: netPay, 
            employeeId: entry.employeeId 
          },
        },
        { generateHash: true }
      ).catch((err: any) => log.warn('[StripeConnect] Audit log failed for payout_sent — payout succeeded but audit record missing', { payrollEntryId, transferId: transfer.id, amount: netPay, workspaceId, error: err?.message }));

      return {
        success: true,
        transferId: transfer.id,
        amount: netPay,
        currency: 'usd',
      };
    } catch (error: any) {
      log.error('[StripeConnect] Payout error:', error);
      return {
        success: false,
        amount: 0,
        currency: 'usd',
        error: (error instanceof Error ? error.message : String(error)) || 'Payout failed',
      };
    }
  }

  /**
   * Process all pending payroll entries for a payroll run
   */
  async processPayrollRun(
    payrollRunId: string,
    workspaceId: string
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    const results = { processed: 0, failed: 0, errors: [] as string[] };
    let totalNetPayDisbursed = 0;

    try {
      // Get all entries for this payroll run
      const entries = await db.select()
        .from(payrollEntries)
        .where(
          and(
            eq(payrollEntries.payrollRunId, payrollRunId),
            eq(payrollEntries.status, 'approved')
          )
        );

      log.info(`[StripeConnect] Processing ${entries.length} payroll entries for run ${payrollRunId}`);

      for (const entry of entries) {
        const result = await this.processPayrollPayout(entry.id, workspaceId);
        if (result.success) {
          results.processed++;
          totalNetPayDisbursed += parseFloat(String(entry.netPay || 0));
        } else {
          results.failed++;
          results.errors.push(`${entry.employeeId}: ${result.error}`);
        }
      }

      // Update payroll run status
      try {
        if (results.processed > 0 && results.failed === 0) {
          // GAP-23 FIX: compound WHERE includes workspaceId so status can never flip
          // a payroll run belonging to a different workspace.
          await db.update(payrollRuns)
            .set({ status: 'completed' })
            .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)));

          // GAP-12 FIX: Write payroll_disbursed ledger entry for Stripe Connect batch payout.
          // Previously this path fired payroll_run_paid but never wrote to the org ledger, so
          // the disbursed amount was invisible to the P&L and QB sync pipelines.
          try {
            const { writeLedgerEntry } = await import('../orgLedgerService');
            await writeLedgerEntry({
              workspaceId,
              entryType: 'payroll_disbursed',
              direction: 'credit',
              amount: totalNetPayDisbursed,
              relatedEntityType: 'payroll_run',
              relatedEntityId: payrollRunId,
              payrollRunId,
              description: `Payroll run ${payrollRunId.substring(0, 8)} — ${results.processed} employee(s) disbursed $${totalNetPayDisbursed.toFixed(2)} via Stripe Connect`,
              metadata: { method: 'stripe_connect', entriesProcessed: results.processed, source: 'stripeConnectPayoutService' },
            });
          } catch (ledgerErr: any) {
            log.error(`[StripeConnect] payroll_disbursed ledger write failed for run ${payrollRunId}:`, ledgerErr.message);
          }

          platformEventBus.publish({
            type: 'payroll_run_paid',
            category: 'automation',
            title: 'Payroll Run Disbursed via Stripe Connect',
            description: `All ${results.processed} payroll entries for run ${payrollRunId} disbursed successfully via Stripe Connect`,
            workspaceId,
            metadata: { payrollRunId, processed: results.processed, failed: 0, method: 'stripe_connect' },
            visibility: 'manager',
          }).catch(err => log.warn('[StripeConnect] payroll_run_paid event publish failed (non-blocking):', (err instanceof Error ? err.message : String(err))));
        } else if (results.failed > 0) {
          // GAP-23 FIX: compound WHERE includes workspaceId (same fix as 'completed' branch above).
          await db.update(payrollRuns)
            .set({ status: 'partial' })
            .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)));
        }
      } catch (err) {
        log.warn('[StripeConnect] Could not update payroll run status:', err);
      }

      return results;
    } catch (error: any) {
      log.error('[StripeConnect] Payroll run error:', error);
      results.errors.push((error instanceof Error ? error.message : String(error)));
      return results;
    }
  }

  /**
   * Get payout history for an employee
   */
  async getPayoutHistory(
    employeeId: string,
    limit: number = 10
  ): Promise<Array<{ id: string; amount: number; status: string; created: Date }>> {
    if (!stripe) return [];

    try {
      const [employee] = await db.select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!employee) return [];

      const [payrollInfo] = await db.select()
        .from(employeePayrollInfo)
        .where(eq(employeePayrollInfo.employeeId, employeeId))
        .limit(1);

      const connectAccountId = payrollInfo?.stripeConnectAccountId || null;

      if (!connectAccountId) return [];

      const transfers = await stripe.transfers.list({
        destination: connectAccountId,
        limit,
      });

      return transfers.data.map(t => ({
        id: t.id,
        amount: t.amount / 100, // Convert from cents
        status: t.reversed ? 'reversed' : 'completed',
        created: new Date(t.created * 1000),
      }));
    } catch (error: any) {
      log.error('[StripeConnect] Error fetching payout history:', error);
      return [];
    }
  }
}

export const stripeConnectPayoutService = new StripeConnectPayoutService();
