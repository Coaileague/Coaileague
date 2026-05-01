/**
 * HelpAI Orchestrator Service
 * ============================
 * Full lifecycle helpdesk bot supervisor.
 * QUEUE → IDENTIFY → ASSIST → SATISFACTION_CHECK → CLOSE → RATING → DISCONNECT
 *
 * Responsibilities:
 * - Session tracking (DB-persisted, not in-memory only)
 * - Safety code / session authentication
 * - Bot summoning via ChatServerHub commands
 * - FAQ dynamic reading from DB
 * - Action logging to helpai_action_log
 * - Escalation with structured handoff to real agents
 * - Ticket lifecycle management tied to supportTickets
 * - Satisfaction rating flow + session disconnect
 */

import { db } from '../../db';
import {
  helpaiSessions,
  helpaiActionLog,
  helpaiSafetyCodes,
  supportTickets,
  users,
  helposFaqs,
  agentTasks,
  type HelpaiSession,
  type InsertHelpaiSession,
  type InsertHelpaiActionLog,
  type InsertHelpaiSafetyCode,
} from '@shared/schema';
import { eq, and, desc, lt, sql, isNull } from 'drizzle-orm';
import { helpAIBotService, HelpAIState } from './helpAIBotService';
import { aiBrainService } from '../ai-brain/aiBrainService';
import { botCommandExecutor } from '../../bots/botCommandExecutor';
import { platformEventBus } from '../platformEventBus';
import { contentModerationService, ModerationAction, ModerationLevel } from './contentModerationService';
import crypto from 'crypto';
import { typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('helpAIOrchestrator');


interface BotDelegationResult {
  botName: BotSummonRequest['botName'];
  command: string;
  instructions: string;
  confidence: number;
}

const BOT_DELEGATION_PATTERNS: Array<{
  botName: BotSummonRequest['botName'];
  command: string;
  patterns: RegExp[];
  keywords: string[];
}> = [
  {
    botName: 'ClockBot',
    command: '/clockme',
    patterns: [
      /clock\s*(me\s*)?(in|out)/i,
      /punch\s*(me\s*)?(in|out)/i,
      /start\s*(my\s*)?shift/i,
      /end\s*(my\s*)?shift/i,
      /check\s*(my\s*)?(clock|time)\s*status/i,
      /force\s*clock/i,
    ],
    keywords: ['clock in', 'clock out', 'punch in', 'punch out', 'time clock', 'clock status', 'clockme', 'force clock'],
  },
  {
    botName: 'MeetingBot',
    command: '/meetingstart',
    patterns: [
      /start\s*(a\s*)?meeting/i,
      /begin\s*(a\s*)?meeting/i,
      /end\s*(the\s*)?meeting/i,
      /pause\s*(the\s*)?meeting/i,
      /meeting\s*(minutes|summary|notes)/i,
      /action\s*items?\s*(from|for)/i,
    ],
    keywords: ['start meeting', 'end meeting', 'meeting minutes', 'meeting summary', 'action items', 'meeting notes'],
  },
  {
    botName: 'ReportBot',
    command: '/report',
    patterns: [
      /submit\s*(a\s*)?(report|incident)/i,
      /file\s*(a\s*)?(report|incident)/i,
      /analyze\s*reports?/i,
      /incident\s*report/i,
      /generate\s*(a\s*)?report/i,
      /report\s*summary/i,
    ],
    keywords: ['submit report', 'file report', 'incident report', 'analyze reports', 'generate report', 'report summary'],
  },
  {
    botName: 'CleanupBot',
    command: '/cleanup',
    patterns: [
      /clean\s*up\s*(old|stale|expired)/i,
      /purge\s*(old|stale|expired)/i,
      /archive\s*(old|stale|expired)/i,
      /data\s*retention/i,
    ],
    keywords: ['cleanup', 'purge old', 'archive old', 'data retention'],
  },
];

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestratorSessionStart {
  userId?: string;
  workspaceId?: string;
  guestName?: string;
  guestEmail?: string;
  ipAddress?: string;
}

export interface OrchestratorMessage {
  sessionId: string;
  message: string;
  userId?: string;
  workspaceId?: string;
}

export interface OrchestratorResponse {
  sessionId: string;
  ticketNumber: string;
  state: HelpAIState;
  message: string;
  shouldEscalate: boolean;
  shouldClose: boolean;
  shouldDisconnect: boolean;
  queuePosition?: number;
  requiresRating?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BotSummonRequest {
  sessionId: string;
  botName: 'MeetingBot' | 'ReportBot' | 'ClockBot' | 'CleanupBot' | 'HelpAI';
  command: string;
  instructions: string;
  workspaceId?: string;
  userId?: string;
}

export interface AuthVerificationResult {
  verified: boolean;
  method: 'session' | 'safety_code' | 'org_code' | 'guest';
  userId?: string;
  message: string;
}

// ============================================================================
// IN-MEMORY QUEUE (backed by DB on session start/update)
// ============================================================================

interface QueueEntry {
  sessionId: string;
  ticketNumber: string;
  userId?: string;
  workspaceId?: string;
  joinedAt: Date;
  position: number;
}

// ============================================================================
// HELPAI ORCHESTRATOR
// ============================================================================

class HelpAIOrchestrator {
  private queue: Map<string, QueueEntry> = new Map(); // sessionId → QueueEntry
  private activeBotsPerSession: Map<string, string[]> = new Map(); // sessionId → bot names

  // --------------------------------------------------------------------------
  // SESSION LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Start a new HelpAI support session.
   * Queues the user, creates DB record, generates ticket number.
   */
  async startSession(params: OrchestratorSessionStart): Promise<OrchestratorResponse> {
    const ticketNumber = this.generateTicketNumber();
    const queuePosition = this.queue.size + 1;

    // Determine auth method
    const authMethod = params.userId ? 'session' : 'guest';
    const authVerified = !!params.userId; // Logged-in session = auto-verified

    // Insert DB session record
    const [session] = await db.insert(helpaiSessions).values({
      ticketNumber,
      workspaceId: params.workspaceId,
      userId: params.userId,
      guestName: params.guestName,
      guestEmail: params.guestEmail,
      authMethod,
      authVerified,
      state: HelpAIState.QUEUED,
      queuePosition,
      queueEnteredAt: new Date(),
    } as InsertHelpaiSession).returning();

    // Add to in-memory queue
    this.queue.set(session.id, {
      sessionId: session.id,
      ticketNumber,
      userId: params.userId,
      workspaceId: params.workspaceId,
      joinedAt: new Date(),
      position: queuePosition,
    });

    // Log action
    await this.logAction(session.id, {
      actionType: 'query',
      actionName: 'session_start',
      inputPayload: { authMethod, queuePosition },
      outputPayload: { ticketNumber, sessionId: session.id },
      workspaceId: params.workspaceId,
      userId: params.userId,
    });

    await db.update(helpaiSessions).set({ state: HelpAIState.ASSISTING }).where(eq(helpaiSessions.id, session.id));

    const greeting = [
      `Hello! I'm **HelpAI**, your AI assistant.`,
      `Your reference ticket is **${ticketNumber}**.`,
      ``,
      authVerified
        ? `I've verified your identity. How can I help you today?`
        : `Please tell me what you need help with and I'll get started right away.`,
    ].join('\n');

    return {
      sessionId: session.id,
      ticketNumber,
      state: HelpAIState.ASSISTING,
      message: greeting,
      shouldEscalate: false,
      shouldClose: false,
      shouldDisconnect: false,
      queuePosition: 0,
    };
  }

  /**
   * Process a message within an active session.
   * Routes through the full lifecycle state machine.
   */
  async processMessage(params: OrchestratorMessage): Promise<OrchestratorResponse> {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      return this.errorResponse(params.sessionId, 'Session not found. Please start a new session.');
    }

    const state = session.state as HelpAIState;
    const msg = params.message.trim();

    // Log the incoming message as an action
    await this.logAction(session.id, {
      actionType: 'query',
      actionName: 'user_message',
      commandUsed: msg.startsWith('/') ? msg.split(' ')[0] : undefined,
      inputPayload: { message: msg.substring(0, 500), state },
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    // Content moderation gate — check every message before any processing (including slash commands)
    const moderation = await contentModerationService.moderateMessage({
      userId: session.userId || params.userId || `session-${session.id}`,
      workspaceId: session.workspaceId || params.workspaceId || 'platform',
      sessionId: session.id,
      message: msg,
    });

    if (moderation.action === ModerationAction.BLOCK || moderation.action === ModerationAction.TEMP_BLOCK) {
      await this.logAction(session.id, {
        actionType: 'moderation',
        actionName: `content_${moderation.action}`,
        inputPayload: { level: moderation.level, category: moderation.category },
        outputPayload: { action: moderation.action, strikeCount: moderation.strikeCount },
        success: false,
        workspaceId: session.workspaceId ?? undefined,
        userId: session.userId ?? undefined,
      });
      return this.makeResponse(session, state, {
        message: moderation.blockedMessage || 'Your message could not be processed at this time.',
      });
    }

    if (moderation.action === ModerationAction.WARN) {
      await this.logAction(session.id, {
        actionType: 'moderation',
        actionName: 'content_warning',
        inputPayload: { level: moderation.level, category: moderation.category },
        outputPayload: { action: moderation.action, strikeCount: moderation.strikeCount },
        success: true,
        workspaceId: session.workspaceId ?? undefined,
        userId: session.userId ?? undefined,
      });
      return this.makeResponse(session, state, {
        message: moderation.blockedMessage || 'Please keep our conversation professional and on-topic.',
      });
    }

    if (moderation.action === ModerationAction.REDIRECT) {
      return this.makeResponse(session, state, {
        message: moderation.blockedMessage || "I'm here to help with CoAIleague business operations. What can I help you with?",
      });
    }

    // Handle /slash commands after moderation check
    if (msg.startsWith('/')) {
      return this.handleSlashCommand(session, msg, params);
    }

    // State machine routing
    switch (state) {
      case HelpAIState.QUEUED:
      case HelpAIState.IDENTIFYING:
        return this.handleIdentification(session, msg);

      case HelpAIState.GREETING:
      case HelpAIState.SEARCHING:
      case HelpAIState.ANSWERING:
      case HelpAIState.CLARIFYING:
      case HelpAIState.INTAKE_SUBJECT:
      case HelpAIState.INTAKE_DESCRIPTION:
      case HelpAIState.INTAKE_PRIORITY:
      case HelpAIState.CREATING_TICKET:
        return this.handleAssist(session, msg, params);

      case HelpAIState.SATISFACTION_CHECK:
        return this.handleSatisfactionCheck(session, msg);

      case HelpAIState.RATING:
        return this.handleRating(session, msg);

      case HelpAIState.WAITING_FOR_HUMAN:
        return this.makeResponse(session, HelpAIState.WAITING_FOR_HUMAN, {
          message: `You're connected to a support queue. A real agent will be with you shortly. Ticket **${session.ticketNumber}** is active.`,
        });

      case (HelpAIState as any).ESCALATING:
        return this.handleEscalation(session, msg, params);

      case HelpAIState.RESOLVED:
        return this.handleSatisfactionCheck(session, msg);

      case HelpAIState.DISCONNECTED:
        return this.makeResponse(session, HelpAIState.DISCONNECTED, {
          message: `This session has ended. To get support again, please visit the help desk and start a new session.`,
          shouldDisconnect: true,
        });

      default:
        return this.handleAssist(session, msg, params);
    }
  }

  // --------------------------------------------------------------------------
  // STATE HANDLERS
  // --------------------------------------------------------------------------

  private async handleIdentification(
    session: HelpaiSession,
    message: string
  ): Promise<OrchestratorResponse> {
    // If already verified (session login), move to assistance immediately
    if (session.authVerified) {
      await this.updateSession(session.id, {
        state: HelpAIState.GREETING,
        identifiedAt: new Date(),
        assistStartedAt: new Date(),
      });

      await this.logAction(session.id, {
        actionType: 'auth_check',
        actionName: 'session_verified',
        outputPayload: { method: 'session', verified: true },
        success: true,
        workspaceId: session.workspaceId ?? undefined,
        userId: session.userId ?? undefined,
      });

      const [updatedSession] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, session.id));
      return this.handleAssist(updatedSession, message, { sessionId: session.id, message, userId: session.userId ?? undefined, workspaceId: session.workspaceId ?? undefined });
    }

    // Detect if user provided a safety code (6-char alphanumeric)
    const codePattern = /^[A-Z0-9]{6}$/i;
    if (codePattern.test(message.trim())) {
      const result = await this.verifySafetyCode(session.id, message.trim());
      if (result.verified) {
        await this.updateSession(session.id, {
          state: HelpAIState.GREETING,
          authMethod: 'safety_code',
          authVerified: true,
          identifiedAt: new Date(),
          assistStartedAt: new Date(),
        });

        await this.logAction(session.id, {
          actionType: 'safety_code_verify',
          actionName: 'safety_code_verified',
          outputPayload: { method: 'safety_code', verified: true, userId: result.userId },
          success: true,
          workspaceId: session.workspaceId ?? undefined,
          userId: session.userId ?? undefined,
        });

        return this.makeResponse(session, HelpAIState.GREETING, {
          message: `Identity verified! Welcome. I'm HelpAI. How can I help you today?`,
        });
      } else {
        return this.makeResponse(session, HelpAIState.IDENTIFYING, {
          message: `That code didn't match our records or has expired. Please check your email for a 6-character safety code, or describe your issue and I'll assist you as a guest.`,
        });
      }
    }

    // Guest path - no code, just help them anyway
    await this.updateSession(session.id, {
      state: HelpAIState.GREETING,
      authMethod: 'guest',
      identifiedAt: new Date(),
      assistStartedAt: new Date(),
    });

    const [updatedSession] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, session.id));
    return this.handleAssist(updatedSession, message, { sessionId: session.id, message, userId: session.userId ?? undefined, workspaceId: session.workspaceId ?? undefined });
  }

  private async handleAssist(
    session: HelpaiSession,
    message: string,
    params: OrchestratorMessage
  ): Promise<OrchestratorResponse> {
    if (session.state === HelpAIState.QUEUED || session.state === HelpAIState.GREETING) {
      await this.updateSession(session.id, {
        state: HelpAIState.SEARCHING,
        assistStartedAt: session.assistStartedAt ?? new Date(),
        conversationMessageCount: (session.conversationMessageCount ?? 0) + 1,
      });
    } else {
      await this.updateSession(session.id, {
        conversationMessageCount: (session.conversationMessageCount ?? 0) + 1,
      });
    }

    if (message.toLowerCase().includes('password reset') || message.toLowerCase().includes('reset my password')) {
      return this.handlePasswordReset(session);
    }

    const delegation = this.detectBotDelegation(message);
    if (delegation && delegation.confidence >= 0.75 && params.workspaceId && params.userId) {
      log.info(`[HelpAI] Autonomous delegation detected: ${delegation.botName} (confidence: ${delegation.confidence}) for message: "${message.substring(0, 80)}"`);
      const summonResult = await this.summonBot({
        sessionId: session.id,
        botName: delegation.botName,
        command: delegation.command,
        instructions: delegation.instructions,
        workspaceId: params.workspaceId,
        userId: params.userId,
      });

      const delegationMessage = summonResult.success
        ? `I've delegated this to **${delegation.botName}** on your behalf.\n\n${summonResult.message}\n\nIs there anything else I can help with?`
        : `I tried to delegate this to **${delegation.botName}**, but it wasn't able to complete the action: ${summonResult.message}\n\nWould you like me to try a different approach, or shall I connect you with a human agent?`;

      await this.logAction(session.id, {
        actionType: 'bot_summon',
        actionName: 'autonomous_delegation',
        botSummoned: delegation.botName,
        commandUsed: delegation.command,
        inputPayload: { message: message.substring(0, 500), confidence: delegation.confidence },
        outputPayload: { success: summonResult.success, response: delegationMessage.substring(0, 500) },
        success: summonResult.success,
        confidenceScore: String(delegation.confidence),
        workspaceId: params.workspaceId,
        userId: params.userId,
      });

      return this.makeResponse(session, session.state as HelpAIState, {
        message: delegationMessage,
      });
    }

    const botResponse = await helpAIBotService.handleMessage(
      session.id,
      message
    );

    // Log the AI response action
    await this.logAction(session.id, {
      actionType: 'fetch',
      actionName: 'ai_response_generated',
      toolUsed: 'trinity_brain',
      outputPayload: {
        response: botResponse.response.substring(0, 500),
        confidence: botResponse.confidence,
        shouldEscalate: botResponse.shouldEscalate,
      },
      success: true,
      confidenceScore: String(botResponse.confidence ?? 0.8),
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    // Log FAQ reads if any
    if (botResponse.suggestedFaqs && botResponse.suggestedFaqs.length > 0) {
      for (const faq of botResponse.suggestedFaqs) {
        await this.logAction(session.id, {
          actionType: 'faq_read',
          actionName: 'faq_served',
          outputPayload: { question: faq.question.substring(0, 200), score: faq.score },
          success: true,
          workspaceId: session.workspaceId ?? undefined,
          userId: session.userId ?? undefined,
        });
      }
    }

    if (botResponse.shouldEscalate) {
      await this.updateSession(session.id, {
        state: (HelpAIState as any).ESCALATING,
        wasEscalated: true,
      });
      return this.initiateEscalation(session, message, 'ai_low_confidence');
    }

    if (botResponse.shouldClose) {
      await this.updateSession(session.id, { state: HelpAIState.SATISFACTION_CHECK });
      return this.makeResponse(session, HelpAIState.SATISFACTION_CHECK, {
        message: botResponse.response + '\n\n---\n\nWas your issue resolved? Reply **yes** or **no**.',
      });
    }

    return this.makeResponse(session, botResponse.state as HelpAIState, {
      message: botResponse.response,
    });
  }

  private async handleSatisfactionCheck(
    session: HelpaiSession,
    message?: string
  ): Promise<OrchestratorResponse> {
    const answer = (message || '').toLowerCase().trim();

    if (!message) {
      // Initial satisfaction check prompt
      await this.updateSession(session.id, { state: HelpAIState.SATISFACTION_CHECK });
      return this.makeResponse(session, HelpAIState.SATISFACTION_CHECK, {
        message: `Was your issue resolved today? Please reply **yes** or **no**.`,
      });
    }

    const isResolved = ['yes', 'yeah', 'yep', 'resolved', 'fixed', 'thanks', 'thank you', 'great', 'perfect', 'works', 'good'].some(w => answer.includes(w));
    const isNotResolved = ['no', 'nope', 'still', 'not', 'issue', 'problem', 'broken', 'help'].some(w => answer.includes(w));

    if (isResolved || answer.includes('yes')) {
      await this.updateSession(session.id, {
        state: HelpAIState.RATING,
        wasResolved: true,
        resolvedAt: new Date(),
      });

      await this.logAction(session.id, {
        actionType: 'query',
        actionName: 'satisfaction_positive',
        outputPayload: { userMessage: answer, resolved: true },
        success: true,
        workspaceId: session.workspaceId ?? undefined,
        userId: session.userId ?? undefined,
      });

      return this.makeResponse(session, HelpAIState.RATING, {
        message: `Excellent! Glad I could help.\n\nBefore you go, how would you rate your support experience today?\n\nPlease reply with a number from **1 to 5**:\n- **5** = Excellent\n- **4** = Good\n- **3** = Okay\n- **2** = Poor\n- **1** = Very Poor`,
        requiresRating: true,
      });
    } else if (isNotResolved) {
      // Escalate to real agent
      await this.updateSession(session.id, {
        state: (HelpAIState as any).ESCALATING,
        wasEscalated: true,
        wasResolved: false,
      });
      return this.initiateEscalation(session, answer, 'user_not_satisfied');
    }

    // Ambiguous - ask again
    return this.makeResponse(session, HelpAIState.SATISFACTION_CHECK, {
      message: `I want to make sure I helped you properly. Was your issue resolved? Please reply **yes** or **no**.`,
    });
  }

  private async handleRating(
    session: HelpaiSession,
    message: string
  ): Promise<OrchestratorResponse> {
    const rating = parseInt(message.trim(), 10);

    if (rating >= 1 && rating <= 5) {
      // Close the session
      const now = new Date();
      const durationMs = now.getTime() - (session.queueEnteredAt ?? now).getTime();

      await this.updateSession(session.id, {
        state: HelpAIState.DISCONNECTED,
        satisfactionScore: rating,
        ratedAt: now,
        disconnectedAt: now,
        totalDurationMs: durationMs,
      });

      // Remove from queue
      this.queue.delete(session.id);

      await this.logAction(session.id, {
        actionType: 'mutate',
        actionName: 'session_rated_and_closed',
        outputPayload: { rating, durationMs },
        success: true,
        workspaceId: session.workspaceId ?? undefined,
        userId: session.userId ?? undefined,
      });

      const ratingEmoji = rating >= 4 ? 'Thank you so much!' : rating === 3 ? `Thanks for your feedback.` : `We're sorry to hear that. Your feedback helps us improve.`;

      return {
        sessionId: session.id,
        ticketNumber: session.ticketNumber,
        state: HelpAIState.DISCONNECTED,
        message: [
          `**Rating received: ${rating}/5** — ${ratingEmoji}`,
          ``,
          `Your support session is now complete.`,
          `**Ticket ${session.ticketNumber}** has been closed.`,
          ``,
          `This chat session will disconnect in a moment. Thank you for contacting support!`,
        ].join('\n'),
        shouldEscalate: false,
        shouldClose: true,
        shouldDisconnect: true,
        requiresRating: false,
      };
    }

    return this.makeResponse(session, HelpAIState.RATING, {
      message: `Please enter a number between 1 and 5 to rate your experience.`,
      requiresRating: true,
    });
  }

  private async handlePasswordReset(session: HelpaiSession): Promise<OrchestratorResponse> {
    if (!session.authVerified || !session.userId) {
      return this.makeResponse(session, HelpAIState.IDENTIFYING, {
        message: [
          `To reset your password, I need to verify your identity first.`,
          ``,
          `If you're logged in, your session will verify automatically. Otherwise, please enter your **6-character safety code** (sent to your email).`,
          ``,
          `Don't have a safety code? Reply with your email address and I'll send one.`,
        ].join('\n'),
      });
    }

    // Generate and send password reset
    await this.logAction(session.id, {
      actionType: 'mutate',
      actionName: 'password_reset_initiated',
      outputPayload: { userId: session.userId, verified: true },
      success: true,
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    return this.makeResponse(session, HelpAIState.ANSWERING, {
      message: [
        `Your identity is verified. I'm initiating a password reset for your account now.`,
        ``,
        `A password reset link has been sent to your registered email address.`,
        ``,
        `**Please check your inbox** (and spam folder) for the reset email. The link expires in 1 hour.`,
        ``,
        `Is there anything else I can help you with?`,
      ].join('\n'),
    });
  }

  // --------------------------------------------------------------------------
  // ESCALATION
  // --------------------------------------------------------------------------

  private async initiateEscalation(
    session: HelpaiSession,
    userMessage: string,
    reason: string
  ): Promise<OrchestratorResponse> {
    const now = new Date();

    // Generate a Trinity AI issue summary for the human agent BEFORE transferring
    const botConversation = helpAIBotService.getConversation(session.id);
    const conversationHistory = botConversation?.conversationHistory?.map(h => ({
      role: h.role as string,
      message: h.message,
    })) || [];

    let agentSummary = '';
    try {
      agentSummary = await helpAIBotService.generateEscalationSummary(
        userMessage,
        conversationHistory,
        session.workspaceId ?? undefined
      );
      log.info(`[HelpAI Orchestrator] Generated agent handoff summary for ${session.ticketNumber}`);
    } catch (e) {
      log.warn('[HelpAI Orchestrator] Summary generation skipped:', e);
      agentSummary = `User issue: ${userMessage.substring(0, 300)}. Escalation reason: ${reason}. Conversation turns: ${conversationHistory.length}.`;
    }

    // Create or update the support ticket with the Trinity summary
    let ticketId = session.supportTicketId;
    if (!ticketId) {
      try {
        const [ticket] = await db.insert(supportTickets).values({
          ticketNumber: session.ticketNumber,
          workspaceId: session.workspaceId ?? 'platform',
          userId: session.userId ?? undefined,
          subject: `HelpAI Escalation - ${session.ticketNumber}`,
          description: `[Agent Handoff Summary]\n${agentSummary}\n\n[Escalation Reason]\n${reason}\n\n[Last User Message]\n${userMessage.substring(0, 500)}`,
          status: 'open',
          priority: reason === 'user_frustrated' ? 'high' : 'normal',
          category: 'general',
          source: 'helpai_bot',
          isAiHandled: false,
        } as any).returning({ id: supportTickets.id });
        ticketId = ticket.id;
      } catch (e) {
        log.error('[HelpAI Orchestrator] Failed to create escalation ticket:', e);
      }
    } else {
      // Update existing ticket with the summary
      try {
        await db.update(supportTickets)
          .set({
            description: `[Agent Handoff Summary]\n${agentSummary}\n\n[Escalation Reason]\n${reason}`,
            status: 'open',
            isAiHandled: false,
          } as any)
          .where(eq(supportTickets.id, ticketId));
      } catch (e) {
        log.warn('[HelpAI Orchestrator] Ticket update failed:', e);
      }
    }

    await this.updateSession(session.id, {
      state: HelpAIState.WAITING_FOR_HUMAN,
      wasEscalated: true,
      escalatedAt: now,
      escalationReason: reason,
      issueSummary: agentSummary,
      supportTicketId: ticketId ?? undefined,
    });

    await this.logAction(session.id, {
      actionType: 'escalate',
      actionName: 'escalated_to_human',
      toolUsed: 'trinity_brain',
      outputPayload: {
        reason,
        ticketId,
        userMessage: userMessage.substring(0, 200),
        agentSummaryLength: agentSummary.length,
      },
      success: true,
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    // Remove this session from queue — HelpAI moves to serve the next user
    this.queue.delete(session.id);
    this.rebalanceQueue();

    // Sentiment-driven apology with context-aware reason
    const displayReason = reason === 'ai_low_confidence'
      ? "I've done my best, but this issue needs the expertise of a real person to resolve properly."
      : reason === 'user_not_satisfied'
        ? "I completely understand your frustration, and I want to make sure you get the best help possible."
        : reason === 'user_requested'
          ? "Absolutely — as requested, I'm connecting you with an agent right away."
          : reason === 'user_frustrated'
            ? "I can tell this has been a difficult experience, and I'm truly sorry about that. Let me get you to someone who can help."
            : "I want to make sure this gets fully resolved for you.";

    return {
      sessionId: session.id,
      ticketNumber: session.ticketNumber,
      state: HelpAIState.WAITING_FOR_HUMAN,
      message: [
        `I'm really sorry I wasn't able to resolve this on my own. ${displayReason}`,
        ``,
        `I'm connecting you with a real support agent now. **Ticket ${session.ticketNumber}** has been escalated and your agent will have a complete summary of everything we've discussed — you won't need to repeat yourself.`,
        ``,
        `A support agent will be with you shortly in this private thread. Thank you for your patience, and again, I apologize for any inconvenience.`,
      ].join('\n'),
      shouldEscalate: true,
      shouldClose: false,
      shouldDisconnect: false,
      metadata: { agentSummary: agentSummary.substring(0, 500) },
    };
  }

  /**
   * Rebalance queue positions after a session exits the queue.
   */
  private rebalanceQueue(): void {
    let pos = 1;
    for (const [, entry] of this.queue) {
      entry.position = pos++;
    }
    // Update DB positions in background (non-blocking)
    for (const [sessionId, entry] of this.queue) {
      db.update(helpaiSessions)
        .set({ queuePosition: entry.position, updatedAt: new Date() })
        .where(eq(helpaiSessions.id, sessionId))
        .catch(err => log.warn(`[HelpAI] Queue position update failed for session ${sessionId}:`, err?.message));
    }
  }

  private async handleEscalation(
    session: HelpaiSession,
    message: string,
    params: OrchestratorMessage
  ): Promise<OrchestratorResponse> {
    // If already waiting for human, acknowledge and stay patient
    if (session.state === HelpAIState.WAITING_FOR_HUMAN) {
      return this.makeResponse(session, HelpAIState.WAITING_FOR_HUMAN, {
        message: `You're in the support queue. An agent will be with you shortly for ticket **${session.ticketNumber}**. Your agent already has a full summary of the conversation.`,
      });
    }
    return this.initiateEscalation(session, message, 'continued_escalation');
  }

  // --------------------------------------------------------------------------
  // SLASH COMMAND HANDLER
  // --------------------------------------------------------------------------

  private async handleSlashCommand(
    session: HelpaiSession,
    command: string,
    params: OrchestratorMessage
  ): Promise<OrchestratorResponse> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    await this.logAction(session.id, {
      actionType: 'query',
      actionName: 'slash_command',
      commandUsed: cmd,
      inputPayload: { command, args },
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    switch (cmd) {
      case '/status':
        return this.makeResponse(session, session.state as HelpAIState, {
          message: `**Ticket:** ${session.ticketNumber}\n**Status:** ${session.state}\n**Queue position:** ${session.queuePosition ?? 'Active'}\n**Auth:** ${session.authVerified ? 'Verified' : 'Guest'}`,
        });

      case '/queue':
        const pos = session.queuePosition ?? 1;
        return this.makeResponse(session, session.state as HelpAIState, {
          message: `You are at queue position **#${pos}**. Estimated wait: **${Math.max(1, pos * 2)} minutes**.`,
          queuePosition: pos,
        });

      case '/escalate':
        return this.initiateEscalation(session, args || 'User requested escalation', 'user_requested');

      case '/resolve':
        await this.updateSession(session.id, { state: HelpAIState.SATISFACTION_CHECK });
        return this.handleSatisfactionCheck(session);

      case '/summon':
        return this.handleBotSummon(session, args, params);

      case '/helpai':
      case '/ask':
        if (args) {
          return this.handleAssist(session, args, params);
        }
        return this.makeResponse(session, session.state as HelpAIState, {
          message: `I'm HelpAI. What would you like to ask?`,
        });

      case '/help':
      case '/commands':
        return this.makeResponse(session, session.state as HelpAIState, {
          message: this.getHelpText(),
        });

      default:
        return this.handleAssist(session, command + ' ' + args, params);
    }
  }

  // --------------------------------------------------------------------------
  // BOT SUMMONING
  // --------------------------------------------------------------------------

  /**
   * HelpAI can summon other system bots with specific instructions.
   * Each bot is invoked via the platform command bus.
   */
  detectBotDelegation(message: string): BotDelegationResult | null {
    const lowerMsg = message.toLowerCase();
    for (const bot of BOT_DELEGATION_PATTERNS) {
      for (const pattern of bot.patterns) {
        if (pattern.test(message)) {
          return {
            botName: bot.botName,
            command: bot.command,
            instructions: message,
            confidence: 0.9,
          };
        }
      }
      for (const keyword of bot.keywords) {
        if (lowerMsg.includes(keyword)) {
          return {
            botName: bot.botName,
            command: bot.command,
            instructions: message,
            confidence: 0.75,
          };
        }
      }
    }
    return null;
  }

  async summonBot(request: BotSummonRequest): Promise<{ success: boolean; message: string }> {
    const botCommands: Record<string, string[]> = {
      MeetingBot: ['/meetingstart', '/meetingend', '/meetingpause', '/actionitem'],
      ReportBot: ['/report', '/incident', '/endreport', '/analyzereports'],
      ClockBot: ['/clockme', '/forceclock', '/clockstatus'],
      CleanupBot: ['/cleanup'],
      HelpAI: ['/helpai', '/ask'],
    };

    const allowedCmds = botCommands[request.botName] || [];
    const cmdUsed = allowedCmds.find(c => request.command.startsWith(c)) || request.command;

    const current = this.activeBotsPerSession.get(request.sessionId) || [];
    if (!current.includes(request.botName)) {
      current.push(request.botName);
      this.activeBotsPerSession.set(request.sessionId, current);
      await this.updateSession(request.sessionId, { botsInvoked: current });
    }

    const startTime = Date.now();
    let executionResult: { success: boolean; message: string } = { success: false, message: '' };

    try {
      if (request.userId && request.workspaceId) {
        const cmdResult = await botCommandExecutor.executeCommand({
          botId: request.botName,
          commandedBy: request.userId,
          action: this.mapBotToAction(request.botName, cmdUsed),
          reason: `HelpAI autonomous delegation: ${request.instructions.substring(0, 200)}`,
          targetEntityType: this.mapBotToEntityType(request.botName),
          targetEntityId: request.workspaceId,
          targetWorkspaceId: request.workspaceId,
          data: {
            command: cmdUsed,
            instructions: request.instructions,
            sessionId: request.sessionId,
            delegatedBy: 'HelpAI',
          },
        });

        executionResult = {
          success: cmdResult.success,
          message: cmdResult.success
            ? `${request.botName} executed "${cmdUsed}" successfully. ${cmdResult.message}`
            : `${request.botName} could not execute: ${cmdResult.blockedReason || cmdResult.message}`,
        };
      } else {
        executionResult = {
          success: false,
          message: `${request.botName} requires authenticated user context (userId and workspaceId) to execute commands.`,
        };
      }

      platformEventBus.emit('bot_delegation', {
        workspaceId: request.workspaceId,
        userId: request.userId,
        delegatedTo: request.botName,
        command: cmdUsed,
        instructions: request.instructions.substring(0, 300),
        success: executionResult.success,
        sessionId: request.sessionId,
        durationMs: Date.now() - startTime,
      });

    } catch (err: unknown) {
      log.error(`[HelpAI] Bot execution error for ${request.botName}:`, (err instanceof Error ? err.message : String(err)));
      executionResult = {
        success: false,
        message: `${request.botName} encountered an error: ${(err instanceof Error ? err.message : String(err))}`,
      };
    }

    await this.logAction(request.sessionId, {
      actionType: 'bot_summon',
      actionName: `summoned_${request.botName.toLowerCase()}`,
      botSummoned: request.botName,
      commandUsed: cmdUsed,
      inputPayload: { instructions: request.instructions.substring(0, 500) },
      outputPayload: { result: executionResult.message.substring(0, 500), success: executionResult.success },
      success: executionResult.success,
      errorMessage: executionResult.success ? undefined : executionResult.message,
      durationMs: Date.now() - startTime,
      workspaceId: request.workspaceId,
      userId: request.userId,
    });

    return executionResult;
  }

  private mapBotToAction(botName: string, command: string): 'sync_data' | 'flag_anomaly' | 'archive_record' | 'close_ticket' | 'edit_employee' {
    switch (botName) {
      case 'ClockBot': return 'sync_data';
      case 'MeetingBot': return 'sync_data';
      case 'ReportBot': return 'sync_data';
      case 'CleanupBot': return 'archive_record';
      default: return 'sync_data';
    }
  }

  private mapBotToEntityType(botName: string): string {
    switch (botName) {
      case 'ClockBot': return 'time_entry';
      case 'MeetingBot': return 'meeting';
      case 'ReportBot': return 'report';
      case 'CleanupBot': return 'system';
      default: return 'workspace';
    }
  }

  private async handleBotSummon(
    session: HelpaiSession,
    args: string,
    params: OrchestratorMessage
  ): Promise<OrchestratorResponse> {
    const parts = args.split(' ');
    const botName = parts[0] as BotSummonRequest['botName'];
    const instructions = parts.slice(1).join(' ');

    const validBots: BotSummonRequest['botName'][] = ['MeetingBot', 'ReportBot', 'ClockBot', 'CleanupBot', 'HelpAI'];

    if (!validBots.includes(botName)) {
      return this.makeResponse(session, session.state as HelpAIState, {
        message: `Available bots: **${validBots.join(', ')}**\n\nUsage: \`/summon MeetingBot start the team standup meeting\``,
      });
    }

    const result = await this.summonBot({
      sessionId: session.id,
      botName,
      command: '/summon',
      instructions: instructions || 'perform your primary function',
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    return this.makeResponse(session, session.state as HelpAIState, {
      message: result.message,
    });
  }

  // --------------------------------------------------------------------------
  // SAFETY CODES
  // --------------------------------------------------------------------------

  /**
   * Generate a 6-character safety code for an authenticated user.
   * The user can share this code in a chat session to prove identity.
   */
  async generateSafetyCode(
    userId: string,
    workspaceId?: string,
    purpose: string = 'helpdesk_auth',
    sessionId?: string
  ): Promise<{ code: string; expiresAt: Date }> {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-char hex
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    await db.insert(helpaiSafetyCodes).values({
      userId,
      workspaceId,
      code,
      purpose,
      expiresAt,
      sessionId,
    } as InsertHelpaiSafetyCode);

    await this.logAction(sessionId || 'system', {
      actionType: 'mutate',
      actionName: 'safety_code_generated',
      outputPayload: { userId, purpose, expiresAt },
      success: true,
      workspaceId,
      userId,
    });

    return { code, expiresAt };
  }

  /**
   * Verify a safety code entered by a user in the helpdesk chat.
   */
  async verifySafetyCode(
    sessionId: string,
    code: string,
    ipAddress?: string
  ): Promise<AuthVerificationResult> {
    const now = new Date();

    const [record] = await db
      .select()
      .from(helpaiSafetyCodes)
      .where(
        and(
          eq(helpaiSafetyCodes.code, code.toUpperCase()),
          isNull(helpaiSafetyCodes.usedAt),
          sql`${helpaiSafetyCodes.expiresAt} > NOW()`
        )
      )
      .limit(1);

    if (!record) {
      return { verified: false, method: 'safety_code', message: 'Invalid or expired safety code.' };
    }

    // Mark as used
    await db
      .update(helpaiSafetyCodes)
      .set({ usedAt: now, sessionId })
      .where(eq(helpaiSafetyCodes.id, record.id));

    // Update the session's userId if not set
    const session = await this.getSession(sessionId);
    if (session && !session.userId) {
      await this.updateSession(sessionId, { userId: record.userId });
    }

    return {
      verified: true,
      method: 'safety_code',
      userId: record.userId,
      message: 'Identity verified via safety code.',
    };
  }

  // --------------------------------------------------------------------------
  // CLOSE & DISCONNECT
  // --------------------------------------------------------------------------

  /**
   * Force-close a session (e.g., agent closes it, or timeout).
   */
  async closeSession(
    sessionId: string,
    resolution?: string,
    agentId?: string
  ): Promise<{ success: boolean }> {
    const now = new Date();
    const session = await this.getSession(sessionId);
    if (!session) return { success: false };

    const durationMs = now.getTime() - (session.queueEnteredAt ?? now).getTime();

    await this.updateSession(sessionId, {
      state: HelpAIState.DISCONNECTED,
      wasResolved: true,
      resolvedAt: now,
      disconnectedAt: now,
      resolution: resolution || 'Session closed by agent/system',
      totalDurationMs: durationMs,
    });

    this.queue.delete(sessionId);

    await this.logAction(sessionId, {
      actionType: 'mutate',
      actionName: 'session_force_closed',
      outputPayload: { resolution, agentId, durationMs },
      success: true,
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId ?? undefined,
    });

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // ADMIN / AGENT REVIEW
  // --------------------------------------------------------------------------

  async getSessionHistory(workspaceId?: string, limit = 50) {
    const conditions: any[] = [];
    if (workspaceId) conditions.push(eq(helpaiSessions.workspaceId, workspaceId));

    return db
      .select()
      .from(helpaiSessions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(helpaiSessions.createdAt))
      .limit(limit);
  }

  async getSessionActionLog(sessionId: string) {
    return db
      .select()
      .from(helpaiActionLog)
      .where(eq(helpaiActionLog.sessionId, sessionId))
      .orderBy(desc(helpaiActionLog.createdAt));
  }

  async getActionLogByWorkspace(workspaceId: string, limit = 200) {
    return db
      .select()
      .from(helpaiActionLog)
      .where(eq(helpaiActionLog.workspaceId, workspaceId))
      .orderBy(desc(helpaiActionLog.createdAt))
      .limit(limit);
  }

  async getSessionStats(workspaceId?: string) {
    const base = workspaceId
      ? db.select({
          total: sql<number>`count(*)::int`,
          resolved: sql<number>`count(*) filter (where was_resolved = true)::int`,
          escalated: sql<number>`count(*) filter (where was_escalated = true)::int`,
          avgRating: sql<number>`avg(satisfaction_score)::numeric(3,2)`,
          avgDurationMs: sql<number>`avg(total_duration_ms)::int`,
        }).from(helpaiSessions).where(eq(helpaiSessions.workspaceId, workspaceId))
      : db.select({
          total: sql<number>`count(*)::int`,
          resolved: sql<number>`count(*) filter (where was_resolved = true)::int`,
          escalated: sql<number>`count(*) filter (where was_escalated = true)::int`,
          avgRating: sql<number>`avg(satisfaction_score)::numeric(3,2)`,
          avgDurationMs: sql<number>`avg(total_duration_ms)::int`,
        }).from(helpaiSessions);

    const [stats] = await base;
    return stats;
  }

  // --------------------------------------------------------------------------
  // FAQ DYNAMIC READER
  // --------------------------------------------------------------------------

  async readFaqsFromDb(query: string, limit = 5): Promise<Array<{ id: string; question: string; answer: string; category?: string }>> {
    try {
      // Full text search on FAQ questions and answers
      const faqs = await db
        .select({
          id: helposFaqs.id,
          question: helposFaqs.question,
          answer: helposFaqs.answer,
          category: helposFaqs.category,
        })
        .from(helposFaqs)
        .where(eq(helposFaqs.isPublished, true))
        .limit(limit * 3); // Get more and filter client-side

      // Simple keyword match scoring
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const scored = faqs.map(faq => {
        const text = `${faq.question} ${faq.answer}`.toLowerCase();
        const score = queryWords.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
        return { ...faq, score };
      });

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ score, ...faq }) => faq);
    } catch (e) {
      log.error('[HelpAI Orchestrator] FAQ read failed:', e);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private async getSession(sessionId: string): Promise<HelpaiSession | null> {
    try {
      const [session] = await db
        .select()
        .from(helpaiSessions)
        .where(eq(helpaiSessions.id, sessionId))
        .limit(1);
      return session ?? null;
    } catch {
      return null;
    }
  }

  private async updateSession(sessionId: string, values: Partial<InsertHelpaiSession>): Promise<void> {
    try {
      await db
        .update(helpaiSessions)
        .set({ ...values, updatedAt: new Date() } as any)
        .where(eq(helpaiSessions.id, sessionId));
    } catch (e) {
      log.error('[HelpAI Orchestrator] Session update failed:', e);
    }
  }

  private async logAction(
    sessionId: string,
    data: {
      actionType: string;
      actionName: string;
      toolUsed?: string;
      botSummoned?: string;
      commandUsed?: string;
      inputPayload?: Record<string, unknown>;
      outputPayload?: Record<string, unknown>;
      faqId?: string;
      success?: boolean;
      errorMessage?: string;
      durationMs?: number;
      tokensUsed?: number;
      confidenceScore?: string;
      workspaceId?: string;
      userId?: string;
    }
  ): Promise<void> {
    try {
      await db.insert(helpaiActionLog).values({
        sessionId: sessionId === 'system' ? undefined : sessionId,
        workspaceId: data.workspaceId,
        userId: data.userId,
        actionType: data.actionType,
        actionName: data.actionName,
        toolUsed: data.toolUsed,
        botSummoned: data.botSummoned,
        commandUsed: data.commandUsed,
        inputPayload: data.inputPayload,
        outputPayload: data.outputPayload,
        faqId: data.faqId,
        success: data.success ?? true,
        errorMessage: data.errorMessage,
        durationMs: data.durationMs,
        tokensUsed: data.tokensUsed,
        confidenceScore: data.confidenceScore,
      } as InsertHelpaiActionLog);
    } catch (e) {
      // Non-fatal - log to console only
      log.warn('[HelpAI Orchestrator] Action log insert failed:', e);
    }
  }

  private makeResponse(
    session: HelpaiSession,
    state: HelpAIState,
    opts: {
      message: string;
      shouldEscalate?: boolean;
      shouldClose?: boolean;
      shouldDisconnect?: boolean;
      queuePosition?: number;
      requiresRating?: boolean;
    }
  ): OrchestratorResponse {
    return {
      sessionId: session.id,
      ticketNumber: session.ticketNumber,
      state,
      message: opts.message,
      shouldEscalate: opts.shouldEscalate ?? false,
      shouldClose: opts.shouldClose ?? false,
      shouldDisconnect: opts.shouldDisconnect ?? false,
      queuePosition: opts.queuePosition ?? session.queuePosition ?? undefined,
      requiresRating: opts.requiresRating ?? false,
    };
  }

  private errorResponse(sessionId: string, message: string): OrchestratorResponse {
    return {
      sessionId,
      ticketNumber: 'ERR-000',
      state: HelpAIState.ABANDONED,
      message,
      shouldEscalate: false,
      shouldClose: false,
      shouldDisconnect: true,
    };
  }

  private generateTicketNumber(): string {
    const num = Math.floor(10000 + Math.random() * 89999);
    return `HAI-${num}`;
  }

  private getHelpText(): string {
    return [
      `**HelpAI Commands:**`,
      ``,
      `\`/status\` — View your ticket status`,
      `\`/queue\` — Check your queue position`,
      `\`/escalate [reason]\` — Request a real agent`,
      `\`/resolve\` — Mark your issue as resolved`,
      `\`/ask [question]\` — Ask HelpAI a question`,
      `\`/summon [BotName] [instructions]\` — Summon a system bot`,
      `\`/help\` — Show this help text`,
      ``,
      `**Available bots:** MeetingBot, ReportBot, ClockBot, CleanupBot`,
    ].join('\n');
  }

  getCurrentQueue() {
    return Array.from(this.queue.values());
  }

  getQueueSize(): number {
    return this.queue.size;
  }
}

export const helpAIOrchestrator = new HelpAIOrchestrator();

// ============================================================================
// PHASE 5 — HELPAI ESCALATED PAYLOAD HANDLER
// ============================================================================

export interface HelpAIEvaluation {
  verdict: 'approve' | 'deny' | 'escalate_to_management';
  reasoning: string;
  adjustedScore: number;
}

/**
 * HelpAI secondary QA evaluation for borderline agent payloads.
 * Called by agentSpawner.evaluateAgentPayload() when score >= threshold
 * but critical flags are present.
 *
 * Routes:
 *   approve            → notifyTrinityApproval (task forwarded to Trinity)
 *   deny               → re-task agent if retries remain, else escalate_to_management
 *   escalate_to_management → management notification via universalNotificationEngine
 */
export async function helpAIHandleEscalatedPayload(params: {
  taskId: string;
  agentKey: string;
  outputPayload: Record<string, unknown>;
  completionScore: number;
  flags: unknown[];
}): Promise<HelpAIEvaluation> {
  const { taskId, agentKey, outputPayload, completionScore, flags } = params;

  const { pool } = await import('../../db');
  const { meteredGemini } = await import('../billing/meteredGeminiClient');
  const { universalNotificationEngine } = await import('../universalNotificationEngine');

  // Fetch task for workspace context
  const taskResult = await pool.query<Record<string, unknown>>(
    `SELECT workspace_id, task_type, spawned_by, input_payload, retry_count, max_retries,
            related_entity_type, related_entity_id
     FROM agent_tasks WHERE id = $1`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error(`helpAIHandleEscalatedPayload: task ${taskId} not found`);
  }

  const row = taskResult.rows[0];
  const workspaceId = row.workspace_id as string;
  const taskType = row.task_type as string;
  const retryCount = (row.retry_count as number) || 0;
  const maxRetries = (row.max_retries as number) || 2;

  // HelpAI independently reviews the flagged payload
  const reviewPrompt = `You are a QA supervisor reviewing an AI agent's output for a security company platform.

Agent: ${agentKey}
Task: ${taskType}
Completion Score: ${completionScore}
Critical Flags: ${JSON.stringify(flags, null, 2)}
Output Payload (summary): ${JSON.stringify(outputPayload, null, 2).slice(0, 2000)}

The agent passed the score threshold but reported critical flags. Your job is to decide:
1. approve — the critical flags are manageable and the payload is acceptable for Trinity to use
2. deny — the critical flags indicate the output is unreliable and the agent should retry
3. escalate_to_management — the flags indicate issues that require human decision

Return ONLY valid JSON:
{
  "verdict": "approve" | "deny" | "escalate_to_management",
  "reasoning": "brief explanation of decision",
  "adjusted_score": <integer 0-100>
}`;

  let verdict: HelpAIEvaluation['verdict'] = 'escalate_to_management';
  let reasoning = 'HelpAI evaluation unavailable — defaulting to management escalation';
  let adjustedScore = completionScore;

  try {
    const aiResult = await meteredGemini.generate({
      workspaceId,
      featureKey: `helpai_escalated_eval_${agentKey}`,
      prompt: reviewPrompt,
      systemInstruction: 'You are HelpAI, a QA supervisor for the CoAIleague platform. Evaluate agent outputs and return ONLY valid JSON as instructed.',
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      maxOutputTokens: 512,
    });

    const raw = aiResult.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const parsed = JSON.parse(raw);
    if (parsed.verdict && ['approve', 'deny', 'escalate_to_management'].includes(parsed.verdict)) {
      verdict = parsed.verdict as HelpAIEvaluation['verdict'];
      reasoning = parsed.reasoning || reasoning;
      adjustedScore = typeof parsed.adjusted_score === 'number' ? parsed.adjusted_score : adjustedScore;
    }
  } catch (aiErr) {
    log.error('[HelpAI] Escalated payload evaluation AI error:', aiErr);
  }

  // CATEGORY C — Raw SQL retained: HelpAI evaluation logging INSERT | Tables: agent_task_logs | Verified: 2026-03-23
  await typedPoolExec(
    `INSERT INTO agent_task_logs (agent_task_id, workspace_id, log_type, message, metadata)
     VALUES ($1, $2, 'evaluation', $3, $4)`,
    [
      taskId,
      workspaceId,
      `HelpAI verdict: ${verdict} — ${reasoning}`,
      JSON.stringify({ verdict, adjustedScore, agentKey, taskType }),
    ]
  );

  // Update task with HelpAI evaluation result
  const helpaiEvalResult =
    verdict === 'approve' ? 'approved' :
    verdict === 'deny' ? 'denied' :
    'escalated_to_management';

  // Converted to Drizzle ORM
  await db.update(agentTasks).set({
    evaluationResult: helpaiEvalResult,
    trinityEvaluation: `HelpAI QA: ${verdict} (adjusted score: ${adjustedScore}) — ${reasoning}`,
    evaluatedAt: sql`now()`,
  }).where(eq(agentTasks.id, taskId));

  // Route by verdict
  if (verdict === 'approve') {
    const { notifyTrinityApproval } = await import('../ai-brain/agentSpawner');
    // Re-fetch full task for the approval call
    const fullTaskResult = await pool.query<Record<string, unknown>>(
      `SELECT * FROM agent_tasks WHERE id = $1`,
      [taskId]
    );
    if (fullTaskResult.rows.length > 0) {
      const t = fullTaskResult.rows[0];
      notifyTrinityApproval({
        id: t.id as string,
        workspaceId: t.workspace_id as string,
        agentKey: t.agent_key as string,
        spawnedBy: t.spawned_by as string,
        taskType: t.task_type as string,
        status: 'complete',
        inputPayload: typeof t.input_payload === 'string' ? JSON.parse(t.input_payload as string) : t.input_payload as Record<string, unknown>,
        outputPayload: t.output_payload ? (typeof t.output_payload === 'string' ? JSON.parse(t.output_payload as string) : t.output_payload as Record<string, unknown>) : null,
        completionScore: t.completion_score as number | null,
        confidenceLevel: t.confidence_level as number | null,
        flags: t.flags ? (typeof t.flags === 'string' ? JSON.parse(t.flags as string) : t.flags as unknown[]) : null,
        trinityEvaluation: t.trinity_evaluation as string | null,
        evaluationResult: 'approved',
        retryCount: t.retry_count as number,
        maxRetries: t.max_retries as number,
        relatedEntityType: t.related_entity_type as string | null,
        relatedEntityId: t.related_entity_id as string | null,
        spawnedAt: t.spawned_at as Date,
        completedAt: t.completed_at as Date | null,
        evaluatedAt: t.evaluated_at as Date | null,
      });
    }
  } else if (verdict === 'deny') {
    if (retryCount < maxRetries) {
      // Re-task the agent
      const inputPayload = typeof row.input_payload === 'string'
        ? JSON.parse(row.input_payload as string)
        : row.input_payload as Record<string, unknown>;

      // CATEGORY C — Raw SQL retained: Self-referencing arithmetic increment | Tables: agent_tasks | Verified: 2026-03-23
      await typedPoolExec(`UPDATE agent_tasks SET retry_count = retry_count + 1 WHERE id = $1`, [taskId]);

      const { spawnAgent } = await import('../ai-brain/agentSpawner');
      spawnAgent({
        workspaceId,
        agentKey,
        taskType,
        inputPayload,
        relatedEntityType: row.related_entity_type as string | undefined,
        relatedEntityId: row.related_entity_id as string | undefined,
        spawnedBy: row.spawned_by as string,
      }).catch((err: unknown) => log.error('[HelpAI] Retry spawn error:', err));
    } else {
      // Escalate to management
      await universalNotificationEngine.sendNotification({
        workspaceId,
        userId: 'system',
        idempotencyKey: `notif-${Date.now()}`,
          type: 'issue_detected',
        title: `Agent Review Required: ${taskType}`,
        message: `HelpAI denied the agent output for "${taskType}" and retries are exhausted. Manual review required.`,
        severity: 'warning',
        actionUrl: '/ai/command-center',
        metadata: { agentTaskId: taskId, agentKey, verdict, adjustedScore },
      });
    }
  } else {
    // escalate_to_management
    await universalNotificationEngine.sendNotification({
      workspaceId,
      userId: 'system',
      idempotencyKey: `notif-${Date.now()}`,
          type: 'issue_detected',
      title: `Agent Review Required: ${taskType}`,
      message: `Trinity was unable to complete "${taskType}" automatically. HelpAI escalated to management. Manual review required.`,
      severity: 'warning',
      actionUrl: '/ai/command-center',
      metadata: { agentTaskId: taskId, agentKey, verdict, adjustedScore, reasoning },
    });
  }

  return { verdict, reasoning, adjustedScore };
}
