/**
 * HelpDesk Event System
 * Standardized event contracts for chat ↔ ticket bridge
 * Based on retrofit plan: 7 key events for seamless support workflow
 */

import { db } from "../db";
import { chatConversations, chatMessages, auditLogs } from "@shared/schema";
import { eq } from "drizzle-orm";

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
        userEmail: 'system@autoforce.app',
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
