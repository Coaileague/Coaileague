/**
 * HelpDesk Event System
 * Standardized event contracts for chat ↔ ticket bridge
 * Based on retrofit plan: 7 key events for seamless support workflow
 * 
 * INTEGRATION: Connected to ChatServerHub for unified event-driven architecture
 */

import { db } from "../db";
import { chatConversations, chatMessages, auditLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ChatServerHub } from "./ChatServerHub";

// Event Types
export type HelpDeskEventType =
  | 'chat.session.started'
  | 'chat.agent.assigned'
  | 'ticket.status.changed'
  | 'ticket.note.created'
  | 'ticket.escalated'
  | 'ticket.artifact.requested'
  | 'ticket.artifact.attached'
  | 'chat.session.ended';

// Event Payloads
export interface ChatSessionStartedEvent {
  type: 'chat.session.started';
  sessionId: string;
  userId?: string;
  orgId?: string;
  isSubscriber: boolean;
  topic?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  timestamp: Date;
}

export interface ChatAgentAssignedEvent {
  type: 'chat.agent.assigned';
  sessionId: string;
  agentId: string;
  agentName: string;
  ticketId?: string;
  timestamp: Date;
}

export interface TicketStatusChangedEvent {
  type: 'ticket.status.changed';
  ticketId: string;
  sessionId: string;
  status: 'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated';
  by: 'agent' | 'system' | 'customer';
  reason?: string;
  timestamp: Date;
}

export interface TicketNoteCreatedEvent {
  type: 'ticket.note.created';
  ticketId: string;
  sessionId: string;
  authorId: string;
  visibility: 'internal' | 'public';
  text: string;
  timestamp: Date;
}

export interface TicketEscalatedEvent {
  type: 'ticket.escalated';
  ticketId: string;
  sessionId: string;
  fromAgent: string;
  toQueue: string;
  reason: string;
  timestamp: Date;
}

export interface TicketArtifactRequestedEvent {
  type: 'ticket.artifact.requested';
  ticketId: string;
  sessionId: string;
  what: 'screenshot' | 'log' | 'file';
  requestedBy: string;
  timestamp: Date;
}

export interface TicketArtifactAttachedEvent {
  type: 'ticket.artifact.attached';
  ticketId: string;
  sessionId: string;
  url: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
  timestamp: Date;
}

export interface ChatSessionEndedEvent {
  type: 'chat.session.ended';
  sessionId: string;
  reason: 'resolved' | 'timeout' | 'manual' | 'escalated';
  duration?: number;
  timestamp: Date;
}

export type HelpDeskEvent =
  | ChatSessionStartedEvent
  | ChatAgentAssignedEvent
  | TicketStatusChangedEvent
  | TicketNoteCreatedEvent
  | TicketEscalatedEvent
  | TicketArtifactRequestedEvent
  | TicketArtifactAttachedEvent
  | ChatSessionEndedEvent;

/**
 * Event Manager - Handles emission and persistence of helpdesk events
 */
export class HelpDeskEventManager {
  private subscribers: Map<HelpDeskEventType, Set<(event: HelpDeskEvent) => void>> = new Map();

