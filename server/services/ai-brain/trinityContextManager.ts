/**
 * TRINITY CONTEXT MANAGER
 * =======================
 * Advanced multi-turn conversation memory system that elevates Trinity
 * to production LLM assistant levels (like ChatGPT/Gemini).
 * 
 * Features:
 * - Multi-turn conversation context with persistent storage
 * - Tool result summarization and context injection
 * - Confidence annotation for AI responses
 * - Knowledge gap detection and tracking
 * - Smart escalation to human support when needed
 * - Session metrics and analytics
 */

import { db } from '../../db';
import { AI_BRAIN } from '../../config/platformConfig';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import {
  trinityConversationSessions,
  trinityConversationTurns,
  knowledgeGapLogs,
  managerAssignments,
  employees,
  type TrinityConversationSession,
  type InsertTrinityConversationSession,
  type InsertTrinityConversationTurn,
  type KnowledgeGapLog,
} from '@shared/schema';
import { trinityMemoryService } from './trinityMemoryService';
import { TTLCache } from './cacheUtils';
import { tokenManager } from '../billing/tokenManager';
import { trinityConfidenceTracker } from './trinityConfidenceTracker';
import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityContextManager');

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationContext {
  sessionId: string;
  userId: string;
  workspaceId?: string;
  turns: ConversationTurn[];
  memory: ContextMemory;
  metrics: SessionMetrics;
  knowledgeGaps: string[];
  pendingClarifications: string[];
}

export interface ConversationTurn {
  turnNumber: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  contentType: 'text' | 'tool_call' | 'tool_result' | 'error';
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  confidenceScore?: number;
  confidenceFactors?: ConfidenceFactorBreakdown;
  knowledgeGapDetected?: boolean;
  timestamp: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: any;
  success: boolean;
  executionTimeMs: number;
}

export interface ContextMemory {
  userPreferences: Record<string, any>;
  recentEntities: EntityMention[];
  topicsDiscussed: string[];
  actionsTaken: ActionSummary[];
  pendingFollowups: FollowupItem[];
  workspaceContext: WorkspaceContext;
}

export interface EntityMention {
  type: 'employee' | 'shift' | 'invoice' | 'client' | 'schedule' | 'report' | 'other';
  id?: string;
  name: string;
  mentionedAt: Date;
  context: string;
}

export interface ActionSummary {
  actionId: string;
  actionName: string;
  category: string;
  result: 'success' | 'failure' | 'pending';
  timestamp: Date;
  summary: string;
}

export interface FollowupItem {
  id: string;
  type: 'question' | 'confirmation' | 'clarification' | 'reminder';
  content: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  resolved: boolean;
}

export interface WorkspaceContext {
  workspaceName?: string;
  userRole?: string;
  activeFeatures?: string[];
  subscriptionTier?: string;
  creditBalance?: number;  // Trinity credit awareness
  creditAllocation?: number;  // Monthly credit allocation
  creditPercentUsed?: number;  // Usage percentage
}

export interface SessionMetrics {
  turnCount: number;
  averageResponseTimeMs: number;
  toolCallsCount: number;
  successfulToolCalls: number;
  knowledgeGapsCount: number;
  escalationCount: number;
  userSatisfactionScore?: number;
}

export interface ConfidenceFactorBreakdown {
  contextClarity: number;
  intentMatch: number;
  toolReliability: number;
  dataCompleteness: number;
  historicalSuccess: number;
}

export interface KnowledgeGap {
  id: string;
  gapType: 'missing_info' | 'ambiguous_intent' | 'unsupported_feature' | 'complex_query' | 'edge_case';
  description: string;
  userQuery: string;
  suggestedActions: string[];
  priority: 'low' | 'normal' | 'high' | 'critical';
}

export interface EscalationContext {
  sessionId: string;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  conversationSummary: string;
  userFrustrationLevel: 'none' | 'mild' | 'moderate' | 'high';
  suggestedNextSteps: string[];
}

// ============================================================================
// TRINITY CONTEXT MANAGER CLASS
// ============================================================================

// Sensitive fields that should be redacted before storage
const SENSITIVE_FIELDS = [
  'password', 'secret', 'token', 'apiKey', 'api_key', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token', 'ssn', 'socialSecurity', 'bankAccount', 'creditCard',
  'cvv', 'pin', 'privateKey', 'private_key', 'sessionSecret', 'encryptionKey'
];

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

class TrinityContextManager {
  private static instance: TrinityContextManager;
  private sessionsCache = new TTLCache<string, ConversationContext>(SESSION_TTL_MS, 50);
  private readonly sessionTimeout = SESSION_TTL_MS;

