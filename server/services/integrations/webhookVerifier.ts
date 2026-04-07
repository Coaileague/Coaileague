/**
 * Webhook Signature Verification Service
 * Fortune 500-Grade Webhook Security
 * 
 * Features:
 * - HMAC signature verification for QuickBooks, Stripe, etc.
 * - Replay attack prevention with timestamp validation
 * - Idempotent processing with deduplication
 * - Comprehensive audit logging
 */

import crypto from 'crypto';
import { db } from '../../db';
import { webhookDeliveries, idempotencyKeys } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { auditLogger } from '../audit-logger';
import { createLogger } from '../../lib/logger';
const log = createLogger('webhookVerifier');


interface WebhookVerificationResult {
  valid: boolean;
  eventId?: string;
  isDuplicate: boolean;
  error?: string;
  provider: string;
}

interface WebhookEvent {
  provider: string;
  eventType: string;
  eventId: string;
  payload: any;
  signature: string;
  timestamp: Date;
  workspaceId?: string;
}

const WEBHOOK_CONFIGS: Record<string, {
  signatureHeader: string;
  timestampHeader?: string;
  maxAgeSeconds: number;
  secretEnvVar: string;
  algorithm: string;
}> = {
  quickbooks: {
    signatureHeader: 'intuit-signature',
    timestampHeader: undefined,
    maxAgeSeconds: 300,
    secretEnvVar: 'QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN',
    algorithm: 'sha256',
  },
  stripe: {
    signatureHeader: 'stripe-signature',
    timestampHeader: undefined,
    maxAgeSeconds: 300,
    secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
    algorithm: 'sha256',
  },
};

