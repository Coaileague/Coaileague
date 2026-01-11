/**
 * SUPPORT SESSION SERVICE
 * 
 * Simplified 1-on-1 support chat system:
 * 1. User opens chat widget → HelpAI greets them
 * 2. User describes issue → HelpAI tries to solve using AI + FAQ
 * 3. If HelpAI can't resolve → Creates ticket, user stays in chat waiting
 * 4. Human support sees "waiting users" queue → Joins the chat
 * 5. 1-on-1 conversation until resolved → Ticket closed
 */

import { db } from '../db';
import { supportTickets, helposAiSessions, helposAiTranscriptEntries } from '@shared/schema';
import { eq, and, desc, sql, isNull, or, inArray } from 'drizzle-orm';
import { aiBrainService } from './ai-brain/aiBrainService';
import { HELPAI, PLATFORM } from '@shared/platformConfig';
import { randomUUID } from 'crypto';
import { PLATFORM_WORKSPACE_ID } from '../seed-platform-workspace';

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
  messages: SessionMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    userAgent?: string;
    url?: string;
    workspaceId?: string;
  };
}

export interface SessionMessage {
  id: string;
  sender: 'user' | 'helpai' | 'staff';
  senderName: string;
  content: string;
  timestamp: Date;
}

class SupportSessionService {
  private sessions: Map<string, SupportSession> = new Map();
  private userSessionMap: Map<string, string> = new Map();
  private staffConnections: Map<string, WebSocket> = new Map();

  async createSession(params: {
    userId?: string;
    guestEmail?: string;
    guestName?: string;
    userAgent?: string;
    url?: string;
    workspaceId?: string;
  }): Promise<SupportSession> {
    const sessionId = randomUUID();
    
    const session: SupportSession = {
      id: sessionId,
      status: 'ai_active',
      userId: params.userId,
      guestEmail: params.guestEmail,
      guestName: params.guestName,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        userAgent: params.userAgent,
        url: params.url,
        workspaceId: params.workspaceId,
      },
    };

    const greeting: SessionMessage = {
      id: randomUUID(),
      sender: 'helpai',
      senderName: HELPAI.name,
      content: `Hi there! I'm ${HELPAI.name}, your AI support assistant. How can I help you today?`,
      timestamp: new Date(),
    };
    session.messages.push(greeting);

    this.sessions.set(sessionId, session);
    if (params.userId) {
      this.userSessionMap.set(params.userId, sessionId);
    }

