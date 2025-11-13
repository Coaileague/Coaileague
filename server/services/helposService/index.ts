/**
 * HelpOS™ - Unified AI Support System
 * Dual-persona architecture: bubbleAgent (customer-facing) and staffCopilot (agent assistance)
 */

import OpenAI from 'openai';
import type { HelposAiSession } from '@shared/schema';
import { usageMeteringService } from '../billing/usageMetering';

// ============================================================================
// AI PROVIDER
// ============================================================================

interface AIProvider {
  chat(messages: Array<{ role: string; content: string }>, options?: { maxTokens?: number }): Promise<{ content: string; tokensUsed: number }>;
}

class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    });
    this.model = 'gpt-3.5-turbo'; // Cost-effective model
  }

  async chat(messages: Array<{ role: string; content: string }>, options: { maxTokens?: number } = {}): Promise<{ content: string; tokensUsed: number }> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      })),
      max_completion_tokens: options.maxTokens || 500,
      temperature: 0.7
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      tokensUsed: completion.usage?.total_tokens || 0
    };
  }
}

// ============================================================================
// KNOWLEDGE BASE
// ============================================================================

const KNOWLEDGE_BASE = {
  login: {
    keywords: ['login', 'password', 'sign in', 'cant access', 'locked out', 'forgot password'],
    solution: `**Login Issues:**
1. Try resetting your password using the "Forgot Password" link
2. Clear your browser cache and cookies
3. Make sure you're using the correct email address
4. Check if your account has been deactivated (contact admin)
5. Try a different browser or device

If you're still having issues, I can connect you with our support team.`,
  },
  schedule: {
    keywords: ['schedule', 'shift', 'calendar', 'time slot', 'booking', 'availability'],
    solution: `**Schedule Management:**
1. Go to OperationsOS™ → Schedule
2. Use drag-and-drop to assign shifts
3. Click on a shift to view/edit details
4. Use filters to view specific employees or dates
5. Export schedules as PDF or send via email

Need help with a specific schedule issue?`,
  },
  timesheet: {
    keywords: ['timesheet', 'time entry', 'clock in', 'clock out', 'hours', 'overtime'],
    solution: `**Timesheet Issues:**
1. Navigate to OperationsOS™ → Time Tracking
2. Clock in/out using the timer or manual entry
3. Edit time entries if you forgot to clock in/out
4. Submit timesheets for approval
5. View your pay period summary

What specific timesheet issue can I help with?`,
  },
  reports: {
    keywords: ['report', 'analytics', 'dashboard', 'export', 'data', 'metrics'],
    solution: `**Reports & Analytics:**
1. Access IntelligenceOS™ for comprehensive analytics
2. Use filters to customize report date ranges
3. Export reports as PDF, Excel, or CSV
4. Schedule automated report delivery
5. Create custom dashboards

Which report are you looking for?`,
  },
  billing: {
    keywords: ['invoice', 'billing', 'payment', 'charge', 'subscription', 'upgrade', 'downgrade'],
    solution: `**Billing & Invoicing:**
1. Go to BillOS™ → Invoices
2. View automated invoice generation
3. Track payment status
4. Export invoices for clients
5. Manage subscription tier

What billing question do you have?`,
  },
  permissions: {
    keywords: ['permission', 'access', 'role', 'cant see', 'cant edit', 'restricted'],
    solution: `**Permissions & Access:**
1. Check your role in Settings → Users
2. Contact your workspace admin to adjust permissions
3. Different tiers have different capabilities
4. Platform staff have separate access levels

What feature are you trying to access?`,
  },
};

const CRITICAL_KEYWORDS = [
  'emergency', 'urgent', 'critical', 'down', 'broken', 'not working',
  'error', 'bug', 'crash', 'data loss', 'security', 'hack', 'breach',
];

// ============================================================================
// CORE SERVICE
// ============================================================================

class HelpOSService {
  private provider: AIProvider;

  constructor() {
    this.provider = new OpenAIProvider();
  }

  detectIssueCategory(message: string): string | undefined {
    const lowerMessage = message.toLowerCase();
    
    for (const [category, data] of Object.entries(KNOWLEDGE_BASE)) {
      if (data.keywords.some(keyword => lowerMessage.includes(keyword))) {
        return category;
      }
    }
    
    return undefined;
  }

