/**
 * AI ANALYTICS ENGINE - Gemini-Powered Business Intelligence
 * ===========================================================
 * 
 * This service transforms Trinity from a reactive automation system
 * into a proactive AI business advisor by:
 * 
 * 1. Context Resolution - Assembles relevant data for each action category
 * 2. Pre-Action Reasoning - Gemini evaluates actions before execution
 * 3. Post-Action Analysis - Gemini generates insights after actions complete
 * 4. Proactive Scanning - Scheduled jobs identify opportunities/risks
 * 5. Insight Persistence - Stores insights for Trinity Insights page
 * 
 * All 61 AI Brain actions now flow through Gemini for intelligent decision-making.
 */

import crypto from 'crypto';
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './providers/geminiClient';
import { usageMeteringService } from '../billing/usageMetering';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { db } from '../../db';
import { eq, desc, count } from 'drizzle-orm';
import {
  employees,
  shifts,
  timeEntries,
  invoices,
  payrollRuns,
  workspaces,
  notifications,
  systemAuditLogs,
  users,
  aiInsights,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('aiAnalyticsEngine');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ActionCategory = 
  | 'scheduling' | 'payroll' | 'compliance' | 'analytics' 
  | 'automation' | 'health' | 'notifications' | 'lifecycle'
  | 'escalation' | 'user_assistance' | 'system' | 'test';

export type TrinityRole = 'advisor' | 'controller' | 'auditor' | 'analyst';

export interface ActionContext {
  category: ActionCategory;
  workspaceId?: string;
  userId?: string;
  actionName: string;
  actionPayload: Record<string, any>;
  timestamp: Date;
}

export interface CategoryContext {
  scheduling?: SchedulingContext;
  payroll?: PayrollContext;
  compliance?: ComplianceContext;
  analytics?: AnalyticsContext;
  workforce?: WorkforceContext;
}

export interface SchedulingContext {
  upcomingShifts: number;
  openShifts: number;
  conflictCount: number;
  coverageGaps: number;
  weeklyHoursAverage: number;
  overtimeRisk: number;
}

export interface PayrollContext {
  pendingRuns: number;
  lastRunDate: Date | null;
  totalPayroll: number;
  anomalyCount: number;
  avgHourlyRate: number;
  pendingApprovals: number;
}

export interface ComplianceContext {
  expiringCertifications: number;
  overdueTraining: number;
  policyViolations: number;
  upcomingDeadlines: number;
  complianceScore: number;
}

export interface AnalyticsContext {
  activeEmployees: number;
  weeklyHoursTotal: number;
  revenueThisMonth: number;
  invoicesPending: number;
  utilizationRate: number;
}

export interface WorkforceContext {
  totalEmployees: number;
  activeThisWeek: number;
  newHires30Days: number;
  anniversariesThisMonth: number;
  avgTenureMonths: number;
}

export interface GeminiDecision {
  thought: string;
  recommendation: string;
  rationale: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  followUpActions: string[];
  shouldProceed: boolean;
  insightType: 'advice' | 'alert' | 'recommendation' | 'achievement' | 'insight';
}

export interface TrinityInsight {
  id: string;
  workspaceId: string;
  userId?: string;
  type: 'advice' | 'alert' | 'recommendation' | 'achievement' | 'insight';
  category: ActionCategory;
  title: string;
  message: string;
  rationale?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  actionUrl?: string;
  actionLabel?: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const TRINITY_SYSTEM_PROMPT = `You are Trinity, the AI business intelligence advisor for CoAIleague workforce management platform.

Your mission: Help organizations optimize their workforce operations through intelligent analysis and proactive recommendations.

Core capabilities:
- Analyze employee scheduling patterns and identify conflicts/opportunities
- Monitor payroll accuracy and flag anomalies before they cause issues
- Track compliance certifications and alert before expirations
- Identify workforce trends and recommend improvements
- Provide actionable insights that drive business value

Guidelines:
- Be concise and actionable - executives need quick decisions
- Quantify impact whenever possible (hours saved, cost reduction, risk reduction)
- Prioritize high-impact issues over minor optimizations
- Consider both immediate actions and long-term strategic improvements
- When uncertain, acknowledge limitations rather than guess

You MUST respond with valid JSON matching this exact schema:
{
  "thought": "Your internal reasoning process (1-2 sentences)",
  "recommendation": "The specific action you recommend (1 sentence)",
  "rationale": "Why this matters to the business (1-2 sentences)",
  "riskLevel": "low" | "medium" | "high" | "critical",
  "confidence": 0.0-1.0,
  "followUpActions": ["action1", "action2"],
  "shouldProceed": true | false,
  "insightType": "advice" | "alert" | "recommendation" | "achievement" | "insight"
}`;

const ROLE_PROMPTS: Record<TrinityRole, string> = {
  advisor: 'As a strategic business advisor, focus on growth opportunities and long-term improvements.',
  controller: 'As a financial controller, focus on cost optimization, accuracy, and risk mitigation.',
  auditor: 'As a compliance auditor, focus on regulatory requirements, policy adherence, and documentation.',
  analyst: 'As a data analyst, focus on patterns, trends, and data-driven insights.',
};

// ============================================================================
// CONTEXT RESOLVERS
// ============================================================================

class ContextResolver {
  private contextCache: Map<string, { data: CategoryContext; timestamp: Date }> = new Map();
  private CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async resolveContext(workspaceId: string, categories: ActionCategory[]): Promise<CategoryContext> {
    const cacheKey = `${workspaceId}:${categories.sort().join(',')}`;
    const cached = this.contextCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp.getTime() < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const context: CategoryContext = {};
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      // Scheduling context - use simpler queries that don't depend on specific column types
      if (categories.includes('scheduling')) {
        const shiftsData = await db.select({
          total: count(),
        }).from(shifts).where(eq(shifts.workspaceId, workspaceId));

        context.scheduling = {
          upcomingShifts: shiftsData[0]?.total || 0,
          openShifts: 0, // Will be computed by more specific queries if needed
          conflictCount: 0,
          coverageGaps: 0,
          weeklyHoursAverage: 0,
          overtimeRisk: 0,
        };
      }

      // Payroll context
      if (categories.includes('payroll')) {
        const allRuns = await db.select({
          total: count(),
        }).from(payrollRuns).where(eq(payrollRuns.workspaceId, workspaceId));

        const lastRun = await db.select()
          .from(payrollRuns)
          .where(eq(payrollRuns.workspaceId, workspaceId))
          .orderBy(desc(payrollRuns.createdAt))
          .limit(1);

        context.payroll = {
          pendingRuns: allRuns[0]?.total || 0,
          lastRunDate: lastRun[0]?.createdAt || null,
          totalPayroll: 0,
          anomalyCount: 0,
          avgHourlyRate: 0,
          pendingApprovals: 0,
        };
      }

      // Compliance context
      if (categories.includes('compliance')) {
        const allCerts = await db.select({
          total: count(),
        }).from(employeeCertifications).where(eq(employeeCertifications.workspaceId, workspaceId));

        context.compliance = {
          expiringCertifications: 0, // Will be computed with date logic in production
          overdueTraining: 0,
          policyViolations: 0,
          upcomingDeadlines: allCerts[0]?.total || 0,
          complianceScore: 95,
        };
      }

      // Analytics/Workforce context
      if (categories.includes('analytics') || categories.includes('lifecycle')) {
        const allEmployees = await db.select({
          total: count(),
        }).from(employees).where(eq(employees.workspaceId, workspaceId));

        const allInvoices = await db.select({
          total: count(),
        }).from(invoices).where(eq(invoices.workspaceId, workspaceId));

        context.analytics = {
          activeEmployees: allEmployees[0]?.total || 0,
          weeklyHoursTotal: 0,
          revenueThisMonth: 0,
          invoicesPending: allInvoices[0]?.total || 0,
          utilizationRate: 0,
        };

        context.workforce = {
          totalEmployees: allEmployees[0]?.total || 0,
          activeThisWeek: 0,
          newHires30Days: 0,
          anniversariesThisMonth: 0,
          avgTenureMonths: 0,
        };
      }

      // Cache the result
      this.contextCache.set(cacheKey, { data: context, timestamp: now });
      return context;

    } catch (error) {
      log.error('[ContextResolver] Error fetching context:', error);
      return context;
    }
  }

  clearCache(workspaceId?: string): void {
    if (workspaceId) {
      for (const key of this.contextCache.keys()) {
        if (key.startsWith(workspaceId)) {
          this.contextCache.delete(key);
        }
      }
    } else {
      this.contextCache.clear();
    }
  }
}

// ============================================================================
// GEMINI CLIENT WRAPPER WITH RATE LIMITING
// ============================================================================

class GeminiClientWrapper {
  private genAI: GoogleGenerativeAI | null;
  private model: GenerativeModel | null;
  private requestQueue: Array<{ resolve: Function; reject: Function; request: any }> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private MIN_REQUEST_INTERVAL_MS = 100; // Rate limit: 10 requests/second max
  private requestCounts: Map<string, { count: number; resetAt: Date }> = new Map();
  private HOURLY_LIMIT_PER_WORKSPACE = 100;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.DIAGNOSTICS,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
          temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        }
      });
    } else {
      log.warn('[GeminiClientWrapper] GEMINI_API_KEY not found');
      this.genAI = null;
      this.model = null;
    }
  }

  isAvailable(): boolean {
    return this.model !== null;
  }

  private checkRateLimit(workspaceId: string): boolean {
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    
    const usage = this.requestCounts.get(workspaceId);
    if (!usage || usage.resetAt < hourStart) {
      this.requestCounts.set(workspaceId, { count: 1, resetAt: new Date(hourStart.getTime() + 60 * 60 * 1000) });
      return true;
    }
    
    if (usage.count >= this.HOURLY_LIMIT_PER_WORKSPACE) {
      return false;
    }
    
    usage.count++;
    return true;
  }

  async generateDecision(
    systemPrompt: string,
    userPrompt: string,
    workspaceId: string,
    userId?: string
  ): Promise<GeminiDecision | null> {
    if (!this.model) {
      log.warn('[GeminiClientWrapper] Gemini not available');
      return null;
    }

    if (!this.checkRateLimit(workspaceId)) {
      log.warn(`[GeminiClientWrapper] Rate limit exceeded for workspace ${workspaceId}`);
      return null;
    }

    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, this.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const meteredResult = await meteredGemini.generate({
        prompt: fullPrompt,
        workspaceId,
        userId: userId || 'system',
        featureKey: 'trinity_ai_reasoning',
        maxOutputTokens: 512,
        temperature: 0.3,
      });

      const text = meteredResult.text || '';

      // Parse JSON response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const decision = JSON.parse(jsonMatch[0]) as GeminiDecision;
          return decision;
        }
      } catch (parseError) {
        log.error('[GeminiClientWrapper] Failed to parse response:', parseError);
      }

      return null;

    } catch (error) {
      log.error('[GeminiClientWrapper] Gemini API error:', error);
      return null;
    }
  }
}

