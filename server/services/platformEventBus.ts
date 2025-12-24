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
  | 'shift_unassigned'
  // Trinity AI orchestration lifecycle events
  | 'trinity_scan_started'
  | 'trinity_scan_completed'
  | 'trinity_issue_detected'
  | 'trinity_fix_proposed'
  | 'trinity_fix_approved'
  | 'trinity_fix_rejected'
  | 'trinity_fix_applied'
  | 'trinity_diagnostic_started'
  | 'trinity_diagnostic_completed'
  | 'trinity_escalation_required'
  | 'trinity_self_healing'
  // Autonomous fix pipeline events
  | 'approval_approved'
  | 'approval_rejected'
  | 'fix_applied'
  | 'fix_validated'
  | 'fix_escalated'
  | 'fix_exhausted';

export type EventCategory = 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement' | 'maintenance' | 'diagnostic' | 'support' | 'ai_brain' | 'error' | 'schedule' | 'trinity' | 'automation';

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

// ============================================================================
// TRINITY AI ORCHESTRATION LIFECYCLE EVENTS
// ============================================================================

export interface TrinityLifecycleParams {
  workspaceId?: string;
  triggeredBy?: string;
  executionId?: string;
  scanType?: 'visual' | 'log' | 'schema' | 'code' | 'full_diagnostic';
  issueCount?: number;
  severity?: 'healthy' | 'warning' | 'error' | 'critical';
  fixId?: string;
  fixDescription?: string;
  affectedFiles?: string[];
  reason?: string;
  metadata?: Record<string, any>;
}

export async function publishTrinityScanStarted(params: TrinityLifecycleParams): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_scan_started',
    category: 'trinity',
    title: 'Trinity Scan Started',
    description: `Trinity AI initiated a ${params.scanType || 'system'} scan`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: 3,
    metadata: {
      executionId: params.executionId,
      scanType: params.scanType,
      ...params.metadata,
    },
  });
}

export async function publishTrinityScanCompleted(params: TrinityLifecycleParams & {
  issueCount: number;
  durationMs?: number;
}): Promise<void> {
  const severityText = params.severity === 'healthy' ? 'No issues found' : 
    `${params.issueCount} issue(s) detected (${params.severity})`;
  
  await publishPlatformUpdate({
    type: 'trinity_scan_completed',
    category: 'trinity',
    title: 'Trinity Scan Completed',
    description: `${params.scanType || 'System'} scan completed. ${severityText}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: params.severity === 'critical' ? 1 : params.severity === 'error' ? 2 : 3,
    metadata: {
      executionId: params.executionId,
      scanType: params.scanType,
      issueCount: params.issueCount,
      severity: params.severity,
      durationMs: params.durationMs,
      ...params.metadata,
    },
  });
}

export async function publishTrinityIssueDetected(params: TrinityLifecycleParams & {
  issueTitle: string;
  issueDescription: string;
  issueCategory?: string;
  confidence?: number;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_issue_detected',
    category: 'trinity',
    title: `Issue Detected: ${params.issueTitle}`,
    description: params.issueDescription,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: params.severity === 'critical' ? 1 : 2,
    metadata: {
      executionId: params.executionId,
      issueCategory: params.issueCategory,
      confidence: params.confidence,
      severity: params.severity,
      affectedFiles: params.affectedFiles,
      ...params.metadata,
    },
  });
}

export async function publishTrinityFixProposed(params: TrinityLifecycleParams & {
  fixId: string;
  fixDescription: string;
  requiresApproval: boolean;
  estimatedImpact?: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_fix_proposed',
    category: 'trinity',
    title: 'Trinity Fix Proposed',
    description: params.fixDescription,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: 1,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      requiresApproval: params.requiresApproval,
      estimatedImpact: params.estimatedImpact,
      affectedFiles: params.affectedFiles,
      ...params.metadata,
    },
  });
  console.log(`[TrinityLifecycle] Fix proposed: ${params.fixId} - ${params.fixDescription}`);
}

export async function publishTrinityFixApproved(params: TrinityLifecycleParams & {
  fixId: string;
  approvedBy: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_fix_approved',
    category: 'trinity',
    title: 'Trinity Fix Approved',
    description: `Fix ${params.fixId} approved by ${params.approvedBy}`,
    workspaceId: params.workspaceId,
    userId: params.approvedBy,
    visibility: 'admin',
    priority: 2,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      approvedBy: params.approvedBy,
      ...params.metadata,
    },
  });
}

export async function publishTrinityFixRejected(params: TrinityLifecycleParams & {
  fixId: string;
  rejectedBy: string;
  reason?: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_fix_rejected',
    category: 'trinity',
    title: 'Trinity Fix Rejected',
    description: `Fix ${params.fixId} rejected${params.reason ? `: ${params.reason}` : ''}`,
    workspaceId: params.workspaceId,
    userId: params.rejectedBy,
    visibility: 'admin',
    priority: 2,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      rejectedBy: params.rejectedBy,
      reason: params.reason,
      ...params.metadata,
    },
  });
}

export async function publishTrinityFixApplied(params: TrinityLifecycleParams & {
  fixId: string;
  success: boolean;
  commitHash?: string;
  errorMessage?: string;
}): Promise<void> {
  const title = params.success ? 'Trinity Fix Applied' : 'Trinity Fix Failed';
  const description = params.success 
    ? `Fix ${params.fixId} successfully applied${params.commitHash ? ` (commit: ${params.commitHash.slice(0, 7)})` : ''}`
    : `Fix ${params.fixId} failed: ${params.errorMessage || 'Unknown error'}`;

  await publishPlatformUpdate({
    type: 'trinity_fix_applied',
    category: 'trinity',
    title,
    description,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: params.success ? 2 : 1,
    metadata: {
      executionId: params.executionId,
      fixId: params.fixId,
      success: params.success,
      commitHash: params.commitHash,
      errorMessage: params.errorMessage,
      affectedFiles: params.affectedFiles,
      ...params.metadata,
    },
  });
}

export async function publishTrinityDiagnosticStarted(params: TrinityLifecycleParams & {
  targetUrl?: string;
  diagnosticScope: string[];
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_diagnostic_started',
    category: 'trinity',
    title: 'Trinity Diagnostic Started',
    description: `Full platform diagnostic initiated for: ${params.diagnosticScope.join(', ')}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: 3,
    metadata: {
      executionId: params.executionId,
      targetUrl: params.targetUrl,
      diagnosticScope: params.diagnosticScope,
      ...params.metadata,
    },
  });
}

