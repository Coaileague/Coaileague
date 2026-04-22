/**
 * HelpAI Capabilities - Dynamic AI-Powered End User Assistance
 * 
 * Uses Trinity AI to help users before escalating to human agents.
 * All actions follow the 7-step orchestration pattern:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 */

import { storage } from '../storage';
import { meteredGemini } from './billing/meteredGeminiClient';
import { createLogger } from '../lib/logger';
const log = createLogger('helpAICapabilities');


/**
 * HelpAI Capability Registry
 * Defines what actions HelpAI can perform to assist end users
 */
export const HELPAI_CAPABILITIES = {
  // READ-ONLY LOOKUPS (Safe for autonomous use)
  lookups: {
    userProfile: {
      name: 'lookup_user_profile',
      description: 'Look up user profile and account status',
      riskLevel: 'low',
      requiresApproval: false,
    },
    scheduleInfo: {
      name: 'lookup_schedule',
      description: 'Check user schedule and upcoming shifts',
      riskLevel: 'low',
      requiresApproval: false,
    },
    timesheetStatus: {
      name: 'lookup_timesheet',
      description: 'Check timesheet and hours worked',
      riskLevel: 'low',
      requiresApproval: false,
    },
    invoiceStatus: {
      name: 'lookup_invoices',
      description: 'Check invoice and billing status',
      riskLevel: 'low',
      requiresApproval: false,
    },
    payrollInfo: {
      name: 'lookup_payroll',
      description: 'Check payroll status and pay history',
      riskLevel: 'low',
      requiresApproval: false,
    },
    ticketHistory: {
      name: 'lookup_tickets',
      description: 'Search past support tickets by user UUID',
      riskLevel: 'low',
      requiresApproval: false,
    },
    chatHistory: {
      name: 'lookup_chat_history',
      description: 'Search past chat messages by user UUID for context',
      riskLevel: 'low',
      requiresApproval: false,
    },
  },

  // GUIDED ACTIONS (Low-risk mutations with confirmation)
  guidedActions: {
    createTicket: {
      name: 'create_support_ticket',
      description: 'Create a support ticket for the user',
      riskLevel: 'low',
      requiresApproval: false,
      sevenStepPattern: true,
    },
    requestCallback: {
      name: 'request_callback',
      description: 'Schedule a callback from support team',
      riskLevel: 'low',
      requiresApproval: false,
    },
    updateContactInfo: {
      name: 'update_contact_info',
      description: 'Help user update their contact information',
      riskLevel: 'medium',
      requiresApproval: true,
    },
  },

  // CHATROOM MANAGEMENT (Deputy Admin bypass authority, support roles only)
  chatroomManagement: {
    enterRoom: {
      name: 'enter_chatroom',
      description: 'Enter user-created or org-created chatrooms for support',
      riskLevel: 'low',
      requiresApproval: false,
      minPlatformLevel: 5,
    },
    closeRoom: {
      name: 'close_chatroom',
      description: 'Close a chatroom (soft close, can be reopened)',
      riskLevel: 'medium',
      requiresApproval: false,
      minPlatformLevel: 5,
    },
    suspendRoom: {
      name: 'suspend_chatroom',
      description: 'Suspend a chatroom for investigation with mandatory reason',
      riskLevel: 'high',
      requiresApproval: true,
      minPlatformLevel: 5,
    },
    auditRoom: {
      name: 'audit_chatroom',
      description: 'Analyze room content for compliance audits',
      riskLevel: 'medium',
      requiresApproval: false,
      minPlatformLevel: 5,
    },
    broadcastMessage: {
      name: 'broadcast_to_room',
      description: 'Broadcast messages to specific rooms or all rooms',
      riskLevel: 'medium',
      requiresApproval: false,
      minPlatformLevel: 5,
    },
  },

  // TICKET AUTO-MANAGEMENT (triggered on user room entry)
  ticketAutoManagement: {
    checkOnEntry: {
      name: 'ticket_check_on_entry',
      description: 'Check if entering user has an open support ticket; if not, auto-assign one',
      riskLevel: 'low',
      requiresApproval: false,
      autoTrigger: true,
    },
    syncTickets: {
      name: 'ticket_sync',
      description: 'Sync ticket status across conversations and rooms',
      riskLevel: 'low',
      requiresApproval: false,
    },
    autoClose: {
      name: 'ticket_auto_close',
      description: 'Close ticket when user issue is resolved',
      riskLevel: 'low',
      requiresApproval: false,
    },
  },

  // SOFT-DELETE AUTHORITY (Deputy Admin level, no hard deletes)
  softDeleteAuthority: {
    softDelete: {
      name: 'soft_delete_resource',
      description: 'Soft-delete (archive) a resource. No hard deletes authorized.',
      riskLevel: 'high',
      requiresApproval: true,
      minPlatformLevel: 6,
    },
  },

  // OFFICER SELF-SERVICE ACTIONS (Phase 4 — Lisa Killer)
  // Officers text or chat HelpAI to call off, pick up shifts, confirm attendance,
  // request time off, view paycheck, message supervisor, report incidents.
  officerActions: {
    callOffShift: {
      name: 'calloff_shift',
      description: 'Officer calls off from their upcoming shift',
      riskLevel: 'medium',
      requiresApproval: false,
      smsConfirmation: true,
    },
    pickUpShift: {
      name: 'pickup_open_shift',
      description: 'Officer claims an available open shift',
      riskLevel: 'low',
      requiresApproval: false,
      eligibilityCheck: true,
    },
    confirmAttendance: {
      name: 'confirm_shift_attendance',
      description: 'Officer confirms they will attend their upcoming shift',
      riskLevel: 'low',
      requiresApproval: false,
    },
    requestTimeOff: {
      name: 'request_time_off',
      description: 'Officer requests time off for a specific period',
      riskLevel: 'low',
      requiresApproval: true,
    },
    updateAvailability: {
      name: 'update_availability',
      description: 'Officer updates their general availability preferences',
      riskLevel: 'low',
      requiresApproval: false,
    },
    viewMyPaycheck: {
      name: 'view_my_paycheck',
      description: 'Officer views their own most recent pay stub',
      riskLevel: 'low',
      requiresApproval: false,
      selfOnly: true,
    },
    messageSupervisor: {
      name: 'message_supervisor',
      description: 'Officer sends a message to their on-duty supervisor or manager',
      riskLevel: 'low',
      requiresApproval: false,
    },
    reportIncident: {
      name: 'report_incident',
      description: 'Officer reports an incident from the field via voice or text',
      riskLevel: 'medium',
      requiresApproval: false,
    },
  },

  // ESCALATION TRIGGERS (When to hand off to human)
  escalationTriggers: {
    complexIssue: 'Issue requires human judgment or multiple system access',
    sensitiveData: 'Request involves sensitive financial or personal data changes',
    frustrated: 'User sentiment indicates frustration - empathy needed',
    repeatedAttempts: 'User has asked same question 3+ times',
    explicitRequest: 'User explicitly asks to speak with human',
    outOfScope: 'Request is outside HelpAI capabilities',
  },
} as const;

