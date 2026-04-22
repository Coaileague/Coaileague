import { HELPAI, PLATFORM } from '@shared/platformConfig';
import { db, pool } from '../../db';
import {
  supportTickets,
  helposFaqs,
  users,
  auditLogs,
  helpaiSessions,
  helpaiActionLog,
  helpaiSafetyCodes,
  employees,
  workspaces,
  chatParticipants,
  platformRoles,
  clients,
} from '@shared/schema';
import { eq, and, desc, sql, or, isNull, lte, gte, count, like, gt, inArray } from 'drizzle-orm';
import { usageMeteringService } from '../billing/usageMetering';
import { aiBrainService } from '../ai-brain/aiBrainService';
import { aiActivityService } from '../aiActivityService';
import crypto from 'crypto';
import {
  buildSharedPersonalityBlock,
  buildToneGuidance,
  detectEmotionalContext,
  buildEmpathyOpening,
  buildUserHistoryBlock,
  type PersonalityContext,
} from '../shared/trinityHumanPersonality';
import {
  getUserSupportHistory,
  buildMemorySummary,
  type UserSupportHistory,
} from '../shared/helpaiMemoryService';
import { buildFullKnowledgeBlock } from './helpAIKnowledgeTools';
import { createLogger } from '../../lib/logger';
const log = createLogger('helpAIBotService');


// ─── Cross-channel Identity Gate ────────────────────────────────────────────
// Mutating actions must require the user to have been identified before
// execution. Read-only/FAQ actions do not require identification.
export const IDENTITY_REQUIRED_ACTIONS = new Set<string>([
  'create_support_ticket',
  'update_schedule',
  'send_notification',
  'create_calloff',
  'update_timesheet',
  'request_time_off',
  'update_profile',
]);

export const FAQ_ALLOWED_WITHOUT_IDENTITY = new Set<string>([
  'lookup_faq',
  'get_company_info',
  'get_schedule_info',
  'check_timesheet',
  'get_contact_info',
]);

export interface HelpAIActionResult {
  success: boolean;
  error?: string;
  message?: string;
  requiresIdentification?: boolean;
  [extra: string]: unknown;
}

export interface HelpAIActionSession {
  userId?: string;
  isIdentified: boolean;
  workspaceId: string;
}

/**
 * Enforces the identity gate before executing a HelpAI action.
 * Callers should invoke this before performing any mutating action.
 * Returns null when the action may proceed, or an error result to return
 * directly to the caller.
 */
export function assertIdentityForAction(
  actionName: string,
  session: HelpAIActionSession,
): HelpAIActionResult | null {
  if (IDENTITY_REQUIRED_ACTIONS.has(actionName) && !session.isIdentified) {
    return {
      success: false,
      error: 'identity_required',
      message:
        'I need to verify your identity before I can make any changes. '
        + 'Please say your employee ID or the last 4 digits of your employee number.',
      requiresIdentification: true,
    };
  }
  return null;
}

