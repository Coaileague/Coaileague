/**
 * SUPPORT SESSION SERVICE - Database Persistent Version
 * 
 * Universal helpdesk system with ChatServerHub integration:
 * 1. User opens chat widget → HelpAI greets them (persisted to DB)
 * 2. User describes issue → HelpAI tries to solve using AI + FAQ
 * 3. If HelpAI can't resolve → Creates ticket, user stays in chat waiting
 * 4. Human support sees "waiting users" queue → Joins the chat via DM thread
 * 5. 1-on-1 conversation until resolved → Ticket closed, user disconnected
 * 6. Rating captured → AI learns from feedback
 * 
 * All sessions persisted to helposAiSessions + helposAiTranscriptEntries
 * Integrates with ChatServerHub for unified chatroom experience
 */

import { db } from '../db';
import {
  supportTickets,
  helposAiSessions,
  helposAiTranscriptEntries
} from '@shared/schema';
import { eq, and, desc, sql, isNull, or, inArray } from 'drizzle-orm';
import { aiBrainService } from './ai-brain/aiBrainService';
import { HELPAI, PLATFORM } from '@shared/platformConfig';
import { randomUUID } from 'crypto';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
import { createLogger } from '../lib/logger';
const log = createLogger('supportSessionService');


export interface SupportSession {
  id: string;
  status: 'ai_active' | 'waiting_human' | 'human_joined' | 'resolved' | 'abandoned';
  userId?: string;
  guestEmail?: string;
  guestName?: string;
  ticketId?: string;
  ticketNumber?: string;
  staffId?: string;
  staffName?: string;
  conversationId?: string;
  workspaceId: string;
  messages: SessionMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    userAgent?: string;
    url?: string;
    rating?: number;
    feedbackComment?: string;
  };
}

export interface SessionMessage {
  id: string;
  sender: 'user' | 'helpai' | 'staff';
  senderName: string;
  content: string;
  timestamp: Date;
  isPrivate?: boolean; // For DM thread visibility
}

// Map sender types to DB role values
function senderToRole(sender: 'user' | 'helpai' | 'staff'): string {
  switch (sender) {
    case 'user': return 'user';
    case 'helpai': return 'assistant';
    case 'staff': return 'system'; // Staff messages stored as system role
    default: {
      const exhaustiveCheck: never = sender;
      return 'user';
    }
  }
}

function roleToSender(role: string): 'user' | 'helpai' | 'staff' {
  switch (role) {
    case 'user': return 'user';
    case 'assistant': return 'helpai';
    case 'system': return 'staff';
    default: return 'user';
  }
}

class SupportSessionService {
  // In-memory cache for fast lookups (synced with DB)
  private sessionCache: Map<string, SupportSession> = new Map();
  private userSessionMap: Map<string, string> = new Map();
  private staffConnections: Map<string, WebSocket> = new Map();

  constructor() {
    // Defer DB load 120s — fires after Phase 1 seeding + circuit stabilizes
    setTimeout(async () => {
      try {
        const { probeDbConnection } = await import('../db');
        const dbOk = await probeDbConnection();
        if (!dbOk) {
          log.warn('[SupportSession] Skipping session load — DB probe failed');
          return;
        }
        await this.loadActiveSessionsFromDB();
      } catch (err: unknown) {
        log.warn('[SupportSession] Error loading sessions:', err?.message || err);
      }
    }, 120000);
  }