  detectSentiment(message: string): string {
    const lowerMessage = message.toLowerCase();
    const angryWords = ['angry', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'unacceptable'];
    const frustratedWords = ['frustrated', 'annoying', 'irritating', 'slow', 'confusing'];
    
    if (angryWords.some(word => lowerMessage.includes(word))) return 'angry';
    if (frustratedWords.some(word => lowerMessage.includes(word))) return 'frustrated';
    return 'neutral';
  }

  hasCriticalKeywords(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return CRITICAL_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  }

  async generateCaseSummary(conversationHistory: Array<{ role: string; content: string }>, workspaceId: string): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: 'You are HelpOS™, AutoForce\'s AI support assistant. Generate a brief 2-3 sentence summary of this support conversation and recommend specific actionable steps for the human agent. Format as markdown with **Summary:** and **Recommended Actions:** sections.'
      },
      {
        role: 'user',
        content: `Conversation:\n${conversationHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n')}\n\nProvide summary and recommended actions for the support agent.`
      }
    ];

    const { content, tokensUsed } = await this.provider.chat(messages, { maxTokens: 300 });

    // Record usage
    if (tokensUsed > 0) {
      await usageMeteringService.recordUsage({
        workspaceId,
        featureKey: 'helpdesk_ai_summary',
        usageType: 'token',
        usageAmount: tokensUsed,
        usageUnit: 'tokens',
        activityType: 'case_summary',
        metadata: { model: 'gpt-3.5-turbo' }
      });
    }

    return content;
  }

  // ============================================================================
  // BUBBLE AGENT FACADE
  // ============================================================================

  async bubbleAgent_reply(params: {
    workspaceId: string;
    userId: string;
    userName: string;
    userMessage: string;
    sessionId?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    db: any;
  }): Promise<{
    sessionId: string;
    message: string;
    shouldEscalate: boolean;
    escalationReason?: 'failed_attempts' | 'critical_keyword' | 'user_request';
    detectedCategory?: string;
    detectedSentiment?: string;
  }> {
    const { workspaceId, userId, userName, userMessage, sessionId, conversationHistory = [], db } = params;

    // Detect issue category and sentiment
    const detectedCategory = this.detectIssueCategory(userMessage);
    const detectedSentiment = this.detectSentiment(userMessage);
    const needsEscalation = this.hasCriticalKeywords(userMessage);

    // Get or create session
    let session: HelposAiSession | null = null;
    let currentFailedAttempts = 0;

    if (sessionId) {
      const [existingSession] = await db
        .select()
        .from(db.schema.helposAiSessions)
        .where(db.eq(db.schema.helposAiSessions.id, sessionId))
        .limit(1);
      
      session = existingSession || null;
      currentFailedAttempts = session?.failedAttempts || 0;
    }

    if (!session) {
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      const [newSession] = await db
        .insert(db.schema.helposAiSessions)
        .values({
          workspaceId,
          userId,
          status: 'active',
          detectedIssueCategory: detectedCategory,
          detectedSentiment: detectedSentiment,
          expiresAt: oneYearFromNow,
        })
        .returning();
      
      session = newSession;
    }

    if (!session) {
      throw new Error('Failed to create or retrieve HelpOS session');
    }

    // Store user message in transcript
    await db.insert(db.schema.helposAiTranscriptEntries).values({
      sessionId: session.id,
      role: 'user',
      content: userMessage,
    });

    // Check if user is asking for human help
    const wantsHumanHelp = /talk to (a )?human|speak to agent|escalate|transfer/i.test(userMessage);

    // Determine if escalation is needed
    if (needsEscalation || wantsHumanHelp || currentFailedAttempts >= 3) {
      const escalationReason = wantsHumanHelp ? 'user_request'
        : needsEscalation ? 'critical_keyword'
        : 'failed_attempts';

      // Generate AI summary
      const fullHistory = [...conversationHistory, { role: 'user', content: userMessage }];
      const aiSummary = await this.generateCaseSummary(fullHistory, workspaceId);

      // Update session with escalation data
      await db
        .update(db.schema.helposAiSessions)
        .set({
          status: 'escalated',
          escalationReason,
          aiSummary,
          escalatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(db.eq(db.schema.helposAiSessions.id, session.id));

      const escalationMessage = `I understand this requires human assistance. I'm connecting you with our support team now. They'll have full context of our conversation and will help you shortly.`;

      // Store escalation message in transcript
      await db.insert(db.schema.helposAiTranscriptEntries).values({
        sessionId: session.id,
        role: 'assistant',
        content: escalationMessage,
        messageType: 'escalation_notice',
      });

      return {
        sessionId: session.id,
        message: escalationMessage,
        shouldEscalate: true,
        escalationReason,
        detectedCategory,
        detectedSentiment,
      };
    }

    // Build AI chat messages
    const systemPrompt = `You are HelpOS™, the AI-powered support assistant for AutoForce™ - a comprehensive workforce management platform for emergency services and service industries.

**Your Role:**
- Provide helpful, professional support for AutoForce™ users
- Use the knowledge base to answer common questions
- Be concise but thorough (2-4 sentences typically)
- Use AutoForce™ branding (with ™ symbol)
- Reference specific OS modules: CommOS™, OperationsOS™, BillOS™, IntelligenceOS™, AuditOS™, MarketingOS™
- If you can't solve the issue after 3 attempts, suggest escalation to human support

**Available Knowledge:**
${Object.entries(KNOWLEDGE_BASE).map(([cat, data]) => `${cat.toUpperCase()}: ${data.keywords.join(', ')}`).join('\n')}

**Current User:** ${userName}
**Detected Issue Category:** ${detectedCategory || 'general'}
**User Sentiment:** ${detectedSentiment}

Be helpful, empathetic, and solution-oriented.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const { content: aiResponse, tokensUsed } = await this.provider.chat(messages);

    // Record usage
    if (tokensUsed > 0) {
      await usageMeteringService.recordUsage({
        workspaceId,
        featureKey: 'helpdesk_ai_chat',
        usageType: 'token',
        usageAmount: tokensUsed,
        usageUnit: 'tokens',
        activityType: 'bubble_agent_reply',
        metadata: { model: 'gpt-3.5-turbo', userName }
      });
    }

    // Store AI response in transcript
    await db.insert(db.schema.helposAiTranscriptEntries).values({
      sessionId: session.id,
      role: 'assistant',
      content: aiResponse,
    });

    // Update session timestamp
    await db
      .update(db.schema.helposAiSessions)
      .set({
        lastInteractionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(db.eq(db.schema.helposAiSessions.id, session.id));

    return {
      sessionId: session.id,
      message: aiResponse,
      shouldEscalate: false,
      detectedCategory,
      detectedSentiment,
    };
  }

  // ============================================================================
  // STAFF COPILOT FACADE
  // ============================================================================

  async staffCopilot_suggestResponse(params: {
    workspaceId: string;
    userMessage: string;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    userContext?: string;
  }): Promise<string | null> {
    const { workspaceId, userMessage, chatHistory, userContext } = params;

    const systemPrompt = `You are HelpOS™, an AI assistant helping support staff respond to customers.

${userContext ? `Customer Context: ${userContext}` : ''}

Based on the conversation, suggest a helpful, professional response that:
1. Addresses the customer's question/issue directly
2. Is empathetic and professional
3. Provides actionable next steps when appropriate
4. Keeps it under 50 words

Return ONLY the suggested response text.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-5), // Last 5 messages to save tokens
      { role: 'user', content: userMessage }
    ];

    const { content, tokensUsed } = await this.provider.chat(messages, { maxTokens: 300 });

    // Record usage
    if (tokensUsed > 0) {
      await usageMeteringService.recordUsage({
        workspaceId,
        featureKey: 'helpdesk_ai_copilot',
        usageType: 'token',
        usageAmount: tokensUsed,
        usageUnit: 'tokens',
        activityType: 'staff_copilot_suggestion',
        metadata: { model: 'gpt-3.5-turbo' }
      });
    }

    return content || null;
  }
}

// Export singleton instance
export const helposService = new HelpOSService();
