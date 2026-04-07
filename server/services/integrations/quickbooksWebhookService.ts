/**
 * QuickBooks Webhook Subscription and Processing Service
 * 
 * Handles real-time data sync through Intuit webhook notifications:
 * - Webhook subscription management after OAuth
 * - Signature verification for security
 * - Event processing for Customer, Employee, Vendor, Invoice changes
 * - Bidirectional sync when QuickBooks data changes
 * 
 * @see https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 * 
 * ============================================================================
 * CloudEvents Migration: COMPLETE (Deadline: May 15, 2026)
 * ============================================================================
 * Dual-format support: handles BOTH legacy and new CloudEvents format.
 * Intuit's Developer Portal toggle controls which format is sent.
 * 
 * Legacy format (pre-May 2026):
 *   { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
 * 
 * CloudEvents format (post-May 2026):
 *   [ { specversion, id, source, type, time, data: { realmId, dataChangeEvent } } ]
 *   Note: CloudEvents payload is a TOP-LEVEL ARRAY, not an object.
 *   One notification can contain multiple events for different QBO companies.
 * 
 * Signature verification: unchanged (HMAC-SHA256 with Verifier Token).
 * 
 * Resources:
 * - https://blogs.intuit.com/2025/11/12/upcoming-change-to-webhooks-payload-structure/
 * - Developer Portal: Use webhook toggle to switch between formats for testing
 * ============================================================================
 */

import crypto from 'crypto';
import { db } from '../../db';
import { 
  partnerConnections, 
  clients, 
  employees,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { platformEventBus } from '../platformEventBus';
import { auditLogger } from '../audit-logger';
import { INTEGRATIONS } from '@shared/platformConfig';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksWebhookService');


// Use centralized config - NO HARDCODED URLs
const QBO_API_BASE = INTEGRATIONS.quickbooks.getCompanyApiBase();

interface WebhookEvent {
  realmId: string;
  name: string;
  id: string;
  operation: 'Create' | 'Update' | 'Delete' | 'Merge' | 'Void';
  lastUpdated: string;
}

// Legacy format (pre-May 2026)
interface LegacyWebhookNotification {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: WebhookEvent[];
    };
  }>;
}

// CloudEvents format (post-May 2026) - payload is a TOP-LEVEL ARRAY
// Each element is a CloudEvent with Intuit data in the `data` field
interface CloudEventNotification {
  specversion: string;         // "1.0"
  id: string;                  // Unique event ID
  source: string;              // "quickbooks.com" or similar
  type: string;                // "com.intuit.qbo.datachange.notification"
  datacontenttype?: string;    // "application/json"
  time: string;                // ISO-8601 timestamp
  data: {
    realmId: string;
    dataChangeEvent: {
      entities: WebhookEvent[];
    };
  };
}

// Union type - can be legacy object or CloudEvents array
type WebhookNotification = LegacyWebhookNotification | CloudEventNotification[];

/**
 * Detect if the incoming payload is the new CloudEvents format.
 * CloudEvents payload is a TOP-LEVEL ARRAY (vs legacy which is an object with eventNotifications).
 */
function isCloudEventsFormat(payload: any): payload is CloudEventNotification[] {
  return Array.isArray(payload) && payload.length > 0 && 
    typeof payload[0]?.specversion === 'string' &&
    typeof payload[0]?.data?.realmId === 'string';
}

/**
 * Normalize either format into a flat list of { realmId, entities } pairs.
 * This is the single extraction point - both formats produce the same output.
 */
function extractNotificationBatches(
  notification: WebhookNotification
): Array<{ realmId: string; entities: WebhookEvent[]; eventId?: string }> {
  // CloudEvents format: top-level array of cloud events
  if (isCloudEventsFormat(notification)) {
    return notification.map(cloudEvent => ({
      realmId: cloudEvent.data.realmId,
      entities: cloudEvent.data.dataChangeEvent?.entities || [],
      eventId: cloudEvent.id,
    }));
  }

  // Legacy format: { eventNotifications: [...] }
  const legacy = notification as LegacyWebhookNotification;
  return (legacy.eventNotifications || []).map(n => ({
    realmId: n.realmId,
    entities: n.dataChangeEvent?.entities || [],
  }));
}

interface WebhookSubscription {
  id: string;
  webhooksVerifier: string;
  endpointUrl: string;
  entities: string[];
  createdAt: Date;
}

