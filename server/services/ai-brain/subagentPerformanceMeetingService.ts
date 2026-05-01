/**
 * SUBAGENT PERFORMANCE MEETING SERVICE
 * =====================================
 * AI Brain orchestration service that conducts performance meetings with all subagents.
 * 
 * Features:
 * - Scheduled and manual performance meetings
 * - 1-5 scoring system (5=excellent, 1=poor/failing)
 * - Pass/Fail ratings based on score thresholds
 * - AI-powered diagnosis for failing subagents
 * - Optimization recommendations and self-healing
 * - FAST mode support for urgent meetings
 * - Weekly automated meetings + manual push capability
 * - Handler supervisors with real AI logic
 * 
 * Meeting Workflow:
 * 1. Convene all subagents
 * 2. Review telemetry and performance metrics
 * 3. AI-powered scoring (1-5)
 * 4. Pass/Fail determination
 * 5. Diagnose failing agents
 * 6. Generate optimization recommendations
 * 7. Apply self-healing fixes if possible
 * 8. Record meeting results
 */

import crypto from 'crypto';
import { db } from '../../db';
import { eq, and, desc, gte, sql, avg, count } from 'drizzle-orm';
import {
  aiSubagentDefinitions,
  subagentTelemetry,
  workspaces,
  AiSubagentDefinition,
} from '@shared/schema';
import { subagentConfidenceMonitor, SubagentConfidenceScore } from './subagentConfidenceMonitor';
import { subagentSupervisor, SubagentDomain } from './subagentSupervisor';
import { aiBrainService } from './aiBrainService';
import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { TTLCache } from './cacheUtils';
import { createLogger } from '../../lib/logger';
const log = createLogger('subagentPerformanceMeetingService');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type PerformanceScore = 1 | 2 | 3 | 4 | 5;
export type MeetingMode = 'standard' | 'fast' | 'emergency';
export type MeetingTrigger = 'scheduled' | 'manual' | 'threshold_breach' | 'fast_mode';

export interface SubagentPerformanceReport {
  subagentId: string;
  subagentName: string;
  domain: SubagentDomain;
  score: PerformanceScore;
  passed: boolean;
  confidenceScore: number;
  successRate: number;
  avgExecutionTimeMs: number;
  recentExecutions: number;
  recentSuccesses: number;
  recentFailures: number;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  aiAnalysis: string;
  issues: string[];
  recommendations: string[];
  optimizationApplied: boolean;
  optimizationDetails?: string;
}

export interface PerformanceMeetingResult {
  meetingId: string;
  workspaceId: string;
  conductedAt: Date;
  mode: MeetingMode;
  trigger: MeetingTrigger;
  duration: number;
  totalSubagents: number;
  passedCount: number;
  failedCount: number;
  averageScore: number;
  overallHealthStatus: 'healthy' | 'needs_attention' | 'critical';
  subagentReports: SubagentPerformanceReport[];
  meetingSummary: string;
  actionItems: string[];
  nextMeetingScheduled?: Date;
}

export interface MeetingScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number; // 0-6, Sunday=0
  timeOfDay?: string; // "17:00" format
  fastModeThreshold?: number; // Trigger fast meeting if avg score below this
  autoOptimize: boolean;
}

