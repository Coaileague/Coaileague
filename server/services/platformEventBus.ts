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
import { platformUpdates, notifications, platformRoles, systemAuditLogs, employees } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

export type PlatformEventType = 
  | 'feature_released'
  | 'feature_updated'
  | 'bugfix_deployed'
  | 'security_patch'
  | 'announcement'
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_escalated'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'chat_message'
  | 'chat_user_joined'
  | 'chat_user_left'
  | 'chat_moderation'
  | 'automation_completed'
  | 'ai_brain_action'
  | 'ai_escalation'
  | 'ai_suggestion'
  | 'system_maintenance'
  | 'queue_update'
  | 'staff_action';

export type EventCategory = 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';

// Event visibility levels - must match update_visibility enum in database
// Available: 'all', 'staff', 'supervisor', 'manager', 'admin'
export type EventVisibility = 'all' | 'staff' | 'supervisor' | 'manager' | 'admin';

export interface PlatformEvent {
  type: PlatformEventType;
  category: EventCategory;
  title: string;
  description: string;
  version?: string;
  workspaceId?: string; // null = global/platform-wide, set = workspace-specific
  userId?: string;
  metadata?: Record<string, any> & {
    conversationId?: string;
    roomSlug?: string;
    ticketId?: string;
    ticketNumber?: string;
    messageId?: string;
    targetUserId?: string;
    audience?: 'room' | 'workspace' | 'user' | 'staff' | 'all';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    chatEventType?: string;
  };
  priority?: number;
  isNew?: boolean;
  learnMoreUrl?: string;
  visibility?: EventVisibility; // RBAC: who can see this update
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
   * - workspaceId: null = global platform update, set = workspace-specific
   * - visibility: controls RBAC who can see the update
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
        workspaceId: event.workspaceId || null, // null = global, set = tenant-scoped
        visibility: event.visibility || 'all', // RBAC visibility control
      });
      
      const scope = event.workspaceId ? `workspace:${event.workspaceId}` : 'global';
      console.log(`[EventBus] Stored in What's New (${scope}): ${event.title}`);
    } catch (error) {
      console.error('[EventBus] Failed to store in What\'s New:', error);
    }
  }

  /**
   * Create notifications for platform events
   * - Global events (no workspaceId): notify platform admins
   * - Workspace events (workspaceId set): notify workspace admins in that specific workspace
   */
  private async createNotifications(event: PlatformEvent): Promise<void> {
    try {
      // Global platform announcements (no workspaceId) - notify platform admins
      if (!event.workspaceId && (event.category === 'announcement' || event.category === 'security')) {
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
        console.log(`[EventBus] Notified ${adminRoles.length} platform admins`);
      }

      // Workspace-specific events - notify users based on visibility level
      if (event.workspaceId) {
        // Get all active employees in this workspace
        const workspaceEmployees = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, event.workspaceId),
            eq(employees.isActive, true)
          ),
          columns: { userId: true, workspaceRole: true },
        });
        
        // Map visibility to which roles should receive notifications
        // Lower visibility levels include higher ones (admin includes org_owner + org_admin)
        const getRecipientRoles = (visibility: string): string[] => {
          switch (visibility) {
            case 'admin':
              return ['org_owner', 'org_admin'];
            case 'manager':
              return ['org_owner', 'org_admin', 'department_manager'];
            case 'supervisor':
              return ['org_owner', 'org_admin', 'department_manager', 'supervisor'];
            case 'staff':
            case 'all':
            default:
              return ['org_owner', 'org_admin', 'department_manager', 'supervisor', 'staff', 'auditor', 'contractor'];
          }
        };
        
        const recipientRoles = getRecipientRoles(event.visibility || 'all');
        const recipients = workspaceEmployees.filter(
          emp => emp.userId && recipientRoles.includes(emp.workspaceRole as string)
        );
        
        for (const recipient of recipients) {
          await db.insert(notifications).values({
            workspaceId: event.workspaceId,
            userId: recipient.userId!,
            type: 'system',
            title: event.title,
            message: event.description,
            actionUrl: event.learnMoreUrl || '/whats-new',
            relatedEntityType: event.type,
            metadata: { ...event.metadata, category: event.category, visibility: event.visibility },
            isRead: false,
          });
        }
        console.log(`[EventBus] Notified ${recipients.length} recipients (visibility: ${event.visibility || 'all'}) in ${event.workspaceId}`);
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
 * 
 * @param workspaceId - null/undefined for global updates, set for workspace-specific
 * @param visibility - 'all' | 'staff' | 'supervisor' | 'manager' | 'admin' controls RBAC
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
  visibility?: EventVisibility;
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