class WebhookVerifierService {
  private processedEvents: Map<string, Date> = new Map();
  private readonly eventRetentionMs = 24 * 60 * 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupProcessedEvents(), 60 * 60 * 1000);
    log.info('[WebhookVerifier] Service initialized');
  }

  private cleanupProcessedEvents(): void {
    const cutoff = Date.now() - this.eventRetentionMs;
    for (const [eventId, timestamp] of this.processedEvents) {
      if (timestamp.getTime() < cutoff) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  async verifyQuickBooksWebhook(
    payload: string,
    signature: string,
    workspaceId?: string
  ): Promise<WebhookVerificationResult> {
    const secret = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    
    if (!secret) {
      log.warn('[WebhookVerifier] QuickBooks webhook secret not configured');
      return { 
        valid: false, 
        isDuplicate: false, 
        error: 'Webhook secret not configured',
        provider: 'quickbooks'
      };
    }

    if (!signature || typeof signature !== 'string') {
      return {
        valid: false,
        isDuplicate: false,
        error: 'Missing or invalid signature header',
        provider: 'quickbooks'
      };
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    let valid = false;
    try {
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      
      if (sigBuffer.length === expectedBuffer.length) {
        valid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
      }
    } catch (error) {
      log.error('[WebhookVerifier] Signature comparison error:', error);
      valid = false;
    }

    if (!valid) {
      await auditLogger.logSystemAction({
        actionType: 'WEBHOOK_SIGNATURE_INVALID',
        targetEntityType: 'WEBHOOK',
        targetEntityId: 'quickbooks',
        payload: { 
          receivedSignature: signature.substring(0, 10) + '...',
          workspaceId 
        },
      });
      
      return { 
        valid: false, 
        isDuplicate: false, 
        error: 'Invalid signature',
        provider: 'quickbooks'
      };
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      return { valid: false, eventId: `qb-${Date.now()}`, isDuplicate: false, error: 'Invalid JSON payload', provider: 'quickbooks' as const };
    }
    let eventId: string;
    if (Array.isArray(parsedPayload) && parsedPayload[0]?.id) {
      eventId = parsedPayload[0].id;
    } else {
      eventId = parsedPayload.eventNotifications?.[0]?.dataChangeEvent?.entities?.[0]?.id || 
                `qb-${Date.now()}`;
    }

    const isDuplicate = await this.checkDuplicate('quickbooks', eventId);

    if (!isDuplicate) {
      await this.recordEvent('quickbooks', eventId, parsedPayload, workspaceId);
    }

    return { 
      valid: true, 
      eventId, 
      isDuplicate,
      provider: 'quickbooks'
    };
  }

  async verifyStripeWebhook(
    payload: string,
    signature: string,
    workspaceId?: string
  ): Promise<WebhookVerificationResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!secret) {
      log.warn('[WebhookVerifier] Stripe webhook secret not configured');
      return { 
        valid: false, 
        isDuplicate: false, 
        error: 'Webhook secret not configured',
        provider: 'stripe'
      };
    }

    const elements = signature.split(',');
    const signatureMap: Record<string, string> = {};
    
    for (const element of elements) {
      const [key, value] = element.split('=');
      signatureMap[key] = value;
    }

    const timestamp = parseInt(signatureMap['t'], 10);
    const signatures = Object.entries(signatureMap)
      .filter(([k]) => k.startsWith('v1'))
      .map(([, v]) => v);

    const maxAge = 300;
    const now = Math.floor(Date.now() / 1000);
    
    if (Math.abs(now - timestamp) > maxAge) {
      return { 
        valid: false, 
        isDuplicate: false, 
        error: 'Webhook timestamp too old',
        provider: 'stripe'
      };
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const valid = signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig, 'hex'),
          Buffer.from(expectedSignature, 'hex')
        );
      } catch {
        return false;
      }
    });

    if (!valid) {
      await auditLogger.logSystemAction({
        actionType: 'WEBHOOK_SIGNATURE_INVALID',
        targetEntityType: 'WEBHOOK',
        targetEntityId: 'stripe',
        payload: { workspaceId },
      });
      
      return { 
        valid: false, 
        isDuplicate: false, 
        error: 'Invalid signature',
        provider: 'stripe'
      };
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      return { valid: false, eventId: `stripe-${Date.now()}`, isDuplicate: false, error: 'Invalid JSON payload', provider: 'stripe' as const };
    }
    const eventId = parsedPayload.id;

    const isDuplicate = await this.checkDuplicate('stripe', eventId);

    if (!isDuplicate) {
      await this.recordEvent('stripe', eventId, parsedPayload, workspaceId);
    }

    return { 
      valid: true, 
      eventId, 
      isDuplicate,
      provider: 'stripe'
    };
  }

  private async checkDuplicate(provider: string, eventId: string): Promise<boolean> {
    const cacheKey = `${provider}:${eventId}`;
    
    if (this.processedEvents.has(cacheKey)) {
      return true;
    }

    try {
      const cutoff = new Date(Date.now() - this.eventRetentionMs);
      const existing = await db.select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, cacheKey),
            gte(idempotencyKeys.createdAt, cutoff)
          )
        )
        .limit(1);

      return existing.length > 0;
    } catch (error) {
      log.error('[WebhookVerifier] Error checking duplicate:', error);
      return false;
    }
  }

  private async recordEvent(
    provider: string,
    eventId: string,
    payload: any,
    workspaceId?: string
  ): Promise<void> {
    const cacheKey = `${provider}:${eventId}`;
    
    this.processedEvents.set(cacheKey, new Date());

    try {
      await db.insert(idempotencyKeys).values({
        workspaceId: workspaceId || 'system',
        operationType: 'invoice_generation',
        requestFingerprint: cacheKey,
        status: 'completed',
        resultMetadata: { processed: true, provider, eventId },
        expiresAt: new Date(Date.now() + this.eventRetentionMs),
      }).onConflictDoNothing();

      await auditLogger.logSystemAction({
        actionType: 'WEBHOOK_RECEIVED',
        targetEntityType: 'WEBHOOK',
        targetEntityId: eventId,
        payload: {
          provider,
          eventType: payload.type || payload.eventType,
          workspaceId,
        },
        workspaceId,
      });
    } catch (error) {
      log.error('[WebhookVerifier] Error recording event:', error);
    }
  }

  async processWebhookIdempotently<T>(
    provider: string,
    eventId: string,
    processor: () => Promise<T>
  ): Promise<{ result: T | null; wasProcessed: boolean }> {
    const cacheKey = `${provider}:process:${eventId}`;
    
    const isDuplicate = await this.checkDuplicate(provider, `process:${eventId}`);
    
    if (isDuplicate) {
      log.info(`[WebhookVerifier] Skipping duplicate event: ${eventId}`);
      return { result: null, wasProcessed: false };
    }

    try {
      const result = await processor();
      
      await db.insert(idempotencyKeys).values({
        workspaceId: 'system',
        operationType: 'invoice_generation',
        requestFingerprint: cacheKey,
        status: 'completed',
        resultMetadata: { processed: true, result: 'success' },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();

      return { result, wasProcessed: true };
    } catch (error) {
      log.error(`[WebhookVerifier] Error processing event ${eventId}:`, error);
      throw error;
    }
  }

  getStats(): {
    cachedEvents: number;
    providers: string[];
  } {
    return {
      cachedEvents: this.processedEvents.size,
      providers: Object.keys(WEBHOOK_CONFIGS),
    };
  }
}

export const webhookVerifier = new WebhookVerifierService();