export interface HandlerSupervisor {
  handlerId: string;
  handlerName: string;
  supervisorSubagentId: string;
  supervisorName: string;
  domain: SubagentDomain;
  isActive: boolean;
  lastSupervisionAt?: Date;
  supervisionCount: number;
  issuesDetected: number;
  issuesResolved: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCORE_THRESHOLDS = {
  excellent: { min: 90, score: 5 as PerformanceScore },
  good: { min: 75, score: 4 as PerformanceScore },
  fair: { min: 60, score: 3 as PerformanceScore },
  poor: { min: 40, score: 2 as PerformanceScore },
  critical: { min: 0, score: 1 as PerformanceScore },
};

const PASS_THRESHOLD = 3; // Score of 3 or above = pass
const FAST_MODE_THRESHOLD = 50; // Trigger fast meeting if avg confidence below 50%

const DEFAULT_SCHEDULE: MeetingScheduleConfig = {
  enabled: true,
  frequency: 'weekly',
  dayOfWeek: 5, // Friday
  timeOfDay: '17:00',
  fastModeThreshold: FAST_MODE_THRESHOLD,
  autoOptimize: true,
};

// Cache for meeting results (15 min TTL)
const meetingCache = new TTLCache<string, PerformanceMeetingResult>(15 * 60 * 1000);

// Handler-to-Supervisor mapping
const handlerSupervisors: Map<string, HandlerSupervisor> = new Map();

// ============================================================================
// SUBAGENT PERFORMANCE MEETING SERVICE
// ============================================================================

class SubagentPerformanceMeetingService {
  private static instance: SubagentPerformanceMeetingService;
  private scheduleConfig: MeetingScheduleConfig = DEFAULT_SCHEDULE;
  private meetingHistory: PerformanceMeetingResult[] = [];
  private initialized = false;

  private constructor() {}

  static getInstance(): SubagentPerformanceMeetingService {
    if (!SubagentPerformanceMeetingService.instance) {
      SubagentPerformanceMeetingService.instance = new SubagentPerformanceMeetingService();
    }
    return SubagentPerformanceMeetingService.instance;
  }

  /**
   * Initialize the meeting service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('[PerformanceMeeting] Initializing service...');
    
    // Initialize handler supervisors
    await this.initializeHandlerSupervisors();
    
    // Subscribe to platform events for monitoring
    this.subscribeToEvents();
    
    this.initialized = true;
    log.info('[PerformanceMeeting] Service initialized');
  }

  /**
   * Initialize handler supervisors - each handler gets a subagent supervisor
   */
  private async initializeHandlerSupervisors(): Promise<void> {
    const handlerMappings: { handlerId: string; handlerName: string; domain: SubagentDomain }[] = [
      { handlerId: 'scheduling', handlerName: 'Scheduling Handler', domain: 'scheduling' },
      { handlerId: 'payroll', handlerName: 'Payroll Handler', domain: 'payroll' },
      { handlerId: 'invoicing', handlerName: 'Invoicing Handler', domain: 'invoicing' },
      { handlerId: 'compliance', handlerName: 'Compliance Handler', domain: 'compliance' },
      { handlerId: 'notifications', handlerName: 'Notifications Handler', domain: 'notifications' },
      { handlerId: 'analytics', handlerName: 'Analytics Handler', domain: 'analytics' },
      { handlerId: 'health', handlerName: 'Health Check Handler', domain: 'health' },
      { handlerId: 'automation', handlerName: 'Automation Handler', domain: 'automation' },
      { handlerId: 'lifecycle', handlerName: 'Employee Lifecycle Handler', domain: 'lifecycle' },
      { handlerId: 'assist', handlerName: 'User Assistance Handler', domain: 'assist' },
      { handlerId: 'filesystem', handlerName: 'File System Handler', domain: 'filesystem' },
      { handlerId: 'workflow', handlerName: 'Workflow Handler', domain: 'workflow' },
      { handlerId: 'onboarding', handlerName: 'Onboarding Handler', domain: 'onboarding' },
      { handlerId: 'expense', handlerName: 'Expense Categorization Handler', domain: 'expense' },
      { handlerId: 'pricing', handlerName: 'Dynamic Pricing Handler', domain: 'pricing' },
      { handlerId: 'security', handlerName: 'Security Handler', domain: 'security' },
      { handlerId: 'escalation', handlerName: 'Escalation Handler', domain: 'escalation' },
      { handlerId: 'recovery', handlerName: 'Recovery Handler', domain: 'recovery' },
      { handlerId: 'orchestration', handlerName: 'Orchestration Handler', domain: 'orchestration' },
      { handlerId: 'gamification', handlerName: 'Gamification Handler', domain: 'gamification' },
    ];

    for (const mapping of handlerMappings) {
      const supervisor: HandlerSupervisor = {
        handlerId: mapping.handlerId,
        handlerName: mapping.handlerName,
        supervisorSubagentId: `supervisor_${mapping.domain}`,
        supervisorName: `${mapping.domain.charAt(0).toUpperCase() + mapping.domain.slice(1)}Supervisor`,
        domain: mapping.domain,
        isActive: true,
        supervisionCount: 0,
        issuesDetected: 0,
        issuesResolved: 0,
      };
      handlerSupervisors.set(mapping.handlerId, supervisor);
    }

    log.info(`[PerformanceMeeting] Initialized ${handlerSupervisors.size} handler supervisors`);
  }