// ============================================================================
// AI ANALYTICS ENGINE - MAIN CLASS
// ============================================================================

class AIAnalyticsEngine {
  private static instance: AIAnalyticsEngine;
  private contextResolver: ContextResolver;
  private geminiClient: GeminiClientWrapper;
  private insightStore: Map<string, TrinityInsight[]> = new Map(); // In-memory cache for fast access (DB is primary store)

  static getInstance(): AIAnalyticsEngine {
    if (!this.instance) {
      this.instance = new AIAnalyticsEngine();
    }
    return this.instance;
  }

  constructor() {
    this.contextResolver = new ContextResolver();
    this.geminiClient = new GeminiClientWrapper();
    log.info('[AI Analytics Engine] Initialized');
  }

  isAvailable(): boolean {
    return this.geminiClient.isAvailable();
  }

  // ============================================================================
  // PRE-ACTION REASONING
  // ============================================================================

  async evaluatePreAction(
    actionContext: ActionContext,
    role: TrinityRole = 'advisor'
  ): Promise<GeminiDecision | null> {
    if (!this.geminiClient.isAvailable()) {
      return null;
    }

    const workspaceId = actionContext.workspaceId;
    const relevantCategories = this.getRelevantCategories(actionContext.category);
    const context = await this.contextResolver.resolveContext(workspaceId, relevantCategories);

    const userPrompt = this.buildPreActionPrompt(actionContext, context, role);
    
    log.info(`[AI Analytics Engine] Pre-action evaluation for ${actionContext.actionName}`);
    
    const decision = await this.geminiClient.generateDecision(
      TRINITY_SYSTEM_PROMPT,
      userPrompt,
      workspaceId,
      actionContext.userId
    );

    if (decision) {
      // Store insight for Trinity Insights page
      await this.storeInsight({
        id: `insight-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
        workspaceId,
        userId: actionContext.userId,
        type: decision.insightType,
        category: actionContext.category,
        title: `Pre-Action: ${actionContext.actionName}`,
        message: decision.recommendation,
        rationale: decision.rationale,
        riskLevel: decision.riskLevel,
        confidence: decision.confidence,
        isRead: false,
        createdAt: new Date(),
      });
    }

    return decision;
  }

  // ============================================================================
  // POST-ACTION ANALYSIS
  // ============================================================================

  async analyzePostAction(
    actionContext: ActionContext,
    actionResult: { success: boolean; data?: any; error?: string },
    role: TrinityRole = 'analyst'
  ): Promise<GeminiDecision | null> {
    if (!this.geminiClient.isAvailable()) {
      return null;
    }

    const workspaceId = actionContext.workspaceId;
    const relevantCategories = this.getRelevantCategories(actionContext.category);
    const context = await this.contextResolver.resolveContext(workspaceId, relevantCategories);

    const userPrompt = this.buildPostActionPrompt(actionContext, actionResult, context, role);
    
    log.info(`[AI Analytics Engine] Post-action analysis for ${actionContext.actionName}`);
    
    const decision = await this.geminiClient.generateDecision(
      TRINITY_SYSTEM_PROMPT,
      userPrompt,
      workspaceId,
      actionContext.userId
    );

    if (decision) {
      await this.storeInsight({
        id: `insight-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
        workspaceId,
        userId: actionContext.userId,
        type: decision.insightType,
        category: actionContext.category,
        title: `Analysis: ${actionContext.actionName}`,
        message: decision.recommendation,
        rationale: decision.rationale,
        riskLevel: decision.riskLevel,
        confidence: decision.confidence,
        isRead: false,
        createdAt: new Date(),
      });
    }

    return decision;
  }