  shutdown(): void {
    this.sessionsCache.shutdown();
    this.enrichedContextCache.shutdown();
  }

  // SECURITY: Sanitize data before persistent storage
  private sanitizeForStorage(data: any, depth = 0): any {
    if (depth > 10) return '[MAX_DEPTH]'; // Prevent infinite recursion
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') {
      // Truncate very long strings
      return data.length > 2000 ? data.substring(0, 2000) + '...[truncated]' : data;
    }
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) {
      return data.slice(0, 50).map(item => this.sanitizeForStorage(item, depth + 1));
    }
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(f => lowerKey.includes(f.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeForStorage(value, depth + 1);
      }
    }
    return sanitized;
  }

  static getInstance(): TrinityContextManager {
    if (!this.instance) {
      this.instance = new TrinityContextManager();
    }
    return this.instance;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  async getOrCreateSession(userId: string, workspaceId?: string): Promise<ConversationContext> {
    // Validate userId to prevent null constraint violations
    if (!userId) {
      log.warn("[TrinityContextManager] getOrCreateSession called with null/undefined userId");
      return this.createFallbackContext("unknown", workspaceId);
    }
    
    const cacheKey = `${userId}:${workspaceId || 'global'}`;
    
    // Check cache first
    const cached = this.sessionsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Try to find active session
      const [existingSession] = await db
        .select()
        .from(trinityConversationSessions)
        .where(
          and(
            eq(trinityConversationSessions.userId, userId),
            workspaceId ? eq(trinityConversationSessions.workspaceId, workspaceId) : sql`workspace_id IS NULL`,
            eq(trinityConversationSessions.sessionState, 'active')
          )
        )
        .orderBy(desc(trinityConversationSessions.lastActivityAt))
        .limit(1);

      // Check if session is still valid (not expired)
      if (existingSession) {
        const lastActivity = new Date(existingSession.lastActivityAt || existingSession.createdAt!);
        const isExpired = Date.now() - lastActivity.getTime() > this.sessionTimeout;
        
        if (!isExpired) {
          const context = await this.loadSessionContext(existingSession);
          this.sessionsCache.set(cacheKey, context);
          return context;
        } else {
          // Mark old session as ended
          await db
            .update(trinityConversationSessions)
            .set({ sessionState: 'expired', endedAt: new Date() })
            .where(eq(trinityConversationSessions.id, existingSession.id));
        }
      }

      // Create new session
      const [newSession] = await db
        .insert(trinityConversationSessions)
        .values({
          userId,
          workspaceId: workspaceId || null,
          sessionState: 'active',
          contextMemory: {},
          turnCount: 0,
          knowledgeGaps: [],
          pendingClarifications: [],
          sessionMetrics: {
            turnCount: 0,
            averageResponseTimeMs: 0,
            toolCallsCount: 0,
            successfulToolCalls: 0,
            knowledgeGapsCount: 0,
            escalationCount: 0,
          },
          startedAt: new Date(),
          lastActivityAt: new Date(),
        })
        .returning();

      const context = this.createEmptyContext(newSession);
      this.sessionsCache.set(cacheKey, context);
      return context;
    } catch (error) {
      log.error('[TrinityContextManager] Error getting/creating session:', error);
      // Return minimal context on error
      return this.createFallbackContext(userId, workspaceId);
    }
  }

  private async loadSessionContext(session: TrinityConversationSession): Promise<ConversationContext> {
    try {
      const turns = await db
        .select()
        .from(trinityConversationTurns)
        .where(eq(trinityConversationTurns.sessionId, session.id))
        .orderBy(trinityConversationTurns.turnNumber);

      return {
        sessionId: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId || undefined,
        turns: turns.map(t => ({
          turnNumber: t.turnNumber,
          role: t.role as 'user' | 'assistant' | 'system' | 'tool',
          content: t.content,
          contentType: (t.contentType || 'text') as 'text' | 'tool_call' | 'tool_result' | 'error',
          toolCalls: (t.toolCalls as ToolCall[]) || [],
          toolResults: (t.toolResults as ToolResult[]) || [],
          confidenceScore: t.confidenceScore || undefined,
          confidenceFactors: (t.confidenceFactors as ConfidenceFactorBreakdown) || undefined,
          knowledgeGapDetected: t.knowledgeGapDetected || false,
          timestamp: t.createdAt || new Date(),
        })),
        memory: (session.contextMemory as ContextMemory) || this.createEmptyMemory(),
        metrics: (session.sessionMetrics as SessionMetrics) || this.createEmptyMetrics(),
        knowledgeGaps: (session.knowledgeGaps as string[]) || [],
        pendingClarifications: (session.pendingClarifications as string[]) || [],
      };
    } catch (error) {
      log.error('[TrinityContextManager] Error loading session context:', error);
      return this.createEmptyContext(session);
    }
  }

  private createEmptyContext(session: TrinityConversationSession): ConversationContext {
    return {
      sessionId: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId || undefined,
      turns: [],
      memory: this.createEmptyMemory(),
      metrics: this.createEmptyMetrics(),
      knowledgeGaps: [],
      pendingClarifications: [],
    };
  }

  private createFallbackContext(userId: string, workspaceId?: string): ConversationContext {
    return {
      sessionId: `fallback-${Date.now()}`,
      userId,
      workspaceId,
      turns: [],
      memory: this.createEmptyMemory(),
      metrics: this.createEmptyMetrics(),
      knowledgeGaps: [],
      pendingClarifications: [],
    };
  }

  private createEmptyMemory(): ContextMemory {
    return {
      userPreferences: {},
      recentEntities: [],
      topicsDiscussed: [],
      actionsTaken: [],
      pendingFollowups: [],
      workspaceContext: {},
    };
  }

  private createEmptyMetrics(): SessionMetrics {
    return {
      turnCount: 0,
      averageResponseTimeMs: 0,
      toolCallsCount: 0,
      successfulToolCalls: 0,
      knowledgeGapsCount: 0,
      escalationCount: 0,
    };
  }

  /**
   * TRINITY SELF-AWARENESS: Enrich workspace context with credit balance
   * Enables Trinity to be aware of credit status for informed decision-making
   */
  async enrichWorkspaceContextWithCredits(workspaceId: string): Promise<Partial<WorkspaceContext>> {
    try {
      const creditsAccount = await tokenManager.getWorkspaceState(workspaceId);
      
      if (!creditsAccount) {
        return {};
      }

      const creditBalance = creditsAccount.currentBalance;
      const creditAllocation = creditsAccount.monthlyAllocation;
      const creditPercentUsed = creditAllocation > 0 
        ? Math.round(((creditAllocation - creditBalance) / creditAllocation) * 100)
        : 0;

      log.info(`[TrinityContext] Credit awareness loaded for ${workspaceId}: ${creditBalance}/${creditAllocation} (${creditPercentUsed}% used)`);

      return {
        creditBalance,
        creditAllocation,
        creditPercentUsed,
      };
    } catch (error) {
      log.warn('[TrinityContext] Failed to load credit balance:', error);
      return {};
    }
  }

  private enrichedContextCache = new TTLCache<string, ConversationContext>(30_000, 100);

  /**
   * Get enriched session context with credit awareness
   * Uses 30-second cache for identical user+workspace requests
   */
  async getEnrichedSessionContext(userId: string, workspaceId?: string): Promise<ConversationContext> {
    const enrichedCacheKey = `enriched:${userId}:${workspaceId || 'global'}`;
    const cachedEnriched = this.enrichedContextCache.get(enrichedCacheKey);
    if (cachedEnriched) {
      return cachedEnriched;
    }

    const [context, creditContext] = await Promise.all([
      this.getOrCreateSession(userId, workspaceId),
      workspaceId ? this.enrichWorkspaceContextWithCredits(workspaceId) : Promise.resolve({}),
    ]);

    if (workspaceId) {
      context.memory.workspaceContext = {
        ...context.memory.workspaceContext,
        ...creditContext,
      };
    }

    this.enrichedContextCache.set(enrichedCacheKey, context);
    return context;
  }

  // ============================================================================
  // TURN MANAGEMENT
  // ============================================================================

  async addTurn(
    sessionId: string,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string,
    options?: {
      contentType?: 'text' | 'tool_call' | 'tool_result' | 'error';
      toolCalls?: ToolCall[];
      toolResults?: ToolResult[];
      confidenceScore?: number;
      confidenceFactors?: ConfidenceFactorBreakdown;
      knowledgeGapDetected?: boolean;
      responseTimeMs?: number;
      ledgerEntryId?: string;
    }
  ): Promise<ConversationTurn | null> {
    try {
      // Get current turn count
      const [session] = await db
        .select({ turnCount: trinityConversationSessions.turnCount })
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);

      const turnNumber = (session?.turnCount || 0) + 1;

      // SECURITY: Sanitize tool calls and results before persistent storage
      const sanitizedToolCalls = this.sanitizeForStorage(options?.toolCalls || []);
      const sanitizedToolResults = this.sanitizeForStorage(options?.toolResults || []);
      const sanitizedConfidenceFactors = this.sanitizeForStorage(options?.confidenceFactors || {});

      const [turn] = await db
        .insert(trinityConversationTurns)
        .values({
          workspaceId: 'system',
          sessionId,
          turnNumber,
          role,
          content: this.sanitizeForStorage(content),
          contentType: options?.contentType || 'text',
          toolCalls: sanitizedToolCalls,
          toolResults: sanitizedToolResults,
          confidenceScore: options?.confidenceScore != null ? Math.round(options.confidenceScore * 100) : undefined,
          confidenceFactors: sanitizedConfidenceFactors,
          knowledgeGapDetected: options?.knowledgeGapDetected || false,
          responseTimeMs: options?.responseTimeMs,
          ledgerEntryId: options?.ledgerEntryId,
        })
        .returning();

      // Update session
      await db
        .update(trinityConversationSessions)
        .set({
          turnCount: turnNumber,
          lastActivityAt: new Date(),
          lastToolUsed: options?.toolCalls?.[0]?.name,
          lastConfidenceScore: options?.confidenceScore != null ? Math.round(options.confidenceScore * 100) : undefined,
        })
        .where(eq(trinityConversationSessions.id, sessionId));

      // Update cache if exists (also use sanitized values)
      const cacheKey = await this.getCacheKeyForSession(sessionId);
      if (cacheKey) {
        const cached = this.sessionsCache.get(cacheKey);
        if (cached) {
          cached.turns.push({
            turnNumber,
            role,
            content: this.sanitizeForStorage(content),
            contentType: options?.contentType || 'text',
            toolCalls: sanitizedToolCalls,
            toolResults: sanitizedToolResults,
            confidenceScore: options?.confidenceScore,
            confidenceFactors: sanitizedConfidenceFactors,
            knowledgeGapDetected: options?.knowledgeGapDetected,
            timestamp: new Date(),
          });
          cached.metrics.turnCount = turnNumber;
        }
      }

      // Return sanitized turn data
      return {
        turnNumber,
        role,
        content: this.sanitizeForStorage(content),
        contentType: options?.contentType || 'text',
        toolCalls: sanitizedToolCalls,
        toolResults: sanitizedToolResults,
        confidenceScore: options?.confidenceScore,
        confidenceFactors: sanitizedConfidenceFactors,
        knowledgeGapDetected: options?.knowledgeGapDetected,
        timestamp: new Date(),
      };
    } catch (error) {
      log.error('[TrinityContextManager] Error adding turn:', error);
      return null;
    }
  }

  private async getCacheKeyForSession(sessionId: string): Promise<string | null> {
    for (const [key, context] of this.sessionsCache.entries()) {
      if (context.sessionId === sessionId) {
        return key;
      }
    }
    return null;
  }

  // ============================================================================
  // CONTEXT BUILDING FOR GEMINI
  // ============================================================================

  buildPromptContext(context: ConversationContext, maxTurns: number = AI_BRAIN.conversationTurnLimit): string {
    const recentTurns = context.turns.slice(-maxTurns);
    
    let promptContext = '';

    // Add workspace context with Trinity token/action awareness (legacy field names retained)
    if (context.memory.workspaceContext.workspaceName || context.memory.workspaceContext.creditBalance !== undefined) {
      promptContext += `## Current Context\n`;
      if (context.memory.workspaceContext.workspaceName) {
        promptContext += `- Workspace: ${context.memory.workspaceContext.workspaceName}\n`;
      }
      promptContext += `- User Role: ${context.memory.workspaceContext.userRole || 'unknown'}\n`;
      promptContext += `- Subscription: ${context.memory.workspaceContext.subscriptionTier || 'free'}\n`;
      
      // TRINITY TOKEN/ACTION AWARENESS: Include monthly usage status for self-aware decision making
      if (context.memory.workspaceContext.creditBalance !== undefined) {
        const creditBalance = context.memory.workspaceContext.creditBalance;
        const creditAllocation = context.memory.workspaceContext.creditAllocation || 0;
        const creditPercentUsed = context.memory.workspaceContext.creditPercentUsed || 0;
        
        promptContext += `\n## Token Status (Tenant Awareness)\n`;
        promptContext += `- Tokens Remaining: ${creditBalance}/${creditAllocation}\n`;
        promptContext += `- Usage: ${creditPercentUsed}% of monthly token allotment consumed\n`;
        
        // Add contextual hints based on tenant token status
        if (creditBalance < 10) {
          promptContext += `- ⚠️ LOW TOKEN HEADROOM: Tenant is near monthly soft-cap/overage zone; prioritize high-value actions\n`;
        } else if (creditPercentUsed > 80) {
          promptContext += `- ⚠️ HIGH USAGE: ${100 - creditPercentUsed}% of monthly token allotment remaining\n`;
        }
      }
      promptContext += '\n';
    }

    // Add recent entities discussed
    if (context.memory.recentEntities.length > 0) {
      promptContext += `## Recently Discussed\n`;
      const uniqueEntities = context.memory.recentEntities.slice(-5);
      for (const entity of uniqueEntities) {
        promptContext += `- ${entity.type}: ${entity.name}\n`;
      }
      promptContext += '\n';
    }

    // Add pending follow-ups
    if (context.memory.pendingFollowups.length > 0) {
      promptContext += `## Pending Items\n`;
      for (const followup of context.memory.pendingFollowups.filter(f => !f.resolved)) {
        promptContext += `- [${followup.type}] ${followup.content}\n`;
      }
      promptContext += '\n';
    }

    // Add conversation history
    promptContext += `## Conversation History\n`;
    for (const turn of recentTurns) {
      const roleLabel = turn.role === 'user' ? 'User' : 
                       turn.role === 'assistant' ? 'Trinity' : 
                       turn.role === 'tool' ? 'Tool Result' : 'System';
      
      if (turn.role === 'tool' && turn.toolResults) {
        for (const result of turn.toolResults) {
          promptContext += `[${roleLabel}:${result.toolName}]: ${result.success ? 'Success' : 'Failed'} - ${JSON.stringify(result.result).slice(0, 200)}\n`;
        }
      } else {
        promptContext += `[${roleLabel}]: ${turn.content}\n`;
      }
    }

    return promptContext;
  }

  // Enhanced context building with long-term memory
  async buildEnhancedPromptContext(
    context: ConversationContext, 
    maxTurns: number = 10,
    currentTopic?: string
  ): Promise<string> {
    let promptContext = this.buildPromptContext(context, maxTurns);

    // Add long-term memory from TrinityMemoryService
    try {
      const memoryContext = await trinityMemoryService.buildMemoryContext(
        context.userId,
        context.workspaceId,
        currentTopic
      );
      promptContext = memoryContext + '\n' + promptContext;
    } catch (error) {
      log.error('[TrinityContextManager] Error building memory context:', error);
    }

    // Inject reporting-line context for recently discussed employees
    try {
      const employeeEntities = context.memory.recentEntities
        .filter(e => e.type === 'employee' && e.id)
        .slice(-5);

      if (employeeEntities.length > 0 && context.workspaceId) {
        const reportingLines: string[] = [];

        for (const entity of employeeEntities) {
          const [assignment] = await db
            .select()
            .from(managerAssignments)
            .where(
              and(
                eq(managerAssignments.employeeId, entity.id!),
                eq(managerAssignments.workspaceId, context.workspaceId)
              )
            )
            .limit(1);

          if (assignment?.managerId) {
            const manager = await db.query.employees.findFirst({
              where: eq(employees.id, assignment.managerId),
            });
            if (manager) {
              reportingLines.push(
                `${entity.name} reports directly to ${manager.firstName} ${manager.lastName} (${manager.workspaceRole || 'manager'})`
              );
            }
          } else {
            reportingLines.push(`${entity.name} — no direct manager assigned`);
          }
        }

        if (reportingLines.length > 0) {
          promptContext += `\n## Reporting Lines\n`;
          for (const line of reportingLines) {
            promptContext += `- ${line}\n`;
          }
          promptContext += `Use this to contact the correct manager when an employee issue requires escalation.\n`;
        }
      }
    } catch (error) {
      log.error('[TrinityContextManager] Error building reporting line context:', error);
    }

    // Add recommended tools based on context (workspace-scoped for tenant isolation)
    try {
      if (context.workspaceId) {
        const workspaceTools = await trinityMemoryService.getWorkspaceScopedToolCatalog(context.workspaceId);
        const recommendedTools = workspaceTools
          .filter(tool => 
            tool.healthStatus === 'healthy' &&
            tool.successMetrics.successRate >= 70 &&
            tool.usageCount >= 3
          )
          .sort((a, b) => b.successMetrics.successRate - a.successMetrics.successRate)
          .slice(0, 5);
        
        if (recommendedTools.length > 0) {
          promptContext += '\n## Recommended Tools\n';
          for (const tool of recommendedTools) {
            promptContext += `- ${tool.toolName} (${tool.category}): ${tool.successMetrics.successRate.toFixed(0)}% success rate\n`;
          }
        }
      }
    } catch (error) {
      log.error('[TrinityContextManager] Error getting recommended tools:', error);
    }

    return promptContext;
  }

  // Record learning outcome for feedback loop
  async recordLearningOutcome(
    context: ConversationContext,
    actionName: string,
    category: string,
    outcome: 'success' | 'failure' | 'partial',
    confidenceAdjustment: number,
    lessonsLearned?: string
  ): Promise<void> {
    try {
      await trinityMemoryService.recordInteractionOutcome({
        userId: context.userId,
        workspaceId: context.workspaceId,
        actionName,
        category,
        outcome,
        confidenceAdjustment,
        lessonsLearned,
      });
    } catch (error) {
      log.error('[TrinityContextManager] Error recording learning outcome:', error);
    }
  }

  // ============================================================================
  // KNOWLEDGE GAP TRACKING
  // ============================================================================

  async recordKnowledgeGap(
    context: ConversationContext,
    gap: KnowledgeGap,
    turnId?: string
  ): Promise<KnowledgeGapLog | null> {
    try {
      const [log] = await db
        .insert(knowledgeGapLogs)
        .values({
          workspaceId: context.workspaceId || null,
          sessionId: context.sessionId,
          turnId: turnId || null,
          gapType: gap.gapType,
          gapDescription: gap.description,
          userQuery: gap.userQuery,
          contextSnapshot: {
            turnCount: context.turns.length,
            recentTopics: context.memory.topicsDiscussed.slice(-5),
            recentActions: context.memory.actionsTaken.slice(-3),
          },
          priority: gap.priority,
          frequency: 1,
        })
        .returning();

      // Update session's knowledge gaps
      await db
        .update(trinityConversationSessions)
        .set({
          knowledgeGaps: [...context.knowledgeGaps, gap.description],
        })
        .where(eq(trinityConversationSessions.id, context.sessionId));

      return log;
    } catch (error) {
      log.error('[TrinityContextManager] Error recording knowledge gap:', error);
      return null;
    }
  }

  detectKnowledgeGap(userQuery: string, assistantResponse: string): KnowledgeGap | null {
    const uncertaintyPhrases = [
      "i'm not sure",
      "i don't have information",
      "i cannot",
      "i'm unable to",
      "beyond my current",
      "would need to check",
      "not available",
      "i apologize",
    ];

    const responseLC = assistantResponse.toLowerCase();
    const hasUncertainty = uncertaintyPhrases.some(phrase => responseLC.includes(phrase));

    if (hasUncertainty) {
      return {
        id: `gap-${Date.now()}`,
        gapType: this.classifyGapType(userQuery, assistantResponse),
        description: `I expressed uncertainty in response to: "${userQuery.slice(0, 100)}..."`,
        userQuery,
        suggestedActions: this.generateSuggestedActions(userQuery),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        priority: 'medium',
      };
    }

    return null;
  }

  private classifyGapType(query: string, response: string): KnowledgeGap['gapType'] {
    const queryLC = query.toLowerCase();
    const responseLC = response.toLowerCase();

    if (responseLC.includes('feature') && (responseLC.includes('not available') || responseLC.includes('not supported'))) {
      return 'unsupported_feature';
    }
    if (responseLC.includes('unclear') || responseLC.includes('could you clarify')) {
      return 'ambiguous_intent';
    }
    if (queryLC.includes('and') && queryLC.includes('also') || query.split(' ').length > 30) {
      return 'complex_query';
    }
    if (responseLC.includes('specific') || responseLC.includes('unusual')) {
      return 'edge_case';
    }
    return 'missing_info';
  }

  private generateSuggestedActions(query: string): string[] {
    const suggestions: string[] = [];
    
    suggestions.push('Add to FAQ database for future reference');
    suggestions.push('Flag for platform team review');
    
    if (query.toLowerCase().includes('how')) {
      suggestions.push('Create tutorial or guide for this topic');
    }
    if (query.toLowerCase().includes('why') || query.toLowerCase().includes('error')) {
      suggestions.push('Investigate potential system issue');
    }
    
    return suggestions;
  }

  // ============================================================================
  // CONFIDENCE SCORING
  // ============================================================================

  computeConfidenceScore(factors: Partial<ConfidenceFactorBreakdown>): number {
    const weights = {
      contextClarity: 0.25,
      intentMatch: 0.30,
      toolReliability: 0.20,
      dataCompleteness: 0.15,
      historicalSuccess: 0.10,
    };

    let score = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      const value = factors[key as keyof ConfidenceFactorBreakdown];
      if (value !== undefined) {
        score += value * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 50;
  }

  annotateConfidence(
    response: string,
    context: ConversationContext,
    toolResults?: ToolResult[]
  ): { score: number; factors: ConfidenceFactorBreakdown; explanation: string } {
    const factors: ConfidenceFactorBreakdown = {
      contextClarity: this.assessContextClarity(context),
      intentMatch: 85, // Default high - would be adjusted by actual intent detection
      toolReliability: toolResults ? this.assessToolReliability(toolResults) : 70,
      dataCompleteness: this.assessDataCompleteness(context, response),
      historicalSuccess: this.assessHistoricalSuccess(context),
    };

    const score = this.computeConfidenceScore(factors);
    
    let explanation = '';
    if (score >= 80) {
      explanation = 'High confidence based on clear context and reliable data.';
    } else if (score >= 60) {
      explanation = 'Moderate confidence - some aspects may need verification.';
    } else {
      explanation = 'Lower confidence - recommend human review for important decisions.';
    }

    return { score, factors, explanation };
  }

  private assessContextClarity(context: ConversationContext): number {
    let score = 50;
    
    // More turns = more context
    score += Math.min(context.turns.length * 3, 20);
    
    // Recent entities help
    score += Math.min(context.memory.recentEntities.length * 5, 15);
    
    // Pending clarifications reduce clarity
    score -= context.pendingClarifications.length * 10;
    
    return Math.max(0, Math.min(100, score));
  }

  private assessToolReliability(toolResults: ToolResult[]): number {
    if (toolResults.length === 0) return 70;
    
    const successCount = toolResults.filter(r => r.success).length;
    return Math.round((successCount / toolResults.length) * 100);
  }

  private assessDataCompleteness(context: ConversationContext, response: string): number {
    let score = 70;
    
    // Check for hedging language in response
    const hedgingPhrases = ['might', 'maybe', 'possibly', 'could be', 'not sure'];
    for (const phrase of hedgingPhrases) {
      if (response.toLowerCase().includes(phrase)) {
        score -= 10;
      }
    }
    
    // Knowledge gaps reduce completeness
    score -= context.knowledgeGaps.length * 5;
    
    return Math.max(0, Math.min(100, score));
  }

  private assessHistoricalSuccess(context: ConversationContext): number {
    const recentActions = context.memory.actionsTaken.slice(-10);
    if (recentActions.length === 0) return 70;
    
    const successCount = recentActions.filter(a => a.result === 'success').length;
    return Math.round((successCount / recentActions.length) * 100);
  }

  // ============================================================================
  // HUMAN ESCALATION
  // ============================================================================

  async escalateToSupport(
    context: ConversationContext,
    reason: string,
    urgency: EscalationContext['urgency']
  ): Promise<boolean> {
    try {
      // Mark session as escalated
      await db
        .update(trinityConversationSessions)
        .set({
          escalationPending: true,
          escalationReason: reason,
          escalatedToSupportAt: new Date(),
        })
        .where(eq(trinityConversationSessions.id, context.sessionId));

      // Create escalation context for support
      const escalationContext: EscalationContext = {
        sessionId: context.sessionId,
        reason,
        urgency,
        conversationSummary: this.summarizeConversation(context),
        userFrustrationLevel: this.assessFrustrationLevel(context),
        suggestedNextSteps: this.generateEscalationSteps(context, reason),
      };

      // Update metrics
      context.metrics.escalationCount++;

      log.info(`[TrinityContextManager] Escalated session ${context.sessionId}: ${reason}`);
      return true;
    } catch (error) {
      log.error('[TrinityContextManager] Error escalating to support:', error);
      return false;
    }
  }

  private summarizeConversation(context: ConversationContext): string {
    const recentTurns = context.turns.slice(-5);
    const userMessages = recentTurns.filter(t => t.role === 'user').map(t => t.content);
    
    return `User discussed: ${userMessages.join('; ').slice(0, 300)}...`;
  }

  private assessFrustrationLevel(context: ConversationContext): EscalationContext['userFrustrationLevel'] {
    const userTurns = context.turns.filter(t => t.role === 'user');
    const recentUserMessages = userTurns.slice(-3).map(t => t.content.toLowerCase());
    
    const frustrationIndicators = [
      'not working', 'broken', 'terrible', 'awful', 'hate', 'stupid',
      'ridiculous', 'unacceptable', 'angry', 'frustrated', '!!!', 
      'why won\'t', 'doesn\'t work', 'useless',
    ];

    let frustrationScore = 0;
    for (const message of recentUserMessages) {
      for (const indicator of frustrationIndicators) {
        if (message.includes(indicator)) {
          frustrationScore++;
        }
      }
    }

    if (frustrationScore >= 3) return 'high';
    if (frustrationScore >= 2) return 'moderate';
    if (frustrationScore >= 1) return 'mild';
    return 'none';
  }

  private generateEscalationSteps(context: ConversationContext, reason: string): string[] {
    const steps: string[] = [];
    
    steps.push('Review conversation history for context');
    steps.push('Acknowledge user\'s concern and apologize for any inconvenience');
    
    if (reason.includes('technical')) {
      steps.push('Check system logs for related errors');
      steps.push('Verify feature availability for user\'s subscription tier');
    }
    
    if (reason.includes('billing') || reason.includes('payment')) {
      steps.push('Review account billing status');
      steps.push('Check for failed payment attempts');
    }
    
    steps.push('Provide clear resolution or next steps');
    
    return steps;
  }

  // ============================================================================
  // MEMORY UPDATES
  // ============================================================================

  async updateMemory(sessionId: string, updates: Partial<ContextMemory>): Promise<boolean> {
    try {
      const [session] = await db
        .select({ contextMemory: trinityConversationSessions.contextMemory })
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);

      const currentMemory = (session?.contextMemory as ContextMemory) || this.createEmptyMemory();
      const updatedMemory = { ...currentMemory, ...updates };

      await db
        .update(trinityConversationSessions)
        .set({ contextMemory: updatedMemory })
        .where(eq(trinityConversationSessions.id, sessionId));

      return true;
    } catch (error) {
      log.error('[TrinityContextManager] Error updating memory:', error);
      return false;
    }
  }

  async addEntityMention(sessionId: string, entity: EntityMention): Promise<boolean> {
    try {
      const [session] = await db
        .select({ contextMemory: trinityConversationSessions.contextMemory })
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);

      const memory = (session?.contextMemory as ContextMemory) || this.createEmptyMemory();
      memory.recentEntities = [...(memory.recentEntities || []), entity].slice(-20);

      return this.updateMemory(sessionId, { recentEntities: memory.recentEntities });
    } catch (error) {
      log.error('[TrinityContextManager] Error adding entity mention:', error);
      return false;
    }
  }

  async addActionSummary(sessionId: string, action: ActionSummary): Promise<boolean> {
    try {
      const [session] = await db
        .select({ contextMemory: trinityConversationSessions.contextMemory })
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);

      const memory = (session?.contextMemory as ContextMemory) || this.createEmptyMemory();
      memory.actionsTaken = [...(memory.actionsTaken || []), action].slice(-50);

      return this.updateMemory(sessionId, { actionsTaken: memory.actionsTaken });
    } catch (error) {
      log.error('[TrinityContextManager] Error adding action summary:', error);
      return false;
    }
  }

  // ============================================================================
  // SESSION CLEANUP
  // ============================================================================

  async endSession(sessionId: string): Promise<boolean> {
    try {
      await db
        .update(trinityConversationSessions)
        .set({
          sessionState: 'ended',
          endedAt: new Date(),
        })
        .where(eq(trinityConversationSessions.id, sessionId));

      // Remove from cache
      for (const [key, context] of this.sessionsCache.entries()) {
        if (context.sessionId === sessionId) {
          this.sessionsCache.delete(key);
          break;
        }
      }

      // Update user confidence statistics (Phase 1C: Confidence Tracking)
      try {
        const metrics = await trinityConfidenceTracker.extractSessionMetrics(sessionId);
        if (metrics) {
          await trinityConfidenceTracker.updateUserConfidenceOnSessionEnd(metrics);
          log.info(`[TrinityContextManager] Updated confidence stats for session ${sessionId}`);
        }
      } catch (confidenceError) {
        log.warn('[TrinityContextManager] Failed to update confidence stats:', confidenceError);
      }

      return true;
    } catch (error) {
      log.error('[TrinityContextManager] Error ending session:', error);
      return false;
    }
  }

  clearCache(): void {
    this.sessionsCache.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const trinityContextManager = TrinityContextManager.getInstance();
export { TrinityContextManager };
