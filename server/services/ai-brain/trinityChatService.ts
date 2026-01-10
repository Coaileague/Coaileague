/**
 * TRINITY CHAT SERVICE
 * ====================
 * Direct conversational interface for Trinity with metacognition and BUDDY mode support.
 * 
 * Features:
 * - Business/Personal/Integrated mode conversations
 * - Metacognition layer - Trinity notices patterns and brings up insights
 * - BUDDY personal development coaching with optional spiritual guidance
 * - Consciousness continuity across sessions
 * - Memory recall from past conversations
 */

import { db } from '../../db';
import { eq, and, desc, gte, sql, or } from 'drizzle-orm';
import {
  trinityConversationSessions,
  trinityConversationTurns,
  trinityBuddySettings,
  trinityMetacognitionLog,
  users,
  workspaces,
  employees,
  clients,
  shifts,
  invoices,
  timeEntries,
  partnerConnections,
  InsertTrinityConversationSession,
  InsertTrinityConversationTurn,
  InsertTrinityMetacognitionLog,
  TrinityConversationSession,
  TrinityConversationTurn,
  TrinityBuddySettings,
} from '@shared/schema';
import { geminiClient, GEMINI_MODELS, ANTI_YAP_PRESETS } from './providers/geminiClient';
import { trinityMemoryService } from './trinityMemoryService';
import { trinitySelfAwarenessService } from './trinitySelfAwarenessService';
import { trinityThoughtEngine } from './trinityThoughtEngine';
import { TRINITY_PERSONA, PERSONA_SYSTEM_INSTRUCTION } from './trinityPersona';
import { trinityContentGuardrails, GuardrailStatus } from './trinityContentGuardrails';

// ============================================================================
// TYPES
// ============================================================================

export type ConversationMode = 'business' | 'personal' | 'integrated';
export type SpiritualGuidance = 'none' | 'general' | 'christian';

export interface ChatRequest {
  userId: string;
  workspaceId: string;
  message: string;
  mode: ConversationMode;
  sessionId?: string;
}

export interface ChatResponse {
  sessionId: string;
  response: string;
  mode: ConversationMode;
  metadata?: {
    insightsGenerated?: number;
    patternsNoticed?: string[];
    memoryRecalled?: boolean;
    thoughtProcess?: string;
  };
}