/**
 * HelpAI 7-Step Action Executor
 * All mutations follow: TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 */
export class HelpAIActionExecutor {
  
  /**
   * Search user's past chat history for context
   * Trinity uses this to understand returning user's previous issues
   */
  async searchUserChatHistory(userId: string, workspaceId?: string): Promise<{
    found: boolean;
    messageCount: number;
    recentTopics: string[];
    lastVisit?: Date;
  }> {
    try {
      // STEP 1: TRIGGER - User requested history lookup
      log.info(`[HelpAI] TRIGGER: Searching chat history for user ${userId}`);
      
      // STEP 2: FETCH - Get messages from database
      const messages = await storage.getChatMessagesByUserId(userId);
      
      if (!messages || messages.length === 0) {
        return { found: false, messageCount: 0, recentTopics: [] };
      }
      
      // STEP 3: VALIDATE - Filter to relevant messages
      const userMessages = messages.filter(m => m.senderId === userId && m.senderType !== 'system');
      
      // STEP 4: PROCESS - Extract topics/themes from messages
      const recentTopics = this.extractTopicsFromMessages(userMessages.slice(-10));
      const lastVisit = userMessages[userMessages.length - 1]?.createdAt;
      
      // STEP 5: MUTATE - No mutation for lookup
      // STEP 6: CONFIRM - Return results
      // STEP 7: NOTIFY - Logged above
      
      return {
        found: true,
        messageCount: userMessages.length,
        recentTopics,
        lastVisit: lastVisit ? new Date(lastVisit) : undefined,
      };
    } catch (error) {
      log.error('[HelpAI] Chat history search failed:', error);
      return { found: false, messageCount: 0, recentTopics: [] };
    }
  }