  /**
   * Emit an event to all subscribers and persist to audit log
   */
  async emit(event: HelpDeskEvent): Promise<void> {
    // Persist to audit log for compliance
    await this.persistToAudit(event);

    // Notify subscribers
    const handlers = this.subscribers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      });
    }

    // UNIFIED EVENT SYSTEM: Forward to ChatServerHub
    this.forwardToChatServerHub(event).catch(err => 
      console.error('[HelpDeskEvents] Failed to forward to ChatServerHub:', err)
    );
  }

  /**
   * Forward helpdesk events to ChatServerHub for unified event-driven architecture
   * Maps to valid ChatEventType values defined in ChatServerHub
   */
  private async forwardToChatServerHub(event: HelpDeskEvent): Promise<void> {
    const sessionId = 'sessionId' in event ? event.sessionId : undefined;
    const ticketId = 'ticketId' in event ? event.ticketId : undefined;

    // Only forward if we have a valid conversationId for routing
    if (!sessionId) {
      console.warn('[HelpDeskEvents] Missing sessionId, skipping ChatServerHub forward');
      return;
    }

    // Valid ChatEventType values from ChatServerHub
    type ChatEventType = 'ticket_created' | 'ticket_assigned' | 'ticket_escalated' | 'ticket_resolved' | 'ticket_closed' | 'staff_joined' | 'message_posted' | 'room_status_changed';

    // Determine correct ChatEventType based on event details
    let chatEventType: ChatEventType;
    let title: string;

    switch (event.type) {
      case 'chat.session.started':
        chatEventType = 'ticket_created';
        title = 'Support Session Started';
        break;
      case 'chat.agent.assigned':
        chatEventType = 'ticket_assigned';
        title = 'Agent Assigned';
        break;
      case 'ticket.status.changed':
        // Map based on actual status value
        const statusEvent = event as TicketStatusChangedEvent;
        if (statusEvent.status === 'resolved') {
          chatEventType = 'ticket_resolved';
          title = 'Ticket Resolved';
        } else if (statusEvent.status === 'assigned') {
          chatEventType = 'ticket_assigned';
          title = 'Ticket Assigned';
        } else if (statusEvent.status === 'escalated') {
          chatEventType = 'ticket_escalated';
          title = 'Ticket Escalated';
        } else {
          chatEventType = 'room_status_changed';
          title = `Ticket Status: ${statusEvent.status}`;
        }
        break;
      case 'ticket.note.created':
        chatEventType = 'message_posted';
        title = 'Note Added to Ticket';
        break;
      case 'ticket.escalated':
        chatEventType = 'ticket_escalated';
        title = 'Ticket Escalated';
        break;
      case 'ticket.artifact.requested':
        chatEventType = 'message_posted';
        title = 'Artifact Requested';
        break;
      case 'ticket.artifact.attached':
        chatEventType = 'message_posted';
        title = 'Artifact Attached';
        break;
      case 'chat.session.ended':
        chatEventType = 'ticket_closed';
        title = 'Session Ended';
        break;
      default:
        chatEventType = 'room_status_changed';
        title = 'Support Activity';
    }

    // Determine persistence/notification based on actual event significance
    const shouldPersist = ['ticket_escalated', 'ticket_resolved'].includes(chatEventType);
    const shouldNotify = ['ticket_escalated', 'ticket_assigned'].includes(chatEventType);

    await ChatServerHub.emit({
      type: chatEventType,
      title,
      description: this.getEventDescription(event),
      metadata: {
        conversationId: sessionId, // Required for room-scoped routing
        ticketId,
        workspaceId: 'orgId' in event ? event.orgId : undefined,
        audience: 'staff',
      },
      shouldPersistToWhatsNew: shouldPersist,
      shouldNotify: shouldNotify,
    });
  }

  /**
   * Get human-readable description for event
   */
  private getEventDescription(event: HelpDeskEvent): string {
    switch (event.type) {
      case 'chat.session.started':
        return `New support session started${event.topic ? `: ${event.topic}` : ''}`;
      case 'chat.agent.assigned':
        return `${event.agentName} assigned to conversation`;
      case 'ticket.status.changed':
        return `Status changed to ${event.status}${event.reason ? ` - ${event.reason}` : ''}`;
      case 'ticket.note.created':
        return `${event.visibility === 'internal' ? 'Internal note' : 'Note'} added`;
      case 'ticket.escalated':
        return `Escalated to ${event.toQueue}: ${event.reason}`;
      case 'ticket.artifact.requested':
        return `${event.what} requested`;
      case 'ticket.artifact.attached':
        return `${event.fileName} attached`;
      case 'chat.session.ended':
        return `Session ended: ${event.reason}`;
      default:
        return 'Helpdesk event occurred';
    }
  }

  /**
   * Subscribe to specific event types
   */
  on(eventType: HelpDeskEventType, handler: (event: HelpDeskEvent) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Persist event to audit log
   */
  private async persistToAudit(event: HelpDeskEvent): Promise<void> {
    try {
      const sessionId = 'sessionId' in event ? event.sessionId : null;
      const ticketId = 'ticketId' in event ? event.ticketId : null;
      const userId = 'authorId' in event ? event.authorId : 
                     'agentId' in event ? event.agentId : 
                     'system-helpdesk';

      await db.insert(auditLogs).values({
        workspaceId: null, // Will be set by caller when they have workspace context
        userId: userId,
        userEmail: 'system@coaileague.app',
        userRole: 'system',
        action: 'other',
        actionDescription: event.type,
        entityType: 'helpdesk_event',
        entityId: ticketId || sessionId || 'unknown',
        conversationId: sessionId,
        metadata: event as any,
        ipAddress: null,
      });
    } catch (error) {
      console.error('Failed to persist event to audit log:', error);
    }
  }

  /**
   * Helper: Emit session started event
   */
  async emitSessionStarted(params: {
    conversationId: string;
    userId?: string;
    workspaceId?: string;
    subscriptionTier?: string;
    topic?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }): Promise<void> {
    await this.emit({
      type: 'chat.session.started',
      sessionId: params.conversationId,
      userId: params.userId,
      orgId: params.workspaceId,
      isSubscriber: params.subscriptionTier !== 'free',
      topic: params.topic,
      priority: params.priority || 'normal',
      timestamp: new Date(),
    });
  }

  /**
   * Helper: Emit agent assigned event
   */
  async emitAgentAssigned(params: {
    conversationId: string;
    agentId: string;
    agentName: string;
    ticketId?: string;
  }): Promise<void> {
    await this.emit({
      type: 'chat.agent.assigned',
      sessionId: params.conversationId,
      agentId: params.agentId,
      agentName: params.agentName,
      ticketId: params.ticketId,
      timestamp: new Date(),
    });
  }

  /**
   * Helper: Emit status changed event
   */
  async emitStatusChanged(params: {
    conversationId: string;
    ticketId?: string;
    status: 'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated';
    by: 'agent' | 'system' | 'customer';
    reason?: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket.status.changed',
      ticketId: params.ticketId || params.conversationId,
      sessionId: params.conversationId,
      status: params.status,
      by: params.by,
      reason: params.reason,
      timestamp: new Date(),
    });
  }

  /**
   * Helper: Emit internal note created
   */
  async emitNoteCreated(params: {
    conversationId: string;
    ticketId?: string;
    authorId: string;
    visibility: 'internal' | 'public';
    text: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket.note.created',
      ticketId: params.ticketId || params.conversationId,
      sessionId: params.conversationId,
      authorId: params.authorId,
      visibility: params.visibility,
      text: params.text,
      timestamp: new Date(),
    });
  }

  /**
   * Helper: Emit escalation event
   */
  async emitEscalated(params: {
    conversationId: string;
    ticketId?: string;
    fromAgent: string;
    toQueue: string;
    reason: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket.escalated',
      ticketId: params.ticketId || params.conversationId,
      sessionId: params.conversationId,
      fromAgent: params.fromAgent,
      toQueue: params.toQueue,
      reason: params.reason,
      timestamp: new Date(),
    });
  }

  /**
   * Helper: Emit artifact requested
   */
  async emitArtifactRequested(params: {
    conversationId: string;
    ticketId?: string;
    what: 'screenshot' | 'log' | 'file';
    requestedBy: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket.artifact.requested',
      ticketId: params.ticketId || params.conversationId,
      sessionId: params.conversationId,
      what: params.what,
      requestedBy: params.requestedBy,
      timestamp: new Date(),
    });
  }

  /**
   * Helper: Emit session ended
   */
  async emitSessionEnded(params: {
    conversationId: string;
    reason: 'resolved' | 'timeout' | 'manual' | 'escalated';
    duration?: number;
  }): Promise<void> {
    await this.emit({
      type: 'chat.session.ended',
      sessionId: params.conversationId,
      reason: params.reason,
      duration: params.duration,
      timestamp: new Date(),
    });
  }
}

// Singleton instance
export const helpdeskEvents = new HelpDeskEventManager();