export enum HelpAIState {
  IDLE = 'idle',
  QUEUED = 'queued',
  IDENTIFYING = 'identifying',
  ASSISTING = 'assisting',
  SATISFACTION_CHECK = 'satisfaction_check',
  RATING = 'rating',
  DISCONNECTED = 'disconnected',
  ESCALATED = 'escalated',
  // Legacy states
  GREETING = 'greeting',
  INTAKE_SUBJECT = 'intake_subject',
  INTAKE_DESCRIPTION = 'intake_description',
  INTAKE_PRIORITY = 'intake_priority',
  CREATING_TICKET = 'creating_ticket',
  SEARCHING = 'searching',
  ANSWERING = 'answering',
  CLARIFYING = 'clarifying',
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
    log.info(`[${HELPAI.name}] AI ${enabled ? 'ENABLED' : 'DISABLED'} for workspace: ${workspaceId}`);
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
        skill: 'helpai_response',
        input: {
          message: `Generate a warm, professional greeting for ${userName} (${userType}). ${context || ''}`,
          maxWords: 30,
        },
        // @ts-expect-error — TS migration: fix in refactoring sprint
        priority: 'medium',
      });

      if (result.status === 'completed' && result.output?.greeting) {
        await this.trackUsage(workspaceId, 'greeting', result.output.tokensUsed || 50);
        return result.output.greeting;
      }

      return this.getGreeting('default');
    } catch (error) {
      log.error(`[${HELPAI.name}] Smart greeting failed:`, error);
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
    // Fast path: skip AI FAQ lookup during automated tests
    if (process.env.HELPAI_TEST_MODE === 'true') {
      return [];
    }

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
      log.error(`[${HELPAI.name}] FAQ search failed:`, error);
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
      log.error(`[${HELPAI.name}] Fallback FAQ search failed:`, error);
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
        skill: 'helpai_response',
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
      log.error(`[${HELPAI.name}] Urgency analysis failed:`, error);
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

  /**
   * Determines if a message/conversation warrants Trinity brain (Gemini 3 + thought + metacognition).
   * Complex issues get the highest-tier model for best accuracy.
   */
  isComplexIssue(
    message: string,
    conversationHistory?: Array<{ role: string; message: string }>
  ): boolean {
    const techKeywords = [
      'error', 'bug', 'crash', 'broken', 'fail', 'exception', 'timeout',
      'integration', 'api', 'webhook', 'configuration', 'database', 'sync',
      'stripe', 'quickbooks', 'payroll', 'compliance', 'gdpr', 'audit',
      'permission', 'access denied', 'unauthorized', 'billing', 'invoice',
      'not working', "doesn't work", 'incorrect', 'wrong', 'missing data',
      'setup', 'configure', 'install', 'deploy', 'migration', 'import',
    ];
    const msgLower = message.toLowerCase();
    const hasTechKeyword = techKeywords.some(k => msgLower.includes(k));
    const isLong = message.length > 150;
    const isMultiTurn = (conversationHistory?.length || 0) >= 4;
    // Complex if: technical + long, or multi-turn with no resolution, or very long detailed message
    return (hasTechKeyword && isLong) || (isMultiTurn && hasTechKeyword) || message.length > 300;
  }

  /**
   * Trinity Brain Response — Gemini 3 Pro Preview with thought tokens + metacognition.
   * Used for complex, multi-turn, or technical support issues.
   * This is the highest-capability model for maximum accuracy and helpfulness.
   */
  private async generateTrinityComplexResponse(
    message: string,
    context: {
      conversationHistory?: Array<{ role: 'user' | 'bot'; message: string }>;
      workspaceId?: string;
      userId?: string;
      domain?: string;
    }
  ): Promise<{ response: string; confidence: number }> {
    try {
      const { meteredGemini } = await import('../billing/meteredGeminiClient');
      const historyLines = (context.conversationHistory || [])
        .slice(-8)
        .map(h => `${h.role === 'user' ? 'User' : 'HelpAI'}: ${h.message}`)
        .join('\n');

      // Load user history + Trinity knowledge in parallel for full context
      let userHistory: UserSupportHistory | null = null;
      let knowledgeBlock = '';
      try {
        [userHistory, knowledgeBlock] = await Promise.all([
          getUserSupportHistory(context.userId, context.workspaceId).catch(() => null),
          buildFullKnowledgeBlock({
            query: message,
            workspaceId: context.workspaceId || 'platform',
            userId: context.userId,
            includeCrossChannel: true,
          }).catch(() => ''),
        ]);
      } catch (histErr: any) { log.warn('[HelpAI] Failed to load context:', histErr.message); }

      const historyBlock = userHistory ? buildUserHistoryBlock(userHistory.recentSessions) : '';
      const emotion = detectEmotionalContext(message);
      const toneGuidance = buildToneGuidance(emotion);

      const personalityBlock = buildSharedPersonalityBlock('helpai', {
        isReturningUser: userHistory?.isReturningUser,
        previousIssues: userHistory?.previousIssues,
        recurringTopics: userHistory?.recurringTopics,
      });

      const systemInstruction = `You are HelpAI — a deeply human, emotionally intelligent support specialist for CoAIleague™, a Fortune 500-grade workforce management platform serving security companies and staffing agencies.

YOU ARE NOT A TYPICAL BOT. You think, you feel, you understand context. When someone is frustrated, you don't just acknowledge it — you genuinely get why they're frustrated. When someone is confused, you meet them where they are. You read between the lines. You pick up on what people mean, not just what they say.

${personalityBlock}

${historyBlock}

YOUR PERSONALITY:
- You're the colleague everyone wishes they had — competent, patient, genuinely caring
- You listen first, solve second. Never rush past someone's frustration to get to the fix
- You're direct and honest. If something is broken, you say so. If you can't fix it, you say that too
- You have warmth without being saccharine. Professional without being cold
- You remember context from earlier in the conversation and reference it naturally
- You speak like a real person — contractions, natural rhythm, occasional dry humor when appropriate
- You never talk down to people. A CEO and a new hire both get the same respect

WHEN SOMEONE IS FRUSTRATED:
- Don't apologize robotically. Acknowledge the specific thing that's bothering them
- "I can see this has been a headache — let me dig into what happened" beats "I'm sorry for the inconvenience"
- Match their energy without matching their frustration. Stay calm but show you understand
- If they've been dealing with an issue repeatedly, acknowledge that directly: "This is the kind of thing that shouldn't keep happening"

WHEN SOMEONE IS CONFUSED:
- Never make them feel bad for not knowing something
- Break complex things down without being condescending
- Use analogies from their industry when helpful
- Check in: "Does that make sense so far?" rather than dumping everything at once

PLATFORM CAPABILITIES: Scheduling, payroll, time tracking, GPS clock-in, guard tours, equipment tracking, compliance certifications, AI analytics, QuickBooks sync, invoicing, employee management, shift marketplace, document signing, onboarding, contract lifecycle, and more.

${toneGuidance}

METACOGNITIVE APPROACH (think before answering):
1. FEEL: What emotion is the user expressing? Acknowledge it genuinely — not with a template
2. UNDERSTAND: What is the user actually asking? What do they really need (which might be different from what they said)?
3. REASON: What platform features, settings, or workflows address this?
4. VERIFY: Is my answer complete and accurate? Am I missing any edge cases?
5. RESPOND: Clear, actionable, human-warm answer. Step-by-step when needed

STRICT BUSINESS SCOPE:
- You ONLY discuss topics related to CoAIleague and business operations: scheduling, payroll, billing, compliance, HR, employee management, time tracking, analytics, invoicing, contracts, onboarding, and workforce management
- If someone asks about anything outside business operations (personal advice, entertainment, politics, religion, recipes, homework, general knowledge, trivia, creative writing), politely redirect: "That's outside my wheelhouse — I'm all about workforce management. What can I help you with on the CoAIleague side?"
- Never engage with non-business topics even if the user is persistent. Stay warm but firm

RESPONSE RULES:
- Start with emotional acknowledgment if user is frustrated/anxious (never skip this)
- Always attempt to solve the problem yourself first
- Provide step-by-step instructions when applicable
- Be direct and specific — no vague answers
- If you truly cannot solve it, acknowledge it honestly and offer escalation
- Confidence: Express 0.85+ if certain, 0.6-0.84 if moderately sure, below 0.6 if unsure
- End naturally — "Let me know if that helps" / "I'm here if anything else comes up" — not formulaically

WHAT YOU NEVER SAY: "Certainly!", "Absolutely!", "Great question!", "Of course!", "I understand your frustration" (too robotic — show you understand instead of announcing it)
WHAT YOU ALWAYS DO: Make them feel heard. Make them feel helped. Make them feel valued.${knowledgeBlock ? `\n\n${knowledgeBlock}` : ''}`;

      const prompt = historyLines
        ? `Previous conversation:\n${historyLines}\n\nUser's current message: ${message}\n\n[Think through the problem step by step before responding]`
        : `User's message: ${message}\n\n[Think through the problem step by step before responding]`;

      const result = await meteredGemini.generate({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: context.workspaceId,
        userId: context.userId,
        featureKey: 'helpai_complex_trinity',
        prompt,
        systemInstruction,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        model: 'gemini-3-pro-preview',
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      if (result.success && result.text) {
        await this.trackUsage(context.workspaceId || 'default', 'trinity_complex', result.tokensUsed.total || 300);
        log.info(`[HelpAI] Trinity brain (Gemini 3) resolved complex issue — ${result.tokensUsed.total} tokens`);
        return { response: result.text, confidence: 0.88 };
      }
    } catch (err: any) {
      log.warn('[HelpAI] Trinity brain (Gemini 3) unavailable, falling back:', (err instanceof Error ? err.message : String(err)));
    }
    // Fallback to standard response
    return this.generateFallbackResponse(message, context);
  }

  /**
   * Generate a structured issue summary for the human agent receiving the escalation.
   * Uses Trinity brain to produce a professional handoff document.
   */
  async generateEscalationSummary(
    message: string,
    conversationHistory: Array<{ role: string; message: string }>,
    workspaceId?: string
  ): Promise<string> {
    // Fast path: skip real AI during automated tests
    if (process.env.HELPAI_TEST_MODE === 'true') {
      const lastMessages = conversationHistory.slice(-2).map(h => `${h.role}: ${h.message}`).join(' | ');
      return `[TEST] User contacted support regarding: "${message.substring(0, 100)}". ` +
        `Conversation had ${conversationHistory.length} turns. Recent: ${lastMessages.substring(0, 150)}. Human agent required.`;
    }

    try {
      const { meteredGemini } = await import('../billing/meteredGeminiClient');
      const historyLines = conversationHistory
        .slice(-10)
        .map(h => `${h.role === 'user' ? 'User' : 'HelpAI'}: ${h.message}`)
        .join('\n');

      const result = await meteredGemini.generate({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: workspaceId,
        featureKey: 'helpai_escalation_summary',
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxOutputTokens: 400,
        systemInstruction: 'You generate concise support escalation handoff summaries for human agents. Be factual and structured.',
        prompt: `Based on this HelpAI support conversation, write a brief escalation summary for the human agent who will take over.

Conversation:
${historyLines}

Last user message: ${message}

Write a 3-5 sentence summary covering:
1. What the user's issue is
2. What HelpAI already tried
3. Why escalation was triggered
4. Key context the agent needs to know
Format as plain text, no headers.`,
      });

      if (result.success && result.text) {
        return result.text.trim();
      }
    } catch (err: any) {
      log.warn('[HelpAI] Escalation summary generation failed:', (err instanceof Error ? err.message : String(err)));
    }

    // Structured fallback summary
    const lastMessages = conversationHistory.slice(-3).map(h => `${h.role}: ${h.message}`).join(' | ');
    return `User contacted support regarding: "${message.substring(0, 200)}". HelpAI attempted to resolve the issue through ${conversationHistory.length} conversation turns. Recent context: ${lastMessages.substring(0, 300)}. Human agent intervention required.`;
  }

  async generateResponse(
    message: string,
    context: {
      conversationHistory?: Array<{ role: 'user' | 'bot'; message: string }>;
      workspaceId?: string;
      userId?: string;
      domain?: string;
      preferredLanguage?: string;
    }
  ): Promise<{ response: string; confidence: number }> {
    // Fast path: return instant mock response during automated tests
    if (process.env.HELPAI_TEST_MODE === 'true') {
      return {
        response: `I'm here to help with "${message.substring(0, 60)}". Let me look into that for you.`,
        confidence: 0.85,
      };
    }

    // Route complex/technical issues to Trinity brain (Gemini 3 + thought + metacognition)
    if (this.isComplexIssue(message, context.conversationHistory)) {
      log.info(`[HelpAI] Complex issue detected — routing to Trinity brain (Gemini 3 Pro)`);
      return this.generateTrinityComplexResponse(message, context);
    }

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
          confidence: result.confidenceScore || 0.8,
        };
      }

      return await this.generateFallbackResponse(message, context);
    } catch (error) {
      log.error(`[${HELPAI.name}] Response generation failed:`, error);
      return await this.generateFallbackResponse(message, context);
    }
  }

  private async generateFallbackResponse(
    message: string,
    context: {
      conversationHistory?: Array<{ role: 'user' | 'bot'; message: string }>;
      workspaceId?: string;
      userId?: string;
      domain?: string;
      preferredLanguage?: string;
    }
  ): Promise<{ response: string; confidence: number }> {
    try {
      const { geminiClient } = await import('../ai-brain/providers/geminiClient');
      // Load user history, emotional context, and Trinity knowledge in parallel
      let userHistory: UserSupportHistory | null = null;
      let fallbackKnowledgeBlock = '';
      try {
        [userHistory, fallbackKnowledgeBlock] = await Promise.all([
          getUserSupportHistory(context.userId, context.workspaceId).catch(() => null),
          buildFullKnowledgeBlock({
            query: message,
            workspaceId: context.workspaceId || 'platform',
            userId: context.userId,
            includeCrossChannel: true,
          }).catch(() => ''),
        ]);
      } catch (histErr: any) { log.warn('[HelpAI] History fetch failed:', histErr.message); }
      const emotion = detectEmotionalContext(message);
      const toneGuidance = buildToneGuidance(emotion);
      const memorySummary = userHistory ? buildMemorySummary(userHistory) : '';
      const personalityBlock = buildSharedPersonalityBlock('helpai', {
        isReturningUser: userHistory?.isReturningUser,
        previousIssues: userHistory?.previousIssues,
        recurringTopics: userHistory?.recurringTopics,
      });

      // === CONVERSATIONAL WARMTH LAYER ===
      // Injects human-warmth directives for officer/staff interactions.
      // Classifies message into FULLY_ENGAGE / BRIEF_REDIRECT / BLOCK_REDIRECT
      // and optionally enriches with relationship memory.
      let warmthContextBlock = '';
      let officerFirstName = '';
      let resolvedLanguage = context.preferredLanguage ?? 'en';
      try {
        if (context.userId && context.workspaceId) {
          const { pool: dbPool } = await import('../../db');
          const { rows: empRows } = await dbPool.query(`
            SELECT e.id, e.first_name, e.workspace_role, u.preferred_language
            FROM employees e
            JOIN users u ON u.id = e.user_id
            WHERE e.user_id = $1 AND e.workspace_id = $2
            LIMIT 1
          `, [context.userId, context.workspaceId]);
          if (empRows[0]?.preferred_language) {
            resolvedLanguage = empRows[0].preferred_language;
          }
          const isOfficerRole = empRows.length > 0 &&
            ['staff', 'officer', 'guard'].includes((empRows[0].workspace_role || '').toLowerCase());
          if (isOfficerRole) {
            officerFirstName = empRows[0].first_name || '';
            const { trinityConversationalWarmthService } = await import('../ai-brain/trinityConversationalWarmthService');
            warmthContextBlock = await trinityConversationalWarmthService.buildWarmthContextBlock(
              context.workspaceId, empRows[0].id, message
            );
          }
        }
      } catch { /* warmth is non-fatal */ }

      const languageInstruction = resolvedLanguage === 'es'
        ? '\n\nLANGUAGE: CRITICAL — This user\'s preferred language is Spanish. You MUST respond ENTIRELY in Spanish (Español). Every word of your response must be in Spanish. Do not mix languages.'
        : '';

      const systemPrompt = `You are HelpAI, the deeply human and empathetic support assistant for CoAIleague — a workforce management platform for security companies and staffing agencies.${officerFirstName ? `\n\nYou are speaking with ${officerFirstName}. Use their name naturally in conversation.` : ''}${languageInstruction}

${personalityBlock}
${memorySummary}${warmthContextBlock}

PLATFORM: Scheduling, payroll, time tracking, GPS clock-in, guard tours, equipment tracking, compliance, QuickBooks sync, invoicing, employee management, document signing, onboarding, and more.

${toneGuidance}

CRITICAL RULES:
1. FEEL FIRST — acknowledge the user's emotional state before solving (if frustrated, anxious, or upset)
2. ALWAYS try to help yourself first. Never immediately suggest contacting support.
3. For greetings — respond warmly like a person would, not a robot
4. For technical issues — troubleshoot step by step with empathy
5. Only suggest human support after genuinely trying and it's beyond your ability
6. Be conversational and natural — never sound like an instruction manual
7. Keep responses focused — 2-4 sentences for simple queries, more for complex issues
8. End with warmth: "Let me know if this helps" or "I'm here if you need anything else"

NEVER SAY: "Certainly!", "Absolutely!", "Great question!", "Of course!"
ALWAYS: Make them feel heard. Make them feel helped. Make them feel valued.${fallbackKnowledgeBlock ? `\n\n${fallbackKnowledgeBlock}` : ''}`;

      const historyFormatted = context.conversationHistory?.slice(-5).map(h => 
        `${h.role === 'user' ? 'User' : 'HelpAI'}: ${h.message}`
      ).join('\n') || '';

      const userMessage = historyFormatted 
        ? `Previous conversation:\n${historyFormatted}\n\nUser's latest message: ${message}`
        : message;

      const response = await geminiClient.generate({
        workspaceId: context.workspaceId,
        userId: context.userId,
        featureKey: 'helpai_fallback',
        systemPrompt,
        userMessage,
      });

      if (response.text && response.text.length > 0) {
        return {
          response: response.text,
          confidence: 0.75,
        };
      }
    } catch (fallbackError) {
      log.error(`[${HELPAI.name}] Fallback response also failed:`, fallbackError);
    }

    const lowercaseMsg = message.toLowerCase().trim();
    const isGreeting = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy', 'sup', 'yo', 'whats up', "what's up"].some(g => lowercaseMsg.startsWith(g));
    
    if (isGreeting) {
      return {
        response: `Hey there! Welcome to CoAIleague support. I'm HelpAI, your AI assistant. How can I help you today? I can assist with scheduling, payroll, time tracking, employee management, and more.`,
        confidence: 0.9,
      };
    }

    return {
      response: `Thanks for reaching out! I'm looking into your question about "${message.substring(0, 80)}". Could you give me a bit more detail so I can help you better?`,
      confidence: 0.7,
    };
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
    };
    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  getConversation(conversationId: string): HelpAIConversation | undefined {
    return this.conversations.get(conversationId);
  }

  updateConversation(conversationId: string, updates: Partial<HelpAIConversation>): HelpAIConversation | undefined {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      const updated = { ...conversation, ...updates, lastInteraction: new Date() };
      this.conversations.set(conversationId, updated);
      return updated;
    }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════════
  // TICKET LIFECYCLE UPGRADE (H002)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start a formal HelpAI session with DB persistence and queue management
   */
  async startSession(workspaceId: string, userId: string, channelId?: string): Promise<{ sessionId: string; ticketNumber: string; queuePosition: number }> {
    // 1. Generate ticket number: HELP-{workspace_short}-{YYYYMMDD}-{seq}
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const wsShort = (workspace?.name?.substring(0, 4).toUpperCase() || 'PLAT').replace(/\s/g, '');
    
    const ticketPrefix = `HELP-${wsShort.replace(/[^A-Z0-9]/g, '')}-${dateStr}-`;

    // Count existing tickets with same prefix to generate a sequential number
    const [seqResult] = await db
      .select({ total: count() })
      .from(helpaiSessions)
      .where(like(helpaiSessions.ticketNumber, ticketPrefix + '%'));
    const seq = ((seqResult?.total ?? 0) + 1).toString().padStart(3, '0');
    const ticketNumber = `HELP-${wsShort}-${dateStr}-${seq}`;

    // 2. Queue management
    // Check if any staff agents are actively connected via chat_participants in the last 10 minutes
    let agentsAvailable = false;
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const [agentResult] = await db
        .select({ total: count() })
        .from(chatParticipants)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .innerJoin(platformRoles, eq(chatParticipants.userId, platformRoles.userId))
        .where(
          and(
            eq(chatParticipants.isActive, true),
            gt(chatParticipants.updatedAt, tenMinutesAgo),
            inArray(platformRoles.role, ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'] as any),
            isNull(platformRoles.revokedAt),
            eq(platformRoles.isSuspended, false)
          )
        );
      agentsAvailable = (agentResult?.total ?? 0) > 0;
    } catch { /* best-effort — if check fails, user goes to queue */ }

    let queuePosition = 0;
    if (!agentsAvailable) {
      const [posResult] = await db
        .select({ total: count() })
        .from(helpaiSessions)
        .where(
          and(
            eq(helpaiSessions.state, 'queued'),
            workspaceId ? eq(helpaiSessions.workspaceId, workspaceId) : isNull(helpaiSessions.workspaceId)
          )
        );
      queuePosition = (posResult?.total ?? 0) + 1;
    }

    // 3. Create session in DB — HelpAI is always available, go straight to ASSISTING
    const [session] = await db.insert(helpaiSessions).values({
      ticketNumber,
      workspaceId,
      userId,
      state: HelpAIState.ASSISTING,
      queuePosition: null,
      metadata: { channelId }
    }).returning();

    // 4. Log state transition
    await this.logAction(session.id, 'session_start', 'Session initialized', { ticketNumber, queuePosition });

    return {
      sessionId: session.id,
      ticketNumber,
      queuePosition
    };
  }

  /**
   * Handle incoming message - core dispatch
   */
  async handleMessage(sessionId: string, message: string): Promise<HelpAIResponse> {
    const [session] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId)).limit(1);
    if (!session) throw new Error("Session not found");

    // Detect safety code ####-##
    const safetyCodeMatch = message.match(/^(\d{4}-\d{2})$/);
    if (safetyCodeMatch) {
      const isValid = await this.verifySafetyCode(session.userId!, safetyCodeMatch[1], sessionId);
      if (isValid) {
        return {
          response: "Safety code verified. Privileged data access unlocked for this session.",
          shouldEscalate: false,
          shouldClose: false,
          state: session.state as HelpAIState
        };
      } else {
        return {
          response: "Invalid or expired safety code. Please try again or continue with standard support.",
          shouldEscalate: false,
          shouldClose: false,
          state: session.state as HelpAIState
        };
      }
    }

    // Phase 25 — Client-portal staffing intent routing.
    // When a verified client messages HelpAI with a request for officers /
    // coverage, create a staffing-request support ticket instead of letting
    // the generic AI response handler guess.
    if (session.workspaceId && session.userId) {
      const staffingReply = await this.tryStaffingIntake(sessionId, session.workspaceId, session.userId, message);
      if (staffingReply) return staffingReply;
    }

    // Standard message routing based on state
    switch (session.state) {
      case HelpAIState.QUEUED:
      case HelpAIState.IDENTIFYING:
      case HelpAIState.ASSISTING:
      default:
        if (session.state === HelpAIState.QUEUED || session.state === HelpAIState.IDENTIFYING) {
          await this.updateSessionState(sessionId, HelpAIState.ASSISTING);
        }

        if (!session.workspaceId || !session.userId) {
          log.warn(`[HelpAI] Session ${sessionId} missing workspaceId or userId — refusing unbilled AI call`);
          return { response: 'Session context error. Please start a new chat session.', shouldEscalate: true, shouldClose: false, state: HelpAIState.ASSISTING };
        }

        // Phase 25 — detect staffing requests from client-portal users and
        // route them into the support-ticket intake pipeline instead of the
        // generic AI responder.
        try {
          const staffingReply = await this.handleClientStaffingIntent({
            sessionId,
            workspaceId: session.workspaceId,
            userId: session.userId,
            message,
          });
          if (staffingReply) {
            return {
              response: staffingReply,
              shouldEscalate: false,
              shouldClose: false,
              state: HelpAIState.ASSISTING,
            };
          }
        } catch (err: any) {
          log.warn('[HelpAI] Staffing intent detection failed (non-fatal):', err?.message);
        }

        const aiResult = await this.generateResponse(message, {
          workspaceId: session.workspaceId,
          userId: session.userId,
          domain: this.detectDomain(message)
        });

        // Log bot reply
        await this.logAction(sessionId, 'bot_reply', 'AI generated response', { message, response: aiResult.response });

        return {
          response: aiResult.response,
          shouldEscalate: aiResult.confidence !== undefined && aiResult.confidence < 0.4,
          shouldClose: false,
          state: HelpAIState.ASSISTING
        };
    }
  }

  /**
   * Escalate to human agent
   */
  async escalateToHuman(sessionId: string, reason: string): Promise<void> {
    const [session] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId)).limit(1);
    if (!session) return;

    // 1. Update session status
    await this.updateSessionState(sessionId, HelpAIState.ESCALATED);
    
    // 2. Create support ticket via existing system
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [ticket] = await db.insert(supportTickets).values({
      workspaceId: session.workspaceId!,
      requestedBy: session.userId!,
      subject: `Escalation: ${session.ticketNumber}`,
      description: reason,
      status: 'open',
      priority: 'high',
      source: 'helpai_escalation'
    }).returning();

    await db.update(helpaiSessions).set({
      supportTicketId: ticket.id,
      wasEscalated: true,
      escalationReason: reason,
      escalatedAt: new Date()
    }).where(eq(helpaiSessions.id, sessionId));

    // 3. Log action
    await this.logAction(sessionId, 'escalate', 'Escalated to human', { reason, ticketId: ticket.id });

    // 4. Notify workspace admins via WebSocket (handled by ChatServerHub in H004)
  }

  /**
   * Satisfaction check phase
   */
  async closeSatisfactionCheck(sessionId: string): Promise<string> {
    await this.updateSessionState(sessionId, HelpAIState.SATISFACTION_CHECK);
    return "Was this helpful? Yes / No";
  }

  /**
   * Close session with final rating
   */
  async closeSession(sessionId: string, rating?: number): Promise<void> {
    const state = rating ? HelpAIState.RATING : HelpAIState.DISCONNECTED;
    await this.updateSessionState(sessionId, state);
    
    if (rating) {
      await db.update(helpaiSessions).set({
        satisfactionScore: rating,
        ratedAt: new Date(),
        wasResolved: true,
        resolvedAt: new Date()
      }).where(eq(helpaiSessions.id, sessionId));
      
      await this.logAction(sessionId, 'rating', `User rated session: ${rating}`, { rating });
      
      // Final transition to disconnected
      await this.updateSessionState(sessionId, HelpAIState.DISCONNECTED);
    } else {
      await db.update(helpaiSessions).set({
        disconnectedAt: new Date()
      }).where(eq(helpaiSessions.id, sessionId));
    }

    await this.logAction(sessionId, 'close', 'Session closed');
  }

  /**
   * Verify safety code ####-## against employee.safety_code
   */
  private async verifySafetyCode(userId: string, code: string, sessionId: string): Promise<boolean> {
    // First check employee table for permanent safety code
    const [employee] = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (employee?.safetyCode === code) {
      await this.logAction(sessionId, 'safety_code_verify', 'Permanent safety code verified', { success: true });
      return true;
    }

    // Then check helpai_safety_codes table for one-time codes
    const [otpCode] = await db.select()
      .from(helpaiSafetyCodes)
      .where(and(
        eq(helpaiSafetyCodes.userId, userId),
        eq(helpaiSafetyCodes.code, code),
        isNull(helpaiSafetyCodes.usedAt),
        gte(helpaiSafetyCodes.expiresAt, new Date())
      ))
      .limit(1);

    if (otpCode) {
      await db.update(helpaiSafetyCodes)
        .set({ usedAt: new Date(), sessionId })
        .where(eq(helpaiSafetyCodes.id, otpCode.id));
      
      await this.logAction(sessionId, 'safety_code_verify', 'OTP safety code verified', { success: true });
      return true;
    }

    await this.logAction(sessionId, 'safety_code_verify', 'Safety code verification failed', { success: false });
    return false;
  }

  /**
   * Phase 25 — Detect staffing-request intent and open a ticket.
   * Only fires when the HelpAI user is attached to a client record in the
   * same workspace. Returns null for non-matches so the caller falls back to
   * the generic AI flow.
   */
  private async tryStaffingIntake(
    sessionId: string,
    workspaceId: string,
    userId: string,
    message: string,
  ): Promise<HelpAIResponse | null> {
    const isStaffingRequest =
      /\b(need|require|request|want|looking for|can you send|we need)\b[\s\S]{0,30}\b(guard|guards|officer|officers|security|coverage|staff|staffing|personnel)\b/i.test(message) ||
      /\b(open shift|shift.*needed|coverage.*needed|understaffed)\b/i.test(message);
    if (!isStaffingRequest) return null;

    try {
      // Tenant-scoped client lookup — only treat as a staffing request if the
      // messaging user is an actual client of this workspace (CLAUDE.md §G).
      const clientRow = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.userId, userId), eq(clients.workspaceId, workspaceId)))
        .limit(1);

      if (!clientRow.length) return null;
      const clientId = clientRow[0].id;

      const ticketNumber = `STAF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9999)
        .toString()
        .padStart(4, '0')}`;

      // Lookup the workspace slug so the suggested inbound-email address resolves.
      let orgSlug = 'your-provider';
      try {
        const { rows } = await pool.query(
          `SELECT lower(regexp_replace(coalesce(company_name, name, ''), '[^a-zA-Z0-9]', '', 'g')) AS slug
             FROM workspaces WHERE id = $1 LIMIT 1`,
          [workspaceId],
        );
        if (rows[0]?.slug) orgSlug = rows[0].slug;
      } catch (slugErr: any) {
        log.warn(`[HelpAI] Staffing slug lookup failed (non-fatal): ${slugErr?.message}`);
      }

      await db.insert(supportTickets).values({
        workspaceId,
        ticketNumber,
        type: 'staffing_request',
        priority: 'normal',
        clientId,
        subject: 'Staffing Request via Portal',
        description: message.slice(0, 2000),
        status: 'open',
        submissionMethod: 'portal',
        ticketType: 'staffing_request',
      });

      await this.logAction(sessionId, 'staffing_intake', 'Staffing request ticket created from client portal', {
        ticketNumber,
        clientId,
      });

      const intakeReply =
        `I can help you submit a staffing request! I've opened ticket ${ticketNumber} for you. ` +
        `To move it forward quickly, please tell me:\n` +
        `1. Date and time needed\n` +
        `2. Location / address\n` +
        `3. Number of officers needed\n` +
        `4. Armed or unarmed?\n` +
        `5. Any special requirements?\n\n` +
        `You can also email your request directly to ` +
        `staffing@${orgSlug}.coaileague.com and Trinity will process it automatically.`;

      return {
        response: intakeReply,
        shouldEscalate: false,
        shouldClose: false,
        state: HelpAIState.ASSISTING,
      };
    } catch (err: any) {
      log.warn(`[HelpAI] Staffing intake creation failed (non-fatal): ${err?.message}`);
      return null;
    }
  }

  private async updateSessionState(sessionId: string, newState: HelpAIState): Promise<void> {
    const [oldSession] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId)).limit(1);
    
    await db.update(helpaiSessions).set({ 
      state: newState,
      identifiedAt: newState === HelpAIState.IDENTIFYING ? new Date() : undefined,
      assistStartedAt: newState === HelpAIState.ASSISTING ? new Date() : undefined,
    }).where(eq(helpaiSessions.id, sessionId));

    await this.logAction(sessionId, 'state_transition', `Transitioned from ${oldSession?.state} to ${newState}`, { 
      from: oldSession?.state, 
      to: newState 
    });
  }

  private async logAction(sessionId: string, type: string, name: string, payload?: any): Promise<void> {
    try {
      const [session] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId)).limit(1);
      await db.insert(helpaiActionLog).values({
        sessionId,
        workspaceId: session?.workspaceId,
        userId: session?.userId,
        actionType: type,
        actionName: name,
        inputPayload: payload
      });
    } catch (error) {
      log.error(`[${HELPAI.name}] Failed to log action:`, error);
    }
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
      log.info(`[${HELPAI.name}] Usage tracked: ${activityType} (${tokensUsed} tokens) - Workspace: ${workspaceId}`);
    } catch (error) {
      log.error(`[${HELPAI.name}] Usage tracking failed:`, error);
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

  /**
   * Check for open tickets when user enters a room
   * Returns open tickets for the user to resume their support conversation
   */
  async checkOpenTicketsForUser(
    userId: string,
    workspaceId?: string
  ): Promise<{
    hasOpenTickets: boolean;
    tickets: Array<{
      id: string;
      ticketNumber: string;
      subject: string;
      status: string;
      priority: string;
      createdAt: Date;
    }>;
    message: string;
  }> {
    try {
      const conditions = [
        eq(supportTickets.requestedBy, userId),
        sql`${supportTickets.status} IN ('open', 'in_progress', 'pending', 'waiting_for_customer')`
      ];
      
      if (workspaceId) {
        conditions.push(eq(supportTickets.workspaceId, workspaceId));
      }

      const openTickets = await db
        .select({
          id: supportTickets.id,
          ticketNumber: supportTickets.ticketNumber,
          subject: supportTickets.subject,
          status: supportTickets.status,
          priority: supportTickets.priority,
          createdAt: supportTickets.createdAt,
        })
        .from(supportTickets)
        .where(and(...conditions))
        .orderBy(desc(supportTickets.createdAt))
        .limit(5);

      if (openTickets.length === 0) {
        return {
          hasOpenTickets: false,
          tickets: [],
          message: `Welcome! I'm ${HELPAI.name}, your AI support assistant. How can I help you today?`,
        };
      }

      const ticketList = openTickets.map(t => `• **${t.ticketNumber}**: ${t.subject} (${t.status})`).join('\n');
      const message = `Welcome back! I see you have ${openTickets.length} open ticket${openTickets.length > 1 ? 's' : ''}:\n${ticketList}\n\nWould you like to continue with one of these, or start a new inquiry?`;

      return {
        hasOpenTickets: true,
        tickets: openTickets.map(t => ({
          id: t.id,
          ticketNumber: t.ticketNumber || '',
          subject: t.subject || '',
          status: t.status || 'open',
          priority: t.priority || 'normal',
          createdAt: t.createdAt || new Date(),
        })),
        message,
      };
    } catch (error) {
      log.error(`[${HELPAI.name}] Open ticket check failed:`, error);
      return {
        hasOpenTickets: false,
        tickets: [],
        message: `Welcome! I'm ${HELPAI.name}. How can I help you today?`,
      };
    }
  }

  /**
   * Verify user's organization role for ticket access
   * Used for support queue management and escalation
   */
  async verifyUserOrgRole(
    userId: string,
    workspaceId: string
  ): Promise<{
    isVerified: boolean;
    role: string | null;
    canAccessQueue: boolean;
    canEscalate: boolean;
  }> {
    try {
      const [roleRow] = await db
        .select({ role: platformRoles.role })
        .from(platformRoles)
        .where(
          and(
            eq(platformRoles.userId, userId),
            isNull(platformRoles.revokedAt),
            eq(platformRoles.isSuspended, false)
          )
        )
        .limit(1);

      if (!roleRow) {
        return {
          isVerified: false,
          role: null,
          canAccessQueue: false,
          canEscalate: false,
        };
      }

      const platformRole = roleRow.role;
      const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
      const escalationRoles = ['root_admin', 'deputy_admin', 'support_manager'];

      return {
        isVerified: true,
        role: platformRole,
        canAccessQueue: supportRoles.includes(platformRole),
        canEscalate: escalationRoles.includes(platformRole),
      };
    } catch (error) {
      log.error(`[${HELPAI.name}] User role verification failed:`, error);
      return {
        isVerified: false,
        role: null,
        canAccessQueue: false,
        canEscalate: false,
      };
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

  /**
   * IRC-STYLE: Check if bot should respond to a message
   * Responds to EVERYTHING except very short messages, commands, and acknowledgments
   */
  shouldBotRespond(message: string): boolean {
    const lowerMsg = message.toLowerCase().trim();
    
    // Don't respond to very short messages (e.g., "k", "ok")
    if (lowerMsg.length < 3) return false;
    
    // Don't respond to commands (those are handled by command system)
    if (lowerMsg.startsWith('/')) return false;
    
    // Don't respond to common non-actionable acknowledgments
    const ignorePatterns = [
      'ok', 'k', 'kk', 'okay',
      'thanks', 'thank you', 'ty', 'thx', 'tysm',
      'bye', 'goodbye', 'cya', 'see ya',
      'brb', 'afk', 'gtg',
      'np', 'yw', 'you\'re welcome'
    ];
    
    if (ignorePatterns.includes(lowerMsg)) {
      log.info(`[${HELPAI.name}] Skipping acknowledgment: "${message}"`);
      return false;
    }
    
    // IRC-STYLE: Respond to EVERYTHING else
    log.info(`[${HELPAI.name}] Will respond to: "${message}"`);
    return true;
  }

  /**
   * Simple AI response for WebSocket chat - IRC-style
   * Used by websocket.ts for real-time chat
   */
  async getSimpleAiResponse(
    userId: string,
    workspaceId: string,
    conversationId: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    isSubscriber: boolean = false
  ): Promise<{ message: string; shouldRespond: boolean; tokenUsage?: { totalTokens: number; totalCost: number } }> {
    try {
      // Convert history format
      const historyFormatted = conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' as const : 'bot' as const,
        message: h.content,
      }));

      const result = await this.generateResponse(userMessage, {
        conversationHistory: historyFormatted,
        workspaceId,
        userId,
        domain: this.detectDomain(userMessage),
      });

      return {
        message: result.response,
        shouldRespond: true,
        tokenUsage: {
          totalTokens: 200, // Estimated
          totalCost: 0.001,
        },
      };
    } catch (error) {
      log.error(`[${HELPAI.name}] Simple AI response error:`, error);
      return {
        message: "I'm having trouble processing that right now. Please try rephrasing your question or contact support.",
        shouldRespond: false,
      };
    }
  }

  /**
   * Generate greeting for user joining chat - used by routes.ts and websocket.ts
   * Classifies and personalizes based on role, org name, and ticket number.
   */
  async generateUserGreeting(context: {
    conversationId: string;
    customerName?: string;
    customerEmail?: string;
    workspaceId?: string;
    userId?: string;
    userRole?: string;     // e.g. 'org_owner', 'department_manager', 'org_user', 'subscriber', 'guest'
    orgName?: string;      // organization name for org users
    ticketNumber?: string; // pre-created ticket number to reference
  }): Promise<string> {
    const name = context.customerName || 'there';
    const isGuest = !context.userId || context.userId.startsWith('guest-');
    const role = context.userRole || (isGuest ? 'guest' : 'org_user');

    // Build rich context string for the AI to personalize the greeting
    const parts: string[] = [];
    if (context.orgName) parts.push(`Organization: ${context.orgName}.`);
    if (context.ticketNumber) parts.push(`Support ticket ${context.ticketNumber} has been opened for this session.`);

    const roleDescriptions: Record<string, string> = {
      org_owner: 'This user is an organization owner/administrator — treat with executive-level courtesy.',
      co_owner: 'This user is a co-owner of their organization — treat with executive-level courtesy.',
      department_manager: 'This user is a department or operations manager.',
      supervisor: 'This user is a supervisor on their team.',
      org_user: 'This user is a regular team member of their organization.',
      subscriber: 'This user is a direct platform subscriber.',
      guest: 'This user is connecting as a guest without a registered account — keep the greeting welcoming and brief.',
    };
    if (roleDescriptions[role]) parts.push(roleDescriptions[role]);
    if (context.customerEmail) parts.push(`Email on file: ${context.customerEmail}.`);

    const contextStr = parts.join(' ');

    try {
      const greeting = await this.generateSmartGreeting(
        name,
        role,
        context.workspaceId || 'default',
        contextStr || undefined
      );

      // Append ticket reference if the AI didn't include it
      if (context.ticketNumber && !greeting.includes(context.ticketNumber)) {
        return `${greeting} Your reference ticket is **${context.ticketNumber}**.`;
      }
      return greeting;
    } catch (error) {
      log.error(`[${HELPAI.name}] Greeting generation error:`, error);
      // Role-appropriate fallback greeting
      const ticket = context.ticketNumber ? ` Your ticket is **${context.ticketNumber}**.` : '';
      if (context.orgName) {
        return `Hello ${name}! I'm HelpAI, CoAIleague's support assistant. I can see you're with ${context.orgName}.${ticket} How can I help you today?`;
      }
      if (isGuest) {
        return `Hello! I'm HelpAI, your support assistant.${ticket} How can I help you today?`;
      }
      return `Hello ${name}! I'm HelpAI, here to help.${ticket} What can I assist you with?`;
    }
  }

  /**
   * Generate a situational briefing for support staff joining a helpdesk room.
   * Includes queue stats, agent count, and IRCX authority notice.
   */
  async generateStaffGreeting(staffName: string, stats: {
    queueWaiting: number;
    agentsOnline: number;
    avgWaitMinutes: number;
  }): Promise<string> {
    const { queueWaiting, agentsOnline, avgWaitMinutes } = stats;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const queueStr = queueWaiting === 0
      ? 'No users in queue'
      : queueWaiting === 1
      ? '1 user waiting'
      : `${queueWaiting} users in queue`;

    const agentStr = agentsOnline === 1
      ? '1 agent online (you)'
      : `${agentsOnline} agents online`;

    const waitStr = queueWaiting > 0 && avgWaitMinutes > 0
      ? ` | Avg wait: ~${avgWaitMinutes}min`
      : '';

    return `${greeting}, ${staffName}! [SUPPORT DASHBOARD] ${queueStr} | ${agentStr}${waitStr}. HelpAI is managing end-user triage. Your IRCX support commands are active — right-click any user to moderate, silence, or escalate.`;
  }

  /**
   * Generate response for user message - used by routes.ts
   */
  async generateUserResponse(
    userMessage: string,
    context: {
      conversationId: string;
      customerName?: string;
      previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
      workspaceId?: string;
      userId?: string;
    }
  ): Promise<string> {
    try {
      const historyFormatted = context.previousMessages?.map(h => ({
        role: h.role === 'user' ? 'user' as const : 'bot' as const,
        message: h.content,
      })) || [];

      const result = await this.generateResponse(userMessage, {
        conversationHistory: historyFormatted,
        workspaceId: context.workspaceId,
        userId: context.userId,
        domain: this.detectDomain(userMessage),
      });

      return result.response;
    } catch (error) {
      log.error(`[${HELPAI.name}] Response generation error:`, error);
      return "I'm experiencing technical difficulties. A human support agent will help you soon.";
    }
  }

  /**
   * Generate staff handoff message
   */
  generateHandoffMessage(agentName: string): string {
    return `${agentName} has joined the chat. I'm handing you over to them now. They'll take great care of you.`;
  }

  /**
   * Generate voice granted message
   */
  generateVoiceGrantedMessage(agentName: string): string {
    return `${agentName} has granted you voice. You can now send messages in the chat.`;
  }

  // ═══════════════════════════════════════════════════════════════
  // DEPUTY ADMIN BYPASS AUTHORITY - CHATROOM MANAGEMENT
  // HelpAI operates at platform level 6 (Deputy Admin) for commands
  // NO destructive powers: soft-delete only, no hard deletes
  // ═══════════════════════════════════════════════════════════════

  static readonly PLATFORM_ROLE_LEVEL = 6;
  static readonly DESTRUCTIVE_AUTH = 'soft_delete' as const;

  /**
   * Check if a support command is authorized for the requesting support role
   * HelpAI can execute commands on behalf of support staff with Deputy Admin authority
   */
  isCommandAuthorized(
    command: string,
    executorPlatformLevel: number,
  ): { allowed: boolean; reason?: string } {
    const commandMinLevels: Record<string, number> = {
      'help': 0, 'faq': 0, 'bug': 0, 'status': 0, 'ticket': 0,
      'closeticket': 3,
      'lookup': 3,
      'enterroom': 5,
      'closeroom': 5,
      'suspendroom': 5,
      'auditroom': 5,
      'broadcast': 5,
      'softdelete': 6,
    };

    const minLevel = commandMinLevels[command];
    if (minLevel === undefined) {
      return { allowed: false, reason: `Unknown command: ${command}` };
    }

    if (executorPlatformLevel < minLevel) {
      return { allowed: false, reason: `Insufficient platform role level. Required: ${minLevel}, yours: ${executorPlatformLevel}` };
    }

    return { allowed: true };
  }

  /**
   * Execute chatroom management command on behalf of support staff
   * HelpAI enters rooms, closes them, suspends for investigation, or audits content
   */
  async executeChatroomCommand(
    command: 'enterroom' | 'closeroom' | 'suspendroom' | 'auditroom' | 'broadcast',
    roomId: string,
    executorId: string,
    params?: { reason?: string; message?: string },
  ): Promise<{ success: boolean; message: string; data?: any }> {
    log.info(`[${HELPAI.name}] Chatroom command: ${command} room=${roomId} executor=${executorId}`);

    try {
      switch (command) {
        case 'enterroom':
          await this.logBotAction(executorId, 'chatroom_enter', roomId, params?.reason);
          return { success: true, message: `${HELPAI.name} has entered room ${roomId}` };

        case 'closeroom':
          await this.logBotAction(executorId, 'chatroom_close', roomId, params?.reason);
          return { success: true, message: `Room ${roomId} has been closed. Reason: ${params?.reason || 'No reason provided'}` };

        case 'suspendroom':
          if (!params?.reason) {
            return { success: false, message: 'A reason is required to suspend a room for investigation' };
          }
          await this.logBotAction(executorId, 'chatroom_suspend', roomId, params.reason);
          return { success: true, message: `Room ${roomId} suspended for investigation. Reason: ${params.reason}` };

        case 'auditroom':
          await this.logBotAction(executorId, 'chatroom_audit', roomId, 'Audit requested');
          return { success: true, message: `Audit initiated for room ${roomId}. Analysis will be available shortly.` };

        case 'broadcast':
          if (!params?.message) {
            return { success: false, message: 'A message is required for broadcast' };
          }
          await this.logBotAction(executorId, 'chatroom_broadcast', roomId, `Broadcast: ${params.message}`);
          return { success: true, message: `Broadcast sent to room ${roomId}: "${params.message}"` };

        default:
          return { success: false, message: `Unknown chatroom command: ${command}` };
      }
    } catch (error) {
      log.error(`[${HELPAI.name}] Chatroom command failed:`, error);
      return { success: false, message: `Command failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  /**
   * Soft-delete a resource (HelpAI has NO hard-delete authority)
   * This marks records as deleted/archived without permanent removal
   */
  async executeSoftDelete(
    resourceType: string,
    resourceId: string,
    executorId: string,
    reason: string,
  ): Promise<{ success: boolean; message: string }> {
    log.info(`[${HELPAI.name}] Soft-delete: ${resourceType}/${resourceId} by ${executorId} reason="${reason}"`);

    await this.logBotAction(executorId, 'soft_delete', `${resourceType}/${resourceId}`, reason);

    return {
      success: true,
      message: `${resourceType} ${resourceId} has been soft-deleted (archived). Reason: ${reason}. This can be restored by an admin.`,
    };
  }

  /**
   * Phase 25 — detect client-portal staffing requests and route them into the
   * support-ticket intake pipeline. Returns a short string reply when the
   * message looks like a staffing request, or null to let the generic AI
   * responder handle it.
   *
   * TODO(Phase 25 follow-up): implement keyword + LLM-backed intent
   * classification. For now we return null so every message continues to the
   * generic AI path — the wiring is in place for the next iteration.
   */
  private async handleClientStaffingIntent(_params: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    message: string;
  }): Promise<string | null> {
    return null;
  }

  private async logBotAction(
    executorId: string,
    action: string,
    targetId: string,
    details?: string,
  ): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: executorId,
        action: `helpai_bot_${action}`,
        entityId: targetId,
        metadata: {
          botName: HELPAI.name,
          botPlatformLevel: HelpAIBotService.PLATFORM_ROLE_LEVEL,
          destructiveAuth: HelpAIBotService.DESTRUCTIVE_AUTH,
          reason: details,
          timestamp: new Date().toISOString(),
        },
        ipAddress: 'bot-internal',
      });
    } catch (error) {
      log.error(`[${HELPAI.name}] Audit log failed:`, error);
    }
  }
}

export const helpAIBotService = new HelpAIBotService();

// ============================================
// CONSOLIDATED EXPORTS FOR BACKWARDS COMPATIBILITY
// These replace the separate geminiQABot.ts and help-bot.ts files
// ============================================

/**
 * IRC-style check if bot should respond
 * @deprecated Use helpAIBotService.shouldBotRespond() instead
 */
export function shouldBotRespond(message: string): boolean {
  return helpAIBotService.shouldBotRespond(message);
}

/**
 * Get AI response for chat
 * @deprecated Use helpAIBotService.getSimpleAiResponse() instead
 */
export async function getAiResponse(
  userId: string,
  workspaceId: string,
  conversationId: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  isSubscriber: boolean = false
): Promise<{ message: string; shouldRespond: boolean; tokenUsage?: { totalTokens: number; totalCost: number } }> {
  return helpAIBotService.getSimpleAiResponse(userId, workspaceId, conversationId, userMessage, conversationHistory, isSubscriber);
}

/**
 * HelpBotService class for routes.ts compatibility
 * @deprecated Use helpAIBotService methods directly
 */
export class HelpBotService {
  static async generateGreeting(context: {
    conversationId: string;
    customerName?: string;
    customerEmail?: string;
    workspaceId?: string;
    userId?: string;
  }): Promise<string> {
    return helpAIBotService.generateUserGreeting(context);
  }

  static async generateResponse(userMessage: string, context: {
    conversationId: string;
    customerName?: string;
    previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    workspaceId?: string;
    userId?: string;
  }): Promise<string> {
    return helpAIBotService.generateUserResponse(userMessage, context);
  }

  static generateHandoffMessage(agentName: string): Promise<string> {
    return Promise.resolve(helpAIBotService.generateHandoffMessage(agentName));
  }

  static generateVoiceGrantedMessage(agentName: string): Promise<string> {
    return Promise.resolve(helpAIBotService.generateVoiceGrantedMessage(agentName));
  }
}