  /**
   * Load active sessions from database into cache on startup
   */
  private async loadActiveSessionsFromDB(): Promise<void> {
    try {
      const activeSessions = await db.select()
        .from(helposAiSessions)
        .where(
          or(
            eq(helposAiSessions.status, 'active'),
            eq(helposAiSessions.status, 'escalated')
          )
        )
        .limit(100);

      for (const dbSession of activeSessions) {
        // Load messages for this session
        const transcripts = await db.select()
          .from(helposAiTranscriptEntries)
          .where(eq(helposAiTranscriptEntries.sessionId, dbSession.id))
          .orderBy(helposAiTranscriptEntries.createdAt);

        const messages: SessionMessage[] = transcripts.map(t => ({
          id: t.id,
          sender: roleToSender(t.role),
          senderName: t.role === 'user' ? 'User' : t.role === 'assistant' ? HELPAI.name : 'Support Agent',
          content: t.content,
          timestamp: t.createdAt || new Date(),
        }));

        const session: SupportSession = {
          id: dbSession.id,
          status: this.dbStatusToSessionStatus(dbSession.status),
          userId: dbSession.userId || undefined,
          workspaceId: dbSession.workspaceId,
          ticketId: dbSession.supportTicketId || undefined,
          conversationId: dbSession.conversationId || undefined,
          messages,
          createdAt: dbSession.createdAt || new Date(),
          updatedAt: dbSession.updatedAt || new Date(),
        };

        this.sessionCache.set(session.id, session);
        if (session.userId) {
          this.userSessionMap.set(session.userId, session.id);
        }
      }

      log.info(`[SupportSession] Loaded ${activeSessions.length} active sessions from database`);
    } catch (error) {
      log.error('[SupportSession] Error loading sessions:', error);
    }
  }

  private dbStatusToSessionStatus(dbStatus: string): SupportSession['status'] {
    switch (dbStatus) {
      case 'active': return 'ai_active';
      case 'escalated': return 'waiting_human';
      case 'resolved': return 'resolved';
      case 'closed': return 'resolved';
      default: return 'ai_active';
    }
  }

  private sessionStatusToDbStatus(status: SupportSession['status']): string {
    switch (status) {
      case 'ai_active': return 'active';
      case 'waiting_human': return 'escalated';
      case 'human_joined': return 'escalated';
      case 'resolved': return 'resolved';
      case 'abandoned': return 'closed';
      default: return 'active';
    }
  }

  /**
   * Create a new support session (persisted to DB)
   */
  async createSession(params: {
    userId?: string;
    guestEmail?: string;
    guestName?: string;
    userAgent?: string;
    url?: string;
    workspaceId?: string;
    issueDescription?: string;
    quickbooksId?: string | null;
  }): Promise<SupportSession> {
    const sessionId = randomUUID();
    const workspaceId = params.workspaceId || PLATFORM_WORKSPACE_ID;
    
    // Create session in database
    try {
      await db.insert(helposAiSessions).values({
        id: sessionId,
        workspaceId,
        userId: params.userId || null,
        status: 'active',
        lastInteractionAt: new Date(),
        detectedIssueCategory: params.issueDescription ? 'user_reported' : undefined,
      });
    } catch (error) {
      log.error('[SupportSession] Failed to create DB session:', error);
      // Continue with in-memory only as fallback
    }

    const session: SupportSession = {
      id: sessionId,
      status: 'ai_active',
      userId: params.userId,
      guestEmail: params.guestEmail,
      guestName: params.guestName,
      workspaceId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        userAgent: params.userAgent,
        url: params.url,
        quickbooksId: params.quickbooksId || undefined,
        issueDescription: params.issueDescription,
      },
    };

    // Add greeting message
    const greeting: SessionMessage = {
      id: randomUUID(),
      sender: 'helpai',
      senderName: HELPAI.name,
      content: params.issueDescription 
        ? `Hi there! I'm ${HELPAI.name}, your AI support assistant. I see you're having an issue. Let me help you with that.`
        : `Hi there! I'm ${HELPAI.name}, your AI support assistant. How can I help you today?`,
      timestamp: new Date(),
    };
    session.messages.push(greeting);

    // Persist greeting to DB
    await this.persistMessage(sessionId, greeting);

    // If user provided issue description, add it as their first message
    if (params.issueDescription) {
      const userMessage: SessionMessage = {
        id: randomUUID(),
        sender: 'user',
        senderName: params.guestName || 'User',
        content: params.issueDescription,
        timestamp: new Date(),
      };
      session.messages.push(userMessage);
      await this.persistMessage(sessionId, userMessage);
    }

    // Update cache
    this.sessionCache.set(sessionId, session);
    if (params.userId) {
      this.userSessionMap.set(params.userId, sessionId);
    }