class QuickBooksWebhookService {
  private readonly SUPPORTED_ENTITIES = ['Customer', 'Employee', 'Vendor', 'Invoice', 'Payment'];
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private processedEventIds: Set<string> = new Set();
  private readonly EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupProcessedEvents(), 60 * 60 * 1000);
    log.info('[QuickBooksWebhooks] Service initialized');
  }

  private cleanupProcessedEvents(): void {
    this.processedEventIds.clear();
    log.info('[QuickBooksWebhooks] Cleaned up processed event IDs');
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    
    if (!verifierToken) {
      log.warn('[QuickBooksWebhooks] QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN not configured');
      return false;
    }

    if (!signature || typeof signature !== 'string') {
      log.warn('[QuickBooksWebhooks] Missing or invalid signature header');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', verifierToken)
        .update(payload)
        .digest('base64');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      
      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (error) {
      log.error('[QuickBooksWebhooks] Signature verification error:', error);
      return false;
    }
  }

  async processWebhookNotification(notification: WebhookNotification): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
    format: 'legacy' | 'cloudevents';
  }> {
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];
    const format = isCloudEventsFormat(notification) ? 'cloudevents' : 'legacy';

    log.info(`[QuickBooksWebhooks] Processing webhook in ${format} format`);

    const batches = extractNotificationBatches(notification);

    for (const batch of batches) {
      const { realmId, entities, eventId } = batch;

      const [connection] = await db.select()
        .from(partnerConnections)
        .where(
          and(
            eq(partnerConnections.realmId, realmId),
            eq(partnerConnections.partnerType, 'quickbooks'),
            eq(partnerConnections.status, 'connected')
          )
        )
        .limit(1);

      if (!connection) {
        log.info(`[QuickBooksWebhooks] No connection found for realm ${realmId}, skipping`);
        skipped += entities.length;
        continue;
      }

      for (const entity of entities) {
        // Deduplication key: prefer CloudEvent ID + entity info, fallback to timestamp-based
        const eventKey = eventId
          ? `ce:${eventId}:${entity.name}:${entity.id}`
          : `${realmId}:${entity.name}:${entity.id}:${entity.lastUpdated}`;
        
        if (this.processedEventIds.has(eventKey)) {
          skipped++;
          continue;
        }

        try {
          await this.processEntityChange(connection, entity);
          this.processedEventIds.add(eventKey);
          processed++;
        } catch (error: any) {
          errors.push(`${entity.name} ${entity.id}: ${(error instanceof Error ? error.message : String(error))}`);
        }
      }
    }

    return { processed, skipped, errors, format };
  }

  private async processEntityChange(
    connection: typeof partnerConnections.$inferSelect,
    entity: WebhookEvent
  ): Promise<void> {
    const { name: entityType, id: entityId, operation } = entity;

    log.info(`[QuickBooksWebhooks] Processing ${operation} for ${entityType} ${entityId}`);

    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title: `QuickBooks Webhook: ${entityType} ${operation}`,
      description: `${operation} event received for ${entityType} ${entityId} in workspace ${connection.workspaceId}`,
      workspaceId: connection.workspaceId,
      metadata: { action: 'quickbooks.webhook_received', entityType, entityId, operation, entityLastUpdated: entity.lastUpdated },
    }).catch((err) => log.warn('[quickbooksWebhookService] Fire-and-forget failed:', err));

    switch (entityType) {
      case 'Customer':
        await this.syncCustomerChange(connection, entityId, operation);
        break;
      case 'Employee':
        await this.syncEmployeeChange(connection, entityId, operation);
        break;
      case 'Vendor':
        await this.syncVendorChange(connection, entityId, operation);
        break;
      case 'Invoice':
        await this.syncInvoiceChange(connection, entityId, operation);
        break;
      default:
        log.info(`[QuickBooksWebhooks] Unsupported entity type: ${entityType}`);
    }

    await auditLogger.logEvent(
      {
        actorId: 'quickbooks-webhook',
        actorType: 'SYSTEM',
        actorName: 'QuickBooks Webhook',
        workspaceId: connection.workspaceId,
      },
      {
        eventType: `quickbooks.${entityType.toLowerCase()}.${operation.toLowerCase()}`,
        aggregateId: entityId,
        aggregateType: entityType,
        payload: { realmId: connection.realmId, operation },
      },
      { generateHash: true }
    ).catch(err => log.error('[QuickBooksWebhooks] Audit log failed:', (err instanceof Error ? err.message : String(err))));
  }

  private async syncCustomerChange(
    connection: typeof partnerConnections.$inferSelect,
    qboCustomerId: string,
    operation: string
  ): Promise<void> {
    const [existingClient] = await db.select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, connection.workspaceId),
          eq(clients.quickbooksClientId, qboCustomerId)
        )
      )
      .limit(1);

    if (!existingClient) {
      log.info(`[QuickBooksWebhooks] Customer ${qboCustomerId} not mapped, skipping`);
      return;
    }

    if (operation === 'Delete') {
      await db.update(clients)
        .set({ 
          isActive: false,
          quickbooksSyncStatus: 'deleted_in_partner',
        })
        .where(eq(clients.id, existingClient.id));
      return;
    }

    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const response = await fetch(
        `${QBO_API_BASE}/${connection.realmId}/customer/${qboCustomerId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch customer: ${response.status}`);
      }

      const data = await response.json();
      const customer = data.Customer;

      await db.update(clients)
        .set({
          companyName: customer.DisplayName || existingClient.companyName,
          email: customer.PrimaryEmailAddr?.Address || existingClient.email,
          phone: customer.PrimaryPhone?.FreeFormNumber || existingClient.phone,
          quickbooksSyncStatus: 'synced',
          quickbooksLastSync: new Date(),
        })
        .where(eq(clients.id, existingClient.id));

      log.info(`[QuickBooksWebhooks] Updated client ${existingClient.id} from QB customer ${qboCustomerId}`);
    } catch (error: any) {
      log.error(`[QuickBooksWebhooks] Failed to sync customer ${qboCustomerId}:`, (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  private async syncEmployeeChange(
    connection: typeof partnerConnections.$inferSelect,
    qboEmployeeId: string,
    operation: string
  ): Promise<void> {
    const [existingEmployee] = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, connection.workspaceId),
          eq(employees.quickbooksEmployeeId, qboEmployeeId)
        )
      )
      .limit(1);

    if (!existingEmployee) {
      log.info(`[QuickBooksWebhooks] Employee ${qboEmployeeId} not mapped, skipping`);
      return;
    }

    if (operation === 'Delete') {
      await db.update(employees)
        .set({ 
          isActive: false,
          quickbooksSyncStatus: 'deleted_in_partner',
        })
        .where(eq(employees.id, existingEmployee.id));
      return;
    }

    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const response = await fetch(
        `${QBO_API_BASE}/${connection.realmId}/employee/${qboEmployeeId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch employee: ${response.status}`);
      }

      const data = await response.json();
      const employee = data.Employee;

      await db.update(employees)
        .set({
          firstName: employee.GivenName || existingEmployee.firstName,
          lastName: employee.FamilyName || existingEmployee.lastName,
          email: employee.PrimaryEmailAddr?.Address || existingEmployee.email,
          phone: employee.PrimaryPhone?.FreeFormNumber || existingEmployee.phone,
          quickbooksSyncStatus: 'synced',
          quickbooksLastSync: new Date(),
        })
        .where(eq(employees.id, existingEmployee.id));

      log.info(`[QuickBooksWebhooks] Updated employee ${existingEmployee.id} from QB employee ${qboEmployeeId}`);
    } catch (error: any) {
      log.error(`[QuickBooksWebhooks] Failed to sync employee ${qboEmployeeId}:`, (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  private async syncVendorChange(
    connection: typeof partnerConnections.$inferSelect,
    qboVendorId: string,
    operation: string
  ): Promise<void> {
    const [existingEmployee] = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, connection.workspaceId),
          eq(employees.quickbooksVendorId, qboVendorId)
        )
      )
      .limit(1);

    if (!existingEmployee) {
      log.info(`[QuickBooksWebhooks] Vendor ${qboVendorId} not mapped, skipping`);
      return;
    }

    if (operation === 'Delete') {
      await db.update(employees)
        .set({ 
          isActive: false,
          quickbooksSyncStatus: 'orphaned',
        })
        .where(eq(employees.id, existingEmployee.id));
      return;
    }

    log.info(`[QuickBooksWebhooks] Vendor ${qboVendorId} ${operation} received - sync pending`);
  }

  private async syncInvoiceChange(
    connection: typeof partnerConnections.$inferSelect,
    qboInvoiceId: string,
    operation: string
  ): Promise<void> {
    log.info(`[QuickBooksWebhooks] Invoice ${qboInvoiceId} ${operation} received for workspace ${connection.workspaceId}`);
    
    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title: `QuickBooks Invoice ${operation}`,
      description: `Invoice ${qboInvoiceId} ${operation} synced from QuickBooks`,
      workspaceId: connection.workspaceId,
      metadata: { action: 'quickbooks.invoice_changed', invoiceId: qboInvoiceId, operation },
    }).catch((err) => log.warn('[quickbooksWebhookService] Fire-and-forget failed:', err));
  }

  async getWebhookEndpointUrl(): Promise<string> {
    const baseUrl = getAppBaseUrl();
    return `${baseUrl}/api/webhooks/quickbooks`;
  }

  getStatus(): {
    subscriptionsActive: number;
    processedEventsInMemory: number;
    supportedEntities: string[];
  } {
    return {
      subscriptionsActive: this.subscriptions.size,
      processedEventsInMemory: this.processedEventIds.size,
      supportedEntities: this.SUPPORTED_ENTITIES,
    };
  }
}

export const quickbooksWebhookService = new QuickBooksWebhookService();
