/**
 * Platform Services Metering Service
 * 
 * Fortune 500-grade cost recovery system that tracks all platform service usage
 * (email, SMS, infrastructure) and bills it to workspaces via the credit pool.
 * 
 * Core Principle: The platform NEVER absorbs costs. Every service used by a
 * workspace is metered and charged back with appropriate margin.
 * 
 * Services Tracked:
 * - Resend Email (transactional, marketing, inbound)
 * - Twilio SMS (notifications, reminders, verification)
 * - Platform Infrastructure (domain, Google Workspace share)
 * 
 * Billing Model:
 * - Per-use charges: Email/SMS billed immediately upon send
 * - Monthly infrastructure: Charged on 1st of each month
 * - All costs include 3x margin for profitability
 */

import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { BATCHES } from '../../config/platformConfig';
import { 
  workspaces,
} from '@shared/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import { creditManager, CREDIT_COSTS } from './creditManager';
import { automationOrchestration } from '../orchestration/automationOrchestration';
import { isBillingExcluded } from './billingConstants';

const log = createLogger('platformServicesMeter');
// Service usage types for tracking
export type PlatformServiceType = 
  // Email services
  | 'email_transactional'
  | 'email_marketing'
  | 'email_inbound_processing'
  | 'email_with_attachment'
  | 'email_staffing_confirmation'
  | 'email_employee_notification'
  | 'email_payroll_notification'
  | 'email_invoice'
  | 'email_digest'
  // SMS services
  | 'sms_notification'
  | 'sms_shift_reminder'
  | 'sms_clock_reminder'
  | 'sms_verification'
  | 'sms_escalation'
  | 'sms_inbound'
  // Infrastructure services
  | 'platform_domain_fee'
  | 'platform_email_domain'
  | 'platform_google_workspace'
  | 'platform_infrastructure';

interface ServiceUsageRecord {
  workspaceId: string;
  serviceType: PlatformServiceType;
  quantity: number;
  metadata?: Record<string, any>;
  timestamp: Date;
}

interface ServiceUsageSummary {
  workspaceId: string;
  period: string;
  totalCreditsCharged: number;
  breakdown: {
    emails: { count: number; credits: number };
    sms: { count: number; credits: number };
    infrastructure: { credits: number };
  };
}

// In-memory queue for batch processing
const usageQueue: ServiceUsageRecord[] = [];
const BATCH_INTERVAL_MS = BATCHES.billingBatchIntervalMs;
let batchTimer: NodeJS.Timeout | null = null;

/**
 * Platform Services Meter
 * Tracks and bills all platform service usage to workspaces
 */
export class PlatformServicesMeter {
  private initialized = false;

  /**
   * Initialize the meter with batch processing
   */
  initialize(): void {
    if (this.initialized) return;
    
    // Start batch processing timer
    batchTimer = setInterval(() => {
      this.processBatch().catch(err => {
        log.error('[PlatformServicesMeter] Batch processing error:', err);
      });
    }, BATCH_INTERVAL_MS);
    
    this.initialized = true;
    log.info('[PlatformServicesMeter] Initialized - tracking email, SMS, and infrastructure costs');
  }

  /**
   * Stop the meter
   */
  shutdown(): void {
    if (batchTimer) {
      clearInterval(batchTimer);
      batchTimer = null;
    }
    this.initialized = false;
  }

  /**
   * Record email usage for billing
   */
  async trackEmail(
    workspaceId: string,
    emailType: 'transactional' | 'marketing' | 'inbound' | 'attachment' | 'staffing' | 'employee' | 'payroll' | 'invoice' | 'digest',
    metadata?: Record<string, any>
  ): Promise<void> {
    const serviceTypeMap: Record<string, PlatformServiceType> = {
      'transactional': 'email_transactional',
      'marketing': 'email_marketing',
      'inbound': 'email_inbound_processing',
      'attachment': 'email_with_attachment',
      'staffing': 'email_staffing_confirmation',
      'employee': 'email_employee_notification',
      'payroll': 'email_payroll_notification',
      'invoice': 'email_invoice',
      'digest': 'email_digest',
    };

    const serviceType = serviceTypeMap[emailType] || 'email_transactional';
    
    usageQueue.push({
      workspaceId,
      serviceType,
      quantity: 1,
      metadata: { ...metadata, emailType },
      timestamp: new Date(),
    });

    log.info(`[PlatformServicesMeter] Email tracked: ${emailType} for workspace ${workspaceId}`);
  }

