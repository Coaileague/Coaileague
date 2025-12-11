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
import { eq, and, inArray, gte, isNull } from 'drizzle-orm';
import { generatePlatformUpdate as aiGeneratePlatformUpdate } from './aiNotificationService';

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
  | 'ai_error'
  | 'ai_timeout'
  | 'system_maintenance'
  | 'queue_update'
  | 'staff_action'
  // Schedule-specific events for real-time workforce notifications
  | 'schedule_published'
  | 'shift_created'
  | 'shift_updated'
  | 'shift_deleted'
  | 'shift_swap_requested'
  | 'shift_swap_approved'
  | 'shift_swap_denied'
  | 'shift_assigned'
  | 'shift_unassigned';

export type EventCategory = 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement' | 'maintenance' | 'diagnostic' | 'support' | 'ai_brain' | 'error' | 'schedule';

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
   * Store event in What's New database table via AI Brain articulation
   * - Uses aiNotificationService.generatePlatformUpdate for Gemini-enhanced descriptions
   * - workspaceId: null = global platform update, set = workspace-specific
   * - visibility: controls RBAC who can see the update
   * - Includes smart deduplication via aiNotificationService
   */
  private async storeInWhatsNew(event: PlatformEvent): Promise<void> {
    try {
      // Use AI Brain articulation via aiNotificationService
      // This provides:
      // 1. Gemini-enhanced descriptions (NOTIFICATION tier)
      // 2. Smart deduplication (idempotency keys)
      // 3. Proper platform update storage
      const result = await aiGeneratePlatformUpdate({
        title: event.title,
        description: event.description,
        category: event.category as any,
        workspaceId: event.workspaceId,
        priority: event.priority || 1,
        learnMoreUrl: event.learnMoreUrl,
        metadata: {
          ...event.metadata,
          sourceType: 'ai_brain',
          eventType: event.type,
          version: event.version,
          visibility: event.visibility || 'all',
        },
      });
      
      if (result) {
        const scope = event.workspaceId ? `workspace:${event.workspaceId}` : 'global';
        console.log(`[EventBus] AI-articulated update stored (${scope}): ${event.title} [${result.id}]`);
      } else {
        console.log(`[EventBus] Skipped duplicate/rate-limited update: ${event.title}`);
      }
    } catch (error) {
      console.error('[EventBus] Failed to store AI-articulated update:', error);
      
      // Fallback to direct insert if AI articulation fails
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
          metadata: { ...event.metadata, sourceType: 'fallback' },
          date: new Date(),
          workspaceId: event.workspaceId || null,
          visibility: event.visibility || 'all',
        });
        console.log(`[EventBus] Fallback: Stored update directly: ${event.title}`);
      } catch (fallbackError) {
        console.error('[EventBus] Fallback insert also failed:', fallbackError);
      }
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

// ============================================================================
// SCHEDULE LIVE NOTIFICATIONS - Real-time workforce schedule updates
// ============================================================================

export interface ScheduleChangeEvent {
  workspaceId: string;
  affectedEmployeeIds: string[];
  shiftId?: string;
  shiftDate?: string;
  shiftTime?: string;
  changedBy: string;
  changedByRole: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Publish schedule change to affected employees immediately
 * Used when schedules are published, shifts created/updated/deleted
 */
export async function publishScheduleChange(
  eventType: 'schedule_published' | 'shift_created' | 'shift_updated' | 'shift_deleted' | 'shift_assigned' | 'shift_unassigned',
  params: ScheduleChangeEvent & { title: string; description: string }
): Promise<void> {
  await publishPlatformUpdate({
    type: eventType,
    category: 'schedule',
    title: params.title,
    description: params.description,
    workspaceId: params.workspaceId,
    userId: params.changedBy,
    visibility: 'all',
    priority: 1,
    metadata: {
      affectedEmployeeIds: params.affectedEmployeeIds,
      shiftId: params.shiftId,
      shiftDate: params.shiftDate,
      shiftTime: params.shiftTime,
      changedByRole: params.changedByRole,
      reason: params.reason,
      ...params.metadata,
    },
  });
  console.log(`[ScheduleLive] ${eventType}: Notified ${params.affectedEmployeeIds.length} employees`);
}

/**
 * Notify employees when a schedule is published
 */
export async function notifySchedulePublished(params: {
  workspaceId: string;
  weekStart: string;
  weekEnd: string;
  affectedEmployeeIds: string[];
  publishedBy: string;
  publishedByRole: string;
  totalShifts: number;
}): Promise<void> {
  await publishScheduleChange('schedule_published', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: params.affectedEmployeeIds,
    changedBy: params.publishedBy,
    changedByRole: params.publishedByRole,
    title: 'Schedule Published',
    description: `Your schedule for ${params.weekStart} - ${params.weekEnd} is now available. ${params.totalShifts} shifts assigned.`,
    metadata: {
      weekStart: params.weekStart,
      weekEnd: params.weekEnd,
      totalShifts: params.totalShifts,
    },
  });
}