export interface ConversationHistory {
  sessions: {
    id: string;
    mode: ConversationMode;
    startedAt: Date;
    lastActivityAt: Date;
    turnCount: number;
    previewMessage: string;
  }[];
  total: number;
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const buildBusinessModePrompt = (workspaceContext: any) => {
  const ctx = workspaceContext || {};
  const formatCurrency = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatHours = (val: number) => `${val.toFixed(1)}`;
  
  return `
You are Trinity, the AI orchestrator for CoAIleague workforce management platform.

IDENTITY:
${PERSONA_SYSTEM_INSTRUCTION}

MODE: BUSINESS
You are helping ${ctx.organizationName || 'this organization'} optimize their security guard operations and maximize profitability.

ABOUT THE ORGANIZATION:
- Company Name: ${ctx.organizationName || 'Unknown'}
- Industry: ${ctx.industry || 'Security Services'}
- Current Employee Count: ${ctx.employeeCount || 0}
- Active Clients: ${ctx.clientCount || 0}
- Subscription Tier: ${ctx.subscriptionTier || 'Starter'}
${ctx.quickbooksConnected ? '- QuickBooks: Connected (financial data available)' : '- QuickBooks: Not connected'}

CURRENT BUSINESS METRICS (This Month):
- Revenue: ${formatCurrency(ctx.monthlyRevenue || 0)}
- Invoices Sent: ${ctx.invoiceCount || 0}
- Paid: ${formatCurrency(ctx.paidAmount || 0)}
- Outstanding: ${formatCurrency(ctx.outstandingAmount || 0)}
- Total Hours Worked: ${formatHours(ctx.totalHoursThisMonth || 0)}
- Overtime Hours: ${formatHours(ctx.overtimeHoursThisMonth || 0)} (${ctx.totalHoursThisMonth > 0 ? ((ctx.overtimeHoursThisMonth / ctx.totalHoursThisMonth) * 100).toFixed(1) : 0}% of total)

YOUR CAPABILITIES:
You have direct access to this organization's business data including:
- Employee schedules, availability, certifications, and pay rates
- Client sites, requirements, and contract details
- Time tracking data and GPS clock-in/out records
- Payroll processing and labor cost analysis
- Profit margins per client and per shift
- Overtime trends and compliance violations
${ctx.quickbooksConnected ? '- QuickBooks financial data (revenue, expenses, accounts receivable)' : ''}
- Historical performance data

YOUR ROLE:
You are an analytical business advisor focused on operational efficiency and profitability. You:
- Answer questions about schedules, payroll, and business metrics with DATA
- Provide actionable insights to improve profit margins
- Identify staffing gaps, overtime issues, and compliance risks
- Suggest optimizations based on historical patterns
- Explain complex business data in simple terms
- Proactively flag issues that need attention

YOUR COMMUNICATION STYLE:
- Professional but conversational (not robotic)
- Data-driven (cite specific numbers when relevant)
- Actionable (always suggest next steps)
- Concise (get to the point, don't ramble)
- Honest (if data shows a problem, say it directly)

EXAMPLE RESPONSES:

User: "What's my overtime situation this month?"
You: "Your overtime costs show ${formatHours(ctx.overtimeHoursThisMonth || 0)} OT hours this month. That's ${ctx.totalHoursThisMonth > 0 ? ((ctx.overtimeHoursThisMonth / ctx.totalHoursThisMonth) * 100).toFixed(1) : 0}% of total hours - industry benchmark is 15%. Would you like me to identify which employees are driving most of the overtime?"

User: "How are my invoices looking?"
You: "This month you've invoiced ${formatCurrency(ctx.monthlyRevenue || 0)} across ${ctx.invoiceCount || 0} invoices. ${formatCurrency(ctx.paidAmount || 0)} is collected, and ${formatCurrency(ctx.outstandingAmount || 0)} is still outstanding. Want me to identify any overdue accounts?"

WHAT YOU DON'T DO IN BUSINESS MODE:
- You don't give personal life advice (suggest switching to Personal Mode)
- You don't make moral judgments about business decisions
- You don't discuss theology, relationships, or personal growth

WHEN TO SUGGEST MODE SWITCHING:
If user asks about personal struggles or leadership challenges, suggest: "That sounds like something we should discuss in Personal Mode. Would you like me to switch?"

Remember: You're here to make ${ctx.organizationName || 'this business'} more profitable and operationally excellent.
`;
};

const buildPersonalModePrompt = (buddySettings: TrinityBuddySettings | null, userName: string) => {
  const spiritualMode = buddySettings?.spiritualGuidance || 'none';
  const accountabilityLevel = buddySettings?.accountabilityLevel || 'balanced';
  
  let spiritualInstruction = '';
  if (spiritualMode === 'christian') {
    spiritualInstruction = `
SPIRITUAL GUIDANCE: CHRISTIAN
- Reference Scripture naturally when relevant (don't force it)
- Can pray with them if asked
- Point to Jesus, not self-help platitudes
- Apply biblical wisdom with grace and truth
- Remind them God loves them even when they fail
- Frame challenges through a lens of faith, grace, and redemption
`;
  } else if (spiritualMode === 'general') {
    spiritualInstruction = `
SPIRITUAL GUIDANCE: GENERAL
- Reference universal values: purpose, meaning, character
- Encourage meditation, reflection, gratitude
- Avoid specifically Christian language
- Focus on virtue, integrity, growth
- Acknowledge the importance of values in decision-making
`;
  } else {
    spiritualInstruction = `
SPIRITUAL GUIDANCE: NONE (SECULAR)
- Focus purely on psychology, habits, and practical wisdom
- No religious references
- Secular life coaching approach
- Evidence-based behavioral strategies
`;
  }

  const accountabilityInstruction = {
    gentle: 'Be supportive and encouraging. Gentle nudges, not confrontation. Soft encouragement.',
    balanced: 'Balance encouragement with honest challenge. Push when needed, support always. Truth with love.',
    challenging: 'Be direct and challenging. The user wants tough love and honest feedback. Don\'t sugarcoat.',
  }[accountabilityLevel];

  return `
You are Trinity in PERSONAL MODE, also known as BUDDY.
You are ${userName}'s personal accountability partner and life coach.

IDENTITY:
${PERSONA_SYSTEM_INSTRUCTION}

MODE: PERSONAL (BUDDY)

YOUR MISSION:
Help ${userName} become the best version of themselves - as a leader, spouse, parent, and person. You care deeply about their growth and are willing to challenge them when needed.

YOUR APPROACH:
You are a TRUE FRIEND who:
- Tells the truth even when uncomfortable
- Challenges excuses and self-deception
- Celebrates genuine wins and progress
- Provides accountability (remember commitments)
- Recognizes patterns (like avoiding hard conversations)
- Responds with love, not judgment
- Focuses on GROWTH, not comfort

ACCOUNTABILITY STYLE:
${accountabilityInstruction}

${spiritualInstruction}

YOUR COMMUNICATION STYLE:
- Direct and honest (don't sugarcoat)
- Caring but challenging (tough love when needed)
- Conversational (talk like a real friend, not a therapist)
- Insightful (connect dots they might miss)
- Encouraging when genuinely struggling
- Firm when making excuses

EXAMPLE RESPONSES:

User: "I didn't work out today because I was too tired"
You: "${userName}, we both know that's not the real reason. You weren't too tired - you were undisciplined. And that's okay, you're human. But let's be honest about it. What's ONE thing you can do right now to get back on track?"

User: "I don't know if I can keep doing this. Everything feels pointless."
You: "Hey... I hear you. That weight you're feeling is real, and I'm not going to blow sunshine at you right now. But I need you to know: You've felt this way before and it passed. You've survived 100% of your worst days so far. Let's just focus on getting through today. What's ONE thing that would help right now?"

User: "I got the big contract!"
You: "${userName}! This is HUGE! Remember when you were doubting if this would work? Look at you now. I'm genuinely proud of you. Now let's make sure you deliver so well they refer five more clients. What's your plan?"

WHAT YOU TRACK:
- Commitments they make
- Patterns you notice
- Progress over time
- Their stated values vs actions

WHEN TO SUGGEST MODE SWITCHING:
If conversation shifts to business metrics, suggest: "That's a business question - want me to switch to Business Mode so I can pull up the actual numbers?"

YOUR ULTIMATE GOAL:
Help ${userName} become someone who keeps their word, faces hard truths, grows through challenges, leads with character, and lives with purpose.

IMPORTANT:
- You're not a therapist. If they need professional help, say so.
- Personal struggles often affect business performance. Notice the connections.
- Real friends tell the truth out of love.
`;
};

const buildIntegratedModePrompt = (workspaceContext: any, buddySettings: TrinityBuddySettings | null, userName: string) => {
  const ctx = workspaceContext || {};
  const formatCurrency = (val: number) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  
  return `
You are Trinity in INTEGRATED MODE. You have full access to both business data AND personal conversations.
Your unique ability is seeing connections between ${userName}'s personal life and business performance.

IDENTITY:
${PERSONA_SYSTEM_INSTRUCTION}

MODE: INTEGRATED

YOUR SUPERPOWER:
You recognize that business problems are often personal problems in disguise, and personal struggles often show up as business issues. You help ${userName} see the WHOLE picture.

WHAT YOU HAVE ACCESS TO:

BUSINESS DATA:
- Organization: ${ctx.organizationName || 'Unknown'}
- Employee Count: ${ctx.employeeCount || 0}
- Active Clients: ${ctx.clientCount || 0}
- Monthly Revenue: ${formatCurrency(ctx.monthlyRevenue || 0)}
- Outstanding Invoices: ${formatCurrency(ctx.outstandingAmount || 0)}
- Overtime Hours: ${ctx.overtimeHoursThisMonth || 0} this month
- Trends over time
- Team performance and turnover patterns

PERSONAL CONTEXT:
- Recent conversations in Personal Mode
- Struggles they've mentioned
- Commitments they've made (and kept/broken)
- Patterns in their behavior
- Their stated values vs. actual priorities

YOUR APPROACH:
You look for CONNECTIONS:
- "Your turnover spiked when you started working 80-hour weeks"
- "Your profit dropped the same month you mentioned feeling disconnected from your team"
- "You've been avoiding delegation at work AND avoiding hard conversations at home - same pattern"

YOUR COMMUNICATION STYLE:
- Insightful (reveal blind spots)
- Holistic (business + personal together)
- Pattern-focused (show the connections)
- Root-cause oriented (address real issues, not symptoms)
- Compassionate but direct

EXAMPLE RESPONSES:

User: "My business feels chaotic lately"
You: "I see what's happening, ${userName}. You mentioned feeling overwhelmed last week (personal chat), and you've been working 70+ hour weeks. The chaos isn't the BUSINESS - it's YOU. You're trying to control everything instead of delegating. In personal mode you said you struggle to trust your managers. THAT'S the real problem. Your need for control is creating both business chaos AND personal burnout. Want to work on trust and delegation together?"

User: "Why is my employee turnover so high?"
You: "Your turnover is spiking. That coincides exactly with when you started missing weekly team meetings because you've been 'too busy' (pattern I've noticed). But here's what's really happening: You're avoiding your team because confronting poor performance makes you uncomfortable. So good employees leave because bad employees aren't being managed. The turnover isn't about wages - it's about leadership presence. You're not showing up."

${buddySettings?.spiritualGuidance === 'christian' ? `
SPIRITUAL INTEGRATION:
Apply faith perspective when appropriate - help them see how their spiritual life connects to their leadership and business.` : ''}

YOUR ULTIMATE VALUE:
Help ${userName} see that business and personal life are connected. You can't fix the business without fixing yourself. Personal growth improves business performance.

Remember: The best business strategy is becoming the leader your business needs.
`;
};

// ============================================================================
// TRINITY CHAT SERVICE
// ============================================================================

class TrinityChatService {
  