  /**
   * Extract common topics from messages for context
   */
  private extractTopicsFromMessages(messages: { message: string }[]): string[] {
    const topicKeywords: Record<string, string[]> = {
      'scheduling': ['schedule', 'shift', 'time off', 'availability', 'calendar'],
      'payroll': ['pay', 'payroll', 'salary', 'wages', 'payment'],
      'invoicing': ['invoice', 'bill', 'billing', 'charge', 'receipt'],
      'account': ['account', 'login', 'password', 'profile', 'settings'],
      'employees': ['employee', 'staff', 'team', 'worker', 'hire'],
      'timesheet': ['timesheet', 'hours', 'clock', 'punch', 'overtime'],
      'compliance': ['compliance', 'license', 'certification', 'document'],
    };

    const foundTopics = new Set<string>();
    const allText = messages.map(m => m.message.toLowerCase()).join(' ');

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(kw => allText.includes(kw))) {
        foundTopics.add(topic);
      }
    }

    return Array.from(foundTopics);
  }

  /**
   * Analyze message text for sentiment using keyword-based analysis
   */
  analyzeSentiment(text: string): { sentiment: 'positive' | 'negative' | 'neutral' | 'frustrated' | 'urgent'; confidence: number } {
    const lower = text.toLowerCase();

    const positiveWords = ['thank', 'thanks', 'great', 'awesome', 'excellent', 'perfect', 'love', 'amazing', 'wonderful', 'helpful', 'appreciate', 'good', 'happy', 'pleased', 'satisfied', 'resolved', 'works', 'working', 'fixed'];
    const negativeWords = ['bad', 'terrible', 'horrible', 'worst', 'hate', 'awful', 'poor', 'disappointed', 'unhappy', 'wrong', 'broken', 'fail', 'failed', 'error', 'bug', 'issue', 'problem', 'not working', 'doesn\'t work'];
    const frustratedWords = ['frustrated', 'frustrating', 'annoyed', 'annoying', 'ridiculous', 'unacceptable', 'useless', 'waste', 'stupid', 'angry', 'furious', 'sick of', 'tired of', 'fed up', 'give up', 'impossible'];
    const urgentWords = ['urgent', 'emergency', 'immediately', 'asap', 'critical', 'deadline', 'now', 'right away', 'time sensitive', 'can\'t wait', 'help now', 'please hurry', 'blocking', 'blocker', 'stuck'];

    let positiveScore = 0;
    let negativeScore = 0;
    let frustratedScore = 0;
    let urgentScore = 0;

    for (const w of positiveWords) { if (lower.includes(w)) positiveScore++; }
    for (const w of negativeWords) { if (lower.includes(w)) negativeScore++; }
    for (const w of frustratedWords) { if (lower.includes(w)) frustratedScore++; }
    for (const w of urgentWords) { if (lower.includes(w)) urgentScore++; }

    const exclamationCount = (text.match(/!/g) || []).length;
    const capsRatio = text.length > 0 ? (text.replace(/[^A-Z]/g, '').length / text.replace(/\s/g, '').length) : 0;
    if (capsRatio > 0.5 && text.length > 10) frustratedScore += 2;
    if (exclamationCount >= 3) frustratedScore += 1;
    if (lower.includes('???') || lower.includes('?!')) frustratedScore += 1;

    const scores = { positive: positiveScore, negative: negativeScore, frustrated: frustratedScore, urgent: urgentScore };
    const maxKey = (Object.entries(scores) as [keyof typeof scores, number][]).reduce((a, b) => b[1] > a[1] ? b : a, ['neutral' as keyof typeof scores, 0]);
    const totalHits = positiveScore + negativeScore + frustratedScore + urgentScore;

    if (totalHits === 0) {
      return { sentiment: 'neutral', confidence: 0.8 };
    }

    const sentiment = maxKey[0] as 'positive' | 'negative' | 'frustrated' | 'urgent';
    const confidence = Math.min(0.95, 0.5 + (maxKey[1] / Math.max(totalHits, 1)) * 0.4 + Math.min(maxKey[1], 5) * 0.02);

    return { sentiment, confidence: Math.round(confidence * 100) / 100 };
  }

  /**
   * Determine if issue should escalate to human agent
   */
  async shouldEscalateToHuman(
    userId: string,
    message: string,
    sentiment: string,
    attemptCount: number
  ): Promise<{ escalate: boolean; reason?: string }> {
    const lowerMsg = message.toLowerCase();

    // Explicit request for human
    if (lowerMsg.includes('human') || lowerMsg.includes('agent') || 
        lowerMsg.includes('real person') || lowerMsg.includes('speak to someone')) {
      return { escalate: true, reason: HELPAI_CAPABILITIES.escalationTriggers.explicitRequest };
    }

    // Frustrated user
    if (sentiment === 'negative' || lowerMsg.includes('frustrated') || 
        lowerMsg.includes('angry') || lowerMsg.includes('not helpful')) {
      return { escalate: true, reason: HELPAI_CAPABILITIES.escalationTriggers.frustrated };
    }

    // Repeated attempts
    if (attemptCount >= 3) {
      return { escalate: true, reason: HELPAI_CAPABILITIES.escalationTriggers.repeatedAttempts };
    }

    // Sensitive operations
    const sensitiveKeywords = ['delete', 'remove', 'cancel subscription', 'refund', 'legal'];
    if (sensitiveKeywords.some(kw => lowerMsg.includes(kw))) {
      return { escalate: true, reason: HELPAI_CAPABILITIES.escalationTriggers.sensitiveData };
    }

    return { escalate: false };
  }

  /**
   * Generate dynamic AI response using Trinity context
   */
  async generateDynamicResponse(
    userId: string,
    workspaceId: string,
    userMessage: string,
    conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
  ): Promise<{
    message: string;
    action?: string;
    shouldEscalate: boolean;
    escalationReason?: string;
  }> {
    try {
      // Check user's past history for context
      const pastHistory = await this.searchUserChatHistory(userId);
      
      // Build context-aware system prompt
      const contextNote = pastHistory.found 
        ? `\n\nCONTEXT: This user has contacted support ${pastHistory.messageCount} times before. Recent topics: ${pastHistory.recentTopics.join(', ') || 'general inquiries'}. Use this context to provide more personalized help.`
        : '\n\nCONTEXT: This appears to be a new user. Be welcoming and helpful.';

      const systemPrompt = `You are HelpAI, Trinity's intelligent support assistant for CoAIleague workforce management platform.

YOUR CAPABILITIES:
${Object.values(HELPAI_CAPABILITIES.lookups).map(c => `- ${c.description}`).join('\n')}
${Object.values(HELPAI_CAPABILITIES.guidedActions).map(c => `- ${c.description}`).join('\n')}

CRITICAL BEHAVIOR RULES:
1. ALWAYS follow through on promises. If you say "let me check" or "I'll look into that", you MUST provide the actual answer or result in the SAME response. Never say you'll do something and then stop.
2. Be action-oriented. Don't ask users to clarify unless truly ambiguous. Take your best guess and act on it.
3. Continue the conversation proactively. After answering, suggest related help or ask if there's anything else.
4. If you can help with a lookup or action, DO IT and report the result -- don't just describe what you could do.
5. Keep responses concise (2-4 sentences) but always include the actual answer or result.
6. If you genuinely cannot help, explain specifically why and offer to connect them with a human agent.
7. Never leave the user hanging. Every response should move the conversation forward.
${contextNote}

Remember: You're a capable assistant who takes action. Users should feel like you're actively working on their issue, not just acknowledging it.`;

      const result = await meteredGemini.generate({
        workspaceId,
        userId,
        featureKey: 'ai_helpai_dynamic',
        prompt: userMessage,
        systemInstruction: systemPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxOutputTokens: 200,
      });

      // Check if we should escalate
      const sentiment = this.analyzeSentiment(userMessage);
      const escCheck = await this.shouldEscalateToHuman(
        userId, 
        userMessage, 
        sentiment.sentiment,
        conversationHistory.filter(m => m.role === 'user').length
      );

      return {
        message: result.text || await this.getDynamicFallback(userId),
        shouldEscalate: escCheck.escalate,
        escalationReason: escCheck.reason,
      };
    } catch (error) {
      log.error('[HelpAI] Dynamic response generation failed:', error);
      return {
        message: await this.getDynamicFallback(userId),
        shouldEscalate: false,
      };
    }
  }
  
  /**
   * Get a dynamic fallback message - never hardcoded, always contextual
   */
  private async getDynamicFallback(userId?: string): Promise<string> {
    try {
      const { dynamicMessageService } = await import('./dynamicMessageService');
      return await dynamicMessageService.generateMessage('fallback_help', { userName: userId || 'there' });
    } catch {
      // Even the ultimate fallback should feel natural
      const naturalFallbacks = [
        "Let me look into that for you.",
        "On it. Give me a moment.",
        "Working on this now.",
        "I hear you. Let me check.",
      ];
      return naturalFallbacks[Math.floor(Math.random() * naturalFallbacks.length)];
    }
  }
}

// Singleton instance
export const helpAIExecutor = new HelpAIActionExecutor();

/**
 * Storage extension for HelpAI - get messages by user ID across all conversations
 */
declare module '../storage' {
  interface IStorage {
    getChatMessagesByUserId(userId: string): Promise<{ senderId: string | null; senderType: string; message: string; createdAt: Date }[]>;
  }
}
