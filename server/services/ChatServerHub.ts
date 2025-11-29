/**
 * ChatServerHub - Unified Event Orchestration Layer
 * 
 * Central hub connecting ALL helpdesk chatrooms to:
 * - AI Brain (intelligent responses)
 * - Notification System (push alerts)
 * - Ticket System (issue tracking)
 * - What's New (platform updates)
 * 
 * Every chat action emits events that automatically propagate to all connected systems.
 */

import { platformEventBus, PlatformEvent, PlatformEventType, EventCategory, EventVisibility } from './platformEventBus';
import { db } from '../db';
import { notifications, supportTickets, chatMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// CHAT-SPECIFIC EVENT TYPES
// ============================================================================

export type ChatEventType = 
  | 'message_posted'
  | 'message_edited'
  | 'message_deleted'
  | 'user_joined_room'
  | 'user_left_room'
  | 'user_kicked'
  | 'user_silenced'
  | 'user_banned'
  | 'room_status_changed'
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_escalated'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ai_response'
  | 'ai_escalation'
  | 'ai_suggestion'
  | 'queue_update'
  | 'staff_joined'
  | 'staff_left';

export interface ChatEventMetadata {
  conversationId: string;
  roomSlug?: string;
  workspaceId?: string;
  userId?: string;
  userName?: string;
  targetUserId?: string;
  targetUserName?: string;
  ticketId?: string;
  ticketNumber?: string;
  messageId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  audience?: 'room' | 'workspace' | 'user' | 'staff' | 'all';
}

export interface ChatEvent {
  type: ChatEventType;
  title: string;
  description: string;
  metadata: ChatEventMetadata;
  timestamp?: Date;
  shouldNotify?: boolean;
  shouldPersistToWhatsNew?: boolean;
  visibility?: EventVisibility;
}

// ============================================================================
// WEBSOCKET BROADCAST HANDLER
// ============================================================================

type WebSocketBroadcaster = (event: {
  type: string;
  conversationId?: string;
  workspaceId?: string;
  userId?: string;
  payload: any;
}) => void;

// ============================================================================
// CHAT SERVER HUB CLASS
// ============================================================================

class ChatServerHubClass {
  private wsBroadcaster: WebSocketBroadcaster | null = null;
  private eventSubscribers: Map<ChatEventType | '*', ((event: ChatEvent) => Promise<void>)[]> = new Map();

  constructor() {
    this.subscribeToEventBus();
  }

  /**
   * Register the WebSocket broadcaster for room-scoped broadcasts
   */
  setWebSocketBroadcaster(broadcaster: WebSocketBroadcaster): void {
    this.wsBroadcaster = broadcaster;
    console.log('[ChatServerHub] WebSocket broadcaster registered');
  }

  /**
   * Subscribe to platform event bus for incoming events
   */
  private subscribeToEventBus(): void {
    platformEventBus.subscribe('*', {
      name: 'ChatServerHub',
      handler: async (event: PlatformEvent) => {
        await this.handlePlatformEvent(event);
      }
    });
    console.log('[ChatServerHub] Subscribed to Platform Event Bus');
  }

  /**
   * Handle incoming platform events and route to appropriate chatrooms
   */
  private async handlePlatformEvent(event: PlatformEvent): Promise<void> {
    if (this.wsBroadcaster && event.metadata?.conversationId) {
      this.wsBroadcaster({
        type: 'platform_event',
        conversationId: event.metadata.conversationId,
        workspaceId: event.workspaceId,
        userId: event.metadata?.userId,
        payload: {
          eventType: event.type,
          title: event.title,
          description: event.description,
          category: event.category,
          metadata: event.metadata,
          timestamp: new Date().toISOString(),
        }
      });
    }
  }

  /**
   * Emit a chat event - propagates to all connected systems
   */
  async emit(event: ChatEvent): Promise<void> {
    const timestamp = event.timestamp || new Date();
    console.log(`[ChatServerHub] Event: ${event.type} - ${event.title}`);

    try {
      const platformEventType = this.mapToPlatformEventType(event.type);
      const category = this.mapToCategory(event.type);

      if (event.shouldPersistToWhatsNew !== false && this.shouldPersistEvent(event.type)) {
        await platformEventBus.publish({
          type: platformEventType,
          category,
          title: event.title,
          description: event.description,
          workspaceId: event.metadata.workspaceId,
          userId: event.metadata.userId,
          metadata: {
            ...event.metadata,
            chatEventType: event.type,
            timestamp: timestamp.toISOString(),
          },
          visibility: event.visibility || 'all',
          learnMoreUrl: event.metadata.ticketNumber 
            ? `/support/tickets/${event.metadata.ticketNumber}`
            : undefined,
        });
      }

      if (event.shouldNotify !== false && this.shouldNotify(event.type)) {
        await this.createChatNotifications(event);
      }

      if (this.wsBroadcaster) {
        this.broadcastChatEvent(event);
      }

      await this.notifySubscribers(event);

    } catch (error) {
      console.error('[ChatServerHub] Error processing event:', error);
    }
  }

  /**
   * Subscribe to specific chat event types
   */
  subscribe(eventType: ChatEventType | '*', handler: (event: ChatEvent) => Promise<void>): void {
    if (!this.eventSubscribers.has(eventType)) {
      this.eventSubscribers.set(eventType, []);
    }
    this.eventSubscribers.get(eventType)!.push(handler);
    console.log(`[ChatServerHub] Handler subscribed to ${eventType}`);
  }

  /**
   * Broadcast chat event via WebSocket
   */
  private broadcastChatEvent(event: ChatEvent): void {
    if (!this.wsBroadcaster) return;

    const broadcastPayload = {
      type: 'chat_event',
      conversationId: event.metadata.conversationId,
      workspaceId: event.metadata.workspaceId,
      userId: event.metadata.audience === 'user' ? event.metadata.targetUserId : undefined,
      payload: {
        eventType: event.type,
        title: event.title,
        description: event.description,
        metadata: event.metadata,
        timestamp: (event.timestamp || new Date()).toISOString(),
      }
    };

    this.wsBroadcaster(broadcastPayload);
  }

  /**
   * Create notifications for chat events
   */
  private async createChatNotifications(event: ChatEvent): Promise<void> {
    try {
      if (!event.metadata.workspaceId) return;

      const notificationType = this.getNotificationType(event.type);
      
      if (event.metadata.audience === 'user' && event.metadata.targetUserId) {
        await db.insert(notifications).values({
          workspaceId: event.metadata.workspaceId,
          userId: event.metadata.targetUserId,
          type: notificationType,
          title: event.title,
          message: event.description,
          actionUrl: event.metadata.ticketNumber 
            ? `/support/tickets/${event.metadata.ticketNumber}`
            : `/chat/${event.metadata.conversationId}`,
          relatedEntityType: 'chat_event',
          relatedEntityId: event.metadata.messageId || event.metadata.ticketId,
          metadata: { chatEventType: event.type, ...event.metadata },
          isRead: false,
        });
      } else if (event.metadata.audience === 'staff') {
        console.log(`[ChatServerHub] Staff notification: ${event.title}`);
      }
    } catch (error) {
      console.error('[ChatServerHub] Failed to create notifications:', error);
    }
  }

  /**
   * Notify internal subscribers
   */
  private async notifySubscribers(event: ChatEvent): Promise<void> {
    const allHandlers = this.eventSubscribers.get('*') || [];
    const typeHandlers = this.eventSubscribers.get(event.type) || [];

    for (const handler of [...allHandlers, ...typeHandlers]) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[ChatServerHub] Subscriber error:`, error);
      }
    }
  }

  /**
   * Map chat event types to platform event types
   * Each ChatEventType maps to the most specific PlatformEventType available
   */
  private mapToPlatformEventType(chatType: ChatEventType): PlatformEventType {
    switch (chatType) {
      case 'ticket_created':
        return 'ticket_created';
      case 'ticket_assigned':
        return 'ticket_assigned';
      case 'ticket_escalated':
        return 'ticket_escalated';
      case 'ticket_resolved':
        return 'ticket_resolved';
      case 'ticket_closed':
        return 'ticket_closed';
      case 'message_posted':
      case 'message_edited':
      case 'message_deleted':
        return 'chat_message';
      case 'user_joined_room':
      case 'staff_joined':
        return 'chat_user_joined';
      case 'user_left_room':
      case 'staff_left':
        return 'chat_user_left';
      case 'user_kicked':
      case 'user_silenced':
      case 'user_banned':
        return 'chat_moderation';
      case 'room_status_changed':
      case 'queue_update':
        return 'queue_update';
      case 'ai_response':
        return 'ai_brain_action';
      case 'ai_escalation':
        return 'ai_escalation';
      case 'ai_suggestion':
        return 'ai_suggestion';
      default:
        return 'announcement';
    }
  }

  /**
   * Map chat event types to categories
   */
  private mapToCategory(chatType: ChatEventType): EventCategory {
    switch (chatType) {
      case 'ticket_created':
      case 'ticket_assigned':
      case 'ticket_escalated':
      case 'ticket_resolved':
      case 'ticket_closed':
        return 'improvement';
      case 'ai_response':
      case 'ai_escalation':
      case 'ai_suggestion':
        return 'feature';
      case 'user_banned':
      case 'user_kicked':
        return 'security';
      default:
        return 'announcement';
    }
  }

  /**
   * Determine if event should persist to What's New
   * Significant lifecycle events that users need to track
   */
  private shouldPersistEvent(type: ChatEventType): boolean {
    const persistableTypes: ChatEventType[] = [
      'ticket_created',
      'ticket_assigned',
      'ticket_escalated',
      'ticket_resolved',
      'ticket_closed',
      'ai_escalation',
      'user_banned',
    ];
    return persistableTypes.includes(type);
  }

  /**
   * Determine if event should create notifications
   * Events that require user attention
   */
  private shouldNotify(type: ChatEventType): boolean {
    const notifiableTypes: ChatEventType[] = [
      'ticket_created',
      'ticket_assigned',
      'ticket_escalated',
      'ticket_resolved',
      'ticket_closed',
      'ai_escalation',
      'user_kicked',
      'user_banned',
      'staff_joined',
    ];
    return notifiableTypes.includes(type);
  }

  /**
   * Get notification type from chat event type
   * Must match the notificationTypeEnum values in schema
   */
  private getNotificationType(chatType: ChatEventType): 'system' | 'support_escalation' | 'ai_action_completed' | 'ai_approval_needed' | 'mention' {
    switch (chatType) {
      case 'ticket_created':
      case 'ticket_assigned':
      case 'ticket_escalated':
      case 'ticket_resolved':
      case 'ticket_closed':
        return 'support_escalation';
      case 'ai_response':
      case 'ai_escalation':
      case 'ai_suggestion':
        return 'ai_action_completed';
      case 'user_kicked':
      case 'user_banned':
        return 'system';
      case 'staff_joined':
        return 'support_escalation';
      default:
        return 'system';
    }
  }

  // =========================================================================
  // CONVENIENCE METHODS FOR COMMON CHAT EVENTS
  // =========================================================================

  /**
   * Emit when a message is posted in a chatroom
   */
  async emitMessagePosted(params: {
    conversationId: string;
    roomSlug?: string;
    workspaceId?: string;
    userId: string;
    userName: string;
    messageId: string;
    messagePreview?: string;
  }): Promise<void> {
    await this.emit({
      type: 'message_posted',
      title: 'New Message',
      description: params.messagePreview || 'A new message was posted',
      metadata: {
        conversationId: params.conversationId,
        roomSlug: params.roomSlug,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        messageId: params.messageId,
        audience: 'room',
      },
      shouldPersistToWhatsNew: false,
      shouldNotify: false,
    });
  }

  /**
   * Emit when a support ticket is created
   */
  async emitTicketCreated(params: {
    conversationId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    ticketId: string;
    ticketNumber: string;
    issueType?: string;
    description?: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket_created',
      title: `Support Ticket Created: ${params.ticketNumber}`,
      description: params.description || `New support ticket ${params.ticketNumber} created by ${params.userName}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        audience: 'staff',
        severity: 'medium',
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: true,
    });
  }

  /**
   * Emit when a ticket is assigned to a staff member
   */
  async emitTicketAssigned(params: {
    conversationId: string;
    workspaceId: string;
    ticketId: string;
    ticketNumber: string;
    assigneeId: string;
    assigneeName: string;
    customerId: string;
    customerName: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket_assigned',
      title: `Ticket Assigned: ${params.ticketNumber}`,
      description: `${params.assigneeName} is now handling ticket ${params.ticketNumber}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.assigneeId,
        userName: params.assigneeName,
        targetUserId: params.customerId,
        targetUserName: params.customerName,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        audience: 'user',
      },
      visibility: 'all',
      shouldNotify: true,
    });
  }

  /**
   * Emit when a ticket is resolved
   */
  async emitTicketResolved(params: {
    conversationId: string;
    workspaceId: string;
    ticketId: string;
    ticketNumber: string;
    resolvedBy: string;
    resolverName: string;
    customerId: string;
    resolution?: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket_resolved',
      title: `Ticket Resolved: ${params.ticketNumber}`,
      description: params.resolution || `Ticket ${params.ticketNumber} has been resolved`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.resolvedBy,
        userName: params.resolverName,
        targetUserId: params.customerId,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        audience: 'user',
      },
      visibility: 'all',
      shouldNotify: true,
      shouldPersistToWhatsNew: true,
    });
  }

  /**
   * Emit when AI Brain takes an action
   */
  async emitAIAction(params: {
    conversationId: string;
    workspaceId?: string;
    actionType: 'response' | 'escalation' | 'suggestion';
    title: string;
    description: string;
    targetUserId?: string;
    ticketNumber?: string;
  }): Promise<void> {
    const eventType: ChatEventType = params.actionType === 'escalation' 
      ? 'ai_escalation' 
      : params.actionType === 'suggestion' 
        ? 'ai_suggestion' 
        : 'ai_response';

    await this.emit({
      type: eventType,
      title: params.title,
      description: params.description,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        targetUserId: params.targetUserId,
        ticketNumber: params.ticketNumber,
        audience: params.actionType === 'escalation' ? 'staff' : 'user',
        severity: params.actionType === 'escalation' ? 'high' : 'low',
      },
      visibility: params.actionType === 'escalation' ? 'staff' : 'all',
      shouldNotify: params.actionType === 'escalation',
      shouldPersistToWhatsNew: params.actionType === 'escalation',
    });
  }

  /**
   * Emit when staff joins a chatroom
   */
  async emitStaffJoined(params: {
    conversationId: string;
    workspaceId?: string;
    staffId: string;
    staffName: string;
    staffRole: string;
    customerId?: string;
  }): Promise<void> {
    await this.emit({
      type: 'staff_joined',
      title: 'Support Agent Available',
      description: `${params.staffName} (${params.staffRole}) is now available to help`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.staffId,
        userName: params.staffName,
        targetUserId: params.customerId,
        audience: 'room',
      },
      shouldNotify: true,
      shouldPersistToWhatsNew: false,
    });
  }

  /**
   * Emit when user is moderated (kicked/silenced/banned)
   */
  async emitModeration(params: {
    conversationId: string;
    workspaceId?: string;
    action: 'kicked' | 'silenced' | 'banned';
    moderatorId: string;
    moderatorName: string;
    targetUserId: string;
    targetUserName: string;
    reason?: string;
    duration?: number;
  }): Promise<void> {
    const eventType: ChatEventType = params.action === 'kicked' 
      ? 'user_kicked' 
      : params.action === 'silenced' 
        ? 'user_silenced' 
        : 'user_banned';

    await this.emit({
      type: eventType,
      title: `User ${params.action}`,
      description: params.reason || `${params.targetUserName} was ${params.action} by ${params.moderatorName}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.moderatorId,
        userName: params.moderatorName,
        targetUserId: params.targetUserId,
        targetUserName: params.targetUserName,
        audience: 'staff',
        severity: params.action === 'banned' ? 'high' : 'medium',
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: params.action === 'banned',
    });
  }

  /**
   * Emit queue update for waiting customers
   */
  async emitQueueUpdate(params: {
    conversationId: string;
    workspaceId?: string;
    userId: string;
    userName: string;
    ticketNumber: string;
    position: number;
    estimatedWait: number;
  }): Promise<void> {
    await this.emit({
      type: 'queue_update',
      title: 'Queue Position Update',
      description: `Position ${params.position} - Estimated wait: ${params.estimatedWait} minutes`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        targetUserId: params.userId,
        ticketNumber: params.ticketNumber,
        audience: 'user',
      },
      shouldNotify: false,
      shouldPersistToWhatsNew: false,
    });
  }

  /**
   * Emit when AI Brain completes a job
   */
  async emitAIBrainResponse(params: {
    jobId: string;
    workspaceId?: string;
    userId?: string;
    skill: string;
    status: string;
    confidenceScore?: number;
    requiresApproval?: boolean;
    executionTimeMs?: number;
  }): Promise<void> {
    const isApprovalNeeded = params.requiresApproval || (params.confidenceScore && params.confidenceScore < 0.95);
    const skillLabel = params.skill.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    await platformEventBus.publish({
      type: isApprovalNeeded ? 'ai_approval_request' : 'ai_brain_action',
      category: 'feature',
      title: isApprovalNeeded 
        ? `AI Action Requires Approval: ${skillLabel}` 
        : `AI Brain: ${skillLabel}`,
      description: isApprovalNeeded
        ? `Low confidence (${((params.confidenceScore || 0) * 100).toFixed(0)}%) - human review recommended`
        : `Completed in ${params.executionTimeMs || 0}ms with ${((params.confidenceScore || 1) * 100).toFixed(0)}% confidence`,
      workspaceId: params.workspaceId,
      userId: params.userId,
      metadata: {
        jobId: params.jobId,
        skill: params.skill,
        status: params.status,
        confidenceScore: params.confidenceScore,
        requiresApproval: params.requiresApproval,
        executionTimeMs: params.executionTimeMs,
      },
      visibility: isApprovalNeeded ? 'manager' : 'staff',
    });
  }
}

// Singleton instance
export const ChatServerHub = new ChatServerHubClass();

// Export convenience functions
export const emitChatEvent = (event: ChatEvent) => ChatServerHub.emit(event);
export const subscribeToChatEvents = (type: ChatEventType | '*', handler: (event: ChatEvent) => Promise<void>) => 
  ChatServerHub.subscribe(type, handler);