    log.info(`[SupportSession] Created session ${sessionId} for ${params.userId || params.guestEmail || 'anonymous'}${params.quickbooksId ? ` (QB: ${params.quickbooksId})` : ''}`);
    return session;
  }

  /**
   * Persist a message to the database
   */
  private async persistMessage(sessionId: string, message: SessionMessage): Promise<void> {
    try {
      await db.insert(helposAiTranscriptEntries).values({
        id: message.id,
        sessionId,
        role: senderToRole(message.sender),
        content: message.content,
        messageType: 'text',
      });
    } catch (error) {
      log.error('[SupportSession] Failed to persist message:', error);
    }
  }

  /**
   * Update session in database
   */
  private async updateSessionInDB(session: SupportSession): Promise<void> {
    try {
      await db.update(helposAiSessions)
        .set({
          status: this.sessionStatusToDbStatus(session.status),
          supportTicketId: session.ticketId || null,
          conversationId: session.conversationId || null,
          lastInteractionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(helposAiSessions.id, session.id));
    } catch (error) {
      log.error('[SupportSession] Failed to update session in DB:', error);
    }
  }

  getSession(sessionId: string): SupportSession | undefined {
    return this.sessionCache.get(sessionId);
  }

  /**
   * Get session from DB if not in cache
   */
  async getSessionWithFallback(sessionId: string): Promise<SupportSession | undefined> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) return cached;

    // Try to load from DB
    try {
      const [dbSession] = await db.select()
        .from(helposAiSessions)
        .where(eq(helposAiSessions.id, sessionId))
        .limit(1);

      if (!dbSession) return undefined;

      // Load messages
      const transcripts = await db.select()
        .from(helposAiTranscriptEntries)
        .where(eq(helposAiTranscriptEntries.sessionId, sessionId))
        .orderBy(helposAiTranscriptEntries.createdAt);

      const messages: SessionMessage[] = transcripts.map(t => ({
        id: t.id,
        sender: roleToSender(t.role),
        senderName: t.role === 'user' ? 'User' : t.role === 'assistant' ? HELPAI.name : 'Support Agent',
        content: t.content,
        timestamp: t.createdAt || new Date(),
      }));

      const session: SupportSession = {
        id: dbSession.id,
        status: this.dbStatusToSessionStatus(dbSession.status),
        userId: dbSession.userId || undefined,
        workspaceId: dbSession.workspaceId,
        ticketId: dbSession.supportTicketId || undefined,
        conversationId: dbSession.conversationId || undefined,
        messages,
        createdAt: dbSession.createdAt || new Date(),
        updatedAt: dbSession.updatedAt || new Date(),
      };

      // Update cache
      this.sessionCache.set(session.id, session);
      return session;
    } catch (error) {
      log.error('[SupportSession] Failed to load session from DB:', error);
      return undefined;
    }
  }

  getSessionByUserId(userId: string): SupportSession | undefined {
    const sessionId = this.userSessionMap.get(userId);
    return sessionId ? this.sessionCache.get(sessionId) : undefined;
  }

  async processUserMessage(sessionId: string, content: string): Promise<SessionMessage> {
    const session = this.sessionCache.get(sessionId) || await this.getSessionWithFallback(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const userMessage: SessionMessage = {
      id: randomUUID(),
      sender: 'user',
      senderName: session.guestName || 'User',
      content,
      timestamp: new Date(),
    };
    session.messages.push(userMessage);
    session.updatedAt = new Date();

    // Persist user message
    await this.persistMessage(sessionId, userMessage);

    // If human agent has joined, don't auto-respond
    if (session.status === 'human_joined' && session.staffId) {
      return userMessage;
    }

    try {
      const aiResponse = await this.getHelpAIResponse(session, content);
      
      const helpaiMessage: SessionMessage = {
        id: randomUUID(),
        sender: 'helpai',
        senderName: HELPAI.name,
        content: aiResponse.message,
        timestamp: new Date(),
      };
      session.messages.push(helpaiMessage);

      // Persist AI response
      await this.persistMessage(sessionId, helpaiMessage);

      if (aiResponse.shouldEscalate) {
        await this.escalateToHuman(sessionId, aiResponse.escalationReason);
      }

      return helpaiMessage;
    } catch (error) {
      log.error('[SupportSession] HelpAI error:', error);
      
      const fallbackMessage: SessionMessage = {
        id: randomUUID(),
        sender: 'helpai',
        senderName: HELPAI.name,
        content: "I'm having trouble processing that. Let me connect you with a human support agent who can help better.",
        timestamp: new Date(),
      };
      session.messages.push(fallbackMessage);
      await this.persistMessage(sessionId, fallbackMessage);
      
      await this.escalateToHuman(sessionId, 'AI processing error');
      return fallbackMessage;
    }
  }

  private async getHelpAIResponse(session: SupportSession, userMessage: string): Promise<{
    message: string;
    shouldEscalate: boolean;
    escalationReason?: string;
  }> {
    const escalationKeywords = [
      'speak to human', 'talk to person', 'real person', 'human agent',
      'not helpful', 'doesn\'t work', 'still broken', 'urgent', 'emergency',
      'billing issue', 'refund', 'cancel subscription', 'delete account'
    ];
    
    const shouldEscalate = escalationKeywords.some(kw => 
      userMessage.toLowerCase().includes(kw)
    );

    if (shouldEscalate) {
      return {
        message: "I understand you'd like to speak with a human support agent. Let me create a ticket and connect you right away. Please hold on...",
        shouldEscalate: true,
        escalationReason: 'User requested human support',
      };
    }

    try {
      // Build conversation history from session messages for context
      const conversationHistory = session.messages
        .filter(m => m.sender === 'user' || m.sender === 'helpai')
        .slice(-6)
        .map(m => ({
          role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
          content: m.content,
        }));

      const result = await aiBrainService.enqueueJob({
        workspaceId: session.workspaceId || 'platform',
        skill: 'helpos_support',
        input: {
          message: userMessage,
          conversationHistory,
          shouldLearn: true,
          userId: session.userId,
        },
        priority: 'high',
      });

      if (result.status === 'completed' && result.output?.response) {
        const response = result.output.response;
        const confidence = result.output.confidence || 0.7;
        
        if (confidence < 0.4) {
          return {
            message: `${response}\n\nIf this doesn't resolve your issue, I can connect you with a human support agent. Just say "speak to human" and I'll create a ticket for you.`,
            shouldEscalate: false,
          };
        }
        
        return {
          message: response,
          shouldEscalate: false,
        };
      }
    } catch (error) {
      log.error('[SupportSession] AI Brain error:', error);
    }

    return {
      message: "I'm not quite sure how to help with that. Would you like me to connect you with a human support agent? Just say 'speak to human' and I'll create a ticket for you.",
      shouldEscalate: false,
    };
  }

  async escalateToHuman(sessionId: string, reason?: string): Promise<SupportSession> {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
    
    try {
      const [ticket] = await db.insert(supportTickets).values({
        subject: `Support Request - ${session.guestName || session.userId || 'Guest'}`,
        description: session.messages.map(m => `${m.senderName}: ${m.content}`).join('\n'),
        priority: 'medium',
        status: 'open',
        type: 'support',
        requestedBy: session.userId || undefined,
        workspaceId: session.workspaceId || null,
        ticketNumber,
      }).returning();

      session.ticketId = ticket.id;
      session.ticketNumber = ticketNumber;

      // Update session in DB with ticket reference
      await db.update(helposAiSessions)
        .set({
          supportTicketId: ticket.id,
          escalationReason: reason || 'User requested',
          escalatedAt: new Date(),
          status: 'escalated',
          updatedAt: new Date(),
        })
        .where(eq(helposAiSessions.id, sessionId));
    } catch (error) {
      log.error('[SupportSession] Failed to create ticket:', error);
      session.ticketNumber = ticketNumber;
    }

    session.status = 'waiting_human';
    session.updatedAt = new Date();

    const escalationMessage: SessionMessage = {
      id: randomUUID(),
      sender: 'helpai',
      senderName: HELPAI.name,
      content: `I've created ticket #${ticketNumber} for you. A human support agent will join this chat shortly. Please stay in the chat - you'll be notified when they join.`,
      timestamp: new Date(),
    };
    session.messages.push(escalationMessage);
    await this.persistMessage(sessionId, escalationMessage);

    // Notify support staff via Trinity Autonomous Notifier
    try {
      const { trinityAutonomousNotifier } = await import('./ai-brain/trinityAutonomousNotifier');
      await (trinityAutonomousNotifier as any).emitAlert({
        id: randomUUID(),
        severity: 'warning',
        category: 'platform',
        title: `Support Request: ${ticketNumber}`,
        description: `User ${session.guestName || session.userId || 'Guest'} needs human assistance. Reason: ${reason || 'User requested support'}`,
        suggestedAction: 'Join the support chat session to assist the user',
        autoFixAvailable: false,
        autoFixRisk: 'low',
        workspaceId: session.workspaceId,
        detectedAt: new Date(),
        metadata: {
          sessionId,
          ticketNumber,
          userName: session.guestName || session.userId,
          messageCount: session.messages.length,
        },
      });
    } catch (notifyError) {
      log.warn('[SupportSession] Failed to notify support staff:', notifyError);
    }

    log.info(`[SupportSession] Escalated session ${sessionId} to human - Ticket: ${ticketNumber}`);
    return session;
  }

  async staffJoinSession(sessionId: string, staffId: string, staffName: string): Promise<SupportSession> {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.staffId = staffId;
    session.staffName = staffName;
    session.status = 'human_joined';
    session.updatedAt = new Date();

    const joinMessage: SessionMessage = {
      id: randomUUID(),
      sender: 'staff',
      senderName: staffName,
      content: `Hi! I'm ${staffName} from the support team. I've reviewed your conversation with ${HELPAI.name} and I'm here to help. How can I assist you?`,
      timestamp: new Date(),
    };
    session.messages.push(joinMessage);
    await this.persistMessage(sessionId, joinMessage);

    // Update DB
    await this.updateSessionInDB(session);

    // Log staff join for audit
    try {
      const { platformEventBus } = await import('./platformEventBus');
      platformEventBus.emit('support_staff_joined', {
        sessionId,
        staffId,
        staffName,
        ticketId: session.ticketId,
        timestamp: new Date(),
      });
    } catch (e) {
      // Silent fail for audit logging
    }

    log.info(`[SupportSession] Staff ${staffName} joined session ${sessionId}`);
    return session;
  }

  async staffSendMessage(sessionId: string, staffId: string, content: string): Promise<SessionMessage> {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.staffId !== staffId) {
      throw new Error('Staff not assigned to this session');
    }

    const message: SessionMessage = {
      id: randomUUID(),
      sender: 'staff',
      senderName: session.staffName || 'Support Agent',
      content,
      timestamp: new Date(),
      isPrivate: true, // DM thread message
    };
    session.messages.push(message);
    session.updatedAt = new Date();

    await this.persistMessage(sessionId, message);

    return message;
  }

  /**
   * Resolve session - closes ticket, forces user out, moves agent to next
   */
  async resolveSession(sessionId: string, resolution?: string): Promise<SupportSession> {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'resolved';
    session.updatedAt = new Date();

    // Update ticket status
    if (session.ticketId) {
      try {
        await db.update(supportTickets)
          .set({ 
            status: 'resolved',
            resolvedAt: new Date(),
            resolution: resolution || 'Resolved via support chat',
          })
          .where(eq(supportTickets.id, session.ticketId));
      } catch (error) {
        log.error('[SupportSession] Failed to update ticket:', error);
      }
    }

    // Update session in DB
    await db.update(helposAiSessions)
      .set({
        status: 'resolved',
        aiSummary: resolution || 'Session resolved',
        updatedAt: new Date(),
      })
      .where(eq(helposAiSessions.id, sessionId));

    const resolvedMessage: SessionMessage = {
      id: randomUUID(),
      sender: session.staffId ? 'staff' : 'helpai',
      senderName: session.staffName || HELPAI.name,
      content: 'This support session has been marked as resolved. Thank you for contacting us! If you need further assistance, feel free to start a new chat.',
      timestamp: new Date(),
    };
    session.messages.push(resolvedMessage);
    await this.persistMessage(sessionId, resolvedMessage);

    // Emit event for ChatServerHub to force disconnect user
    try {
      const { platformEventBus } = await import('./platformEventBus');
      platformEventBus.emit('support_session_resolved', {
        sessionId,
        ticketId: session.ticketId,
        staffId: session.staffId,
        userId: session.userId,
        workspaceId: session.workspaceId,
        timestamp: new Date(),
      });
    } catch (e) {
      // Silent fail
    }

    log.info(`[SupportSession] Session ${sessionId} resolved`);
    return session;
  }

  /**
   * Submit rating/feedback for a resolved session
   */
  async submitFeedback(sessionId: string, rating: number, comment?: string): Promise<void> {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Store in session metadata
    if (!session.metadata) session.metadata = {};
    session.metadata.rating = rating;
    session.metadata.feedbackComment = comment;

    // Store in aiFeedbackLoops for AI learning
    try {
      await db.insert(aiFeedbackLoops).values({
        workspaceId: session.workspaceId,
        rating,
        sentiment: rating >= 4 ? 'positive' : rating >= 3 ? 'neutral' : 'negative',
        feedback: comment || null,
        wasHelpful: rating >= 3,
        issueResolved: session.status === 'resolved',
        aiSuggestion: JSON.stringify({
          sessionId,
          ticketId: session.ticketId,
          messageCount: session.messages.length,
          hadHumanAgent: !!session.staffId,
        }),
      });

      log.info(`[SupportSession] Feedback captured for session ${sessionId}: ${rating}/5`);
    } catch (error) {
      log.error('[SupportSession] Failed to store feedback:', error);
    }
  }

  getWaitingQueue(): SupportSession[] {
    return Array.from(this.sessionCache.values())
      .filter(s => s.status === 'waiting_human')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getActiveStaffSessions(staffId: string): SupportSession[] {
    return Array.from(this.sessionCache.values())
      .filter(s => s.staffId === staffId && s.status === 'human_joined');
  }

  getAllActiveSessions(): SupportSession[] {
    return Array.from(this.sessionCache.values())
      .filter(s => s.status !== 'resolved' && s.status !== 'abandoned');
  }

  /**
   * Get statistics about current support sessions
   */
  getStats(): {
    totalActive: number;
    aiActive: number;
    waitingHuman: number;
    humanJoined: number;
    avgWaitTime: number;
  } {
    const sessions = Array.from(this.sessionCache.values());
    const active = sessions.filter(s => s.status !== 'resolved' && s.status !== 'abandoned');
    const aiActive = sessions.filter(s => s.status === 'ai_active');
    const waitingHuman = sessions.filter(s => s.status === 'waiting_human');
    const humanJoined = sessions.filter(s => s.status === 'human_joined');

    // Calculate average wait time for waiting sessions
    let avgWaitTime = 0;
    if (waitingHuman.length > 0) {
      const totalWaitMs = waitingHuman.reduce((sum, s) => {
        return sum + (Date.now() - s.updatedAt.getTime());
      }, 0);
      avgWaitTime = Math.round(totalWaitMs / waitingHuman.length / 60000); // in minutes
    }

    return {
      totalActive: active.length,
      aiActive: aiActive.length,
      waitingHuman: waitingHuman.length,
      humanJoined: humanJoined.length,
      avgWaitTime,
    };
  }

  /**
   * Get all sessions visible to support staff (platform-wide)
   */
  async getAllSessionsForSupport(): Promise<SupportSession[]> {
    // Return all active sessions for support roles
    return Array.from(this.sessionCache.values())
      .filter(s => s.status !== 'abandoned')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Get sessions filtered by workspace (for org users)
   */
  async getSessionsByWorkspace(workspaceId: string): Promise<SupportSession[]> {
    return Array.from(this.sessionCache.values())
      .filter(s => s.workspaceId === workspaceId && s.status !== 'abandoned')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getSessionStats() {
    const sessions = Array.from(this.sessionCache.values());
    return {
      total: sessions.length,
      aiActive: sessions.filter(s => s.status === 'ai_active').length,
      waitingHuman: sessions.filter(s => s.status === 'waiting_human').length,
      humanJoined: sessions.filter(s => s.status === 'human_joined').length,
      resolved: sessions.filter(s => s.status === 'resolved').length,
    };
  }

  registerStaffConnection(staffId: string, ws: WebSocket): void {
    this.staffConnections.set(staffId, ws);
    log.info(`[SupportSession] Staff ${staffId} connected to support queue`);
  }

  unregisterStaffConnection(staffId: string): void {
    this.staffConnections.delete(staffId);
    log.info(`[SupportSession] Staff ${staffId} disconnected from support queue`);
  }
}

export const supportSessionService = new SupportSessionService();
