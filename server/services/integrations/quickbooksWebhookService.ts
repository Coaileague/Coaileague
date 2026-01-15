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
 * MIGRATION REQUIRED: CloudEvents Format (Deadline: May 15, 2026)
 * ============================================================================
 * Intuit is requiring migration from legacy webhook format to CloudEvents.
 * 
 * Current (Legacy):
 *   { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
 * 
 * New (CloudEvents):
 *   { specversion, type, source, id, time, datacontenttype, data: {...} }
 * 
 * Migration Steps:
 * 1. Q2 2025: Test new format in Intuit Developer Portal sandbox (toggle available)
 * 2. Q3 2025: Update WebhookNotification interface and processWebhookNotification()
 * 3. Q4 2025: Deploy to production with new format
 * 4. Q1 2026: Remove legacy format support
 * 
 * Resources:
 * - https://blogs.intuit.com/2025/12/01/upcoming-changes-to-apis-and-tools-that-may-impact-your-application/
 * - Developer Portal: Use webhook toggle to switch between formats for testing
 * ============================================================================
 */

import crypto from 'crypto';
import { db } from '../../db';
import { 
  partnerConnections, 
  clients, 
  employees,
  partnerSyncLogs,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { platformEventBus } from '../platformEventBus';
import { auditLogger } from '../audit-logger';
import { INTEGRATIONS } from '@shared/platformConfig';

// Use centralized config - NO HARDCODED URLs
const QBO_API_BASE = INTEGRATIONS.quickbooks.getCompanyApiBase();

interface WebhookEvent {
  realmId: string;
  name: string;
  id: string;
  operation: 'Create' | 'Update' | 'Delete' | 'Merge' | 'Void';
  lastUpdated: string;
}

interface WebhookNotification {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: WebhookEvent[];
    };
  }>;
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
    console.log('[QuickBooksWebhooks] Service initialized');
  }

  private cleanupProcessedEvents(): void {
    this.processedEventIds.clear();
    console.log('[QuickBooksWebhooks] Cleaned up processed event IDs');
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    
    if (!verifierToken) {
      console.warn('[QuickBooksWebhooks] QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN not configured');
      return false;
    }

    if (!signature || typeof signature !== 'string') {
      console.warn('[QuickBooksWebhooks] Missing or invalid signature header');
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
      console.error('[QuickBooksWebhooks] Signature verification error:', error);
      return false;
    }
  }

  async processWebhookNotification(notification: WebhookNotification): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const eventNotification of notification.eventNotifications) {
      const realmId = eventNotification.realmId;
      const entities = eventNotification.dataChangeEvent?.entities || [];

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
        console.log(`[QuickBooksWebhooks] No connection found for realm ${realmId}, skipping`);
        skipped += entities.length;
        continue;
      }

      for (const entity of entities) {
        const eventKey = `${realmId}:${entity.name}:${entity.id}:${entity.lastUpdated}`;
        
        if (this.processedEventIds.has(eventKey)) {
          skipped++;
          continue;
        }

        try {
          await this.processEntityChange(connection, entity);
          this.processedEventIds.add(eventKey);
          processed++;
        } catch (error: any) {
          errors.push(`${entity.name} ${entity.id}: ${error.message}`);
        }
      }
    }

    return { processed, skipped, errors };
  }

  private async processEntityChange(
    connection: typeof partnerConnections.$inferSelect,
    entity: WebhookEvent
  ): Promise<void> {
    const { name: entityType, id: entityId, operation } = entity;

    console.log(`[QuickBooksWebhooks] Processing ${operation} for ${entityType} ${entityId}`);

    platformEventBus.emit({
      type: 'ai_brain_action',
      data: {
        action: 'quickbooks.webhook_received',
        workspaceId: connection.workspaceId,
        entityType,
        entityId,
        operation,
        timestamp: entity.lastUpdated,
      },
      timestamp: new Date(),
    });

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
        console.log(`[QuickBooksWebhooks] Unsupported entity type: ${entityType}`);
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
    ).catch(err => console.error('[QuickBooksWebhooks] Audit log failed:', err.message));
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
      console.log(`[QuickBooksWebhooks] Customer ${qboCustomerId} not mapped, skipping`);
      return;
    }

    if (operation === 'Delete') {
      await db.update(clients)
        .set({ 
          status: 'inactive',
          quickbooksSyncStatus: 'orphaned',
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
          name: customer.DisplayName || existingClient.name,
          email: customer.PrimaryEmailAddr?.Address || existingClient.email,
          phone: customer.PrimaryPhone?.FreeFormNumber || existingClient.phone,
          quickbooksSyncStatus: 'synced',
          quickbooksLastSync: new Date(),
        })
        .where(eq(clients.id, existingClient.id));

      console.log(`[QuickBooksWebhooks] Updated client ${existingClient.id} from QB customer ${qboCustomerId}`);
    } catch (error: any) {
      console.error(`[QuickBooksWebhooks] Failed to sync customer ${qboCustomerId}:`, error.message);
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
      console.log(`[QuickBooksWebhooks] Employee ${qboEmployeeId} not mapped, skipping`);
      return;
    }

    if (operation === 'Delete') {
      await db.update(employees)
        .set({ 
          status: 'inactive',
          quickbooksSyncStatus: 'orphaned',
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

      console.log(`[QuickBooksWebhooks] Updated employee ${existingEmployee.id} from QB employee ${qboEmployeeId}`);
    } catch (error: any) {
      console.error(`[QuickBooksWebhooks] Failed to sync employee ${qboEmployeeId}:`, error.message);
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
      console.log(`[QuickBooksWebhooks] Vendor ${qboVendorId} not mapped, skipping`);
      return;
    }

    if (operation === 'Delete') {
      await db.update(employees)
        .set({ 
          status: 'inactive',
          quickbooksSyncStatus: 'orphaned',
        })
        .where(eq(employees.id, existingEmployee.id));
      return;
    }

    console.log(`[QuickBooksWebhooks] Vendor ${qboVendorId} ${operation} received - sync pending`);
  }

  private async syncInvoiceChange(
    connection: typeof partnerConnections.$inferSelect,
    qboInvoiceId: string,
    operation: string
  ): Promise<void> {
    console.log(`[QuickBooksWebhooks] Invoice ${qboInvoiceId} ${operation} received for workspace ${connection.workspaceId}`);
    
    platformEventBus.emit({
      type: 'ai_brain_action',
      data: {
        action: 'quickbooks.invoice_changed',
        workspaceId: connection.workspaceId,
        invoiceId: qboInvoiceId,
        operation,
      },
      timestamp: new Date(),
    });
  }

  async getWebhookEndpointUrl(): Promise<string> {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_URL || 'http://localhost:5000';
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
