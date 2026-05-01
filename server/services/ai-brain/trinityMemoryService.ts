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

import crypto from 'crypto';
import { db } from '../../db';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { 
  trinityConversationSessions, 
  knowledgeGapLogs, 
  automationActionLedger,
  trinityUserConfidenceStats,
  trinityOrgStats,
} from '@shared/schema';
import { TTLCache } from './cacheUtils';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityMemoryService');

// Type aliases for DB records
type SessionRecord = typeof trinityConversationSessions.$inferSelect;
type LedgerRecord = typeof automationActionLedger.$inferSelect;
type GapRecord = typeof knowledgeGapLogs.$inferSelect;

// ============================================================================
// TYPES
// ============================================================================

export type OrgActionCategory = 
  | 'scheduling' | 'payroll' | 'time_tracking' | 'compliance' 
  | 'onboarding' | 'billing' | 'analytics' | 'hr_management'
  | 'document_processing' | 'communication' | 'support'
  | 'employee_management' | 'shift_management' | 'reporting'
  | 'integration' | 'automation' | 'configuration' | 'financial';

export interface OrgActionSummary {
  workspaceId: string;
  periodDays: number;
  totalActions: number;
  topCategories: {
    category: string;
    total: number;
    success: number;
    failure: number;
    successRate: number;
  }[];
  recentHighImpactActions: {
    category: string;
    name: string;
    description: string;
    when: Date;
  }[];
  overallSuccessRate: number;
}

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
  patternData: Record<string, unknown>;
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

export interface OrgLearningInsights {
  workspaceId: string;
  totalActiveUsers: number;
  totalSessions: number;
  avgUserConfidence: number;
  orgHealthScore: number;
  commonTopics: string[];
  commonPainPoints: string[];
  growthOpportunities: string[];
  featuresUsed: string[];
  featureAdoptionScore: number;
  recommendations: OrgRecommendation[];
  aggregatedAt: Date;
}

export interface OrgRecommendation {
  type: 'training' | 'support' | 'process' | 'adoption' | 'growth';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionable: boolean;
}

// ============================================================================
// TRINITY MEMORY SERVICE CLASS
// ============================================================================

class TrinityMemoryService {
  private static instance: TrinityMemoryService;
  private profileCache = new TTLCache<string, UserMemoryProfile>(10 * 60 * 1000, 100);
  private sharedInsights: SharedInsight[] = [];
  private readonly maxInsights = 200;

  static getInstance(): TrinityMemoryService {
    if (!this.instance) {
      this.instance = new TrinityMemoryService();
    }
    return this.instance;
  }

  shutdown(): void {
    this.profileCache.shutdown();
    this.sharedInsights = [];
  }

  // ============================================================================
  // USER MEMORY PROFILE (WORKSPACE-SCOPED for tenant isolation)
  // ============================================================================

