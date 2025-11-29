/**
 * UNIVERSAL HELPAI BOT SERVICE
 * =============================
 * Single unified AI assistant for CoAIleague platform
 * Uses Gemini via AI Brain for all AI operations
 * All configuration from shared/platformConfig.ts
 */

import { HELPAI, PLATFORM } from '@shared/platformConfig';
import { db } from '../../db';
import { supportTickets, helposFaqs, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { usageMeteringService } from '../billing/usageMetering';
import { aiBrainService } from '../ai-brain/aiBrainService';

export enum HelpAIState {
  GREETING = 'greeting',
  INTAKE_SUBJECT = 'intake_subject',
  INTAKE_DESCRIPTION = 'intake_description',
  INTAKE_PRIORITY = 'intake_priority',
  CREATING_TICKET = 'creating_ticket',
  SEARCHING = 'searching',
  ANSWERING = 'answering',
  CLARIFYING = 'clarifying',
  ESCALATING = 'escalating',
  WAITING_FOR_HUMAN = 'waiting_for_human',
  RESOLVED = 'resolved',
  ABANDONED = 'abandoned',
}

export interface HelpAIConversation {
  conversationId: string;
  state: HelpAIState;
  userQuery: string;
  suggestedFaqs: Array<{ id: string; question: string; answer: string; score: number }>;
  conversationHistory: Array<{ role: 'bot' | 'user'; message: string; timestamp: Date }>;
  satisfactionSignals: number;
  escalationSignals: number;
  lastInteraction: Date;
  workspaceId?: string;
  userId?: string;
  guestResponsesUsed: number;
  intakeData?: {
    subject?: string;
    description?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
}

export interface HelpAIResponse {
  response: string;
  shouldEscalate: boolean;
  shouldClose: boolean;
  state: HelpAIState;
  confidence?: number;
  suggestedFaqs?: Array<{ question: string; answer: string; score: number }>;
}

class HelpAIBotService {
  private conversations = new Map<string, HelpAIConversation>();
  private aiEnabledMap = new Map<string, boolean>();

  get botName(): string {
    return HELPAI.name;
  }

  get fullName(): string {
    return HELPAI.fullName;
  }

  toggleAI(workspaceId: string, enabled: boolean): boolean {
    this.aiEnabledMap.set(workspaceId, enabled);
    console.log(`[${HELPAI.name}] AI ${enabled ? 'ENABLED' : 'DISABLED'} for workspace: ${workspaceId}`);
    return enabled;
  }

  isEnabled(workspaceId: string = 'default'): boolean {
    return this.aiEnabledMap.get(workspaceId) ?? HELPAI.bot.enabled;
  }

  getGreeting(type: keyof typeof HELPAI.greetings = 'default', params?: { remaining?: number }): string {
    let greeting: string = HELPAI.greetings[type];
    if (params?.remaining !== undefined) {
      greeting = greeting.replace('{remaining}', String(params.remaining));
    }
    return greeting;
  }

  async generateSmartGreeting(
    userName: string,
    userType: string,
    workspaceId: string,
    context?: string
  ): Promise<string> {
    if (!this.isEnabled(workspaceId)) {
      return this.getGreeting('default');
    }

    try {
      const result = await aiBrainService.enqueueJob({
        workspaceId,
        skill: 'helpai_greeting',
        input: {
          message: `Generate a warm, professional greeting for ${userName} (${userType}). ${context || ''}`,
          maxWords: 30,
        },
        priority: 'normal',
      });

      if (result.status === 'completed' && result.output?.greeting) {
        await this.trackUsage(workspaceId, 'greeting', result.output.tokensUsed || 50);
        return result.output.greeting;
      }

      return this.getGreeting('default');
    } catch (error) {
      console.error(`[${HELPAI.name}] Smart greeting failed:`, error);
      return this.getGreeting('default');
    }
  }

  detectSentiment(message: string): { satisfaction: number; escalation: number } {
    const lowercaseMsg = message.toLowerCase();
    
    let satisfaction = 0;
    let escalation = 0;
    
    for (const signal of HELPAI.signals.satisfaction) {
      if (lowercaseMsg.includes(signal)) {
        satisfaction++;
      }
    }
    
    for (const signal of HELPAI.signals.frustration) {
      if (lowercaseMsg.includes(signal)) {
        escalation++;
      }
    }
    
    return { satisfaction, escalation };
  }

  detectDomain(message: string): string {
    const lowercaseMsg = message.toLowerCase();
    
    for (const [domain, keywords] of Object.entries(HELPAI.domains)) {
      for (const keyword of keywords) {
        if (lowercaseMsg.includes(keyword)) {
          return domain;
        }
      }
    }
    
    return 'general';
  }

  async searchFaqs(
    query: string,
    workspaceId?: string,
    userId?: string,
    limit: number = 3
  ): Promise<Array<{ id: string; question: string; answer: string; score: number }>> {
    try {
      const result = await aiBrainService.enqueueJob({
        workspaceId,
        userId,
        skill: 'helpai_faq_search',
        input: {
          message: query,
          limit,
        },
        priority: 'high',
      });

      if (result.status === 'completed' && result.output?.faqs) {
        await this.trackUsage(workspaceId || 'default', 'faq_search', result.output.tokensUsed || 100);
        return result.output.faqs;
      }

      return await this.fallbackFaqSearch(query, limit);
    } catch (error) {
      console.error(`[${HELPAI.name}] FAQ search failed:`, error);
      return await this.fallbackFaqSearch(query, limit);
    }
  }

  private async fallbackFaqSearch(
    query: string,
    limit: number
  ): Promise<Array<{ id: string; question: string; answer: string; score: number }>> {
    try {
      const results = await db
        .select({
          id: helposFaqs.id,
          question: helposFaqs.question,
          answer: helposFaqs.answer,
        })
        .from(helposFaqs)
        .where(eq(helposFaqs.isPublished, true))
        .limit(limit);

      return results.map((r: { id: string; question: string; answer: string }) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        score: 0.5,
      }));
    } catch (error) {
      console.error(`[${HELPAI.name}] Fallback FAQ search failed:`, error);
      return [];
    }
  }

  async analyzeUrgency(
    message: string,
    workspaceId?: string
  ): Promise<{ urgency: 'low' | 'normal' | 'high' | 'urgent'; reason: string } | null> {
    if (!HELPAI.bot.urgencyDetection) {
      return null;
    }

    try {
      const result = await aiBrainService.enqueueJob({
        workspaceId,
        skill: 'helpai_urgency',
        input: {
          message,
        },
        priority: 'high',
      });

      if (result.status === 'completed' && result.output) {
        await this.trackUsage(workspaceId || 'default', 'urgency_analysis', result.output.tokensUsed || 75);
        return result.output;
      }

      return this.fallbackUrgencyAnalysis(message);
    } catch (error) {
      console.error(`[${HELPAI.name}] Urgency analysis failed:`, error);
      return this.fallbackUrgencyAnalysis(message);
    }
  }

  private fallbackUrgencyAnalysis(message: string): { urgency: 'low' | 'normal' | 'high' | 'urgent'; reason: string } {
    const lowercaseMsg = message.toLowerCase();
    const urgentKeywords = ['urgent', 'emergency', 'critical', 'asap', 'immediately', 'down', 'broken'];
    const highKeywords = ['important', 'soon', 'quickly', 'deadline', 'blocked'];

    for (const keyword of urgentKeywords) {
      if (lowercaseMsg.includes(keyword)) {
        return { urgency: 'urgent', reason: `Contains urgent keyword: ${keyword}` };
      }
    }

    for (const keyword of highKeywords) {
      if (lowercaseMsg.includes(keyword)) {
        return { urgency: 'high', reason: `Contains priority keyword: ${keyword}` };
      }
    }

    return { urgency: 'normal', reason: 'Standard request' };
  }

  async generateResponse(
    message: string,
    context: {
      conversationHistory?: Array<{ role: 'user' | 'bot'; message: string }>;
      workspaceId?: string;
      userId?: string;
      domain?: string;
    }
  ): Promise<{ response: string; confidence: number }> {
    try {
      const result = await aiBrainService.enqueueJob({
        workspaceId: context.workspaceId,
        userId: context.userId,
        skill: 'helpai_response',
        input: {
          message,
          conversationHistory: context.conversationHistory?.slice(-5),
          domain: context.domain || 'general',
          platformInfo: {
            name: PLATFORM.name,
            products: HELPAI.platformKnowledge.products,
            capabilities: HELPAI.platformKnowledge.capabilities,
          },
        },
        priority: 'high',
      });

      if (result.status === 'completed' && result.output) {
        await this.trackUsage(
          context.workspaceId || 'default',
          'ai_response',
          result.output.tokensUsed || 200
        );
        return {
          response: result.output.response || this.getGreeting('default'),
          confidence: result.confidenceScore || 0.7,
        };
      }

      return {
        response: "I understand you need help. Let me connect you with our support team for personalized assistance.",
        confidence: 0.3,
      };
    } catch (error) {
      console.error(`[${HELPAI.name}] Response generation failed:`, error);
      return {
        response: "I'm having trouble processing your request. A support agent will assist you shortly.",
        confidence: 0.1,
      };
    }
  }

  startConversation(
    conversationId: string,
    workspaceId?: string,
    userId?: string,
    startIntake: boolean = false
  ): HelpAIConversation {
    const conversation: HelpAIConversation = {
      conversationId,
      state: startIntake ? HelpAIState.INTAKE_SUBJECT : HelpAIState.GREETING,
      userQuery: '',
      suggestedFaqs: [],
      conversationHistory: [],
      satisfactionSignals: 0,
      escalationSignals: 0,
      lastInteraction: new Date(),
      workspaceId,
      userId,
      guestResponsesUsed: 0,
      intakeData: startIntake ? {} : undefined,
    };

    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  getConversation(conversationId: string): HelpAIConversation | undefined {
    return this.conversations.get(conversationId);
  }

  startIntakeFlow(conversationId: string, userId: string, workspaceId: string): string {
    const conversation = this.startConversation(conversationId, workspaceId, userId, true);
    this.conversations.set(conversationId, conversation);

    return `Welcome to ${PLATFORM.name} Support! I'm ${HELPAI.name}, your AI assistant.\n\nI'll help create a support ticket for you. First, can you briefly describe what you need help with?`;
  }

  async processMessage(
    conversationId: string,
    userMessage: string,
    workspaceId?: string,
    userId?: string
  ): Promise<HelpAIResponse> {
    let conversation = this.conversations.get(conversationId);

    if (!conversation) {
      conversation = this.startConversation(conversationId, workspaceId, userId);
    }

    if (workspaceId && !conversation.workspaceId) {
      conversation.workspaceId = workspaceId;
    }
    if (userId && !conversation.userId) {
      conversation.userId = userId;
    }

    conversation.conversationHistory.push({
      role: 'user',
      message: userMessage,
      timestamp: new Date(),
    });
    conversation.lastInteraction = new Date();
    conversation.userQuery = userMessage;

    const isIntakeFlow = [
      HelpAIState.INTAKE_SUBJECT,
      HelpAIState.INTAKE_DESCRIPTION,
      HelpAIState.INTAKE_PRIORITY,
      HelpAIState.CREATING_TICKET,
    ].includes(conversation.state);

    if (!isIntakeFlow) {
      const sentiment = this.detectSentiment(userMessage);
      conversation.satisfactionSignals += sentiment.satisfaction;
      conversation.escalationSignals += sentiment.escalation;
    }

    let response = '';
    let shouldEscalate = false;
    let shouldClose = false;
    let confidence = 0.7;
    let suggestedFaqs: Array<{ question: string; answer: string; score: number }> = [];

    switch (conversation.state) {
      case HelpAIState.INTAKE_SUBJECT:
        if (!conversation.intakeData) conversation.intakeData = {};
        conversation.intakeData.subject = userMessage.trim();
        conversation.state = HelpAIState.INTAKE_DESCRIPTION;
        response = "Got it! Now, please describe your issue in detail. What's happening, and when did it start?";
        break;

      case HelpAIState.INTAKE_DESCRIPTION:
        if (!conversation.intakeData) conversation.intakeData = {};
        conversation.intakeData.description = userMessage.trim();
        conversation.state = HelpAIState.INTAKE_PRIORITY;
        response = "Thanks for the details. How urgent is this issue?\n\nPlease respond with:\n- **urgent** - Needs immediate attention\n- **high** - Important but not critical\n- **normal** - Standard priority\n- **low** - Can wait";
        break;

      case HelpAIState.INTAKE_PRIORITY:
        const priorityMap: Record<string, 'urgent' | 'high' | 'normal' | 'low'> = {
          urgent: 'urgent', high: 'high', normal: 'normal', low: 'low',
          '1': 'urgent', '2': 'high', '3': 'normal', '4': 'low',
          critical: 'urgent', important: 'high', medium: 'normal', minor: 'low',
        };
        const priority = priorityMap[userMessage.trim().toLowerCase()] || 'normal';
        if (!conversation.intakeData) conversation.intakeData = {};
        conversation.intakeData.priority = priority;
        conversation.state = HelpAIState.CREATING_TICKET;
        response = `Creating your support ticket with **${priority}** priority. I'll search our knowledge base while your ticket is being processed...`;
        break;

      case HelpAIState.CREATING_TICKET:
        conversation.state = HelpAIState.SEARCHING;

      case HelpAIState.GREETING:
      case HelpAIState.SEARCHING:
        conversation.state = HelpAIState.SEARCHING;
        const faqs = await this.searchFaqs(userMessage, workspaceId, userId);
        conversation.suggestedFaqs = faqs;
        suggestedFaqs = faqs;

        if (faqs.length > 0 && faqs[0].score > HELPAI.escalation.lowConfidenceThreshold) {
          conversation.state = HelpAIState.ANSWERING;
          confidence = faqs[0].score;
          response = this.formatFaqResponse(faqs);
        } else {
          const aiResponse = await this.generateResponse(userMessage, {
            conversationHistory: conversation.conversationHistory.map((h) => ({
              role: h.role,
              message: h.message,
            })),
            workspaceId,
            userId,
            domain: this.detectDomain(userMessage),
          });

          if (aiResponse.confidence > HELPAI.escalation.lowConfidenceThreshold) {
            conversation.state = HelpAIState.ANSWERING;
            response = aiResponse.response;
            confidence = aiResponse.confidence;
          } else {
            conversation.state = HelpAIState.ESCALATING;
            response = `I couldn't find a clear answer. **Connecting you to our support team** for personalized assistance...`;
            shouldEscalate = true;
          }
        }
        break;

      case HelpAIState.ANSWERING:
      case HelpAIState.CLARIFYING:
        if (conversation.satisfactionSignals >= HELPAI.escalation.frustrationSignalCount) {
          conversation.state = HelpAIState.RESOLVED;
          response = `Great! I'm glad I could help. If you need anything else, feel free to ask!`;
          shouldClose = true;
        } else if (conversation.escalationSignals >= HELPAI.escalation.frustrationSignalCount) {
          conversation.state = HelpAIState.ESCALATING;
          response = `I understand you need more help. **Connecting you to our support team**...`;
          shouldEscalate = true;
        } else {
          conversation.state = HelpAIState.CLARIFYING;
          response = `Could you clarify what you're looking for? Or would you prefer to speak with our support team directly?`;
        }
        break;

      case HelpAIState.WAITING_FOR_HUMAN:
        response = `You're connected to our support team! An agent will assist you shortly.`;
        break;

      default:
        response = this.getGreeting('default');
    }

    if (conversation.state === HelpAIState.CREATING_TICKET && conversation.intakeData) {
      const ticketResult = await this.createTicketFromIntake(conversation);
      if (ticketResult.success) {
        response += `\n\n${ticketResult.message}`;
        conversation.state = HelpAIState.SEARCHING;
      } else {
        response = `I encountered an error creating your ticket. **Connecting you to support**...`;
        shouldEscalate = true;
        conversation.state = HelpAIState.ESCALATING;
      }
    }

    conversation.conversationHistory.push({
      role: 'bot',
      message: response,
      timestamp: new Date(),
    });

    this.conversations.set(conversationId, conversation);

    return {
      response,
      shouldEscalate,
      shouldClose,
      state: conversation.state,
      confidence,
      suggestedFaqs,
    };
  }

  private formatFaqResponse(faqs: Array<{ question: string; answer: string; score: number }>): string {
    if (faqs.length === 0) {
      return "I searched our knowledge base but couldn't find a direct answer. Let me connect you with support.";
    }

    const topFaq = faqs[0];

    if (topFaq.score > 0.85) {
      return `I found this in our knowledge base:\n\n**${topFaq.question}**\n\n${topFaq.answer}\n\nDoes this answer your question?`;
    } else if (topFaq.score > 0.7) {
      return `I found something that might help:\n\n**${topFaq.question}**\n\n${topFaq.answer}\n\nIs this what you were looking for?`;
    } else {
      return `I found a related topic:\n\n**${topFaq.question}**\n\nWould you like to see this answer, or should I connect you with support?`;
    }
  }

  private async createTicketFromIntake(conversation: HelpAIConversation): Promise<{ success: boolean; message: string }> {
    const { subject, description, priority } = conversation.intakeData || {};
    const { workspaceId, userId } = conversation;

    if (!subject || !description || !priority || !workspaceId || !userId) {
      return { success: false, message: 'Missing required information' };
    }

    try {
      const ticketNumber = await this.generateTicketNumber(workspaceId);

      await db.insert(supportTickets).values({
        workspaceId,
        ticketNumber,
        type: 'support',
        priority,
        subject,
        description,
        requestedBy: userId,
        status: 'open',
      });

      conversation.intakeData = undefined;
      return { success: true, message: `Ticket **${ticketNumber}** created successfully!` };
    } catch (error) {
      console.error(`[${HELPAI.name}] Ticket creation failed:`, error);
      return { success: false, message: 'Failed to create ticket' };
    }
  }

  private async generateTicketNumber(workspaceId: string): Promise<string> {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);

    const tickets = await db
      .select({ ticketNumber: supportTickets.ticketNumber })
      .from(supportTickets)
      .where(
        and(eq(supportTickets.workspaceId, workspaceId), sql`${supportTickets.createdAt} >= ${yearStart}`)
      )
      .orderBy(desc(supportTickets.createdAt))
      .limit(1);

    let nextNumber = 1;
    if (tickets.length > 0 && tickets[0].ticketNumber) {
      const match = tickets[0].ticketNumber.match(/TKT-\d{4}-(\d+)/);
      if (match && match[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `TKT-${year}-${String(nextNumber).padStart(4, '0')}`;
  }

  private async trackUsage(workspaceId: string, activityType: string, tokensUsed: number): Promise<void> {
    try {
      await usageMeteringService.recordUsage({
        workspaceId,
        featureKey: `helpai_${activityType}`,
        usageType: 'token',
        usageAmount: tokensUsed,
        usageUnit: 'tokens',
        activityType: `helpai_${activityType}`,
        metadata: {
          model: HELPAI.model.modelId,
          botName: HELPAI.name,
        },
      });
      console.log(`[${HELPAI.name}] Usage tracked: ${activityType} (${tokensUsed} tokens) - Workspace: ${workspaceId}`);
    } catch (error) {
      console.error(`[${HELPAI.name}] Usage tracking failed:`, error);
    }
  }

  checkGuestLimit(conversation: HelpAIConversation): { allowed: boolean; remaining: number } {
    const { freeResponses, promptUpgrade } = HELPAI.guestLimits;
    const used = conversation.guestResponsesUsed;
    const remaining = Math.max(0, freeResponses - used);

    return {
      allowed: used < freeResponses,
      remaining,
    };
  }

  incrementGuestUsage(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.guestResponsesUsed++;
      this.conversations.set(conversationId, conversation);
    }
  }

  async closeConversationSuccess(conversationId: string): Promise<{ success: boolean; summary: string }> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return { success: false, summary: 'Conversation not found' };
    }

    conversation.state = HelpAIState.RESOLVED;

    const summary = `${HELPAI.name} resolved query.\n\nQuery: ${conversation.userQuery}\nTurns: ${conversation.conversationHistory.length}`;

    this.conversations.delete(conversationId);

    return { success: true, summary };
  }

  endConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}

export const helpAIBotService = new HelpAIBotService();
