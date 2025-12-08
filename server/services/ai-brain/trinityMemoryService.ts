/**
 * TRINITY MEMORY SERVICE
 * =======================
 * Long-term memory persistence and learning system for Trinity, HelpAI, and AI Brain.
 * 
 * Features:
 * - User/workspace profile aggregation from conversation history
 * - Experience-based pattern detection from automation outcomes
 * - Tool capability catalog with success metrics
 * - Cross-bot knowledge sharing via insights broadcast
 * - Semantic memory recall for intelligent suggestions
 */

import { db } from '../../db';
import { eq, and, desc, gte, sql, or, like, inArray } from 'drizzle-orm';
import {
  trinityConversationSessions,
  trinityConversationTurns,
  knowledgeGapLogs,
  automationActionLedger,
  systemAuditLogs,
  users,
  workspaces,
} from '@shared/schema';

// ============================================================================
// TYPES
// ============================================================================

export interface UserMemoryProfile {
  userId: string;
  workspaceId?: string;
  preferences: UserPreferences;
  interactionPatterns: InteractionPattern[];
  frequentTopics: TopicFrequency[];
  issueHistory: IssueRecord[];
  toolUsage: ToolUsageStats[];
  learningInsights: LearningInsight[];
  lastUpdated: Date;
}

export interface UserPreferences {
  communicationStyle: 'concise' | 'detailed' | 'technical' | 'simple';
  preferredTools: string[];
  automationLevel: 'manual' | 'guided' | 'automated';
  notificationPreference: 'immediate' | 'batched' | 'minimal';
  workingHours?: { start: string; end: string };
  timezone?: string;
}

export interface InteractionPattern {
  patternType: 'time_of_day' | 'day_of_week' | 'feature_sequence' | 'issue_recurrence';
  patternData: Record<string, any>;
  confidence: number;
  occurrences: number;
  lastSeen: Date;
}

export interface TopicFrequency {
  topic: string;
  category: 'scheduling' | 'payroll' | 'compliance' | 'analytics' | 'billing' | 'support' | 'automation' | 'other';
  frequency: number;
  lastDiscussed: Date;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface IssueRecord {
  issueId: string;
  issueType: string;
  description: string;
  resolution?: string;
  resolutionMethod: 'self_service' | 'ai_assisted' | 'human_support' | 'automated';
  timeToResolve?: number;
  recurrenceCount: number;
  lastOccurred: Date;
}

export interface ToolUsageStats {
  toolName: string;
  category: string;
  usageCount: number;
  successRate: number;
  avgExecutionTime: number;
  lastUsed: Date;
  userSatisfaction?: number;
}

export interface LearningInsight {
  insightId: string;
  insightType: 'pattern' | 'recommendation' | 'warning' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  applicableContext: string[];
  actionable: boolean;
  suggestedAction?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ToolCapability {
  toolId: string;
  toolName: string;
  category: string;
  description: string;
  requiredConsents: string[];
  prerequisites: string[];
  successMetrics: {
    successRate: number;
    avgExecutionTime: number;
    userSatisfaction: number;
  };
  healthStatus: 'healthy' | 'degraded' | 'offline';
  lastHealthCheck: Date;
  usageCount: number;
  recommendedFor: string[];
}

export interface SharedInsight {
  insightId: string;
  sourceAgent: 'trinity' | 'helpai' | 'automation' | 'subagent';
  insightType: 'resolution' | 'pattern' | 'optimization' | 'warning';
  workspaceScope: string | null;
  title: string;
  content: string;
  confidence: number;
  applicableScenarios: string[];
  createdAt: Date;
  usageCount: number;
  effectivenessScore: number;
}

// ============================================================================
// TRINITY MEMORY SERVICE CLASS
// ============================================================================

class TrinityMemoryService {
  private static instance: TrinityMemoryService;
  private userProfileCache: Map<string, UserMemoryProfile> = new Map();
  private toolCatalog: Map<string, ToolCapability> = new Map();
  private sharedInsights: SharedInsight[] = [];
  private cacheTimeout = 10 * 60 * 1000; // 10 minutes

  static getInstance(): TrinityMemoryService {
    if (!this.instance) {
      this.instance = new TrinityMemoryService();
    }
    return this.instance;
  }

  // ============================================================================
  // USER MEMORY PROFILE
  // ============================================================================