  async getUserMemoryProfile(userId: string, workspaceId?: string): Promise<UserMemoryProfile> {
    const cacheKey = `${userId}:${workspaceId || 'global'}`;
    const cached = this.profileCache.get(cacheKey);
    if (cached) return cached;

    try {
      const profile = await this.buildUserProfile(userId, workspaceId);
      this.profileCache.set(cacheKey, profile);
      return profile;
    } catch (error) {
      log.error('[TrinityMemoryService] Error building user profile:', error);
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

  private inferPreferences(sessions: SessionRecord[]): UserPreferences {
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

  private detectPatterns(sessions: SessionRecord[]): InteractionPattern[] {
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

  private analyzeTopics(sessions: SessionRecord[], knowledgeGaps: GapRecord[]): TopicFrequency[] {
    const topicMap: Map<string, TopicFrequency> = new Map();

    // Analyze knowledge gaps for topic extraction
    for (const gap of knowledgeGaps) {
      const topic = gap.gapType || 'general';
      const existing = topicMap.get(topic);
      
      if (existing) {
        existing.frequency++;
        existing.lastDiscussed = gap.createdAt ? new Date(gap.createdAt) : new Date();
      } else {
        topicMap.set(topic, {
          topic,
          category: this.categorizeGapType(gap.gapType),
          frequency: 1,
          lastDiscussed: gap.createdAt ? new Date(gap.createdAt) : new Date(),
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

  private extractIssues(knowledgeGaps: GapRecord[], automationOutcomes: LedgerRecord[]): IssueRecord[] {
    const issues: IssueRecord[] = [];

    // Extract from knowledge gaps
    for (const gap of knowledgeGaps) {
      issues.push({
        issueId: gap.id,
        issueType: gap.gapType,
        description: gap.gapDescription || 'Unknown issue',
        resolution: gap.resolutionDetails || undefined,
        resolutionMethod: gap.resolutionStatus === 'resolved' ? 'ai_assisted' : 'self_service',
        timeToResolve: gap.resolvedAt && gap.createdAt 
          ? new Date(gap.resolvedAt).getTime() - new Date(gap.createdAt).getTime() 
          : undefined,
        recurrenceCount: 1,
        lastOccurred: gap.createdAt ? new Date(gap.createdAt) : new Date(),
      });
    }

    // Extract from failed automation outcomes
    for (const outcome of automationOutcomes) {
      if (outcome.executionStatus === 'error' || outcome.approvalState === 'rejected') {
        issues.push({
          issueId: outcome.id,
          issueType: 'automation_failure',
          description: `${outcome.actionCategory}.${outcome.actionName} failed`,
          resolution: outcome.errorDetails || undefined,
          resolutionMethod: 'automated',
          recurrenceCount: 1,
          lastOccurred: outcome.createdAt ? new Date(outcome.createdAt) : new Date(),
        });
      }
    }

    return issues.slice(0, 20);
  }

  private calculateToolUsage(automationOutcomes: LedgerRecord[]): ToolUsageStats[] {
    const toolStats: Map<string, ToolUsageStats> = new Map();

    for (const outcome of automationOutcomes) {
      const toolName = `${outcome.actionCategory}.${outcome.actionName}`;
      const existing = toolStats.get(toolName);

      if (existing) {
        existing.usageCount++;
        if (outcome.executionStatus === 'success') {
          existing.successRate = ((existing.successRate * (existing.usageCount - 1)) + 100) / existing.usageCount;
        } else {
          existing.successRate = ((existing.successRate * (existing.usageCount - 1)) + 0) / existing.usageCount;
        }
        existing.lastUsed = outcome.createdAt ? new Date(outcome.createdAt) : new Date();
      } else {
        toolStats.set(toolName, {
          toolName,
          category: outcome.actionCategory,
          usageCount: 1,
          successRate: outcome.executionStatus === 'success' ? 100 : 0,
          avgExecutionTime: 0,
          lastUsed: outcome.createdAt ? new Date(outcome.createdAt) : new Date(),
        });
      }
    }

    return Array.from(toolStats.values())
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  private generateInsights(sessions: SessionRecord[], automationOutcomes: LedgerRecord[], knowledgeGaps: GapRecord[]): LearningInsight[] {
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
  // TOOL CAPABILITY CATALOG (WORKSPACE-SCOPED FOR TENANT ISOLATION)
  // ============================================================================

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
      log.error('[TrinityMemoryService] Error getting workspace-scoped catalog:', error);
      return [];
    }
  }

  // ============================================================================
  // CROSS-BOT KNOWLEDGE SHARING (WORKSPACE-SCOPED via workspaceScope field)
  // ============================================================================

  async shareInsight(insight: Omit<SharedInsight, 'insightId' | 'createdAt' | 'usageCount' | 'effectivenessScore'>): Promise<SharedInsight> {
    const sharedInsight: SharedInsight = {
      ...insight,
      insightId: `shared-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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

    log.info(`[TrinityMemoryService] Insight shared by ${insight.sourceAgent}: ${insight.title}`);
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
  // CONTEXT FOR AI PROMPTS (WORKSPACE-SCOPED - all sub-queries filter by workspaceId)
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
    
    // Org-wide action intelligence (business context for better advice)
    if (workspaceId) {
      try {
        const orgSummary = await this.getOrgActionSummary(workspaceId, 14);
        if (orgSummary.totalActions > 0) {
          context += `### Organization Activity (Last 14 Days)\n`;
          context += `- Total actions tracked: ${orgSummary.totalActions}\n`;
          context += `- Overall success rate: ${orgSummary.overallSuccessRate.toFixed(0)}%\n`;
          if (orgSummary.topCategories.length > 0) {
            context += `- Most active areas: ${orgSummary.topCategories.slice(0, 5).map(c => `${c.category} (${c.total} actions, ${c.successRate.toFixed(0)}% success)`).join(', ')}\n`;
          }
          if (orgSummary.recentHighImpactActions.length > 0) {
            context += `- Recent significant actions:\n`;
            for (const action of orgSummary.recentHighImpactActions.slice(0, 3)) {
              context += `  - ${action.category}: ${action.description}\n`;
            }
          }
          context += '\n';
        }
      } catch {
        // Non-critical - continue without org action context
      }
    }

    // Relevant shared insights from other bots
    if (currentTopic) {
      const sharedInsights = this.getRelevantInsights([currentTopic], 3, workspaceId);
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
  // MEMORY OPTIMIZATION - Context Window Management with Model Tier Awareness
  // ============================================================================

  // Default context budget (used when no tier specified)
  private readonly MAX_CONTEXT_TOKENS = 8000;
  private readonly SUMMARY_THRESHOLD = 4000;
  private contextTokenEstimates: Map<string, number> = new Map();

  // Model tier-specific context budgets (in tokens)
  // Based on Gemini model capabilities and optimal performance
  private readonly TIER_CONTEXT_BUDGETS: Record<string, { maxTokens: number; summaryThreshold: number; priority: string[] }> = {
    // Tier 1: Complex reasoning with Gemini 3 Pro (large context)
    'ORCHESTRATOR': { maxTokens: 500000, summaryThreshold: 250000, priority: ['reasoning', 'history', 'tools', 'insights'] },
    'DIAGNOSTICS': { maxTokens: 500000, summaryThreshold: 250000, priority: ['system_state', 'errors', 'history', 'patterns'] },
    'PRO_FALLBACK': { maxTokens: 200000, summaryThreshold: 100000, priority: ['context', 'history', 'tools'] },
    'SUPERVISOR': { maxTokens: 200000, summaryThreshold: 100000, priority: ['domain', 'tools', 'history'] },
    'COMPLIANCE': { maxTokens: 200000, summaryThreshold: 100000, priority: ['rules', 'history', 'violations'] },
    
    // Tier 2: Conversational with Gemini 2.5 Flash (medium context)
    'CONVERSATIONAL': { maxTokens: 50000, summaryThreshold: 25000, priority: ['recent', 'preferences', 'topics'] },
    'HELLOS': { maxTokens: 50000, summaryThreshold: 25000, priority: ['user', 'issues', 'insights'] },
    'ONBOARDING': { maxTokens: 32000, summaryThreshold: 16000, priority: ['user', 'progress', 'next_steps'] },
    
    // Tier 3: Simple bots with Gemini 1.5 Flash 8B (small context)
    'SIMPLE': { maxTokens: 16000, summaryThreshold: 8000, priority: ['recent', 'essential'] },
    'NOTIFICATION': { maxTokens: 16000, summaryThreshold: 8000, priority: ['message', 'recipients'] },
  };

  /**
   * Get context budget configuration for a model tier
   */
  getContextBudgetForTier(tier: string): { maxTokens: number; summaryThreshold: number; priority: string[] } {
    return this.TIER_CONTEXT_BUDGETS[tier] || { 
      maxTokens: this.MAX_CONTEXT_TOKENS, 
      summaryThreshold: this.SUMMARY_THRESHOLD,
      priority: ['recent', 'essential'] 
    };
  }

  /**
   * Estimate token count for a string (rough approximation: 4 chars = 1 token)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Build optimized context with token budget management
   * Prioritizes recent and relevant information within token limits
   * 
   * @param modelTier - Optional model tier for tier-specific context budgeting
   */
  async buildOptimizedContext(
    userId: string,
    workspaceId: string | undefined,
    currentQuery: string,
    maxTokens: number = this.MAX_CONTEXT_TOKENS,
    modelTier?: string
  ): Promise<{ context: string; tokenCount: number; pruned: boolean; tier?: string }> {
    // Apply tier-specific context budget if provided
    if (modelTier) {
      const tierBudget = this.getContextBudgetForTier(modelTier);
      maxTokens = Math.min(maxTokens, tierBudget.maxTokens);
    }
    const sections: { priority: number; content: string; tokens: number }[] = [];
    let totalTokens = 0;
    
    // 1. User profile (high priority)
    const profile = await this.getUserMemoryProfile(userId, workspaceId);
    if (profile) {
      // Build a compact profile context string
      let profileContext = '### User Profile\n';
      profileContext += `Communication style: ${profile.preferences.communicationStyle}\n`;
      profileContext += `Automation level: ${profile.preferences.automationLevel}\n`;
      if (profile.frequentTopics.length > 0) {
        profileContext += `Frequent topics: ${profile.frequentTopics.slice(0, 3).map(t => t.topic).join(', ')}\n`;
      }
      if (profile.toolUsage.length > 0) {
        profileContext += `Preferred tools: ${profile.toolUsage.slice(0, 3).map(t => t.toolName).join(', ')}\n`;
      }
      const tokens = this.estimateTokens(profileContext);
      sections.push({ priority: 1, content: profileContext, tokens });
    }

    // 2. Shared insights (medium priority) - WORKSPACE SCOPED to prevent cross-org leakage
    const insights = this.getRelevantInsights([currentQuery], 3, workspaceId);
    if (insights.length > 0) {
      let insightsContext = '### Platform Insights\n';
      for (const insight of insights) {
        insightsContext += `- ${insight.title}\n`;
      }
      const tokens = this.estimateTokens(insightsContext);
      sections.push({ priority: 2, content: insightsContext, tokens });
    }

    // Sort by priority and build context within token budget
    sections.sort((a, b) => a.priority - b.priority);
    
    let context = '';
    let pruned = false;

    for (const section of sections) {
      if (totalTokens + section.tokens <= maxTokens) {
        context += section.content + '\n';
        totalTokens += section.tokens;
      } else {
        // Summarize or truncate if over budget
        const remaining = maxTokens - totalTokens;
        if (remaining > 100) {
          const truncated = section.content.substring(0, remaining * 4) + '...\n';
          context += truncated;
          totalTokens += remaining;
        }
        pruned = true;
        break;
      }
    }

    return { context, tokenCount: totalTokens, pruned, tier: modelTier };
  }

  /**
   * Summarize long conversation for memory efficiency
   */
  async summarizeConversation(
    messages: { role: string; content: string }[],
    maxLength: number = 500
  ): Promise<string> {
    if (messages.length === 0) return '';
    
    // Extract key points from conversation
    const topics = new Set<string>();
    const actions = new Set<string>();
    let lastUserMessage = '';
    let lastAssistantMessage = '';

    for (const msg of messages) {
      if (msg.role === 'user') {
        lastUserMessage = msg.content;
        // Extract likely topics
        const words = msg.content.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (['schedule', 'shift', 'payroll', 'time', 'report', 'help', 'error', 'issue'].includes(word)) {
            topics.add(word);
          }
        }
      } else if (msg.role === 'assistant') {
        lastAssistantMessage = msg.content;
        // Extract actions taken
        if (msg.content.includes('created')) actions.add('created');
        if (msg.content.includes('updated')) actions.add('updated');
        if (msg.content.includes('approved')) actions.add('approved');
        if (msg.content.includes('sent')) actions.add('sent');
      }
    }

    const topicList = Array.from(topics).slice(0, 5).join(', ');
    const actionList = Array.from(actions).slice(0, 3).join(', ');
    
    let summary = '';
    if (topicList) summary += `Topics: ${topicList}. `;
    if (actionList) summary += `Actions: ${actionList}. `;
    if (lastUserMessage) summary += `Last query: "${lastUserMessage.substring(0, 100)}..."`;

    return summary.substring(0, maxLength);
  }

  // ============================================================================
  // SESSION SUMMARY — Updates working memory after every conversation turn
  // ============================================================================

  /**
   * updateSessionSummaryAfterTurn
   * Called after each Trinity conversation turn to keep working memory current.
   * Updates: summary (rolling text), turn_count, last_action_id, context_memory.
   */
  async updateSessionSummaryAfterTurn(params: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    userMessage: string;
    assistantResponse: string;
    actionId?: string;
    confidenceScore?: number;
    toolUsed?: string;
  }): Promise<void> {
    const {
      sessionId, workspaceId, userId, userMessage, assistantResponse,
      actionId, confidenceScore, toolUsed,
    } = params;

    try {
      // Fetch the current session state (summary + turn_count)
      const [current] = await db
        .select({
          summary: trinityConversationSessions.summary,
          turnCount: trinityConversationSessions.turnCount,
          contextMemory: trinityConversationSessions.contextMemory,
        })
        .from(trinityConversationSessions)
        .where(
          and(
            eq(trinityConversationSessions.id, sessionId),
            eq(trinityConversationSessions.workspaceId, workspaceId),
          )
        )
        .limit(1);

      if (!current) return; // Session not found — nothing to update

      const newTurnCount = ((current.turnCount as number) || 0) + 1;

      // Rolling summary: keep the last 3 turns visible
      const userSnippet = userMessage.substring(0, 120).replace(/\n/g, ' ');
      const assistantSnippet = assistantResponse.substring(0, 200).replace(/\n/g, ' ');
      const turnEntry = `[T${newTurnCount}] U: "${userSnippet}" → A: "${assistantSnippet}"`;

      // Append to existing summary, keeping last 2000 chars
      const prevSummary = current.summary ?? '';
      const combined = prevSummary ? `${prevSummary}\n${turnEntry}` : turnEntry;
      const truncatedSummary = combined.length > 2000
        ? combined.substring(combined.length - 2000)
        : combined;

      // Merge context memory patch
      const prevContext = (current.contextMemory as Record<string, unknown>) ?? {};
      const contextPatch: Record<string, unknown> = {
        ...prevContext,
        lastTurn: newTurnCount,
        lastUserIntent: userSnippet,
        lastActionTaken: actionId ?? prevContext.lastActionTaken ?? null,
        updatedAt: new Date().toISOString(),
      };

      await db
        .update(trinityConversationSessions)
        .set({
          summary: truncatedSummary,
          turnCount: newTurnCount,
          lastActionId: actionId ?? null,
          lastConfidenceScore: typeof confidenceScore === 'number' ? Math.round(confidenceScore) : null,
          lastToolUsed: toolUsed ?? null,
          contextMemory: contextPatch,
          updatedAt: new Date(),
          lastActivityAt: new Date(),
        } as any)
        .where(
          and(
            eq(trinityConversationSessions.id, sessionId),
            eq(trinityConversationSessions.workspaceId, workspaceId),
          )
        );
    } catch (err) {
      log.warn('[TrinityMemoryService] updateSessionSummaryAfterTurn failed:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Prune old memories to maintain performance
   */
  async pruneOldMemories(workspaceId: string | undefined, daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      // Clear old entries from caches
      let pruned = 0;
      
      // Clear old profile cache entries
      this.profileCache.clear();
      pruned++;

      // Clear expired shared insights - WORKSPACE SCOPED to prevent cross-org pruning
      const now = new Date();
      const initialCount = this.sharedInsights.length;
      this.sharedInsights = this.sharedInsights.filter(insight => {
        const createdDate = insight.createdAt;
        const daysSinceCreated = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated > daysToKeep) {
          if (workspaceId) {
            return insight.workspaceScope !== workspaceId && insight.workspaceScope !== null;
          }
          return false;
        }
        return true;
      });
      pruned += initialCount - this.sharedInsights.length;

      log.info(`[TrinityMemoryService] Pruned ${pruned} old memory entries`);
      return pruned;
    } catch (error) {
      log.error('[TrinityMemoryService] Error pruning memories:', error);
      return 0;
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    profileCacheSize: number;
    sharedInsightsCount: number;
    estimatedTokenUsage: number;
  } {
    let totalTokenEstimate = 0;
    
    for (const tokens of this.contextTokenEstimates.values()) {
      totalTokenEstimate += tokens;
    }

    return {
      profileCacheSize: this.profileCache.size,
      sharedInsightsCount: this.sharedInsights.length,
      estimatedTokenUsage: totalTokenEstimate,
    };
  }

  /**
   * Compact memory by summarizing and archiving
   */
  async compactMemory(userId: string, workspaceId: string | undefined): Promise<void> {
    const cacheKey = `${userId}:${workspaceId || 'global'}`;
    
    // Get current context token count
    const currentEstimate = this.contextTokenEstimates.get(cacheKey) || 0;
    
    if (currentEstimate > this.SUMMARY_THRESHOLD) {
      // Force profile refresh with summarization
      this.profileCache.delete(cacheKey);
      log.info(`[TrinityMemoryService] Compacted memory for ${cacheKey}`);
    }
  }

  // ============================================================================
  // ORG LEARNING AGGREGATION (Phase 2B)
  // ============================================================================

  /**
   * Aggregate learning insights across all users in an organization.
   * Updates trinity_org_stats with cross-user patterns, common topics, and pain points.
   */
  async aggregateOrgLearning(workspaceId: string): Promise<OrgLearningInsights> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get all user sessions for this workspace
      const sessions = await db
        .select()
        .from(trinityConversationSessions)
        .where(
          and(
            eq(trinityConversationSessions.workspaceId, workspaceId),
            gte(trinityConversationSessions.createdAt, thirtyDaysAgo)
          )
        )
        .orderBy(desc(trinityConversationSessions.createdAt))
        .limit(500);

      // Get unique users
      const uniqueUserIds = [...new Set(sessions.map(s => s.userId))];

      // Get user confidence stats
      const userStats = uniqueUserIds.length > 0 ? await db
        .select()
        .from(trinityUserConfidenceStats)
        .where(
          and(
            inArray(trinityUserConfidenceStats.userId, uniqueUserIds),
            eq(trinityUserConfidenceStats.workspaceId, workspaceId)
          )
        ) : [];

      // Get knowledge gaps for this workspace's sessions
      const sessionIds = sessions.map(s => s.id);
      const knowledgeGaps = sessionIds.length > 0 ? await db
        .select()
        .from(knowledgeGapLogs)
        .where(inArray(knowledgeGapLogs.sessionId, sessionIds))
        .limit(200) : [];

      // Aggregate common topics
      const topicCounts: Record<string, number> = {};
      for (const gap of knowledgeGaps) {
        const topic = gap.gapType || 'general';
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
      const commonTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic]) => topic);

      // Identify common pain points from unresolved gaps
      const unresolvedGaps = knowledgeGaps.filter(g => g.resolutionStatus !== 'resolved');
      const painPointCounts: Record<string, number> = {};
      for (const gap of unresolvedGaps) {
        const type = gap.gapType || 'unknown';
        painPointCounts[type] = (painPointCounts[type] || 0) + 1;
      }
      const commonPainPoints = Object.entries(painPointCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type]) => type);

      // Calculate average user confidence
      const confidenceValues = userStats
        .filter(s => s.averageConfidence)
        .map(s => parseFloat(s.averageConfidence || '0.5'));
      const avgUserConfidence = confidenceValues.length > 0
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
        : 0.5;

      // Calculate org health score based on various factors
      const resolutionRate = knowledgeGaps.length > 0
        ? knowledgeGaps.filter(g => g.resolutionStatus === 'resolved').length / knowledgeGaps.length
        : 0.5;
      const orgHealthScore = (avgUserConfidence * 0.4) + (resolutionRate * 0.6);

      // Identify growth opportunities from successful patterns
      const growthOpportunities: string[] = [];
      if (avgUserConfidence > 0.7) {
        growthOpportunities.push('High user confidence - ready for advanced automation');
      }
      if (sessions.length > 50) {
        growthOpportunities.push('High engagement - consider Trinity Pro features');
      }
      if (resolutionRate > 0.8) {
        growthOpportunities.push('Excellent issue resolution - reduce human escalations');
      }

      // Get features used from session data
      const featuresUsed = new Set<string>();
      for (const session of sessions) {
        if (session.lastToolUsed) {
          featuresUsed.add(session.lastToolUsed);
        }
      }

      // Calculate feature adoption score
      const expectedFeatures = 20; // Baseline expected feature count
      const featureAdoptionScore = Math.min(featuresUsed.size / expectedFeatures, 1);

      // Update trinity_org_stats table
      const existingStats = await db.query.trinityOrgStats.findFirst({
        where: eq(trinityOrgStats.workspaceId, workspaceId),
      });

      const statsUpdate = {
        totalActiveUsers: uniqueUserIds.length,
        totalUserSessions: sessions.length,
        totalOrgInteractions: sessions.reduce((sum, s) => sum + (s.turnCount || 0), 0),
        avgUserConfidence: avgUserConfidence.toFixed(4),
        orgHealthScore: orgHealthScore.toFixed(2),
        commonTopics,
        commonPainPoints,
        growthOpportunities,
        featuresUsed: Array.from(featuresUsed),
        featureAdoptionScore: featureAdoptionScore.toFixed(2),
        updatedAt: new Date(),
        lastAggregatedAt: new Date(),
      };

      if (existingStats) {
        await db
          .update(trinityOrgStats)
          .set(statsUpdate)
          .where(eq(trinityOrgStats.workspaceId, workspaceId));
      } else {
        await db.insert(trinityOrgStats).values({
          workspaceId,
          ...statsUpdate,
        });
      }

      const insights: OrgLearningInsights = {
        workspaceId,
        totalActiveUsers: uniqueUserIds.length,
        totalSessions: sessions.length,
        avgUserConfidence,
        orgHealthScore,
        commonTopics,
        commonPainPoints,
        growthOpportunities,
        featuresUsed: Array.from(featuresUsed),
        featureAdoptionScore,
        recommendations: this.generateOrgRecommendations(
          avgUserConfidence,
          orgHealthScore,
          commonPainPoints,
          featureAdoptionScore
        ),
        aggregatedAt: new Date(),
      };

      log.info(`[TrinityMemoryService] Aggregated org learning for workspace ${workspaceId}: ${uniqueUserIds.length} users, ${sessions.length} sessions`);
      return insights;
    } catch (error) {
      log.error('[TrinityMemoryService] Error aggregating org learning:', error);
      return {
        workspaceId,
        totalActiveUsers: 0,
        totalSessions: 0,
        avgUserConfidence: 0.5,
        orgHealthScore: 0.5,
        commonTopics: [],
        commonPainPoints: [],
        growthOpportunities: [],
        featuresUsed: [],
        featureAdoptionScore: 0,
        recommendations: [],
        aggregatedAt: new Date(),
      };
    }
  }

  private generateOrgRecommendations(
    avgConfidence: number,
    healthScore: number,
    painPoints: string[],
    adoptionScore: number
  ): OrgRecommendation[] {
    const recommendations: OrgRecommendation[] = [];

    if (avgConfidence < 0.5) {
      recommendations.push({
        type: 'training',
        priority: 'high',
        title: 'Improve User Onboarding',
        description: 'Low average confidence suggests users need more guidance. Consider enhanced onboarding tours.',
        actionable: true,
      });
    }

    if (healthScore < 0.6) {
      recommendations.push({
        type: 'support',
        priority: 'high',
        title: 'Address Issue Resolution Rate',
        description: 'Many issues remain unresolved. Review common pain points and create documentation.',
        actionable: true,
      });
    }

    if (painPoints.length > 3) {
      recommendations.push({
        type: 'process',
        priority: 'medium',
        title: 'Address Recurring Pain Points',
        description: `${painPoints.length} recurring issues detected. Consider automated solutions or documentation.`,
        actionable: true,
      });
    }

    if (adoptionScore < 0.3) {
      recommendations.push({
        type: 'adoption',
        priority: 'medium',
        title: 'Increase Feature Adoption',
        description: 'Users are only using a fraction of available features. Consider feature discovery campaigns.',
        actionable: true,
      });
    }

    if (avgConfidence > 0.8 && adoptionScore > 0.7) {
      recommendations.push({
        type: 'growth',
        priority: 'low',
        title: 'Ready for Advanced Automation',
        description: 'High confidence and adoption indicate readiness for Trinity Pro or Guru mode features.',
        actionable: true,
      });
    }

    return recommendations;
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

      const cacheKey = `${params.userId}:${params.workspaceId || 'global'}`;
      this.profileCache.delete(cacheKey);

      log.info(`[TrinityMemoryService] Recorded outcome for ${params.actionName}: ${params.outcome}`);
    } catch (error) {
      log.error('[TrinityMemoryService] Error recording interaction outcome:', error);
    }
  }

  // ============================================================================
  // ORG-WIDE ACTION TRACKING (Phase 2 - WORKSPACE-SCOPED per org)
  // ============================================================================

  async recordOrgAction(params: {
    workspaceId: string;
    userId?: string;
    actionCategory: OrgActionCategory;
    actionName: string;
    actionDescription: string;
    outcome: 'success' | 'failure' | 'partial' | 'pending';
    metadata?: Record<string, unknown>;
    impactLevel?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<void> {
    try {
      await db.insert(automationActionLedger).values({
        workspaceId: params.workspaceId,
        actionId: `org_${params.actionCategory}_${Date.now()}`,
        actionName: params.actionName,
        actionCategory: params.actionCategory,
        confidenceScore: params.outcome === 'success' ? 95 : params.outcome === 'failure' ? 20 : 60,
        computedLevel: 'NOTIFY_ONLY',
        policyLevel: 'NOTIFY_ONLY',
        executionStatus: params.outcome === 'success' ? 'success' : params.outcome === 'failure' ? 'error' : 'pending',
        executedBy: params.userId || null,
        executedByBot: !params.userId,
        executorType: params.userId ? 'user' : 'system',
        inputPayload: {
          description: params.actionDescription,
          impactLevel: params.impactLevel || 'low',
          source: 'org_action_tracker',
          ...params.metadata,
        },
        outputResult: params.outcome === 'success' ? { status: 'completed' } : null,
        approvalState: 'executed',
      });

      if (params.outcome === 'success' && params.impactLevel && ['high', 'critical'].includes(params.impactLevel)) {
        await this.shareInsight({
          sourceAgent: 'automation',
          insightType: 'pattern',
          workspaceScope: params.workspaceId,
          title: `${params.actionCategory}: ${params.actionName}`,
          content: params.actionDescription,
          confidence: 0.8,
          applicableScenarios: [params.actionCategory, 'org_learning', 'business_intelligence'],
        });
      }

      const cacheKey = `${params.userId || 'system'}:${params.workspaceId}`;
      this.profileCache.delete(cacheKey);
    } catch (error) {
      log.error('[TrinityMemoryService] Error recording org action:', error);
    }
  }

  async getOrgActionSummary(workspaceId: string, daysBack: number = 30): Promise<OrgActionSummary> {
    try {
      const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      const actions = await db
        .select({
          actionCategory: automationActionLedger.actionCategory,
          actionName: automationActionLedger.actionName,
          executionStatus: automationActionLedger.executionStatus,
          createdAt: automationActionLedger.createdAt,
          inputPayload: automationActionLedger.inputPayload,
        })
        .from(automationActionLedger)
        .where(
          and(
            eq(automationActionLedger.workspaceId, workspaceId),
            gte(automationActionLedger.createdAt, cutoff)
          )
        )
        .orderBy(desc(automationActionLedger.createdAt))
        .limit(500);

      const categoryCounts: Record<string, { total: number; success: number; failure: number }> = {};
      const recentHighImpact: { category: string; name: string; description: string; when: Date }[] = [];

      for (const action of actions) {
        const cat = action.actionCategory;
        if (!categoryCounts[cat]) {
          categoryCounts[cat] = { total: 0, success: 0, failure: 0 };
        }
        categoryCounts[cat].total++;
        if (action.executionStatus === 'success') categoryCounts[cat].success++;
        if (action.executionStatus === 'error') categoryCounts[cat].failure++;

        const payload = action.inputPayload as Record<string, any> | null;
        if (payload?.impactLevel && ['high', 'critical'].includes(payload.impactLevel)) {
          recentHighImpact.push({
            category: cat,
            name: action.actionName,
            description: payload.description || action.actionName,
            when: action.createdAt ? new Date(action.createdAt) : new Date(),
          });
        }
      }

      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([category, stats]) => ({
          category,
          ...stats,
          successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
        }));

      return {
        workspaceId,
        periodDays: daysBack,
        totalActions: actions.length,
        topCategories,
        recentHighImpactActions: recentHighImpact.slice(0, 10),
        overallSuccessRate: actions.length > 0
          ? (actions.filter(a => a.executionStatus === 'success').length / actions.length) * 100
          : 0,
      };
    } catch (error) {
      log.error('[TrinityMemoryService] Error getting org action summary:', error);
      return {
        workspaceId,
        periodDays: daysBack,
        totalActions: 0,
        topCategories: [],
        recentHighImpactActions: [],
        overallSuccessRate: 0,
      };
    }
  }
}

export const trinityMemoryService = TrinityMemoryService.getInstance();

// ============================================================================
// PLATFORM EVENT BUS INTEGRATION - Learn from ALL org automations
// ============================================================================
// Hooks into the centralized automation orchestration pipeline so Trinity 
// captures every scheduling, payroll, compliance, onboarding, and other
// organizational action for building business intelligence and better advice.

let eventBusConnected = false;

export async function connectTrinityMemoryToEventBus(): Promise<void> {
  if (eventBusConnected) return;
  
  try {
    const { platformEventBus } = await import('../platformEventBus');

    platformEventBus.on('automation_completed', (p: any) => {
      if (!p?.workspaceId || !p?.domain) return;
      
      const domainToCategoryMap: Record<string, OrgActionCategory> = {
        scheduling: 'scheduling',
        payroll: 'payroll',
        compliance: 'compliance',
        onboarding: 'onboarding',
        billing: 'billing',
        analytics: 'analytics',
        hr: 'hr_management',
        documents: 'document_processing',
        communication: 'communication',
        support: 'support',
        employee: 'employee_management',
        reporting: 'reporting',
        financial: 'financial',
        integration: 'integration',
      };
      
      const category = domainToCategoryMap[p.domain] || 'automation';
      
      trinityMemoryService.recordOrgAction({
        workspaceId: p.workspaceId,
        userId: p.userId,
        actionCategory: category,
        actionName: p.automationName || 'unknown',
        actionDescription: `${p.domain} automation "${p.automationName}" completed successfully in ${p.durationMs || 0}ms`,
        outcome: 'success',
        metadata: {
          orchestrationId: p.orchestrationId,
          automationType: p.automationType,
          durationMs: p.durationMs,
        },
        impactLevel: p.durationMs > 30000 ? 'high' : 'medium',
      }).catch(err => log.warn('[TrinityMemory] Failed to record automation success:', err?.message));
    });
    
    platformEventBus.on('automation_execution_failed', (p: any) => {
      if (!p?.workspaceId || !p?.domain) return;
      
      const domainToCategoryMap: Record<string, OrgActionCategory> = {
        scheduling: 'scheduling',
        payroll: 'payroll',
        compliance: 'compliance',
        onboarding: 'onboarding',
        billing: 'billing',
        analytics: 'analytics',
        hr: 'hr_management',
        documents: 'document_processing',
        communication: 'communication',
        support: 'support',
        employee: 'employee_management',
        reporting: 'reporting',
        financial: 'financial',
        integration: 'integration',
      };
      
      const category = domainToCategoryMap[p.domain] || 'automation';
      
      trinityMemoryService.recordOrgAction({
        workspaceId: p.workspaceId,
        userId: p.userId,
        actionCategory: category,
        actionName: p.automationName || 'unknown',
        actionDescription: `${p.domain} automation "${p.automationName}" failed: ${p.error || 'unknown error'}`,
        outcome: 'failure',
        metadata: {
          orchestrationId: p.orchestrationId,
          errorCode: p.errorCode,
          retryable: p.retryable,
          remediation: p.remediation,
        },
        impactLevel: p.retryable ? 'medium' : 'high',
      }).catch(err => log.warn('[TrinityMemory] Failed to record automation failure:', err?.message));
    });
    
    eventBusConnected = true;
    log.info('[TrinityMemoryService] Connected to platform event bus - learning from ALL org automations');
  } catch (error) {
    log.warn('[TrinityMemoryService] Platform event bus not available yet, will retry on next import');
  }
}

connectTrinityMemoryToEventBus();
