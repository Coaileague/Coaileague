import crypto from 'crypto';
import { Request } from 'express';
import { partnerApiUsageService } from '../services/billing/partnerApiUsage';
import type { PartnerApiCallInput } from '../services/billing/partnerApiUsage';
import { createLogger } from '../lib/logger';
const log = createLogger('usageTracking');

export interface PartnerApiContext {
  workspaceId: string;
  userId?: string;
  partnerConnectionId: string;
  partnerType: 'quickbooks' | 'gusto' | 'stripe' | 'other';
  endpoint?: string;
  httpMethod?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  operationType?: string; // Alternative to endpoint for operation naming
  featureKey?: string;
  activityType?: string;
  metadata?: {
    requestId?: string;
    batchId?: string;
    webhookId?: string;
    [key: string]: any;
  };
  req?: Request;
}

/**
 * Factory wrapper for partner API calls with automatic usage tracking.
 * Returns a callable async function that executes the operation with tracking.
 * 
 * This pattern allows creating a trackable operation, then executing it later.
 * 
 * @example
 * const createCustomer = withUsageTracking(
 *   async (requestId) => qboClient.createCustomer(data),
 *   { workspaceId, partnerType: 'quickbooks', operationType: 'customer_create' }
 * );
 * const result = await createCustomer();
 */