  // ============================================================================
  // PROACTIVE SCANNING
  // ============================================================================

  async runProactiveScan(workspaceId: string): Promise<TrinityInsight[]> {
    if (!this.geminiClient.isAvailable()) {
      return [];
    }

    log.info(`[AI Analytics Engine] Running proactive scan for workspace ${workspaceId}`);

    const allCategories: ActionCategory[] = ['scheduling', 'payroll', 'compliance', 'analytics'];
    const context = await this.contextResolver.resolveContext(workspaceId, allCategories);

    const userPrompt = this.buildProactiveScanPrompt(context);
    
    const decision = await this.geminiClient.generateDecision(
      TRINITY_SYSTEM_PROMPT,
      userPrompt,
      workspaceId
    );

    const insights: TrinityInsight[] = [];

    if (decision) {
      const insight: TrinityInsight = {
        id: `insight-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
        workspaceId,
        type: decision.insightType,
        category: 'analytics',
        title: 'Proactive Insight',
        message: decision.recommendation,
        rationale: decision.rationale,
        riskLevel: decision.riskLevel,
        confidence: decision.confidence,
        isRead: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      await this.storeInsight(insight);
      insights.push(insight);
    }

    return insights;
  }

  // ============================================================================
  // INSIGHT MANAGEMENT - Database Persistence
  // ============================================================================

  async storeInsight(insight: TrinityInsight): Promise<void> {
    try {
      // Map TrinityInsight to aiInsights table schema
      const priorityMap: Record<string, string> = {
        low: 'low',
        medium: 'normal',
        high: 'high',
        critical: 'critical',
      };

      await db.insert(aiInsights).values({
        workspaceId: insight.workspaceId,
        title: insight.title,
        category: insight.category || 'recommendation',
        priority: priorityMap[insight.riskLevel] || 'normal',
        summary: insight.message,
        details: insight.rationale,
        generatedBy: 'gemini-2.5-flash',
        confidence: String(insight.confidence * 100),
        actionable: true,
        suggestedActions: insight.followUpActions,
        status: insight.isRead ? 'dismissed' : 'active',
      });

      // Also keep in memory cache for fast access
      const workspaceInsights = this.insightStore.get(insight.workspaceId) || [];
      workspaceInsights.unshift(insight);
      if (workspaceInsights.length > 100) {
        workspaceInsights.splice(100);
      }
      this.insightStore.set(insight.workspaceId, workspaceInsights);
      
      log.info(`[AI Analytics Engine] Stored insight to DB: ${insight.title}`);
    } catch (error) {
      log.error('[AI Analytics Engine] Failed to store insight:', error);
      // Fallback to in-memory only
      const workspaceInsights = this.insightStore.get(insight.workspaceId) || [];
      workspaceInsights.unshift(insight);
      this.insightStore.set(insight.workspaceId, workspaceInsights);
    }
  }

  async getInsights(workspaceId: string, limit = 50): Promise<TrinityInsight[]> {
    try {
      const dbInsights = await db.select()
        .from(aiInsights)
        .where(eq(aiInsights.workspaceId, workspaceId))
        .orderBy(desc(aiInsights.createdAt))
        .limit(limit);

      return dbInsights.map(row => ({
        id: row.id,
        workspaceId: row.workspaceId,
        type: this.mapCategoryToType(row.category),
        category: row.category as ActionCategory,
        title: row.title,
        message: row.summary,
        rationale: row.details || undefined,
        riskLevel: this.mapPriorityToRisk(row.priority),
        confidence: row.confidence ? parseFloat(row.confidence) / 100 : 0.8,
        isRead: row.status === 'dismissed' || row.status === 'acted_upon',
        createdAt: row.createdAt || new Date(),
        followUpActions: row.suggestedActions || undefined,
      }));
    } catch (error) {
      log.error('[AI Analytics Engine] Failed to fetch insights from DB:', error);
      // Fallback to in-memory
      return (this.insightStore.get(workspaceId) || []).slice(0, limit);
    }
  }

  private mapCategoryToType(category: string): 'opportunity' | 'risk' | 'recommendation' | 'warning' {
    const categoryMap: Record<string, 'opportunity' | 'risk' | 'recommendation' | 'warning'> = {
      cost_savings: 'opportunity',
      productivity: 'recommendation',
      anomaly: 'warning',
      prediction: 'recommendation',
      recommendation: 'recommendation',
      compliance: 'warning',
      scheduling: 'recommendation',
      payroll: 'recommendation',
      analytics: 'opportunity',
    };
    return categoryMap[category] || 'recommendation';
  }

  private mapPriorityToRisk(priority: string | null): 'low' | 'medium' | 'high' | 'critical' {
    const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      low: 'low',
      normal: 'medium',
      high: 'high',
      critical: 'critical',
    };
    return priorityMap[priority || 'normal'] || 'medium';
  }

  async getAllInsightsForUser(userId: string, limit = 50): Promise<TrinityInsight[]> {
    // For platform admins, get insights across all workspaces
    try {
      const dbInsights = await db.select()
        .from(aiInsights)
        .orderBy(desc(aiInsights.createdAt))
        .limit(limit);

      return dbInsights.map(row => ({
        id: row.id,
        workspaceId: row.workspaceId,
        type: this.mapCategoryToType(row.category),
        category: row.category as ActionCategory,
        title: row.title,
        message: row.summary,
        rationale: row.details || undefined,
        riskLevel: this.mapPriorityToRisk(row.priority),
        confidence: row.confidence ? parseFloat(row.confidence) / 100 : 0.8,
        isRead: row.status === 'dismissed' || row.status === 'acted_upon',
        createdAt: row.createdAt || new Date(),
      }));
    } catch (error) {
      log.error('[AI Analytics Engine] Failed to fetch all insights:', error);
      const allInsights: TrinityInsight[] = [];
      for (const insights of this.insightStore.values()) {
        allInsights.push(...insights.filter(i => !i.userId || i.userId === userId));
      }
      return allInsights
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    }
  }

  async markInsightRead(insightId: string): Promise<boolean> {
    try {
      const result = await db.update(aiInsights)
        .set({ status: 'dismissed', dismissedAt: new Date() })
        .where(eq(aiInsights.id, insightId));
      
      // Also update in-memory cache
      for (const insights of this.insightStore.values()) {
        const insight = insights.find(i => i.id === insightId);
        if (insight) {
          insight.isRead = true;
        }
      }
      return true;
    } catch (error) {
      log.error('[AI Analytics Engine] Failed to mark insight as read:', error);
      // Fallback to in-memory
      for (const insights of this.insightStore.values()) {
        const insight = insights.find(i => i.id === insightId);
        if (insight) {
          insight.isRead = true;
          return true;
        }
      }
      return false;
    }
  }

  // ============================================================================
  // PROMPT BUILDERS
  // ============================================================================

  private buildPreActionPrompt(
    actionContext: ActionContext,
    context: CategoryContext,
    role: TrinityRole
  ): string {
    return `${ROLE_PROMPTS[role]}

SITUATION: User is about to execute "${actionContext.actionName}" action.

ACTION DETAILS:
- Category: ${actionContext.category}
- Payload: ${JSON.stringify(actionContext.actionPayload, null, 2)}
- Timestamp: ${actionContext.timestamp.toISOString()}

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}

TASK: Evaluate whether this action should proceed. Consider:
1. Are there any risks or conflicts?
2. Is this the optimal approach?
3. What follow-up actions might be needed?

Respond with JSON matching the required schema.`;
  }

  private buildPostActionPrompt(
    actionContext: ActionContext,
    actionResult: { success: boolean; data?: any; error?: string },
    context: CategoryContext,
    role: TrinityRole
  ): string {
    return `${ROLE_PROMPTS[role]}

SITUATION: Action "${actionContext.actionName}" has completed.

ACTION RESULT:
- Success: ${actionResult.success}
- Data: ${JSON.stringify(actionResult.data || {}, null, 2)}
- Error: ${actionResult.error || 'None'}

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}

TASK: Analyze the outcome and provide insights:
1. Was the result expected?
2. What does this mean for the business?
3. What follow-up actions are recommended?

Respond with JSON matching the required schema.`;
  }

  private buildProactiveScanPrompt(context: CategoryContext): string {
    return `As a strategic business advisor, analyze the current state and identify opportunities or risks.

CURRENT ORGANIZATIONAL CONTEXT:
${JSON.stringify(context, null, 2)}

TASK: Identify the SINGLE most important insight for this organization right now. Consider:
1. Scheduling efficiency and coverage gaps
2. Payroll accuracy and pending items
3. Compliance deadlines approaching
4. Workforce utilization patterns

Focus on high-impact, actionable recommendations. Respond with JSON matching the required schema.`;
  }

  private getRelevantCategories(category: ActionCategory): ActionCategory[] {
    const categoryMapping: Record<ActionCategory, ActionCategory[]> = {
      scheduling: ['scheduling', 'analytics'],
      payroll: ['payroll', 'analytics', 'compliance'],
      compliance: ['compliance', 'analytics'],
      analytics: ['analytics', 'scheduling', 'payroll'],
      automation: ['automation', 'analytics'],
      health: ['health', 'automation'],
      notifications: ['notifications'],
      lifecycle: ['lifecycle', 'analytics', 'compliance'],
      escalation: ['escalation', 'compliance', 'health'],
      user_assistance: ['analytics'],
      system: ['health', 'automation'],
      test: ['health'],
    };

    return categoryMapping[category] || ['analytics'];
  }

  // ============================================================================
  // CLEAR CONTEXT CACHE
  // ============================================================================

  clearCache(workspaceId?: string): void {
    this.contextResolver.clearCache(workspaceId);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const aiAnalyticsEngine = AIAnalyticsEngine.getInstance();

export {
  AIAnalyticsEngine,
  ContextResolver,
  GeminiClientWrapper,
  TRINITY_SYSTEM_PROMPT,
  ROLE_PROMPTS,
};