  /**
   * Record SMS usage for billing
   */
  async trackSMS(
    workspaceId: string,
    smsType: 'notification' | 'shift_reminder' | 'clock_reminder' | 'verification' | 'escalation' | 'inbound',
    segments: number = 1,
    metadata?: Record<string, any>
  ): Promise<void> {
    const serviceTypeMap: Record<string, PlatformServiceType> = {
      'notification': 'sms_notification',
      'shift_reminder': 'sms_shift_reminder',
      'clock_reminder': 'sms_clock_reminder',
      'verification': 'sms_verification',
      'escalation': 'sms_escalation',
      'inbound': 'sms_inbound',
    };

    const serviceType = serviceTypeMap[smsType] || 'sms_notification';
    
    // Each SMS segment is billed separately
    usageQueue.push({
      workspaceId,
      serviceType,
      quantity: segments,
      metadata: { ...metadata, smsType, segments },
      timestamp: new Date(),
    });

    log.info(`[PlatformServicesMeter] SMS tracked: ${smsType} (${segments} segments) for workspace ${workspaceId}`);
  }

  /**
   * Process monthly infrastructure fees with 7-step orchestration
   * Called on the 1st of each month by the billing scheduler
   */
  async chargeMonthlyInfrastructure(): Promise<{ processed: number; totalCredits: number }> {
    log.info('[PlatformServicesMeter] Processing monthly infrastructure fees...');

    const result = await automationOrchestration.executeAutomation(
      {
        domain: 'automation',
        automationName: 'monthly-infrastructure-billing',
        automationType: 'billing_cycle',
        triggeredBy: 'cron',
        payload: { month: new Date().toISOString().slice(0, 7) },
        billable: false,
      },
      async (ctx) => {
        const activeWorkspaces = await db.select()
          .from(workspaces)
          .where(and(
            eq(workspaces.subscriptionStatus, 'active'),
            sql`${workspaces.subscriptionTier} IN ('starter', 'professional', 'enterprise')`
          ));

        let processed = 0;
        let totalCredits = 0;

        for (const workspace of activeWorkspaces) {
          // Skip platform, system, and support pool workspaces — never billed
          if (isBillingExcluded(workspace.id)) continue;

          try {
            const infraFees = this.calculateInfrastructureFees(workspace.subscriptionTier || 'starter');
            
            const chargeResult = await creditManager.deductCredits(
              workspace.id,
              'SYSTEM',
              'platform_infrastructure',
              infraFees.total,
              `Monthly platform infrastructure fee: ${infraFees.breakdown}`
            );

            if (chargeResult.success) {
              processed++;
              totalCredits += infraFees.total;
              log.info(`[PlatformServicesMeter] Charged ${infraFees.total} credits to workspace ${workspace.id}`);
            }
          } catch (error) {
            log.error(`[PlatformServicesMeter] Failed to charge workspace ${workspace.id}:`, error);
          }
        }

        return { processed, totalCredits };
      }
    );

    if (result.success && result.data) {
      log.info(`[PlatformServicesMeter] Monthly fees complete: ${result.data.processed} workspaces, ${result.data.totalCredits} total credits (orchestrationId: ${result.orchestrationId})`);
      return result.data;
    }

    return { processed: 0, totalCredits: 0 };
  }

  /**
   * Calculate infrastructure fees based on subscription tier
   */
  private calculateInfrastructureFees(tier: string): { total: number; breakdown: string } {
    // Base fees for all tiers
    const baseFees = {
      domain: CREDIT_COSTS.platform_domain_fee,           // 25 credits
      emailDomain: CREDIT_COSTS.platform_email_domain,    // 50 credits
    };

    // Tier-specific additions
    const tierFees: Record<string, { workspace: number; infra: number }> = {
      'starter': { workspace: 0, infra: 100 },           // 100 credits infra
      'professional': { workspace: 50, infra: 150 },     // 200 credits infra + 50 workspace features
      'enterprise': { workspace: 100, infra: 200 },      // 300 credits infra + 100 premium features
    };

    const fees = tierFees[tier] || tierFees['starter'];
    const total = baseFees.domain + baseFees.emailDomain + fees.workspace + fees.infra;

    const breakdown = [
      `Domain: ${baseFees.domain}`,
      `Email: ${baseFees.emailDomain}`,
      `Workspace: ${fees.workspace}`,
      `Infra: ${fees.infra}`,
    ].join(', ');

    return { total, breakdown };
  }

