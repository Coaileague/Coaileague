/**
 * Platform Event Bus - Unified event system connecting all CoAIleague services
 * 
 * Connects: Chat Server, AI Brain, Notifications, Tickets, What's New
 * All features can emit events that automatically propagate to:
 * - Real-time WebSocket broadcasts
 * - Notification system
 * - What's New feed
 * - Audit logging
 */

import { db } from '../db';
import { platformUpdates, notifications, platformRoles, systemAuditLogs } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

export type PlatformEventType = 
  | 'feature_released'
  | 'feature_updated'
  | 'bugfix_deployed'
  | 'security_patch'
  | 'announcement'
  | 'ticket_created'
  | 'ticket_resolved'
  | 'automation_completed'
  | 'ai_brain_action'
  | 'system_maintenance';

export type EventCategory = 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';

export interface PlatformEvent {
  type: PlatformEventType;
  category: EventCategory;
  title: string;
  description: string;
  version?: string;
  workspaceId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  priority?: number;
  isNew?: boolean;
  learnMoreUrl?: string;
}

export interface EventSubscriber {
  name: string;
  handler: (event: PlatformEvent) => Promise<void>;
}

class PlatformEventBus {
  private subscribers: Map<string, EventSubscriber[]> = new Map();
  private wsHandler: ((event: PlatformEvent) => void) | null = null;

  /**
   * Register the WebSocket broadcast handler
   */
  setWebSocketHandler(handler: (event: PlatformEvent) => void) {
    this.wsHandler = handler;
    console.log('[EventBus] WebSocket handler registered');
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: PlatformEventType | '*', subscriber: EventSubscriber) {
    const key = eventType === '*' ? 'all' : eventType;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key)!.push(subscriber);
    console.log(`[EventBus] ${subscriber.name} subscribed to ${eventType}`);
  }

  /**
   * Publish a platform event - propagates to all connected systems
   */
  async publish(event: PlatformEvent): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[EventBus] Event: ${event.type} - ${event.title}`);

    try {
      // 1. Store in What's New feed (persisted to database)
      await this.storeInWhatsNew(event);

      // 2. Broadcast via WebSocket to all connected clients
      if (this.wsHandler) {
        this.wsHandler(event);
      }

      // 3. Create notifications for relevant users
      await this.createNotifications(event);

      // 4. Notify all subscribers
      const allSubscribers = this.subscribers.get('all') || [];
      const typeSubscribers = this.subscribers.get(event.type) || [];
      
      for (const subscriber of [...allSubscribers, ...typeSubscribers]) {
        try {
          await subscriber.handler(event);
        } catch (err) {
          console.error(`[EventBus] Subscriber ${subscriber.name} error:`, err);
        }
      }

      // 5. Log to audit trail
      await this.logAudit(event, timestamp);

    } catch (error) {
      console.error('[EventBus] Error processing event:', error);
    }
  }

  /**
   * Store event in What's New database table
   */
  private async storeInWhatsNew(event: PlatformEvent): Promise<void> {
    try {
      const id = `${event.type}-${event.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      
      await db.insert(platformUpdates).values({
        id,
        title: event.title,
        description: event.description,
        category: event.category,
        version: event.version,
        isNew: event.isNew ?? true,
        priority: event.priority,
        learnMoreUrl: event.learnMoreUrl,
        metadata: event.metadata,
        date: new Date(),
      });
      
      console.log(`[EventBus] Stored in What's New: ${event.title}`);
    } catch (error) {
      console.error('[EventBus] Failed to store in What\'s New:', error);
    }
  }

  /**
   * Create notifications for platform-wide announcements
   */
  private async createNotifications(event: PlatformEvent): Promise<void> {
    try {
      // Platform announcements go to all users with platform roles (root_admin, deputy_admin, etc.)
      if (event.category === 'announcement' || event.category === 'security') {
        const adminRoles = await db.query.platformRoles.findMany({
          where: inArray(platformRoles.role, ['root_admin', 'deputy_admin', 'support_manager']),
          columns: { userId: true },
        });
        
        for (const admin of adminRoles) {
          await db.insert(notifications).values({
            workspaceId: 'coaileague-platform-workspace',
            userId: admin.userId,
            type: 'system',
            title: event.title,
            message: event.description,
            actionUrl: event.learnMoreUrl || '/whats-new',
            relatedEntityType: 'platform_update',
            metadata: { category: event.category, version: event.version },
            isRead: false,
          });
        }
      }

      // Workspace-specific events - create a single notification for the workspace owner
      if (event.workspaceId && event.type !== 'announcement' && event.userId) {
        await db.insert(notifications).values({
          workspaceId: event.workspaceId,
          userId: event.userId,
          type: 'system',
          title: event.title,
          message: event.description,
          actionUrl: event.learnMoreUrl,
          relatedEntityType: event.type,
          metadata: event.metadata,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('[EventBus] Failed to create notifications:', error);
    }
  }

  /**
   * Log event to system audit trail (platform-level, not workspace-level)
   */
  private async logAudit(event: PlatformEvent, timestamp: string): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: event.userId,
        action: `platform_event_${event.type}`,
        entityType: 'platform_event',
        entityId: event.title,
        workspaceId: event.workspaceId,
        changes: {
          type: event.type,
          category: event.category,
          title: event.title,
          description: event.description,
          version: event.version,
          timestamp,
        },
        metadata: event.metadata,
        ipAddress: '127.0.0.1',
      });
    } catch (error) {
      // Audit logging failures shouldn't break the event flow
      console.error('[EventBus] Audit log failed:', error);
    }
  }
}

// Singleton instance
export const platformEventBus = new PlatformEventBus();

/**
 * Helper function to publish platform updates from any feature
 * Use this when a feature is released, updated, or patched
 */
export async function publishPlatformUpdate(params: {
  type: PlatformEventType;
  category: EventCategory;
  title: string;
  description: string;
  version?: string;
  workspaceId?: string;
  userId?: string;
  learnMoreUrl?: string;
  priority?: number;
  metadata?: Record<string, any>;
}): Promise<void> {
  await platformEventBus.publish({
    ...params,
    isNew: true,
  });
}

/**
 * Helper to announce a new feature
 */
export async function announceNewFeature(
  title: string,
  description: string,
  version?: string,
  learnMoreUrl?: string
): Promise<void> {
  await publishPlatformUpdate({
    type: 'feature_released',
    category: 'feature',
    title,
    description,
    version,
    learnMoreUrl,
    priority: 1,
  });
}

/**
 * Helper to announce a bug fix
 */
export async function announceBugfix(
  title: string,
  description: string,
  version?: string
): Promise<void> {
  await publishPlatformUpdate({
    type: 'bugfix_deployed',
    category: 'bugfix',
    title,
    description,
    version,
    priority: 3,
  });
}

/**
 * Helper to announce a security patch
 */
export async function announceSecurityPatch(
  title: string,
  description: string,
  version?: string
): Promise<void> {
  await publishPlatformUpdate({
    type: 'security_patch',
    category: 'security',
    title,
    description,
    version,
    priority: 1,
  });
}

/**
 * Helper to announce automation completion
 */
export async function announceAutomationComplete(
  workspaceId: string,
  title: string,
  description: string,
  metadata?: Record<string, any>
): Promise<void> {
  await publishPlatformUpdate({
    type: 'automation_completed',
    category: 'improvement',
    title,
    description,
    workspaceId,
    metadata,
    priority: 2,
  });
}