export function withUsageTracking<T>(
  fn: (requestId: string) => Promise<T>,
  context: PartnerApiContext
): () => Promise<T> {
  return async () => {
    const startTime = Date.now();
    const requestId = `${context.operationType || context.endpoint || 'api'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    let responsePayloadSize: number | undefined;
    let responseStatusCode: number | undefined;
    let success = true;
    let errorMessage: string | undefined;
    let errorCode: string | undefined;
    
    try {
      const result = await fn(requestId);
      
      if (result && typeof result === 'object') {
        try {
          const resultJson = JSON.stringify(result);
          responsePayloadSize = Buffer.byteLength(resultJson, 'utf8');
        } catch (err) {
          log.warn('[UsageTracking] Response serialization failed:', (err as Error).message);
        }
      }
      
      responseStatusCode = 200;
      return result;
    } catch (error: any) {
      success = false;
      errorMessage = error.message || String(error);
      errorCode = error.code || error.statusCode?.toString();
      responseStatusCode = error.statusCode || error.response?.status || 500;
      throw error;
    } finally {
      const responseTimeMs = Date.now() - startTime;
      
      // Record usage asynchronously (non-blocking)
      partnerApiUsageService.recordApiCall({
        workspaceId: context.workspaceId,
        userId: context.userId,
        partnerConnectionId: context.partnerConnectionId,
        partnerType: context.partnerType,
        endpoint: context.endpoint || context.operationType || '/api',
        httpMethod: context.httpMethod || 'POST',
        usageType: 'api_call',
        usageAmount: 1,
        usageUnit: 'api_calls',
        responsePayloadSize,
        responseStatusCode,
        responseTimeMs,
        success,
        errorMessage,
        errorCode,
        featureKey: context.featureKey,
        activityType: context.activityType || context.operationType,
        metadata: {
          ...context.metadata,
          requestId,
        },
        ipAddress: context.req?.ip,
        userAgent: context.req?.get('user-agent'),
      }).catch(err => {
        log.error('[PartnerApiUsage] Failed to track API usage:', err);
      });
    }
  };
}

/**
 * Track a batch of API calls (for bulk operations)
 * 
 * REQUIRED: You MUST provide a unique batchId in metadata for proper idempotency.
 * Use identifiers that represent the entire batch operation:
 * - Batch invoice creation: `invoice-batch-${period}` or `batch-invoice-run-${runId}`
 * - Batch employee sync: `employee-sync-batch-${syncId}` or `sync-employees-${version}`
 * - Bulk payroll creation: `payroll-batch-${payrollPeriod}` or `batch-payroll-${periodId}`
 * 
 * @throws Error if metadata.batchId is not provided
 * 
 * @example
 * const results = await withBatchUsageTracking(
 *   {
 *     workspaceId: 'ws_123',
 *     partnerConnectionId: 'conn_789',
 *     partnerType: 'quickbooks',
 *     endpoint: '/v3/invoice/batch',
 *     httpMethod: 'POST',
 *     featureKey: 'billos_batch_invoice_creation',
 *     metadata: {
 *       batchId: `invoice-batch-${billingPeriod}`, // REQUIRED: Stable across retries
 *     },
 *   },
 *   async () => qboClient.createInvoicesBatch(invoicesData),
 *   invoicesData.length // Number of items in batch
 * );
 */
export async function withBatchUsageTracking<T>(
  context: PartnerApiContext,
  fn: () => Promise<T>,
  batchSize: number
): Promise<T> {
  // ENFORCE mandatory batchId for proper idempotency
  if (!context.metadata?.batchId) {
    throw new Error(
      `Missing required metadata.batchId for batch API usage tracking. ` +
      `Provide a deterministic identifier for the entire batch operation:\n` +
      `  - Batch invoice creation: Use batch run ID (e.g., "invoice-batch-2025-01")\n` +
      `  - Batch employee sync: Use sync ID (e.g., "employee-sync-run-456")\n` +
      `  - Bulk payroll creation: Use payroll period ID (e.g., "payroll-batch-2025-W01")\n` +
      `This ensures proper deduplication and prevents double-billing on retries.`
    );
  }
  
  const startTime = Date.now();
  const batchId = context.metadata.batchId; // Already validated above
  let success = true;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let responseStatusCode: number | undefined;
  
  try {
    const result = await fn();
    responseStatusCode = 200;
    return result;
  } catch (error: any) {
    success = false;
    errorMessage = error.message || String(error);
    errorCode = error.code || error.statusCode?.toString();
    responseStatusCode = error.statusCode || error.response?.status || 500;
    throw error;
  } finally {
    const responseTimeMs = Date.now() - startTime;
    
    // Track batch operation with stable batchId for deduplication
    partnerApiUsageService.recordApiCall({
      workspaceId: context.workspaceId,
      userId: context.userId,
      partnerConnectionId: context.partnerConnectionId,
      partnerType: context.partnerType,
      endpoint: context.endpoint || context.operationType || '/api/batch',
      httpMethod: context.httpMethod || 'POST',
      usageType: 'batch_operation',
      usageAmount: batchSize,
      usageUnit: 'items',
      responseStatusCode,
      responseTimeMs,
      success,
      errorMessage,
      errorCode,
      featureKey: context.featureKey,
      activityType: context.activityType,
      metadata: {
        ...context.metadata,
        batchSize,
        batchId, // Stable ID for deduplication
      },
      ipAddress: context.req?.ip,
      userAgent: context.req?.get('user-agent'),
    }).catch(err => {
      log.error('Failed to track batch partner API usage:', err);
    });
  }
}

/**
 * Track webhook events from partners (QuickBooks, Gusto)
 * 
 * This is different from outbound API calls - it tracks inbound
 * webhook events that we receive from partners.
 * 
 * @example
 * await trackWebhookEvent({
 *   workspaceId: 'ws_123',
 *   partnerConnectionId: 'conn_789',
 *   partnerType: 'quickbooks',
 *   endpoint: '/webhooks/quickbooks',
 *   eventType: 'invoice.created',
 *   payloadSize: 1024,
 *   req,
 * });
 */
export async function trackWebhookEvent(params: {
  workspaceId: string;
  partnerConnectionId: string;
  partnerType: 'quickbooks' | 'gusto' | 'stripe' | 'other';
  endpoint: string;
  eventType: string;
  webhookId: string; // REQUIRED: Unique webhook event ID from partner (e.g., QuickBooks eventId)
  payloadSize?: number;
  req?: Request;
}): Promise<void> {
  try {
    await partnerApiUsageService.recordApiCall({
      workspaceId: params.workspaceId,
      partnerConnectionId: params.partnerConnectionId,
      partnerType: params.partnerType,
      endpoint: params.endpoint,
      httpMethod: 'POST', // Webhooks are always POST
      usageType: 'webhook_event',
      usageAmount: 1,
      usageUnit: 'events',
      requestPayloadSize: params.payloadSize,
      responseStatusCode: 200,
      success: true,
      activityType: params.eventType,
      metadata: {
        eventType: params.eventType,
        webhookId: params.webhookId, // CRITICAL: Use partner's webhook ID for idempotency
      },
      ipAddress: params.req?.ip,
      userAgent: params.req?.get('user-agent'),
    });
  } catch (err) {
    log.error('Failed to track webhook event:', err);
  }
}