  /**
   * Process queued usage records in batch
   */
  private async processBatch(): Promise<void> {
    if (usageQueue.length === 0) return;

    // Take current batch
    const batch = usageQueue.splice(0, usageQueue.length);
    
    // Group by workspace for efficiency
    const byWorkspace = new Map<string, ServiceUsageRecord[]>();
    for (const record of batch) {
      const existing = byWorkspace.get(record.workspaceId) || [];
      existing.push(record);
      byWorkspace.set(record.workspaceId, existing);
    }

    // Process each workspace
    for (const [workspaceId, records] of byWorkspace) {
      try {
        // Calculate total credits for this batch
        let totalCredits = 0;
        const serviceBreakdown: Record<string, number> = {};

        for (const record of records) {
          const creditCost = CREDIT_COSTS[record.serviceType as keyof typeof CREDIT_COSTS] || 1;
          const cost = creditCost * record.quantity;
          totalCredits += cost;
          
          serviceBreakdown[record.serviceType] = (serviceBreakdown[record.serviceType] || 0) + cost;
        }

        if (totalCredits > 0) {
          // Deduct credits
          const description = Object.entries(serviceBreakdown)
            .map(([service, credits]) => `${service}: ${credits}`)
            .join(', ');

          await creditManager.deductCredits(
            workspaceId,
            'SYSTEM',
            'platform_services',
            totalCredits,
            `Platform services: ${description}`
          );

          log.info(`[PlatformServicesMeter] Billed ${totalCredits} credits to ${workspaceId}: ${description}`);
        }
      } catch (error) {
        log.error(`[PlatformServicesMeter] Failed to bill workspace ${workspaceId}:`, error);
        // Re-queue failed records for retry
        usageQueue.push(...records);
      }
    }
  }

  /**
   * Get usage summary for a workspace
   */
  async getUsageSummary(workspaceId: string, periodMonths: number = 1): Promise<ServiceUsageSummary> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - periodMonths);

    // credit_transactions table dropped (Phase 16) — return empty
    const transactions: Array<{ description: string | null; amount: number }> = [];

    // Parse and summarize
    let emailCount = 0;
    let emailCredits = 0;
    let smsCount = 0;
    let smsCredits = 0;
    let infraCredits = 0;

    for (const tx of transactions) {
      const desc = tx.description || '';
      const amount = Math.abs(tx.amount);

      if (desc.includes('email')) {
        emailCount++;
        emailCredits += amount;
      } else if (desc.includes('sms')) {
        smsCount++;
        smsCredits += amount;
      } else if (desc.includes('infrastructure') || desc.includes('Platform')) {
        infraCredits += amount;
      }
    }

    return {
      workspaceId,
      period: `${periodMonths} month(s)`,
      totalCreditsCharged: emailCredits + smsCredits + infraCredits,
      breakdown: {
        emails: { count: emailCount, credits: emailCredits },
        sms: { count: smsCount, credits: smsCredits },
        infrastructure: { credits: infraCredits },
      },
    };
  }

  /**
   * Check if workspace has sufficient credits for a service
   */
  async canUseService(workspaceId: string, serviceType: PlatformServiceType): Promise<boolean> {
    const creditCost = CREDIT_COSTS[serviceType as keyof typeof CREDIT_COSTS] || 1;
    const check = await creditManager.checkCredits(workspaceId, null, creditCost);
    return check.hasEnoughCredits;
  }
}

// Singleton instance
export const platformServicesMeter = new PlatformServicesMeter();

// Export helper functions for easy integration
export async function trackEmailUsage(
  workspaceId: string,
  emailType: 'transactional' | 'marketing' | 'inbound' | 'attachment' | 'staffing' | 'employee' | 'payroll' | 'invoice' | 'digest',
  metadata?: Record<string, any>
): Promise<void> {
  return platformServicesMeter.trackEmail(workspaceId, emailType, metadata);
}

export async function trackSMSUsage(
  workspaceId: string,
  smsType: 'notification' | 'shift_reminder' | 'clock_reminder' | 'verification' | 'escalation' | 'inbound',
  segments?: number,
  metadata?: Record<string, any>
): Promise<void> {
  return platformServicesMeter.trackSMS(workspaceId, smsType, segments, metadata);
}