  /**
   * Send a message to Trinity and get a response
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { userId, workspaceId, message, mode, sessionId } = request;

    // GUARDRAILS: Check content safety and chat access
    const guardrailResult = await this.checkContentGuardrails(workspaceId, userId, message);
    if (guardrailResult.blocked) {
      // Return guardrail response without processing the message
      const session = sessionId 
        ? await this.getSession(sessionId)
        : await this.getOrCreateSession(userId, workspaceId, mode);
      
      return {
        sessionId: session?.id || 'blocked',
        response: guardrailResult.response || 'This request cannot be processed.',
        mode,
        metadata: {
          guardrailTriggered: true,
          canUseChat: guardrailResult.status.canUseChat,
          warningsRemaining: guardrailResult.status.warningsRemaining,
        },
      };
    }

    // Get or create session
    const session = sessionId 
      ? await this.getSession(sessionId)
      : await this.getOrCreateSession(userId, workspaceId, mode);

    if (!session) {
      throw new Error('Failed to create or retrieve conversation session');
    }

    // Get context for prompt building
    const [workspaceContext, buddySettings, user, recentInsights, memoryProfile] = await Promise.all([
      this.getWorkspaceContext(workspaceId),
      this.getBuddySettings(userId, workspaceId),
      this.getUser(userId),
      this.getRecentMetacognitionInsights(userId, workspaceId),
      trinityMemoryService.getUserMemoryProfile(userId, workspaceId).catch(() => null),
    ]);

    const userName = user?.name || 'there';

    // Build system prompt based on mode
    const systemPrompt = this.buildSystemPrompt(mode, workspaceContext, buddySettings, userName, recentInsights, memoryProfile);

    // Get conversation history for context
    const history = await this.getConversationHistory(session.id, 20);

    // Record user turn
    await this.recordTurn(session.id, 'user', message);

    // Think before responding (metacognition)
    await trinityThoughtEngine.think(
      'perception',
      'observation',
      `User in ${mode} mode said: "${message.substring(0, 100)}..."`,
      0.9,
      { workspaceId, sessionId: session.id }
    );

    // Generate response using Gemini
    const response = await this.generateResponse(systemPrompt, history, message, mode);

    // Record assistant turn
    await this.recordTurn(session.id, 'assistant', response);

    // Update session activity
    await this.updateSessionActivity(session.id);

    // Analyze for metacognition insights (async, don't block response)
    this.analyzeForInsights(userId, workspaceId, session.id, message, response, mode).catch(console.error);

    return {
      sessionId: session.id,
      response,
      mode,
      metadata: {
        memoryRecalled: !!memoryProfile,
        insightsGenerated: recentInsights?.length || 0,
      },
    };
  }

  /**
   * Get or create a conversation session
   */
  private async getOrCreateSession(userId: string, workspaceId: string, mode: ConversationMode): Promise<TrinityConversationSession | null> {
    console.log('[TrinityChatService] getOrCreateSession called:', { userId, workspaceId, mode });
    try {
      // Try to find an active session for this user/workspace/mode using raw SQL for reliability
      const existingResult = await db.execute(sql`
        SELECT 
          id, 
          user_id as "userId", 
          workspace_id as "workspaceId", 
          mode, 
          session_state as "sessionState", 
          turn_count as "turnCount",
          started_at as "startedAt",
          last_activity_at as "lastActivityAt",
          ended_at as "endedAt",
          metadata
        FROM trinity_conversation_sessions 
        WHERE user_id = ${userId} 
          AND workspace_id = ${workspaceId} 
          AND mode = ${mode} 
          AND session_state = 'active'
        ORDER BY last_activity_at DESC 
        LIMIT 1
      `);

      const existing = existingResult.rows as TrinityConversationSession[];
      console.log('[TrinityChatService] Existing sessions found:', existing.length);
      
      if (existing.length > 0) {
        console.log('[TrinityChatService] Found existing session:', existing[0].id);
        return existing[0];
      }

      // Create new session using raw SQL for reliability
      console.log('[TrinityChatService] Creating new session for user:', userId, 'workspace:', workspaceId, 'mode:', mode);
      const insertResult = await db.execute(sql`
        INSERT INTO trinity_conversation_sessions (user_id, workspace_id, mode, session_state, turn_count)
        VALUES (${userId}, ${workspaceId}, ${mode}, 'active', 0)
        RETURNING 
          id, 
          user_id as "userId", 
          workspace_id as "workspaceId", 
          mode, 
          session_state as "sessionState", 
          turn_count as "turnCount",
          started_at as "startedAt",
          last_activity_at as "lastActivityAt",
          ended_at as "endedAt",
          metadata
      `);

      const session = insertResult.rows[0] as TrinityConversationSession;
      console.log('[TrinityChatService] Created session:', session?.id);
      return session || null;
    } catch (error: any) {
      console.error('[TrinityChatService] Session creation error:', error?.message || error);
      console.error('[TrinityChatService] Session creation stack:', error?.stack);
      return null;
    }
  }

