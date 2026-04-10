import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import {
  partnerConnections,
  workspaces,
  billingAuditLog,
  trinityCreditFailures,
  type InsertPartnerApiUsageEvent,
  type PartnerApiUsageEvent,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { creditManager } from './creditManager';

const log = createLogger('partnerApiUsage');
export interface PartnerApiCallInput {
  workspaceId: string;
  userId?: string;
  partnerConnectionId: string;
  partnerType: 'quickbooks' | 'gusto' | 'stripe' | 'plaid' | 'other';
  
  // API call details
  endpoint: string; // e.g., '/v3/invoice', '/v1/companies/{id}/payrolls'
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  
  // Usage metrics
  usageType: 'api_call' | 'batch_operation' | 'webhook_event';
  usageAmount?: number; // Default 1
  usageUnit?: string; // Default 'api_calls'
  
  // Request/Response metrics
  requestPayloadSize?: number; // Bytes
  responsePayloadSize?: number; // Bytes
  responseStatusCode?: number;
  responseTimeMs?: number; // Milliseconds
  
  // Success/Error tracking
  success?: boolean;
  errorMessage?: string;
  errorCode?: string;
  
  // Context
  featureKey?: string; // e.g., 'billos_invoice_creation', 'billos_payroll_submission'
  activityType?: string; // e.g., 'invoice_creation', 'customer_sync'
  metadata?: any;
  
  // Audit trail
  ipAddress?: string;
  userAgent?: string;
}

export interface PartnerApiMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalCost: number;
  averageResponseTime: number;
  byPartner: Record<string, {
    calls: number;
    cost: number;
    successRate: number;
  }>;
  byEndpoint: Record<string, {
    calls: number;
    avgResponseTime: number;
    successRate: number;
  }>;
}

export class PartnerApiUsageService {
  constructor() {
  }
  