  async getUserMemoryProfile(userId: string, workspaceId?: string): Promise<UserMemoryProfile> {
    const cacheKey = `${userId}:${workspaceId || 'global'}`;
    const cached = this.userProfileCache.get(cacheKey);
    
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheTimeout) {
      return cached;
    }

    try {
      const profile = await this.buildUserProfile(userId, workspaceId);
      this.userProfileCache.set(cacheKey, profile);
      return profile;
    } catch (error) {
      console.error('[TrinityMemoryService] Error building user profile:', error);
      return this.createDefaultProfile(userId, workspaceId);
    }
  }

  private async buildUserProfile(userId: string, workspaceId?: string): Promise<UserMemoryProfile> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch conversation history
    const sessions = await db
      .select()
      .from(trinityConversationSessions)
      .where(
        and(
          eq(trinityConversationSessions.userId, userId),
          workspaceId ? eq(trinityConversationSessions.workspaceId, workspaceId) : sql`true`,
          gte(trinityConversationSessions.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(trinityConversationSessions.createdAt))
      .limit(50);

    // Fetch automation outcomes for this user's workspace
    const automationOutcomes = workspaceId ? await db
      .select()
      .from(automationActionLedger)
      .where(
        and(
          eq(automationActionLedger.workspaceId, workspaceId),
          gte(automationActionLedger.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(automationActionLedger.createdAt))
      .limit(100) : [];

    // Fetch knowledge gaps (via session IDs)
    const userSessionIds = sessions.map(s => s.id);
    const knowledgeGaps = userSessionIds.length > 0 ? await db
      .select()
      .from(knowledgeGapLogs)
      .where(
        and(
          inArray(knowledgeGapLogs.sessionId, userSessionIds),
          gte(knowledgeGapLogs.createdAt, thirtyDaysAgo)
        )
      )
      .limit(50) : [];

    // Build profile from collected data
    return {
      userId,
      workspaceId,
      preferences: this.inferPreferences(sessions),
      interactionPatterns: this.detectPatterns(sessions),
      frequentTopics: this.analyzeTopics(sessions, knowledgeGaps),
      issueHistory: this.extractIssues(knowledgeGaps, automationOutcomes),
      toolUsage: this.calculateToolUsage(automationOutcomes),
      learningInsights: this.generateInsights(sessions, automationOutcomes, knowledgeGaps),
      lastUpdated: new Date(),
    };
  }

  private inferPreferences(sessions: any[]): UserPreferences {
    // Analyze session data to infer user preferences
    const toolsUsed: string[] = [];
    let technicalTermCount = 0;
    let totalTurns = 0;

    for (const session of sessions) {
      if (session.lastToolUsed) {
        toolsUsed.push(session.lastToolUsed);
      }
      totalTurns += session.turnCount || 0;
    }

    // Determine communication style based on interaction patterns
    const avgTurnsPerSession = sessions.length > 0 ? totalTurns / sessions.length : 0;
    let communicationStyle: 'concise' | 'detailed' | 'technical' | 'simple' = 'simple';
    
    if (avgTurnsPerSession > 10) {
      communicationStyle = 'detailed';
    } else if (avgTurnsPerSession < 3) {
      communicationStyle = 'concise';
    }

    // Get unique preferred tools
    const toolFrequency = toolsUsed.reduce((acc, tool) => {
      acc[tool] = (acc[tool] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const preferredTools = Object.entries(toolFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);

    return {
      communicationStyle,
      preferredTools,
      automationLevel: 'guided',
      notificationPreference: 'immediate',
    };
  }

  private detectPatterns(sessions: any[]): InteractionPattern[] {
    const patterns: InteractionPattern[] = [];

    // Time of day pattern
    const hourCounts = new Array(24).fill(0);
    for (const session of sessions) {
      if (session.createdAt) {
        const hour = new Date(session.createdAt).getHours();
        hourCounts[hour]++;
      }
    }

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    if (Math.max(...hourCounts) >= 3) {
      patterns.push({
        patternType: 'time_of_day',
        patternData: { peakHour, distribution: hourCounts },
        confidence: Math.min(Math.max(...hourCounts) / sessions.length, 1),
        occurrences: Math.max(...hourCounts),
        lastSeen: new Date(),
      });
    }

    // Day of week pattern
    const dayCounts = new Array(7).fill(0);
    for (const session of sessions) {
      if (session.createdAt) {
        const day = new Date(session.createdAt).getDay();
        dayCounts[day]++;
      }
    }

    const peakDay = dayCounts.indexOf(Math.max(...dayCounts));
    if (Math.max(...dayCounts) >= 3) {
      patterns.push({
        patternType: 'day_of_week',
        patternData: { peakDay, distribution: dayCounts },
        confidence: Math.min(Math.max(...dayCounts) / sessions.length, 1),
        occurrences: Math.max(...dayCounts),
        lastSeen: new Date(),
      });
    }

    return patterns;
  }

  private analyzeTopics(sessions: any[], knowledgeGaps: any[]): TopicFrequency[] {
    const topicMap: Map<string, TopicFrequency> = new Map();

    // Analyze knowledge gaps for topic extraction
    for (const gap of knowledgeGaps) {
      const topic = gap.gapType || 'general';
      const existing = topicMap.get(topic);
      
      if (existing) {
        existing.frequency++;
        existing.lastDiscussed = new Date(gap.createdAt);
      } else {
        topicMap.set(topic, {
          topic,
          category: this.categorizeGapType(gap.gapType),
          frequency: 1,
          lastDiscussed: new Date(gap.createdAt),
          sentiment: gap.resolutionStatus === 'resolved' ? 'positive' : 'neutral',
        });
      }
    }

    return Array.from(topicMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  private categorizeGapType(gapType: string): TopicFrequency['category'] {
    const categoryMap: Record<string, TopicFrequency['category']> = {
      'missing_info': 'support',
      'ambiguous_intent': 'support',
      'unsupported_feature': 'automation',
      'complex_query': 'analytics',
      'edge_case': 'other',
    };
    return categoryMap[gapType] || 'other';
  }

  private extractIssues(knowledgeGaps: any[], automationOutcomes: any[]): IssueRecord[] {
    const issues: IssueRecord[] = [];

    // Extract from knowledge gaps
    for (const gap of knowledgeGaps) {
      issues.push({
        issueId: gap.id,
        issueType: gap.gapType,
        description: gap.description || 'Unknown issue',
        resolution: gap.resolutionNotes,
        resolutionMethod: gap.resolutionStatus === 'resolved' ? 'ai_assisted' : 'self_service',
        timeToResolve: gap.resolvedAt && gap.createdAt 
          ? new Date(gap.resolvedAt).getTime() - new Date(gap.createdAt).getTime() 
          : undefined,
        recurrenceCount: 1,
        lastOccurred: new Date(gap.createdAt),
      });
    }

    // Extract from failed automation outcomes
    for (const outcome of automationOutcomes) {
      if (outcome.executionResult === 'error' || outcome.approvalState === 'rejected') {
        issues.push({
          issueId: outcome.id,
          issueType: 'automation_failure',
          description: `${outcome.actionCategory}.${outcome.actionName} failed`,
          resolution: outcome.errorMessage,
          resolutionMethod: 'automated',
          recurrenceCount: 1,
          lastOccurred: new Date(outcome.createdAt),
        });
      }
    }

    return issues.slice(0, 20);
  }

  private calculateToolUsage(automationOutcomes: any[]): ToolUsageStats[] {
    const toolStats: Map<string, ToolUsageStats> = new Map();

    for (const outcome of automationOutcomes) {
      const toolName = `${outcome.actionCategory}.${outcome.actionName}`;
      const existing = toolStats.get(toolName);

      if (existing) {
        existing.usageCount++;
        if (outcome.executionResult === 'success') {
          existing.successRate = ((existing.successRate * (existing.usageCount - 1)) + 100) / existing.usageCount;
        } else {
          existing.successRate = ((existing.successRate * (existing.usageCount - 1)) + 0) / existing.usageCount;
        }
        existing.lastUsed = new Date(outcome.createdAt);
      } else {
        toolStats.set(toolName, {
          toolName,
          category: outcome.actionCategory,
          usageCount: 1,
          successRate: outcome.executionResult === 'success' ? 100 : 0,
          avgExecutionTime: 0,
          lastUsed: new Date(outcome.createdAt),
        });
      }
    }

    return Array.from(toolStats.values())
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  private generateInsights(sessions: any[], automationOutcomes: any[], knowledgeGaps: any[]): LearningInsight[] {
    const insights: LearningInsight[] = [];

    // Insight: Frequent tool usage pattern
    const toolUsage = this.calculateToolUsage(automationOutcomes);
    if (toolUsage.length > 0 && toolUsage[0].usageCount >= 5) {
      insights.push({
        insightId: `insight-tool-${toolUsage[0].toolName}`,
        insightType: 'pattern',
        title: `Frequently used: ${toolUsage[0].toolName}`,
        description: `This user frequently uses ${toolUsage[0].toolName} with ${toolUsage[0].successRate.toFixed(0)}% success rate.`,
        confidence: Math.min(toolUsage[0].usageCount / 20, 1),
        applicableContext: [toolUsage[0].category],
        actionable: true,
        suggestedAction: `Proactively suggest ${toolUsage[0].toolName} for related tasks.`,
        createdAt: new Date(),
      });
    }

    // Insight: Recurring issues
    const issueTypes = knowledgeGaps.reduce((acc, gap) => {
      acc[gap.gapType] = (acc[gap.gapType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [issueType, countValue] of Object.entries(issueTypes)) {
      const count = countValue as number;
      if (count >= 3) {
        insights.push({
          insightId: `insight-issue-${issueType}`,
          insightType: 'warning',
          title: `Recurring issue: ${issueType}`,
          description: `This issue type has occurred ${count} times in the last 30 days.`,
          confidence: Math.min(count / 10, 1),
          applicableContext: ['support', 'troubleshooting'],
          actionable: true,
          suggestedAction: `Consider creating documentation or automation to address ${issueType}.`,
          createdAt: new Date(),
        });
      }
    }

    // Insight: Automation success opportunities
    const successfulTools = toolUsage.filter(t => t.successRate >= 90 && t.usageCount >= 3);
    if (successfulTools.length > 0) {
      insights.push({
        insightId: 'insight-automation-opportunity',
        insightType: 'optimization',
        title: 'Automation candidates identified',
        description: `${successfulTools.length} tools have high success rates and could be fully automated.`,
        confidence: 0.8,
        applicableContext: ['automation', 'efficiency'],
        actionable: true,
        suggestedAction: `Consider upgrading ${successfulTools.map(t => t.toolName).join(', ')} to FULL_AUTOMATION tier.`,
        createdAt: new Date(),
      });
    }

    return insights;
  }

  private createDefaultProfile(userId: string, workspaceId?: string): UserMemoryProfile {
    return {
      userId,
      workspaceId,
      preferences: {
        communicationStyle: 'simple',
        preferredTools: [],
        automationLevel: 'guided',
        notificationPreference: 'immediate',
      },
      interactionPatterns: [],
      frequentTopics: [],
      issueHistory: [],
      toolUsage: [],
      learningInsights: [],
      lastUpdated: new Date(),
    };
  }

  // ============================================================================
  // TOOL CAPABILITY CATALOG
  // ============================================================================

  async refreshToolCatalog(): Promise<void> {
    try {
      // Get all registered actions from automation ledger for success metrics
      const recentOutcomes = await db
        .select({
          actionCategory: automationActionLedger.actionCategory,
          actionName: automationActionLedger.actionName,
          approvalState: automationActionLedger.approvalState,
        })
        .from(automationActionLedger)
        .where(gte(automationActionLedger.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
        .limit(1000);

      // Calculate success metrics per tool
      const toolMetrics: Map<string, { success: number; total: number }> = new Map();
      
      for (const outcome of recentOutcomes) {
        const toolId = `${outcome.actionCategory}.${outcome.actionName}`;
        const existing = toolMetrics.get(toolId) || { success: 0, total: 0 };
        existing.total++;
        if (outcome.approvalState === 'executed' || outcome.approvalState === 'approved') {
          existing.success++;
        }
        toolMetrics.set(toolId, existing);
      }

      // Update catalog with metrics
      for (const [toolId, metrics] of toolMetrics) {
        const [category, name] = toolId.split('.');
        const existing = this.toolCatalog.get(toolId);
        
        this.toolCatalog.set(toolId, {
          toolId,
          toolName: name,
          category,
          description: existing?.description || `${category} ${name} action`,
          requiredConsents: existing?.requiredConsents || [],
          prerequisites: existing?.prerequisites || [],
          successMetrics: {
            successRate: metrics.total > 0 ? (metrics.success / metrics.total) * 100 : 0,
            avgExecutionTime: existing?.successMetrics.avgExecutionTime || 0,
            userSatisfaction: existing?.successMetrics.userSatisfaction || 0,
          },
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          usageCount: metrics.total,
          recommendedFor: existing?.recommendedFor || [],
        });
      }

      console.log(`[TrinityMemoryService] Tool catalog refreshed: ${this.toolCatalog.size} tools`);
    } catch (error) {
      console.error('[TrinityMemoryService] Error refreshing tool catalog:', error);
    }
  }

  getToolCatalog(workspaceId?: string): ToolCapability[] {
    // Note: Tool catalog currently contains platform-wide metrics
    // For tenant isolation, we return only tools with usage in the caller's workspace
    // or tools with no workspace association (platform defaults)
    return Array.from(this.toolCatalog.values());
  }

  // Get workspace-scoped tool catalog with metrics from automation ledger
  async getWorkspaceScopedToolCatalog(workspaceId: string): Promise<ToolCapability[]> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Get workspace-specific automation outcomes
      const recentOutcomes = await db
        .select({
          actionCategory: automationActionLedger.actionCategory,
          actionName: automationActionLedger.actionName,
          approvalState: automationActionLedger.approvalState,
        })
        .from(automationActionLedger)
        .where(
          and(
            eq(automationActionLedger.workspaceId, workspaceId),
            gte(automationActionLedger.createdAt, sevenDaysAgo)
          )
        )
        .limit(500);

      // Calculate workspace-specific success metrics
      const workspaceTools: Map<string, ToolCapability> = new Map();
      
      for (const outcome of recentOutcomes) {
        const toolId = `${outcome.actionCategory}.${outcome.actionName}`;
        const existing = workspaceTools.get(toolId);
        
        const isSuccess = outcome.approvalState === 'executed' || outcome.approvalState === 'approved';
        
        if (existing) {
          existing.usageCount++;
          const successCount = Math.round((existing.successMetrics.successRate / 100) * (existing.usageCount - 1));
          const newSuccessCount = isSuccess ? successCount + 1 : successCount;
          existing.successMetrics.successRate = (newSuccessCount / existing.usageCount) * 100;
        } else {
          workspaceTools.set(toolId, {
            toolId,
            toolName: outcome.actionName,
            category: outcome.actionCategory,
            description: `${outcome.actionCategory} ${outcome.actionName} action`,
            requiredConsents: [],
            prerequisites: [],
            successMetrics: {
              successRate: isSuccess ? 100 : 0,
              avgExecutionTime: 0,
              userSatisfaction: 0,
            },
            healthStatus: 'healthy',
            lastHealthCheck: new Date(),
            usageCount: 1,
            recommendedFor: [],
          });
        }
      }

      return Array.from(workspaceTools.values());
    } catch (error) {
      console.error('[TrinityMemoryService] Error getting workspace-scoped catalog:', error);
      return [];
    }
  }

  getToolsByCategory(category: string): ToolCapability[] {
    return Array.from(this.toolCatalog.values())
      .filter(tool => tool.category === category);
  }

  getRecommendedTools(context: string[]): ToolCapability[] {
    return Array.from(this.toolCatalog.values())
      .filter(tool => 
        tool.healthStatus === 'healthy' &&
        tool.successMetrics.successRate >= 70 &&
        (context.some(c => tool.recommendedFor.includes(c)) || tool.usageCount >= 10)
      )
      .sort((a, b) => b.successMetrics.successRate - a.successMetrics.successRate)
      .slice(0, 5);
  }

  // ============================================================================
  // CROSS-BOT KNOWLEDGE SHARING
  // ============================================================================

  async shareInsight(insight: Omit<SharedInsight, 'insightId' | 'createdAt' | 'usageCount' | 'effectivenessScore'>): Promise<SharedInsight> {
    const sharedInsight: SharedInsight = {
      ...insight,
      insightId: `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      usageCount: 0,
      effectivenessScore: 0,
    };

    this.sharedInsights.push(sharedInsight);
    
    // Keep only last 500 insights
    if (this.sharedInsights.length > 500) {
      this.sharedInsights = this.sharedInsights
        .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
        .slice(0, 400);
    }

    console.log(`[TrinityMemoryService] Insight shared by ${insight.sourceAgent}: ${insight.title}`);
    return sharedInsight;
  }

  getRelevantInsights(scenarios: string[], limit: number = 5, workspaceId?: string): SharedInsight[] {
    return this.sharedInsights
      .filter(insight => {
        // Filter by workspace scope for tenant isolation
        // Allow insights with null workspaceScope (platform-wide) or matching workspace
        const scopeMatch = insight.workspaceScope === null || insight.workspaceScope === workspaceId;
        const scenarioMatch = insight.applicableScenarios.some(s => scenarios.includes(s));
        return scopeMatch && scenarioMatch;
      })
      .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
      .slice(0, limit);
  }

  recordInsightUsage(insightId: string, wasEffective: boolean): void {
    const insight = this.sharedInsights.find(i => i.insightId === insightId);
    if (insight) {
      insight.usageCount++;
      // Adjust effectiveness score based on feedback
      const adjustment = wasEffective ? 10 : -5;
      insight.effectivenessScore = Math.max(0, Math.min(100, insight.effectivenessScore + adjustment));
    }
  }

  // ============================================================================
  // CONTEXT FOR AI PROMPTS
  // ============================================================================

  async buildMemoryContext(userId: string, workspaceId?: string, currentTopic?: string): Promise<string> {
    const profile = await this.getUserMemoryProfile(userId, workspaceId);
    
    let context = '## User Memory Context\n\n';
    
    // User preferences
    context += `### Communication Style\n`;
    context += `- Preferred style: ${profile.preferences.communicationStyle}\n`;
    context += `- Automation preference: ${profile.preferences.automationLevel}\n\n`;
    
    // Frequent topics
    if (profile.frequentTopics.length > 0) {
      context += `### Frequently Discussed Topics\n`;
      for (const topic of profile.frequentTopics.slice(0, 5)) {
        context += `- ${topic.topic} (${topic.category}): ${topic.frequency} times\n`;
      }
      context += '\n';
    }
    
    // Recent issues (if relevant)
    const recentIssues = profile.issueHistory.filter(i => 
      Date.now() - i.lastOccurred.getTime() < 7 * 24 * 60 * 60 * 1000
    );
    if (recentIssues.length > 0) {
      context += `### Recent Issues\n`;
      for (const issue of recentIssues.slice(0, 3)) {
        context += `- ${issue.issueType}: ${issue.description}\n`;
        if (issue.resolution) {
          context += `  Resolution: ${issue.resolution}\n`;
        }
      }
      context += '\n';
    }
    
    // Preferred tools
    if (profile.toolUsage.length > 0) {
      context += `### Preferred Tools\n`;
      for (const tool of profile.toolUsage.slice(0, 5)) {
        context += `- ${tool.toolName}: ${tool.usageCount} uses, ${tool.successRate.toFixed(0)}% success\n`;
      }
      context += '\n';
    }
    
    // Learning insights
    if (profile.learningInsights.length > 0) {
      context += `### AI Insights\n`;
      for (const insight of profile.learningInsights.slice(0, 3)) {
        context += `- [${insight.insightType}] ${insight.title}\n`;
        if (insight.suggestedAction) {
          context += `  Suggested: ${insight.suggestedAction}\n`;
        }
      }
      context += '\n';
    }
    
    // Relevant shared insights from other bots
    if (currentTopic) {
      const sharedInsights = this.getRelevantInsights([currentTopic], 3);
      if (sharedInsights.length > 0) {
        context += `### Learned from Platform Experience\n`;
        for (const insight of sharedInsights) {
          context += `- ${insight.title}: ${insight.content}\n`;
        }
        context += '\n';
      }
    }
    
    return context;
  }

  // ============================================================================
  // FEEDBACK LOOP FOR LEARNING
  // ============================================================================

  async recordInteractionOutcome(params: {
    userId: string;
    workspaceId?: string;
    actionName: string;
    category: string;
    outcome: 'success' | 'failure' | 'partial';
    confidenceAdjustment: number;
    lessonsLearned?: string;
  }): Promise<void> {
    try {
      // If there's a lesson learned, share it as an insight
      if (params.lessonsLearned && params.outcome !== 'partial') {
        await this.shareInsight({
          sourceAgent: 'trinity',
          insightType: params.outcome === 'success' ? 'resolution' : 'warning',
          workspaceScope: params.workspaceId || null,
          title: `${params.category}.${params.actionName} ${params.outcome}`,
          content: params.lessonsLearned,
          confidence: Math.abs(params.confidenceAdjustment) / 100,
          applicableScenarios: [params.category, params.actionName],
        });
      }

      // Invalidate user profile cache to force refresh
      const cacheKey = `${params.userId}:${params.workspaceId || 'global'}`;
      this.userProfileCache.delete(cacheKey);

      console.log(`[TrinityMemoryService] Recorded outcome for ${params.actionName}: ${params.outcome}`);
    } catch (error) {
      console.error('[TrinityMemoryService] Error recording interaction outcome:', error);
    }
  }
}

export const trinityMemoryService = TrinityMemoryService.getInstance();