/**
 * Notify employee when a shift is created/assigned to them
 */
export async function notifyShiftCreated(params: {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftDate: string;
  shiftTime: string;
  createdBy: string;
  createdByRole: string;
}): Promise<void> {
  await publishScheduleChange('shift_created', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: [params.employeeId],
    shiftId: params.shiftId,
    shiftDate: params.shiftDate,
    shiftTime: params.shiftTime,
    changedBy: params.createdBy,
    changedByRole: params.createdByRole,
    title: 'New Shift Assigned',
    description: `You have a new shift on ${params.shiftDate} at ${params.shiftTime}`,
  });
}

/**
 * Notify employee when their shift is updated
 */
export async function notifyShiftUpdated(params: {
  workspaceId: string;
  employeeId: string;
  shiftId: string;
  shiftDate: string;
  shiftTime: string;
  changedBy: string;
  changedByRole: string;
  changes: string;
}): Promise<void> {
  await publishScheduleChange('shift_updated', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: [params.employeeId],
    shiftId: params.shiftId,
    shiftDate: params.shiftDate,
    shiftTime: params.shiftTime,
    changedBy: params.changedBy,
    changedByRole: params.changedByRole,
    title: 'Shift Updated',
    description: `Your shift on ${params.shiftDate} has been updated: ${params.changes}`,
    metadata: { changes: params.changes },
  });
}

/**
 * Notify employee when their shift is deleted
 */
export async function notifyShiftDeleted(params: {
  workspaceId: string;
  employeeId: string;
  shiftId: string;
  shiftDate: string;
  shiftTime: string;
  deletedBy: string;
  deletedByRole: string;
  reason?: string;
}): Promise<void> {
  await publishScheduleChange('shift_deleted', {
    workspaceId: params.workspaceId,
    affectedEmployeeIds: [params.employeeId],
    shiftId: params.shiftId,
    shiftDate: params.shiftDate,
    shiftTime: params.shiftTime,
    changedBy: params.deletedBy,
    changedByRole: params.deletedByRole,
    reason: params.reason,
    title: 'Shift Removed',
    description: `Your shift on ${params.shiftDate} at ${params.shiftTime} has been removed${params.reason ? `: ${params.reason}` : ''}`,
  });
}

/**
 * Notify employees about shift swap requests/approvals
 */
export async function notifyShiftSwap(
  eventType: 'shift_swap_requested' | 'shift_swap_approved' | 'shift_swap_denied',
  params: {
    workspaceId: string;
    requesterId: string;
    targetEmployeeId?: string;
    shiftId: string;
    shiftDate: string;
    actionBy: string;
    actionByRole: string;
    reason?: string;
  }
): Promise<void> {
  const titles: Record<string, string> = {
    shift_swap_requested: 'Shift Swap Request',
    shift_swap_approved: 'Shift Swap Approved',
    shift_swap_denied: 'Shift Swap Denied',
  };

  const affectedIds = [params.requesterId];
  if (params.targetEmployeeId) affectedIds.push(params.targetEmployeeId);

  await publishPlatformUpdate({
    type: eventType,
    category: 'schedule',
    title: titles[eventType],
    description: `Shift swap for ${params.shiftDate}${params.reason ? `: ${params.reason}` : ''}`,
    workspaceId: params.workspaceId,
    userId: params.actionBy,
    visibility: 'all',
    priority: 1,
    metadata: {
      affectedEmployeeIds: affectedIds,
      shiftId: params.shiftId,
      shiftDate: params.shiftDate,
      requesterId: params.requesterId,
      targetEmployeeId: params.targetEmployeeId,
      actionByRole: params.actionByRole,
      reason: params.reason,
    },
  });
}