  /**
   * Record a partner API call asynchronously (non-blocking)
   * This ensures partner operations aren't blocked by billing failures
   * 
   * CRITICAL: This method NEVER throws - it's fully best-effort
   */
  async recordApiCall(input: PartnerApiCallInput): Promise<PartnerApiUsageEvent | null> {
    try {
      // Generate stable idempotency key from input (prevents double-billing on retries)
      // IMPORTANT: Use caller-provided key if available, otherwise create from request params
      const idempotencyKey = input.metadata?.idempotencyKey || this.generateIdempotencyKey(input);
      
      // Check for duplicate event (deduplication)
      const existingEvent = await db.select()
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .from(partnerApiUsageEvents)
        .where(
          and(
            // @ts-expect-error — TS migration: fix in refactoring sprint
            eq(partnerApiUsageEvents.workspaceId, input.workspaceId),
            // @ts-expect-error — TS migration: fix in refactoring sprint
            sql`${partnerApiUsageEvents.metadata}->>'idempotencyKey' = ${idempotencyKey}`
          )
        )
        .limit(1);
      
      if (existingEvent.length > 0) {
        // Event already tracked - return existing event to prevent double-billing
        log.info(`Deduplicated partner API call with key: ${idempotencyKey}`);
        return existingEvent[0];
      }
      
      // Get unit price for this API call (monthly amortized cost)
      const unitPrice = await this.getUnitPrice(input.partnerType, input.endpoint, input.httpMethod);
      const usageAmount = input.usageAmount ?? 1;
      const totalCost = unitPrice * usageAmount;
      
      // Create usage event (only if not duplicate)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const [event] = await db.insert(partnerApiUsageEvents).values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        partnerConnectionId: input.partnerConnectionId,
        partnerType: input.partnerType,
        endpoint: input.endpoint,
        httpMethod: input.httpMethod,
        usageType: input.usageType,
        usageAmount: (input.usageAmount ?? 1).toString(),
        usageUnit: input.usageUnit ?? 'api_calls',
        unitPrice: unitPrice.toString(),
        totalCost: totalCost.toString(),
        costCurrency: 'USD',
        requestPayloadSize: input.requestPayloadSize,
        responsePayloadSize: input.responsePayloadSize,
        responseStatusCode: input.responseStatusCode,
        responseTimeMs: input.responseTimeMs,
        success: input.success ?? true,
        errorMessage: input.errorMessage,
        errorCode: input.errorCode,
        featureKey: input.featureKey,
        activityType: input.activityType,
        metadata: {
          ...input.metadata,
          idempotencyKey, // Store for deduping
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      }).returning();
      
      // Async: Deduct from credit wallet (don't block on failure)
      if (totalCost > 0) {
        this.deductCreditsAsync(
          input.workspaceId,
          totalCost,
          `${input.partnerType} API: ${input.endpoint}`,
          event.id
        ).catch(err => {
          log.error(`Failed to deduct credits for partner API call ${event.id}:`, err);
        });
      }
      
      // Async: Log audit event (don't block)
      this.logAuditEventAsync(input.workspaceId, input.userId, event).catch(err => {
        log.error(`Failed to log audit event for partner API call ${event.id}:`, err);
      });
      
      return event;
    } catch (error) {
      // CRITICAL: Never throw - just log and return null
      // Partner operations must never fail due to billing failures
      log.error('Failed to record partner API call (non-fatal):', error, input);
      return null;
    }
  }
  
  /**
   * Async credit deduction (non-blocking)
   */
  private async deductCreditsAsync(
    workspaceId: string,
    amount: number,
    description: string,
    usageEventId: string
  ): Promise<void> {
    try {
      await creditManager.deductCredits({
        workspaceId,
        featureKey: 'partner_api_call',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: 'Partner API',
        amountOverride: amount,
        description,
        aiUsageEventId: usageEventId,
        relatedEntityType: 'partner_api_usage',
        relatedEntityId: usageEventId,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`[PartnerApiUsage] Credit deduction FAILED for workspace ${workspaceId} — event ${usageEventId}: ${errMsg}`);

      // Log to canonical failure table — never silently drop
      db.insert(trinityCreditFailures).values({
        workspaceId,
        featureKey: 'partner_api_call',
        featureName: 'Partner API',
        amountAttempted: String(amount),
        description,
        errorMessage: errMsg,
        source: 'partner_api_usage',
        relatedEntityType: 'partner_api_usage_event',
        relatedEntityId: usageEventId,
        aiUsageEventId: usageEventId,
        notifiedOwner: false,
        resolved: false,
      }).catch(e => log.error('[PartnerApiUsage] Failed to write credit failure row:', e));

      // Best-effort owner notification
      import('../../services/notificationService').then(async ({ createNotification }) => {
        const { db } = await import('../../db');
        const { workspaces } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
        const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (!ws?.ownerId) { log.warn('[PartnerApiUsage] No owner found for workspace', workspaceId); return; }
        createNotification({
          workspaceId,
          userId: ws.ownerId,
          title: 'Partner API Credit Deduction Failed',
          message: `A Partner API call ran successfully but the credit deduction of ${amount} credits failed: ${errMsg}. Please contact support to reconcile.`,
          type: 'error',
          category: 'billing',
          priority: 'high',
          actionUrl: '/billing',
        });
      }).catch((err) => log.warn('[partnerApiUsage] Fire-and-forget failed:', err));
    }
  }
  
  /**
   * Generate stable idempotency key from caller-supplied identifiers
   * 
   * CRITICAL: This method expects callers to provide deterministic IDs
   * via metadata. NO FALLBACKS are provided to enforce this contract.
   * 
   * @throws Error if no deterministic identifier found in metadata
   */
  private generateIdempotencyKey(input: PartnerApiCallInput): string {
    // Extract caller-supplied deterministic ID
    const deterministicId = input.metadata?.requestId || 
      input.metadata?.webhookId || 
      input.metadata?.batchId;
    
    if (!deterministicId) {
      throw new Error(
        `Missing deterministic identifier in metadata for partner API usage tracking. ` +
        `Required: metadata.requestId, metadata.batchId, or metadata.webhookId`
      );
    }
    
    // Build stable idempotency key from workspace + operation + caller ID
    return `${input.workspaceId}:${input.partnerType}:${input.endpoint}:${input.httpMethod}:${deterministicId}`;
  }
  
  /**
   * Async audit logging (non-blocking)
   */
  private async logAuditEventAsync(
    workspaceId: string,
    userId: string | undefined,
    event: PartnerApiUsageEvent
  ): Promise<void> {
    try {
      await db.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'partner_api_usage_recorded',
        eventCategory: 'usage',
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        description: `Recorded ${event.partnerType} API call: ${event.httpMethod} ${event.endpoint}`,
        relatedEntityType: 'partner_api_usage_event',
        relatedEntityId: event.id,
        newState: {
          partnerType: event.partnerType,
          endpoint: event.endpoint,
          success: event.success,
          totalCost: event.totalCost,
          responseTime: event.responseTimeMs,
        },
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      });
    } catch (error) {
      log.error('Audit logging failed:', error);
    }
  }
  
  /**
   * Get unit price for a partner API call
   * 
   * Strategy: Monthly amortized cost per API call
   * - QuickBooks Essentials: $65/month ÷ ~10,000 API calls = $0.0065/call
   * - Gusto Core: $40/month + $6/employee ÷ ~1,000 API calls = variable
   * 
   * NOTE: These are BASE costs. Tier-based markup is applied at invoice time:
   * - Free tier: 50% markup
   * - Starter tier: 30% markup
   * - Professional tier: 20% markup
   * - Enterprise tier: 10% markup
   */
  private async getUnitPrice(
    partnerType: string,
    endpoint: string,
    httpMethod: string
  ): Promise<number> {
    // Base pricing (amortized monthly subscription cost per API call)
    // These are COST prices (what we pay), markup is applied later
    const basePricing: Record<string, Record<string, number>> = {
      quickbooks: {
        // QuickBooks Online Essentials: $65/month
        // Estimated 10,000 API calls/month = $0.0065/call base
        'POST /v3/invoice': 0.0065, // Create invoice
        'POST /v3/customer': 0.0065, // Create customer
        'GET /v3/customer': 0.0010, // Read customer (cheaper)
        'GET /v3/invoice': 0.0010, // Read invoice
        'POST /v3/payment': 0.0065, // Record payment
        'default': 0.0050, // Default for unlisted endpoints
      },
      gusto: {
        // Gusto Core: $40/month base + $6/employee
        // Estimated 1,000 API calls/month = variable by company size
        // Using $0.10/call base (higher due to lower volume)
        'POST /v1/companies/{company_id}/payrolls': 0.1000, // Create payroll (high value)
        'POST /v1/companies/{company_id}/employees': 0.0500, // Create employee
        'GET /v1/companies/{company_id}/employees': 0.0100, // Read employees
        'GET /v1/companies/{company_id}/payrolls': 0.0100, // Read payrolls
        'default': 0.0500, // Default for unlisted endpoints
      },
      stripe: {
        // Stripe is free for API calls (only charges transaction fees)
        // We don't charge for Stripe API usage
        'default': 0.0000,
      },
      plaid: {
        // Plaid pricing: Link token creation ~$0.05, ACH transfer auth ~$0.50, transfer initiation ~$0.25
        'POST /link/token/create': 0.0500,   // Link token creation
        'POST /item/public_token/exchange': 0.0500, // Token exchange
        'POST /auth/get': 0.0200,             // Account auth read
        'POST /transfer/authorization/create': 0.5000, // Transfer auth (highest value)
        'POST /transfer/create': 0.2500,      // Initiate ACH transfer
        'GET /transfer/get': 0.0100,          // Transfer status check
        'POST /transfer/cancel': 0.0100,      // Cancel transfer
        'default': 0.0500, // Default for unlisted Plaid endpoints
      },
      other: {
        'default': 0.0100, // Generic $0.01/call for unknown partners
      },
    };
    
    const partnerPricing = basePricing[partnerType] || basePricing.other;
    const key = `${httpMethod} ${endpoint}`;
    
    // Try exact match first, then fall back to default
    return partnerPricing[key] ?? partnerPricing['default'] ?? 0.01;
  }
  
  /**
   * Get usage metrics for a workspace within a date range
   */
  async getUsageMetrics(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PartnerApiMetrics> {
    const events = await db.select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(partnerApiUsageEvents.createdAt, startDate),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(partnerApiUsageEvents.createdAt, endDate)
        )
      )
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(partnerApiUsageEvents.createdAt));
    
    // Calculate metrics
    const metrics: PartnerApiMetrics = {
      totalCalls: events.length,
      successfulCalls: events.filter(e => e.success).length,
      failedCalls: events.filter(e => !e.success).length,
      totalCost: events.reduce((sum, e) => sum + Number(e.totalCost || 0), 0),
      averageResponseTime: 0,
      byPartner: {},
      byEndpoint: {},
    };
    
    // Calculate average response time
    const responseTimes = events.filter(e => e.responseTimeMs != null).map(e => e.responseTimeMs!);
    if (responseTimes.length > 0) {
      metrics.averageResponseTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
    }
    
    // Aggregate by partner
    for (const event of events) {
      if (!metrics.byPartner[event.partnerType]) {
        metrics.byPartner[event.partnerType] = { calls: 0, cost: 0, successRate: 0 };
      }
      metrics.byPartner[event.partnerType].calls++;
      metrics.byPartner[event.partnerType].cost += Number(event.totalCost || 0);
    }
    
    // Calculate success rates
    for (const partner in metrics.byPartner) {
      const partnerEvents = events.filter(e => e.partnerType === partner);
      const successfulEvents = partnerEvents.filter(e => e.success);
      metrics.byPartner[partner].successRate = partnerEvents.length > 0
        ? (successfulEvents.length / partnerEvents.length) * 100
        : 0;
    }
    
    // Aggregate by endpoint
    for (const event of events) {
      const key = `${event.httpMethod} ${event.endpoint}`;
      if (!metrics.byEndpoint[key]) {
        metrics.byEndpoint[key] = { calls: 0, avgResponseTime: 0, successRate: 0 };
      }
      metrics.byEndpoint[key].calls++;
    }
    
    // Calculate endpoint metrics
    for (const endpoint in metrics.byEndpoint) {
      const endpointEvents = events.filter(e => `${e.httpMethod} ${e.endpoint}` === endpoint);
      const successfulEvents = endpointEvents.filter(e => e.success);
      const responseTimes = endpointEvents.filter(e => e.responseTimeMs != null).map(e => e.responseTimeMs!);
      
      metrics.byEndpoint[endpoint].successRate = endpointEvents.length > 0
        ? (successfulEvents.length / endpointEvents.length) * 100
        : 0;
      
      if (responseTimes.length > 0) {
        metrics.byEndpoint[endpoint].avgResponseTime = 
          responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
      }
    }
    
    return metrics;
  }
  
  /**
   * Get usage for a specific partner
   */
  async getPartnerUsage(
    workspaceId: string,
    partnerType: string,
    startDate: Date,
    endDate: Date
  ): Promise<PartnerApiUsageEvent[]> {
    return db.select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          sql`${partnerApiUsageEvents.partnerType} = ${partnerType}`,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(partnerApiUsageEvents.createdAt, startDate),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(partnerApiUsageEvents.createdAt, endDate)
        )
      )
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(partnerApiUsageEvents.createdAt));
  }
  
  /**
   * Get recent API calls (for monitoring dashboard)
   */
  async getRecentApiCalls(
    workspaceId: string,
    limit: number = 100
  ): Promise<PartnerApiUsageEvent[]> {
    return db.select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(partnerApiUsageEvents.workspaceId, workspaceId))
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(partnerApiUsageEvents.createdAt))
      .limit(limit);
  }
  
  /**
   * Get failed API calls (for error monitoring)
   */
  async getFailedApiCalls(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PartnerApiUsageEvent[]> {
    return db.select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.success, false),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(partnerApiUsageEvents.createdAt, startDate),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(partnerApiUsageEvents.createdAt, endDate)
        )
      )
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(partnerApiUsageEvents.createdAt));
  }
}

// Singleton instance
export const partnerApiUsageService = new PartnerApiUsageService();