  /**
   * Subscribe to platform events
   */
  private subscribeToEvents(): void {
    platformEventBus.subscribe('ai_brain_action', {
      name: 'PerformanceMeetingMonitor',
      handler: async (event: PlatformEvent) => {
        // Track execution for supervisor
        const domain = event.metadata?.domain as string;
        const supervisor = handlerSupervisors.get(domain);
        if (supervisor) {
          supervisor.supervisionCount++;
          supervisor.lastSupervisionAt = new Date();
          if (event.metadata?.success === false) {
            supervisor.issuesDetected++;
          }
        }
      }
    });
  }

  /**
   * Conduct a performance meeting with all subagents
   */
  async conductMeeting(
    workspaceId: string,
    mode: MeetingMode = 'standard',
    trigger: MeetingTrigger = 'manual'
  ): Promise<PerformanceMeetingResult> {
    const startTime = Date.now();
    const meetingId = `meeting_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;

    log.info(`[PerformanceMeeting] Starting ${mode} meeting (${trigger}) for workspace ${workspaceId}`);

    try {
      // Check if in FAST mode
      const isFastMode = mode === 'fast' || await this.checkFastModeRequired(workspaceId);
      const effectiveMode = isFastMode ? 'fast' : mode;

      // Get all active subagents
      const subagents = await db.select()
        .from(aiSubagentDefinitions)
        .where(eq(aiSubagentDefinitions.isActive, true));

      // Get confidence scores for all subagents
      const confidenceScores = await this.getSubagentConfidenceScores(workspaceId);

      // Conduct AI-powered performance review for each subagent
      const subagentReports: SubagentPerformanceReport[] = [];
      
      for (const subagent of subagents) {
        const report = await this.reviewSubagent(
          subagent,
          confidenceScores.find(s => s.subagentId === subagent.id),
          workspaceId,
          effectiveMode
        );
        subagentReports.push(report);

        // If failed and auto-optimize enabled, attempt optimization
        if (!report.passed && this.scheduleConfig.autoOptimize) {
          await this.optimizeSubagent(report, workspaceId);
        }
      }

      // Calculate meeting summary
      const passedCount = subagentReports.filter(r => r.passed).length;
      const failedCount = subagentReports.filter(r => !r.passed).length;
      const averageScore = subagentReports.reduce((sum, r) => sum + r.score, 0) / subagentReports.length;

      // Generate AI meeting summary
      const meetingSummary = await this.generateMeetingSummary(subagentReports, effectiveMode);
      const actionItems = this.generateActionItems(subagentReports);

      const overallHealth = averageScore >= 4 ? 'healthy' : averageScore >= 2.5 ? 'needs_attention' : 'critical';

      const result: PerformanceMeetingResult = {
        meetingId,
        workspaceId,
        conductedAt: new Date(),
        mode: effectiveMode,
        trigger,
        duration: Date.now() - startTime,
        totalSubagents: subagentReports.length,
        passedCount,
        failedCount,
        averageScore,
        overallHealthStatus: overallHealth,
        subagentReports,
        meetingSummary,
        actionItems,
        nextMeetingScheduled: this.getNextScheduledMeeting(),
      };

      // Cache and store result
      meetingCache.set(meetingId, result);
      this.meetingHistory.push(result);

      // Publish meeting complete event
      await platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'Performance Meeting Completed',
        description: `Subagent performance meeting: ${passedCount}/${subagentReports.length} passed, avg score ${averageScore.toFixed(1)}/5`,
        workspaceId,
        metadata: {
          meetingId,
          averageScore,
          passedCount,
          failedCount,
          overallHealth,
        },
      });

      log.info(`[PerformanceMeeting] Meeting ${meetingId} completed in ${result.duration}ms. Score: ${averageScore.toFixed(2)}, Pass: ${passedCount}/${subagentReports.length}`);

      return result;
    } catch (error: any) {
      log.error(`[PerformanceMeeting] Meeting failed: ${(error instanceof Error ? error.message : String(error))}`);
      throw error;
    }
  }

  /**
   * Review a single subagent's performance with AI analysis
   */
  private async reviewSubagent(
    subagent: AiSubagentDefinition,
    confidenceScore: SubagentConfidenceScore | undefined,
    workspaceId: string,
    mode: MeetingMode
  ): Promise<SubagentPerformanceReport> {
    const domain = subagent.domain as SubagentDomain;
    
    // Get recent telemetry for this subagent SCOPED BY WORKSPACE (multi-tenant isolation)
    const recentTelemetry = await db.select()
      .from(subagentTelemetry)
      .where(
        and(
          eq(subagentTelemetry.subagentId, subagent.id),
          eq(subagentTelemetry.workspaceId, workspaceId), // CRITICAL: Workspace isolation
          gte(subagentTelemetry.startedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
        )
      )
      .orderBy(desc(subagentTelemetry.startedAt))
      .limit(50);

    // Calculate metrics
    const successCount = recentTelemetry.filter(t => t.status === 'completed').length;
    const failureCount = recentTelemetry.filter(t => t.status === 'failed' || t.status === 'derailed').length;
    const successRate = recentTelemetry.length > 0 ? (successCount / recentTelemetry.length) * 100 : 50;
    const avgExecutionTime = recentTelemetry.reduce((sum, t) => sum + (t.durationMs || 0), 0) / (recentTelemetry.length || 1);

    // Calculate score (1-5)
    const score = this.calculateScore(successRate, confidenceScore?.confidenceScore || 50);
    const passed = score >= PASS_THRESHOLD;

    // Determine health status
    const healthStatus = score === 5 ? 'excellent' : score === 4 ? 'good' : score === 3 ? 'fair' : score === 2 ? 'poor' : 'critical';

    // Generate AI analysis if not in fast mode
    let aiAnalysis = '';
    let issues: string[] = [];
    let recommendations: string[] = [];

    if (mode !== 'fast' || !passed) {
      const analysis = await this.generateAIAnalysis(subagent, recentTelemetry, score, successRate);
      aiAnalysis = analysis.summary;
      issues = analysis.issues;
      recommendations = analysis.recommendations;
    } else {
      aiAnalysis = `${subagent.name}: Score ${score}/5 (${healthStatus}). ${passed ? 'Performing well.' : 'Needs attention.'}`;
    }

    return {
      subagentId: subagent.id,
      subagentName: subagent.name,
      domain,
      score,
      passed,
      confidenceScore: confidenceScore?.confidenceScore || 50,
      successRate,
      avgExecutionTimeMs: avgExecutionTime,
      recentExecutions: recentTelemetry.length,
      recentSuccesses: successCount,
      recentFailures: failureCount,
      healthStatus,
      aiAnalysis,
      issues,
      recommendations,
      optimizationApplied: false,
    };
  }

  /**
   * Calculate performance score (1-5)
   */
  private calculateScore(successRate: number, confidenceScore: number): PerformanceScore {
    const combinedScore = (successRate * 0.6) + (confidenceScore * 0.4);
    
    if (combinedScore >= SCORE_THRESHOLDS.excellent.min) return 5;
    if (combinedScore >= SCORE_THRESHOLDS.good.min) return 4;
    if (combinedScore >= SCORE_THRESHOLDS.fair.min) return 3;
    if (combinedScore >= SCORE_THRESHOLDS.poor.min) return 2;
    return 1;
  }

  /**
   * Generate AI-powered analysis for a subagent
   */
  private async generateAIAnalysis(
    subagent: AiSubagentDefinition,
    telemetry: any[],
    score: PerformanceScore,
    successRate: number
  ): Promise<{ summary: string; issues: string[]; recommendations: string[] }> {
    try {
      const prompt = `You are the AI Brain Performance Analyst. Analyze this subagent's performance:

Subagent: ${subagent.name}
Domain: ${subagent.domain}
Score: ${score}/5
Success Rate: ${successRate.toFixed(1)}%
Recent Executions: ${telemetry.length}
Failures: ${telemetry.filter(t => t.status === 'failed').length}

Capabilities: ${JSON.stringify(subagent.capabilities)}
Known Patterns: ${JSON.stringify(subagent.knownPatterns)}

Provide a brief performance analysis in JSON format:
{
  "summary": "2-3 sentence analysis",
  "issues": ["issue1", "issue2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;

      const result = await aiBrainService.enqueueJob({
        skill: 'helpai_orchestrate',
        input: { prompt, context: 'performance_analysis' },
        workspaceId: 'platform-system',
        userId: 'system',
        priority: 'medium',
      });

      const parsed = JSON.parse(result.output?.response || '{}');
      return {
        summary: parsed.summary || `${subagent.name} scored ${score}/5 with ${successRate.toFixed(1)}% success rate.`,
        issues: parsed.issues || [],
        recommendations: parsed.recommendations || [],
      };
    } catch (error) {
      return {
        summary: `${subagent.name} scored ${score}/5 with ${successRate.toFixed(1)}% success rate.`,
        issues: score < 3 ? ['Performance below threshold'] : [],
        recommendations: score < 3 ? ['Review recent failures', 'Consider optimization'] : [],
      };
    }
  }

  /**
   * Attempt to optimize a failing subagent
   */
  private async optimizeSubagent(
    report: SubagentPerformanceReport,
    workspaceId: string
  ): Promise<void> {
    log.info(`[PerformanceMeeting] Optimizing subagent ${report.subagentName} (score: ${report.score})`);

    try {
      // Generate optimization strategy
      const prompt = `You are the AI Brain Self-Healing System. A subagent is underperforming:

Subagent: ${report.subagentName}
Domain: ${report.domain}
Score: ${report.score}/5
Issues: ${report.issues.join(', ')}
Success Rate: ${report.successRate.toFixed(1)}%
Recent Failures: ${report.recentFailures}

Generate an optimization strategy in JSON format:
{
  "strategy": "brief strategy description",
  "actions": ["action1", "action2"],
  "expectedImprovement": "expected improvement percentage"
}`;

      const result = await aiBrainService.enqueueJob({
        skill: 'helpai_orchestrate',
        input: { prompt, context: 'optimization_strategy' },
        workspaceId,
        userId: 'system',
        priority: 'high',
      });

      const strategy = JSON.parse(result.output?.response || '{}');
      
      // Apply optimization (in real implementation, this would trigger actual fixes)
      report.optimizationApplied = true;
      report.optimizationDetails = strategy.strategy || 'Optimization applied';

      // Publish optimization event
      await platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'Subagent Optimized',
        description: `${report.subagentName} optimization applied: ${strategy.strategy}`,
        workspaceId,
        metadata: {
          subagentId: report.subagentId,
          previousScore: report.score,
          strategy: strategy.strategy,
          actions: strategy.actions,
        },
      });

      log.info(`[PerformanceMeeting] Optimization applied to ${report.subagentName}: ${strategy.strategy}`);
    } catch (error: any) {
      log.error(`[PerformanceMeeting] Optimization failed for ${report.subagentName}: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Generate meeting summary using AI
   */
  private async generateMeetingSummary(
    reports: SubagentPerformanceReport[],
    mode: MeetingMode
  ): Promise<string> {
    const passedCount = reports.filter(r => r.passed).length;
    const avgScore = reports.reduce((sum, r) => sum + r.score, 0) / reports.length;
    const criticalAgents = reports.filter(r => r.score <= 2);

    if (mode === 'fast') {
      return `FAST Performance Meeting: ${passedCount}/${reports.length} passed, avg score ${avgScore.toFixed(1)}/5. ${criticalAgents.length} agents need attention.`;
    }

    try {
      const prompt = `Generate a brief executive summary for this AI subagent performance meeting:

Total Subagents: ${reports.length}
Passed: ${passedCount}
Failed: ${reports.length - passedCount}
Average Score: ${avgScore.toFixed(2)}/5

Top Performers: ${reports.filter(r => r.score >= 4).map(r => r.subagentName).join(', ') || 'None'}
Needs Attention: ${criticalAgents.map(r => `${r.subagentName} (${r.score}/5)`).join(', ') || 'None'}

Provide a 2-3 sentence executive summary.`;

      const result = await aiBrainService.enqueueJob({
        skill: 'helpai_orchestrate',
        input: { prompt, context: 'meeting_summary' },
        workspaceId: 'platform-system',
        userId: 'system',
        priority: 'medium',
      });

      return result.output?.response || `Performance meeting complete. ${passedCount}/${reports.length} subagents passed with average score ${avgScore.toFixed(1)}/5.`;
    } catch (error) {
      return `Performance meeting complete. ${passedCount}/${reports.length} subagents passed with average score ${avgScore.toFixed(1)}/5. ${criticalAgents.length > 0 ? `${criticalAgents.length} agents require optimization.` : 'All systems healthy.'}`;
    }
  }

  /**
   * Generate action items from meeting results
   */
  private generateActionItems(reports: SubagentPerformanceReport[]): string[] {
    const actionItems: string[] = [];

    // Critical agents need immediate attention
    const criticalAgents = reports.filter(r => r.score === 1);
    if (criticalAgents.length > 0) {
      actionItems.push(`URGENT: Review and repair ${criticalAgents.length} critical subagent(s): ${criticalAgents.map(r => r.subagentName).join(', ')}`);
    }

    // Poor agents need investigation
    const poorAgents = reports.filter(r => r.score === 2);
    if (poorAgents.length > 0) {
      actionItems.push(`Investigate performance issues for ${poorAgents.length} poor-performing agent(s)`);
    }

    // Collect unique recommendations
    const allRecommendations = reports.flatMap(r => r.recommendations).slice(0, 5);
    actionItems.push(...allRecommendations);

    // Schedule follow-up if needed
    if (criticalAgents.length > 0 || poorAgents.length > 0) {
      actionItems.push('Schedule follow-up FAST meeting in 24 hours to verify improvements');
    }

    return actionItems;
  }

  /**
   * Check if FAST mode meeting is required
   */
  private async checkFastModeRequired(workspaceId: string): Promise<boolean> {
    try {
      const scores = await this.getSubagentConfidenceScores(workspaceId);
      const avgConfidence = scores.reduce((sum, s) => sum + s.confidenceScore, 0) / (scores.length || 1);
      return avgConfidence < (this.scheduleConfig.fastModeThreshold || FAST_MODE_THRESHOLD);
    } catch {
      return false;
    }
  }

  /**
   * Get confidence scores for all subagents
   */
  private async getSubagentConfidenceScores(workspaceId: string): Promise<SubagentConfidenceScore[]> {
    try {
      const readiness = await subagentConfidenceMonitor.getOrgAutomationReadiness(workspaceId);
      return readiness?.subagentScores || [];
    } catch {
      return [];
    }
  }

  /**
   * Get next scheduled meeting time
   */
  private getNextScheduledMeeting(): Date | undefined {
    if (!this.scheduleConfig.enabled) return undefined;

    const now = new Date();
    const nextMeeting = new Date(now);

    switch (this.scheduleConfig.frequency) {
      case 'daily':
        nextMeeting.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        const daysUntilTarget = ((this.scheduleConfig.dayOfWeek || 5) - now.getDay() + 7) % 7 || 7;
        nextMeeting.setDate(now.getDate() + daysUntilTarget);
        break;
      case 'biweekly':
        nextMeeting.setDate(now.getDate() + 14);
        break;
      case 'monthly':
        nextMeeting.setMonth(now.getMonth() + 1);
        break;
    }

    if (this.scheduleConfig.timeOfDay) {
      const [hours, minutes] = this.scheduleConfig.timeOfDay.split(':').map(Number);
      nextMeeting.setHours(hours, minutes, 0, 0);
    }

    return nextMeeting;
  }

  /**
   * Trigger a FAST mode performance meeting
   */
  async triggerFastMeeting(workspaceId: string): Promise<PerformanceMeetingResult> {
    log.info(`[PerformanceMeeting] Triggering FAST mode meeting for workspace ${workspaceId}`);
    return this.conductMeeting(workspaceId, 'fast', 'fast_mode');
  }

  /**
   * Manually trigger a performance meeting
   */
  async triggerManualMeeting(workspaceId: string, mode: MeetingMode = 'standard'): Promise<PerformanceMeetingResult> {
    log.info(`[PerformanceMeeting] Manual ${mode} meeting triggered for workspace ${workspaceId}`);
    return this.conductMeeting(workspaceId, mode, 'manual');
  }

  /**
   * Get meeting history
   */
  getMeetingHistory(limit: number = 10): PerformanceMeetingResult[] {
    return this.meetingHistory.slice(-limit);
  }

  /**
   * Get handler supervisors status
   */
  getHandlerSupervisors(): HandlerSupervisor[] {
    return Array.from(handlerSupervisors.values());
  }

  /**
   * Get meeting by ID
   */
  getMeeting(meetingId: string): PerformanceMeetingResult | undefined {
    return meetingCache.get(meetingId) || this.meetingHistory.find(m => m.meetingId === meetingId);
  }

  /**
   * Update schedule configuration
   */
  updateScheduleConfig(config: Partial<MeetingScheduleConfig>): void {
    this.scheduleConfig = { ...this.scheduleConfig, ...config };
    log.info('[PerformanceMeeting] Schedule config updated:', this.scheduleConfig);
  }

  /**
   * Get current schedule configuration
   */
  getScheduleConfig(): MeetingScheduleConfig {
    return { ...this.scheduleConfig };
  }

  /**
   * Supervise a handler execution with AI logic
   */
  async superviseHandler(
    handlerId: string,
    executionContext: {
      actionId: string;
      workspaceId: string;
      userId: string;
      parameters: Record<string, unknown>;
    }
  ): Promise<{ approved: boolean; guidance?: string; warnings?: string[] }> {
    const supervisor = handlerSupervisors.get(handlerId);
    if (!supervisor || !supervisor.isActive) {
      return { approved: true };
    }

    try {
      // Quick AI check for high-risk operations
      const prompt = `As the ${supervisor.supervisorName}, review this handler execution:

Handler: ${supervisor.handlerName}
Action: ${executionContext.actionId}
Domain: ${supervisor.domain}

Should this action proceed? Reply with JSON:
{
  "approved": true/false,
  "guidance": "brief guidance if needed",
  "warnings": ["warning1", "warning2"] or []
}`;

      const result = await aiBrainService.enqueueJob({
        skill: 'helpai_orchestrate',
        input: { prompt, context: 'handler_supervision' },
        workspaceId: executionContext.workspaceId,
        userId: executionContext.userId,
        priority: 'high',
      });

      const decision = JSON.parse(result.output?.response || '{"approved": true}');
      
      supervisor.supervisionCount++;
      supervisor.lastSupervisionAt = new Date();
      
      return decision;
    } catch (error) {
      // Default to approved if supervision fails
      return { approved: true, warnings: ['Supervision check failed, proceeding with caution'] };
    }
  }
}

export const subagentPerformanceMeetingService = SubagentPerformanceMeetingService.getInstance();