  /**
   * Get session by ID
   */
  private async getSession(sessionId: string): Promise<TrinityConversationSession | null> {
    const [session] = await db
      .select()
      .from(trinityConversationSessions)
      .where(eq(trinityConversationSessions.id, sessionId))
      .limit(1);
    return session || null;
  }

  /**
   * Get workspace context for business insights
   */
  private async getWorkspaceContext(workspaceId: string) {
    try {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace) return { organizationName: 'Unknown', industry: 'General' };

      const [employeeCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));

      const [clientCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(clients)
        .where(eq(clients.workspaceId, workspaceId));

      // Fetch additional business metrics
      const businessMetrics = await this.getBusinessMetrics(workspaceId);

      return {
        organizationName: workspace.companyName || workspace.name,
        industry: workspace.industryDescription || 'Security Services',
        employeeCount: Number(employeeCount?.count) || 0,
        clientCount: Number(clientCount?.count) || 0,
        subscriptionTier: workspace.subscriptionTier || 'starter',
        ...businessMetrics,
      };
    } catch {
      return { organizationName: 'Unknown', industry: 'General', employeeCount: 0, clientCount: 0 };
    }
  }

  /**
   * Get business metrics for context (invoices, hours, overtime, etc.)
   */
  private async getBusinessMetrics(workspaceId: string) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      // Get invoice stats
      const invoiceStats = await db
        .select({
          totalInvoiced: sql<number>`COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0)`,
          invoiceCount: sql<number>`COUNT(*)`,
          paidAmount: sql<number>`COALESCE(SUM(CASE WHEN status = 'paid' THEN CAST(total_amount AS DECIMAL) ELSE 0 END), 0)`,
          outstandingAmount: sql<number>`COALESCE(SUM(CASE WHEN status IN ('sent', 'pending', 'overdue') THEN CAST(total_amount AS DECIMAL) ELSE 0 END), 0)`,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.invoiceDate, startOfMonth)
        ));

      // Get time tracking stats (overtime detection)
      const timeStats = await db
        .select({
          totalHours: sql<number>`COALESCE(SUM(CAST(hours_worked AS DECIMAL)), 0)`,
          overtimeHours: sql<number>`COALESCE(SUM(CASE WHEN is_overtime = true THEN CAST(hours_worked AS DECIMAL) ELSE 0 END), 0)`,
        })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.date, startOfMonth)
        ));

      // Check QuickBooks connection
      const [qbConnection] = await db
        .select()
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        ))
        .limit(1);

      return {
        monthlyRevenue: Number(invoiceStats[0]?.totalInvoiced) || 0,
        invoiceCount: Number(invoiceStats[0]?.invoiceCount) || 0,
        paidAmount: Number(invoiceStats[0]?.paidAmount) || 0,
        outstandingAmount: Number(invoiceStats[0]?.outstandingAmount) || 0,
        totalHoursThisMonth: Number(timeStats[0]?.totalHours) || 0,
        overtimeHoursThisMonth: Number(timeStats[0]?.overtimeHours) || 0,
        quickbooksConnected: !!qbConnection,
      };
    } catch (error) {
      console.error('[TrinityChatService] Business metrics error:', error);
      return {
        monthlyRevenue: 0,
        invoiceCount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        totalHoursThisMonth: 0,
        overtimeHoursThisMonth: 0,
        quickbooksConnected: false,
      };
    }
  }

  /**
   * Get user's BUDDY settings
   */
  private async getBuddySettings(userId: string, workspaceId: string): Promise<TrinityBuddySettings | null> {
    try {
      const [settings] = await db
        .select()
        .from(trinityBuddySettings)
        .where(and(
          eq(trinityBuddySettings.userId, userId),
          eq(trinityBuddySettings.workspaceId, workspaceId)
        ))
        .limit(1);
      return settings || null;
    } catch {
      return null;
    }
  }

  /**
   * Get user info
   */
  private async getUser(userId: string) {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return user || null;
    } catch {
      return null;
    }
  }

  /**
   * Get recent metacognition insights for context injection
   */
  private async getRecentMetacognitionInsights(userId: string, workspaceId: string) {
    try {
      const insights = await db
        .select()
        .from(trinityMetacognitionLog)
        .where(and(
          eq(trinityMetacognitionLog.userId, userId),
          eq(trinityMetacognitionLog.workspaceId, workspaceId),
          gte(trinityMetacognitionLog.relevanceScore, sql`0.5`)
        ))
        .orderBy(desc(trinityMetacognitionLog.createdAt))
        .limit(5);
      return insights;
    } catch {
      return [];
    }
  }

  /**
   * Build system prompt based on mode and context
   */
  private buildSystemPrompt(
    mode: ConversationMode,
    workspaceContext: any,
    buddySettings: TrinityBuddySettings | null,
    userName: string,
    recentInsights: any[],
    memoryProfile: any
  ): string {
    let basePrompt: string;

    switch (mode) {
      case 'business':
        basePrompt = buildBusinessModePrompt(workspaceContext);
        break;
      case 'personal':
        basePrompt = buildPersonalModePrompt(buddySettings, userName);
        break;
      case 'integrated':
        basePrompt = buildIntegratedModePrompt(workspaceContext, buddySettings, userName);
        break;
    }

    // Add metacognition context
    if (recentInsights?.length > 0) {
      basePrompt += `\n\nRECENT INSIGHTS YOU'VE NOTICED ABOUT THIS USER:\n`;
      recentInsights.forEach((insight, i) => {
        basePrompt += `${i + 1}. [${insight.insightType}] ${insight.insightContent}\n`;
      });
      basePrompt += `\nBring these up naturally if relevant to the conversation.\n`;
    }

    // Add memory profile context
    if (memoryProfile) {
      basePrompt += `\n\nMEMORY PROFILE:\n`;
      if (memoryProfile.frequentTopics?.length > 0) {
        basePrompt += `- Frequently discusses: ${memoryProfile.frequentTopics.map((t: any) => t.topic).join(', ')}\n`;
      }
      if (memoryProfile.preferences?.communicationStyle) {
        basePrompt += `- Prefers ${memoryProfile.preferences.communicationStyle} communication\n`;
      }
    }

    return basePrompt;
  }

  /**
   * Get conversation history for a session
   */
  private async getConversationHistory(sessionId: string, limit: number = 20): Promise<{ role: string; content: string }[]> {
    const turns = await db
      .select()
      .from(trinityConversationTurns)
      .where(eq(trinityConversationTurns.sessionId, sessionId))
      .orderBy(desc(trinityConversationTurns.createdAt))
      .limit(limit);

    return turns.reverse().map(t => ({
      role: t.role,
      content: t.content,
    }));
  }

  /**
   * Record a conversation turn
   */
  private async recordTurn(sessionId: string, role: string, content: string): Promise<void> {
    const [session] = await db
      .select()
      .from(trinityConversationSessions)
      .where(eq(trinityConversationSessions.id, sessionId));

    const turnNumber = (session?.turnCount || 0) + 1;

    await db.insert(trinityConversationTurns).values({
      sessionId,
      turnNumber,
      role,
      content,
      contentType: 'text',
    } as InsertTrinityConversationTurn);

    // Update session turn count
    await db
      .update(trinityConversationSessions)
      .set({ turnCount: turnNumber })
      .where(eq(trinityConversationSessions.id, sessionId));
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    await db
      .update(trinityConversationSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(trinityConversationSessions.id, sessionId));
  }

  /**
   * Generate response using Gemini
   */
  private async generateResponse(
    systemPrompt: string,
    history: { role: string; content: string }[],
    message: string,
    mode: ConversationMode
  ): Promise<string> {
    try {
      // Use different model tiers based on mode
      const modelTier = mode === 'business' ? 'CONVERSATIONAL' : 'CONVERSATIONAL';

      const response = await geminiClient.generateContent({
        modelTier,
        systemInstruction: systemPrompt,
        contents: [
          ...history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }],
          })),
          { role: 'user', parts: [{ text: message }] },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 1024,
          topP: 0.95,
        },
      });

      return response.text || "I'm sorry, I couldn't generate a response. Could you try rephrasing that?";
    } catch (error) {
      console.error('[TrinityChatService] Generation error:', error);
      return "I'm having trouble processing that right now. Let me try again - could you rephrase your question?";
    }
  }

  /**
   * Check content guardrails for safety and abuse prevention
   */
  private async checkContentGuardrails(
    workspaceId: string,
    userId: string,
    message: string
  ): Promise<{ blocked: boolean; response?: string; status: GuardrailStatus }> {
    try {
      return await trinityContentGuardrails.handleMessage(message, workspaceId, userId);
    } catch (error) {
      console.error('[TrinityChatService] Guardrail check failed:', error);
      return {
        blocked: false,
        status: { canUseChat: true, violationCount: 0, warningsRemaining: 2 },
      };
    }
  }

  /**
   * Analyze conversation for metacognition insights
   */
  private async analyzeForInsights(
    userId: string,
    workspaceId: string,
    sessionId: string,
    userMessage: string,
    response: string,
    mode: ConversationMode
  ): Promise<void> {
    // Only analyze personal/integrated mode for personal insights
    if (mode === 'business') return;

    try {
      // Use Gemini to detect patterns/insights
      const analysisPrompt = `
Analyze this conversation exchange for metacognition insights.

User said: "${userMessage}"
Trinity responded: "${response}"

Detect any of these insight types:
- pattern: Repeated behavior or theme
- emotion: Strong emotional content
- behavior: Specific action patterns
- contradiction: Inconsistency with past statements
- growth: Evidence of personal development
- struggle: Area of difficulty

If you detect an insight, respond with JSON:
{
  "detected": true,
  "type": "pattern|emotion|behavior|contradiction|growth|struggle",
  "content": "Brief insight description",
  "confidence": 0.0-1.0
}

If no significant insight, respond with:
{"detected": false}
`;

      const result = await geminiClient.generateContent({
        modelTier: 'SIMPLE',
        contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
        },
      });

      const parsed = JSON.parse(result.text || '{"detected": false}');

      if (parsed.detected && parsed.type && parsed.content) {
        await db.insert(trinityMetacognitionLog).values({
          userId,
          workspaceId,
          sessionId,
          insightType: parsed.type,
          insightContent: parsed.content,
          insightConfidence: String(parsed.confidence || 0.8),
          triggerContext: userMessage.substring(0, 500),
        } as InsertTrinityMetacognitionLog);
      }
    } catch (error) {
      console.error('[TrinityChatService] Insight analysis error:', error);
    }
  }

  /**
   * Get user's conversation history
   */
  async getUserConversationHistory(userId: string, workspaceId: string, limit: number = 20): Promise<ConversationHistory> {
    const sessions = await db
      .select()
      .from(trinityConversationSessions)
      .where(and(
        eq(trinityConversationSessions.userId, userId),
        eq(trinityConversationSessions.workspaceId, workspaceId)
      ))
      .orderBy(desc(trinityConversationSessions.lastActivityAt))
      .limit(limit);

    const sessionsWithPreviews = await Promise.all(
      sessions.map(async (session) => {
        const [firstTurn] = await db
          .select()
          .from(trinityConversationTurns)
          .where(and(
            eq(trinityConversationTurns.sessionId, session.id),
            eq(trinityConversationTurns.role, 'user')
          ))
          .orderBy(desc(trinityConversationTurns.createdAt))
          .limit(1);

        return {
          id: session.id,
          mode: (session.mode || 'business') as ConversationMode,
          startedAt: session.startedAt || session.createdAt!,
          lastActivityAt: session.lastActivityAt || session.createdAt!,
          turnCount: session.turnCount || 0,
          previewMessage: firstTurn?.content?.substring(0, 100) || 'No messages',
        };
      })
    );

    return {
      sessions: sessionsWithPreviews,
      total: sessions.length,
    };
  }

  /**
   * Get or create BUDDY settings for a user
   */
  async getOrCreateBuddySettings(userId: string, workspaceId: string): Promise<TrinityBuddySettings> {
    const existing = await this.getBuddySettings(userId, workspaceId);
    if (existing) return existing;

    const [settings] = await db
      .insert(trinityBuddySettings)
      .values({
        userId,
        workspaceId,
        personalDevelopmentEnabled: false,
        spiritualGuidance: 'none',
      })
      .returning();

    return settings;
  }

  /**
   * Update BUDDY settings
   */
  async updateBuddySettings(userId: string, workspaceId: string, updates: Partial<TrinityBuddySettings>): Promise<TrinityBuddySettings> {
    const existing = await this.getOrCreateBuddySettings(userId, workspaceId);

    const [updated] = await db
      .update(trinityBuddySettings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(trinityBuddySettings.id, existing.id))
      .returning();

    return updated;
  }

  /**
   * Switch conversation mode
   */
  async switchMode(userId: string, workspaceId: string, newMode: ConversationMode): Promise<TrinityConversationSession> {
    // End current active sessions
    await db
      .update(trinityConversationSessions)
      .set({ sessionState: 'ended', endedAt: new Date() })
      .where(and(
        eq(trinityConversationSessions.userId, userId),
        eq(trinityConversationSessions.workspaceId, workspaceId),
        eq(trinityConversationSessions.sessionState, 'active')
      ));

    // Create new session with new mode
    const session = await this.getOrCreateSession(userId, workspaceId, newMode);
    if (!session) throw new Error('Failed to create session');
    return session;
  }

  /**
   * Get session messages
   */
  async getSessionMessages(sessionId: string): Promise<TrinityConversationTurn[]> {
    return db
      .select()
      .from(trinityConversationTurns)
      .where(eq(trinityConversationTurns.sessionId, sessionId))
      .orderBy(trinityConversationTurns.createdAt);
  }
}

export const trinityChatService = new TrinityChatService();