export async function publishTrinityDiagnosticCompleted(params: TrinityLifecycleParams & {
  visualIssues: number;
  logIssues: number;
  visualScore: number;
  recommendedActions: string[];
}): Promise<void> {
  const totalIssues = params.visualIssues + params.logIssues;
  const healthStatus = params.severity || 'healthy';
  
  await publishPlatformUpdate({
    type: 'trinity_diagnostic_completed',
    category: 'trinity',
    title: 'Trinity Diagnostic Completed',
    description: `Diagnostic complete: ${totalIssues} issue(s) found. Visual score: ${params.visualScore}/100. Status: ${healthStatus}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: healthStatus === 'critical' ? 1 : healthStatus === 'error' ? 2 : 3,
    metadata: {
      executionId: params.executionId,
      visualIssues: params.visualIssues,
      logIssues: params.logIssues,
      visualScore: params.visualScore,
      severity: healthStatus,
      recommendedActions: params.recommendedActions,
      ...params.metadata,
    },
  });
}

export async function publishTrinityEscalationRequired(params: TrinityLifecycleParams & {
  escalationReason: string;
  escalatedTo: string[];
  contextSummary: string;
}): Promise<void> {
  await publishPlatformUpdate({
    type: 'trinity_escalation_required',
    category: 'trinity',
    title: 'Trinity Escalation Required',
    description: `Human intervention needed: ${params.escalationReason}`,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: 1,
    metadata: {
      executionId: params.executionId,
      escalationReason: params.escalationReason,
      escalatedTo: params.escalatedTo,
      contextSummary: params.contextSummary,
      severity: params.severity || 'high',
      ...params.metadata,
    },
  });
}

export async function publishTrinitySelfHealing(params: TrinityLifecycleParams & {
  healingType: 'workflow_restart' | 'cache_clear' | 'service_restart' | 'config_fix' | 'dependency_update';
  targetService?: string;
  success: boolean;
}): Promise<void> {
  const title = params.success ? 'Trinity Self-Healing Successful' : 'Trinity Self-Healing Failed';
  const description = params.success
    ? `Automatically resolved: ${params.healingType.replace(/_/g, ' ')}${params.targetService ? ` for ${params.targetService}` : ''}`
    : `Self-healing attempt failed: ${params.healingType.replace(/_/g, ' ')}`;

  await publishPlatformUpdate({
    type: 'trinity_self_healing',
    category: 'trinity',
    title,
    description,
    workspaceId: params.workspaceId,
    userId: params.triggeredBy,
    visibility: 'admin',
    priority: params.success ? 3 : 2,
    metadata: {
      executionId: params.executionId,
      healingType: params.healingType,
      targetService: params.targetService,
      success: params.success,
      ...params.metadata,
    },
  });
}