    console.log(`[SupportSession] Created session ${sessionId} for ${params.userId || params.guestEmail || 'anonymous'}`);
    return session;
  }

  getSession(sessionId: string): SupportSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByUserId(userId: string): SupportSession | undefined {
    const sessionId = this.userSessionMap.get(userId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  async processUserMessage(sessionId: string, content: string): Promise<SessionMessage> {
    const session = this.sessions.get(sessionId);
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

      if (aiResponse.shouldEscalate) {
        await this.escalateToHuman(sessionId, aiResponse.escalationReason);
      }

      return helpaiMessage;
    } catch (error) {
      console.error('[SupportSession] HelpAI error:', error);
      
      const fallbackMessage: SessionMessage = {
        id: randomUUID(),
        sender: 'helpai',
        senderName: HELPAI.name,
        content: "I'm having trouble processing that. Let me connect you with a human support agent who can help better.",
        timestamp: new Date(),
      };
      session.messages.push(fallbackMessage);
      
      await this.escalateToHuman(sessionId, 'AI processing error');
      return fallbackMessage;
    }
  }

  private async getHelpAIResponse(session: SupportSession, userMessage: string): Promise<{
    message: string;
    shouldEscalate: boolean;
    escalationReason?: string;
  }> {
    const conversationContext = session.messages
      .slice(-6)
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n');

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
      const result = await aiBrainService.enqueueJob({
        workspaceId: session.metadata?.workspaceId || 'platform',
        skill: 'helpai_support',
        input: {
          userMessage,
          conversationContext,
          sessionId: session.id,
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
      console.error('[SupportSession] AI Brain error:', error);
    }

    return {
      message: "I'm not quite sure how to help with that. Would you like me to connect you with a human support agent? Just say 'speak to human' and I'll create a ticket for you.",
      shouldEscalate: false,
    };
  }

  async escalateToHuman(sessionId: string, reason?: string): Promise<SupportSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
    
    try {
      const [ticket] = await db.insert(supportTickets).values({
        subject: `Support Request - ${session.guestName || session.userId || 'Guest'}`,
        description: session.messages.map(m => `${m.senderName}: ${m.content}`).join('\n'),
        priority: 'normal',
        status: 'open',
        reportedBy: session.userId || session.guestEmail || 'guest',
        workspaceId: session.metadata?.workspaceId || null,
        ticketNumber,
        metadata: JSON.stringify({
          sessionId,
          escalationReason: reason,
          userAgent: session.metadata?.userAgent,
          url: session.metadata?.url,
        }),
      }).returning();

      session.ticketId = ticket.id;
      session.ticketNumber = ticketNumber;
    } catch (error) {
      console.error('[SupportSession] Failed to create ticket:', error);
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

    console.log(`[SupportSession] Escalated session ${sessionId} to human - Ticket: ${ticketNumber}`);
    return session;
  }

  async staffJoinSession(sessionId: string, staffId: string, staffName: string): Promise<SupportSession> {
    const session = this.sessions.get(sessionId);
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

    console.log(`[SupportSession] Staff ${staffName} joined session ${sessionId}`);
    return session;
  }

  async staffSendMessage(sessionId: string, staffId: string, content: string): Promise<SessionMessage> {
    const session = this.sessions.get(sessionId);
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
    };
    session.messages.push(message);
    session.updatedAt = new Date();

    return message;
  }

  async resolveSession(sessionId: string, resolution?: string): Promise<SupportSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'resolved';
    session.updatedAt = new Date();

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
        console.error('[SupportSession] Failed to update ticket:', error);
      }
    }

    const resolvedMessage: SessionMessage = {
      id: randomUUID(),
      sender: session.staffId ? 'staff' : 'helpai',
      senderName: session.staffName || HELPAI.name,
      content: 'This support session has been marked as resolved. Thank you for contacting us! If you need further assistance, feel free to start a new chat.',
      timestamp: new Date(),
    };
    session.messages.push(resolvedMessage);

    console.log(`[SupportSession] Session ${sessionId} resolved`);
    return session;
  }

  getWaitingQueue(): SupportSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'waiting_human')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getActiveStaffSessions(staffId: string): SupportSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.staffId === staffId && s.status === 'human_joined');
  }

  getAllActiveSessions(): SupportSession[] {
    return Array.from(this.sessions.values())
      .filter(s => ['ai_active', 'waiting_human', 'human_joined'].includes(s.status));
  }

  getStats(): {
    totalActive: number;
    aiActive: number;
    waitingHuman: number;
    humanJoined: number;
    avgWaitTime: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const waiting = sessions.filter(s => s.status === 'waiting_human');
    
    const avgWaitTime = waiting.length > 0
      ? waiting.reduce((sum, s) => sum + (Date.now() - s.updatedAt.getTime()), 0) / waiting.length / 1000 / 60
      : 0;

    return {
      totalActive: sessions.filter(s => ['ai_active', 'waiting_human', 'human_joined'].includes(s.status)).length,
      aiActive: sessions.filter(s => s.status === 'ai_active').length,
      waitingHuman: waiting.length,
      humanJoined: sessions.filter(s => s.status === 'human_joined').length,
      avgWaitTime: Math.round(avgWaitTime * 10) / 10,
    };
  }
}

export const supportSessionService = new SupportSessionService();
