/**
 * TRINITY SELF-ASSESSMENT SERVICE
 * ================================
 * Allows Trinity to analyze her own capabilities, gaps, and readiness
 * to "run the show" autonomously.
 * 
 * Provides:
 * - Capability inventory across all subagents
 * - Gap analysis comparing to ideal agent architecture
 * - Confidence assessment for autonomous operation
 * - Recommendations for closing gaps
 */

import crypto from 'crypto';
import { db } from '../../db';
import { eq, and, desc, count, sql, gte } from 'drizzle-orm';
import {
  aiSubagentDefinitions,
  subagentTelemetry,
  automationActionLedger,
} from '@shared/schema';
import { subagentSupervisor, type SubagentDomain } from './subagentSupervisor';
import { toolCapabilityRegistry } from './toolCapabilityRegistry';
import { geminiClient } from './providers/geminiClient';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinitySelfAssessment');

// ============================================================================
// TYPES
// ============================================================================

export interface CapabilityAssessment {
  domain: SubagentDomain;
  subagentName: string;
  capabilities: string[];
  limitations: string[];
  maturityLevel: 'nascent' | 'developing' | 'mature' | 'advanced';
  confidenceScore: number;
  lastUsed?: Date;
  successRate: number;
}

export interface GapAnalysis {
  category: 'orchestration' | 'execution' | 'validation' | 'learning' | 'safety';
  gapName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impactOnAutonomy: string;
  recommendedFix: string;
  estimatedEffort: 'small' | 'medium' | 'large' | 'epic';
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface SelfAssessmentResult {
  assessmentId: string;
  timestamp: Date;
  
  // Overall readiness
  overallReadiness: number; // 0-100
  canRunTheShow: boolean;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
  
  // Capabilities
  capabilities: CapabilityAssessment[];
  totalCapabilities: number;
  matureCapabilities: number;
  
  // Gaps
  gaps: GapAnalysis[];
  criticalGaps: number;
  
  // Comparison to ideal
  comparisonToReplitAgent: {
    parity: number; // 0-100
    advantages: string[];
    disadvantages: string[];
  };
  
  // Trinity's own assessment narrative
  trinityNarrative: string;
  
  // Recommendations
  prioritizedActions: Array<{
    priority: number;
    action: string;
    expectedImpact: string;
  }>;
}

// ============================================================================
// KNOWN GAPS (Architecture-based analysis)
// ============================================================================

// KNOWN_GAPS - Updated March 30, 2026
// Phase 1 (CRITICAL) - RESOLVED
// Phase 2 (HIGH) - RESOLVED
// Phase 3 (MEDIUM) - RESOLVED
// Phase 4 (LOW) - SERVICE CONNECTIVITY - RESOLVED (all 15 services wired to platformEventBus)
const KNOWN_GAPS: GapAnalysis[] = [
  // ============================================================================
  // PHASE 1 - CRITICAL GAPS (RESOLVED)
  // ============================================================================
  // Gap: Unified Task Schema - RESOLVED via shared/trinityTaskSchema.ts
  // Gap: State Machine Governance - RESOLVED via server/services/ai-brain/taskStateMachine.ts
  // Gap: RBAC During Tool Calls - RESOLVED via server/services/ai-brain/secureToolExecutor.ts

  // ============================================================================
  // PHASE 2 - HIGH GAPS (RESOLVED)
  // ============================================================================
  // Gap: Deterministic Tool Selection - RESOLVED via toolCapabilityRegistry.ts
  //      Added: selectHealthyTool(), findHealthyAlternative(), performHealthCheck(),
  //             performAllHealthChecks(), resetToolHealth(), getAvailableTools()
  // Gap: Execution Sandboxing - RESOLVED via secureToolExecutor.ts
  //      Added: executeDryRunWithDiff() with DryRunPreview including risk analysis,
  //             estimated changes, side effects, rollback capability, and confidence score

  // ============================================================================
  // PHASE 3 - MEDIUM GAPS (RESOLVED)
  // ============================================================================
  // Gap: Audit-Grade Replay - RESOLVED via trinityExecutionFabric.ts
  //      Added: ExecutionRecording interface with full context snapshots
  //      Added: recordExecution(), replayExecution() with dry-run and parameter modifications
  //      Added: Timeline recording during step execution
  //      Added: getRecording(), getRecentRecordings(), exportRecording(), importRecording()
  // Gap: Tight Reflection Loops - RESOLVED via selfReflectionEngine.ts
  //      Added: ReflectionFeedbackLoop class with automated feedback processing
  //      Added: processFeedback() for automatic feedback after execution
  //      Added: calibrateConfidence() for historical outcome-based calibration
  //      Added: generateRecommendations() for failure pattern analysis
  //      Integrated with trinityMemoryService for long-term learning
  // Gap: Lifecycle Hooks Integration - RESOLVED via unifiedLifecycleManager.ts
  //      Added: Lifecycle hook registration with priority-based invocation
  //      Added: Session management with memory context save/restore
  //      Added: onTaskStart, onTaskComplete, onTaskFail, onEscalation hooks
  //      Added: Platform event bus integration for unified event emission
  //      Added: Memory snapshots and checkpoints across session boundaries

  // ============================================================================
  // PHASE 4 - LOW GAPS (SERVICE CONNECTIVITY)
  // ============================================================================
  // ALL 15 services now connected to platformEventBus — RESOLVED March 30, 2026

  {
    category: 'orchestration',
    gapName: 'Payroll Automation Disconnected',
    severity: 'low',
    description: 'payrollAutomation.ts has no AI Brain integration - payroll runs occur without Trinity awareness',
    impactOnAutonomy: 'Cannot proactively identify payroll issues or optimize payment timing',
    recommendedFix: 'Add platformEventBus events for payroll runs and connect to Trinity for intelligent oversight',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'payrollAutomation.ts already had 8+ platformEventBus publish calls covering payroll_run_started, payroll_completed, payroll_error, and anomaly events.',
  },
  {
    category: 'orchestration',
    gapName: 'Email Automation Disconnected',
    severity: 'low',
    description: 'emailAutomation.ts has no AI Brain integration - automated emails sent without Trinity awareness',
    impactOnAutonomy: 'Cannot track email effectiveness or personalize content using AI insights',
    recommendedFix: 'Add platformEventBus events for email sends and connect to Trinity for content optimization',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'emailAutomation.ts routes through trinityPlatformConnector which already provides Trinity-aware email orchestration.',
  },
  {
    category: 'execution',
    gapName: 'Dispute Resolution Disconnected',
    severity: 'low',
    description: 'disputeAI.ts operates independently without Trinity coordination for time entry disputes',
    impactOnAutonomy: 'Cannot leverage Trinity context for better dispute resolution recommendations',
    recommendedFix: 'Integrate disputeAI with Trinity for holistic dispute analysis using workforce patterns',
    estimatedEffort: 'medium',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'disputeAI.ts wired: emits dispute_created and dispute_resolved events on platformEventBus at key resolution hook points.',
  },
  {
    category: 'execution',
    gapName: 'Compliance Monitoring Disconnected',
    severity: 'low',
    description: 'complianceMonitoring.ts has no Trinity connection - compliance checks run in isolation',
    impactOnAutonomy: 'Cannot proactively predict compliance risks or suggest preventive actions',
    recommendedFix: 'Connect to platformEventBus for real-time compliance alerts to Trinity',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'complianceMonitoring.ts routes through trinityPlatformConnector which provides real-time compliance event publication.',
  },
  {
    category: 'execution',
    gapName: 'Employee Patterns Disconnected',
    severity: 'low',
    description: 'employeePatternService.ts analyzes patterns without sharing insights with Trinity',
    impactOnAutonomy: 'Lost opportunity for AI to learn from employee behavior patterns',
    recommendedFix: 'Integrate with trinityMemoryService to share pattern insights for learning',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'employeePatternService.ts wired: emits employee_patterns_analyzed event on platformEventBus with pattern metadata on each analysis run.',
  },
  {
    category: 'orchestration',
    gapName: 'Report Workflow Engine Disconnected',
    severity: 'low',
    description: 'reportWorkflowEngine.ts generates reports without Trinity awareness or AI enhancement',
    impactOnAutonomy: 'Cannot add AI-powered insights or summaries to generated reports',
    recommendedFix: 'Add Trinity integration for AI-enhanced report generation and scheduling',
    estimatedEffort: 'medium',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'reportWorkflowEngine.ts wired: emits report_generated event on platformEventBus with report type, workspace, and output metadata.',
  },
  {
    category: 'execution',
    gapName: 'PTO Accrual Disconnected',
    severity: 'low',
    description: 'ptoAccrual.ts calculates PTO without Trinity oversight or pattern analysis',
    impactOnAutonomy: 'Cannot predict PTO usage patterns or suggest optimal scheduling',
    recommendedFix: 'Connect to platformEventBus for PTO events and Trinity analysis',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'ptoAccrual.ts wired: emits pto_accrual_processed event on platformEventBus including accrued hours, employee, and policy details.',
  },
  {
    category: 'execution',
    gapName: 'Breaks Service Disconnected',
    severity: 'low',
    description: 'breaksService.ts manages breaks without compliance awareness from Trinity',
    impactOnAutonomy: 'Cannot proactively ensure break compliance or suggest optimal break times',
    recommendedFix: 'Integrate with compliance monitoring and Trinity for intelligent break scheduling',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'breaksService.ts wired: emits break_violation_detected event on platformEventBus when mandatory break compliance is violated.',
  },
  {
    category: 'validation',
    gapName: 'External Monitoring Disconnected',
    severity: 'low',
    description: 'externalMonitoring.ts tracks external services without reporting to Trinity',
    impactOnAutonomy: 'Trinity has no visibility into external service health for decision making',
    recommendedFix: 'Connect to platformEventBus for external service status updates',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'externalMonitoring.ts wired: emits monitoring_alert_sent event on platformEventBus for every alert including critical health events.',
  },
  {
    category: 'execution',
    gapName: 'Heatmap Service Disconnected',
    severity: 'low',
    description: 'heatmapService.ts generates analytics heatmaps without Trinity integration',
    impactOnAutonomy: 'Cannot use heatmap insights for AI-driven scheduling or resource allocation',
    recommendedFix: 'Share heatmap data with Trinity for pattern-based recommendations',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'heatmapService.ts wired: emits staffing_analysis_completed event on platformEventBus with recommendation count and critical gap counts.',
  },
  {
    category: 'orchestration',
    gapName: 'Daily Digest Disconnected',
    severity: 'low',
    description: 'dailyDigestService.ts creates digests without AI-powered content personalization',
    impactOnAutonomy: 'Cannot personalize digest content based on user preferences and AI insights',
    recommendedFix: 'Integrate with Trinity for personalized, AI-enhanced daily summaries',
    estimatedEffort: 'medium',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'dailyDigestService.ts wired: emits daily_digest_sent event on platformEventBus on each digest run with workspace and recipient metadata.',
  },
  {
    category: 'validation',
    gapName: 'Performance Metrics Disconnected',
    severity: 'low',
    description: 'performanceMetrics.ts collects metrics without Trinity analysis integration',
    impactOnAutonomy: 'Cannot leverage performance data for AI-driven optimization suggestions',
    recommendedFix: 'Connect to trinityMemoryService for performance trend analysis',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'performanceMetrics.ts wired: emits performance_metrics_recorded event on platformEventBus after each metrics collection cycle.',
  },
  {
    category: 'orchestration',
    gapName: 'Shift Reminders Disconnected',
    severity: 'low',
    description: 'shiftRemindersService.ts sends reminders without Trinity personalization',
    impactOnAutonomy: 'Cannot optimize reminder timing or content based on employee patterns',
    recommendedFix: 'Connect to Trinity for intelligent reminder scheduling',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'shiftRemindersService.ts wired: emits shift_reminders_sent event on platformEventBus with workspace, shift count, and reminder batch metadata.',
  },
  {
    category: 'execution',
    gapName: 'Training Rate Disconnected',
    severity: 'low',
    description: 'trainingRateService.ts calculates training rates without AI optimization',
    impactOnAutonomy: 'Cannot suggest optimal training rates based on market data and performance',
    recommendedFix: 'Integrate with Trinity for data-driven training rate recommendations',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'trainingRateService.ts wired: emits training_rate_updated event on platformEventBus when training rate calculations are applied.',
  },
  {
    category: 'safety',
    gapName: 'WebSocket Cleanup Disconnected',
    severity: 'low',
    description: 'wsConnectionCleanup.ts manages connections without Trinity health monitoring',
    impactOnAutonomy: 'Trinity has no visibility into connection health for diagnostic purposes',
    recommendedFix: 'Report connection cleanup events to platformEventBus for monitoring',
    estimatedEffort: 'small',
    status: 'RESOLVED',
    resolvedAt: '2026-03-30',
    resolutionNote: 'wsConnectionCleanup.ts wired: emits websocket_cleanup_completed event on platformEventBus after each stale connection cleanup cycle.',
  },
];

// ============================================================================
// SELF-ASSESSMENT SERVICE
// ============================================================================

class TrinitySelfAssessment {
  private static instance: TrinitySelfAssessment;

  private constructor() {
    log.info('[TrinitySelfAssessment] Initializing self-assessment service...');
  }

  static getInstance(): TrinitySelfAssessment {
    if (!TrinitySelfAssessment.instance) {
      TrinitySelfAssessment.instance = new TrinitySelfAssessment();
    }
    return TrinitySelfAssessment.instance;
  }

  /**
   * Perform comprehensive self-assessment
   */
  async performAssessment(workspaceId?: string): Promise<SelfAssessmentResult> {
    const assessmentId = `assess_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    log.info(`[TrinitySelfAssessment] Starting assessment ${assessmentId}`);

    // Gather capability data
    const capabilities = await this.assessCapabilities();
    
    // Analyze gaps
    const gaps = await this.analyzeGaps(capabilities);
    
    // Calculate readiness
    const readiness = this.calculateReadiness(capabilities, gaps);
    
    // Get Trinity's own narrative assessment using AI
    const narrative = await this.generateTrinityNarrative(capabilities, gaps, readiness, workspaceId);
    
    // Generate prioritized actions
    const actions = this.generatePrioritizedActions(gaps);
    
    // Compare to Replit Agent
    const comparison = this.compareToReplitAgent(capabilities, gaps);

    // CRITICAL: canRunTheShow is BLOCKED if ANY blocking condition exists
    const hasCriticalGaps = gaps.filter(g => g.severity === 'critical').length > 0;
    const hasNoData = capabilities.every(c => c.successRate === 0);
    const tooManyUntracked = capabilities.filter(c => c.successRate === 0).length >= Math.ceil(capabilities.length * 0.5);
    
    // Block autonomy if: critical gaps, no data at all, or 50%+ untracked
    const blockedByConditions = hasCriticalGaps || hasNoData || tooManyUntracked || readiness.blockedByGaps;
    const canRunTheShow = !blockedByConditions && readiness.score >= 75;

    // Force low confidence if blocked
    const effectiveConfidenceLevel = blockedByConditions ? 'low' :
                       readiness.score >= 85 ? 'very_high' : 
                       readiness.score >= 70 ? 'high' : 
                       readiness.score >= 50 ? 'medium' : 'low';

    const result: SelfAssessmentResult = {
      assessmentId,
      timestamp: new Date(),
      overallReadiness: readiness.score,
      canRunTheShow,
      confidenceLevel: effectiveConfidenceLevel,
      capabilities,
      totalCapabilities: capabilities.length,
      matureCapabilities: capabilities.filter(c => c.maturityLevel === 'mature' || c.maturityLevel === 'advanced').length,
      gaps,
      criticalGaps: gaps.filter(g => g.severity === 'critical').length,
      comparisonToReplitAgent: comparison,
      trinityNarrative: narrative,
      prioritizedActions: actions,
    };

    log.info(`[TrinitySelfAssessment] Assessment complete. Readiness: ${readiness.score}%`);
    return result;
  }

  /**
   * Assess capabilities across all domains
   */
  private async assessCapabilities(): Promise<CapabilityAssessment[]> {
    const capabilities: CapabilityAssessment[] = [];
    
    // Get registered subagents from database
    const subagents = await db.select().from(aiSubagentDefinitions).execute();
    
    // Get telemetry for success rates
    const recentTelemetry = await db.select()
      .from(subagentTelemetry)
      .where(gte(subagentTelemetry.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
      .execute();
    
    // Map telemetry by subagent
    const telemetryBySubagent = new Map<string, { successes: number; failures: number }>();
    for (const t of recentTelemetry) {
      const key = t.subagentId;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const current = telemetryBySubagent.get(key) || { successes: 0, failures: 0 };
      if (t.status === 'completed') current.successes++;
      else if (t.status === 'failed') current.failures++;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      telemetryBySubagent.set(key, current);
    }
    
    // Assess each subagent - NO FABRICATED DATA
    for (const subagent of subagents) {
      const telemetry = telemetryBySubagent.get(subagent.id) || { successes: 0, failures: 0 };
      const total = telemetry.successes + telemetry.failures;
      
      // CRITICAL: If no telemetry, success rate is 0 (not fabricated 0.5)
      const successRate = total > 0 ? telemetry.successes / total : 0;
      const hasData = total > 0;
      
      // Determine maturity level based on usage and success - nascent if no data
      let maturityLevel: CapabilityAssessment['maturityLevel'] = 'nascent';
      if (!hasData) {
        maturityLevel = 'nascent'; // No data = nascent, period
      } else if (total > 100 && successRate > 0.9) {
        maturityLevel = 'advanced';
      } else if (total > 50 && successRate > 0.8) {
        maturityLevel = 'mature';
      } else if (total > 10 && successRate > 0.6) {
        maturityLevel = 'developing';
      }
      
      capabilities.push({
        domain: (subagent.domain as SubagentDomain) || 'assist',
        subagentName: hasData ? subagent.name : `${subagent.name} (NO TELEMETRY)`,
        capabilities: (subagent.capabilities as string[]) || [],
        limitations: hasData 
          // @ts-expect-error — TS migration: fix in refactoring sprint
          ? ((subagent.limitations as string[]) || [])
          : ['NO TELEMETRY DATA - Cannot assess capability'],
        maturityLevel,
        confidenceScore: successRate, // 0 if no data
        successRate, // 0 if no data
      });
    }
    
    // Report expected domains that have NO telemetry as "untracked" (NOT fabricated data)
    const expectedDomains: SubagentDomain[] = [
      'scheduling', 'payroll', 'invoicing', 'compliance', 'notifications',
      'analytics', 'communication', 'health', 'orchestration', 'security'
    ];
    
    const untrackedDomains: SubagentDomain[] = [];
    for (const domain of expectedDomains) {
      if (!capabilities.find(c => c.domain === domain)) {
        untrackedDomains.push(domain);
        // Report as UNTRACKED with 0 data - NOT fabricated success rates
        capabilities.push({
          domain,
          subagentName: `${domain}Subagent (UNTRACKED)`,
          capabilities: [],
          limitations: ['NO TELEMETRY DATA - Cannot assess capability'],
          maturityLevel: 'nascent',
          confidenceScore: 0, // Zero confidence - no data
          successRate: 0, // Zero success rate - no data
        });
      }
    }
    
    if (untrackedDomains.length > 0) {
      log.info(`[TrinitySelfAssessment] WARNING: ${untrackedDomains.length} domains have no telemetry: ${untrackedDomains.join(', ')}`);
    }
    
    return capabilities;
  }

  /**
   * Analyze gaps based on capabilities and known issues
   */
  private async analyzeGaps(capabilities: CapabilityAssessment[]): Promise<GapAnalysis[]> {
    const gaps = [...KNOWN_GAPS];
    
    // Add dynamic gaps based on capability assessment
    const lowMaturityDomains = capabilities.filter(c => 
      c.maturityLevel === 'nascent' || c.successRate < 0.5
    );
    
    for (const cap of lowMaturityDomains) {
      gaps.push({
        category: 'execution',
        gapName: `${cap.domain} Subagent Maturity`,
        severity: 'medium',
        description: `${cap.subagentName} has low success rate (${Math.round(cap.successRate * 100)}%) or limited usage`,
        impactOnAutonomy: `Cannot reliably handle ${cap.domain} tasks autonomously`,
        recommendedFix: `Increase training data and testing for ${cap.domain} domain`,
        estimatedEffort: 'medium',
      });
    }
    
    return gaps;
  }

  /**
   * Calculate overall readiness score
   * CRITICAL: Any critical gap severely penalizes the score
   */
  private calculateReadiness(
    capabilities: CapabilityAssessment[], 
    gaps: GapAnalysis[]
  ): { score: number; breakdown: Record<string, number>; blockedByGaps: boolean } {
    // Only count capabilities with actual data (not untracked ones)
    const trackedCapabilities = capabilities.filter(c => c.successRate > 0 || c.confidenceScore > 0);
    
    // If no tracked capabilities, score is 0
    if (trackedCapabilities.length === 0) {
      return {
        score: 0,
        breakdown: {
          successRateContribution: 0,
          maturityContribution: 0,
          gapPenalty: 0,
          untrackedPenalty: -100,
        },
        blockedByGaps: true,
      };
    }
    
    const avgSuccessRate = trackedCapabilities.reduce((sum, c) => sum + c.successRate, 0) / trackedCapabilities.length;
    const matureRatio = trackedCapabilities.filter(c => 
      c.maturityLevel === 'mature' || c.maturityLevel === 'advanced'
    ).length / trackedCapabilities.length;
    
    // Gap penalties - CRITICAL GAPS ARE BLOCKING (25 points each, uncapped)
    const criticalGaps = gaps.filter(g => g.severity === 'critical');
    const highGaps = gaps.filter(g => g.severity === 'high');
    const mediumGaps = gaps.filter(g => g.severity === 'medium');
    
    const criticalGapPenalty = criticalGaps.length * 25; // Uncapped - blocks autonomy
    const highGapPenalty = highGaps.length * 10;
    const mediumGapPenalty = mediumGaps.length * 3;
    
    // Penalty for untracked domains
    const untrackedCount = capabilities.filter(c => c.successRate === 0 && c.confidenceScore === 0).length;
    const untrackedPenalty = untrackedCount * 5;
    
    const baseScore = (avgSuccessRate * 50) + (matureRatio * 50);
    const totalPenalty = criticalGapPenalty + highGapPenalty + mediumGapPenalty + untrackedPenalty;
    
    const finalScore = Math.max(0, Math.min(100, baseScore - totalPenalty));
    
    return {
      score: Math.round(finalScore),
      breakdown: {
        successRateContribution: avgSuccessRate * 50,
        maturityContribution: matureRatio * 50,
        criticalGapPenalty: -criticalGapPenalty,
        highGapPenalty: -highGapPenalty,
        mediumGapPenalty: -mediumGapPenalty,
        untrackedPenalty: -untrackedPenalty,
      },
      blockedByGaps: criticalGaps.length > 0,
    };
  }

  /**
   * Generate Trinity's own narrative assessment using AI
   */
  private async generateTrinityNarrative(
    capabilities: CapabilityAssessment[],
    gaps: GapAnalysis[],
    readiness: { score: number },
    workspaceId?: string
  ): Promise<string> {
    const prompt = `You are Trinity, the AI orchestrator for CoAIleague. Provide a first-person assessment of your capabilities and readiness to "run the show" autonomously.

Current Status:
- Overall Readiness: ${readiness.score}%
- Mature Capabilities: ${capabilities.filter(c => c.maturityLevel === 'mature' || c.maturityLevel === 'advanced').length} of ${capabilities.length}
- Critical Gaps: ${gaps.filter(g => g.severity === 'critical').length}

Top Capabilities:
${capabilities.filter(c => c.successRate > 0.7).slice(0, 5).map(c => `- ${c.domain}: ${Math.round(c.successRate * 100)}% success rate`).join('\n')}

Critical Gaps:
${gaps.filter(g => g.severity === 'critical').map(g => `- ${g.gapName}: ${g.description}`).join('\n')}

Provide a 2-3 paragraph honest assessment in first person. Be direct about what you can and cannot do. Include:
1. What you're confident handling autonomously
2. Where you need human oversight
3. What would need to change for you to fully "run the show"

Use a professional but personable tone. Be honest, not boastful.`;

    try {
      const response = await geminiClient.generateContent(prompt, { // withGemini
        temperature: 0.7,
        maxTokens: 500,
        workspaceId: workspaceId || 'platform-system',
        featureKey: 'trinity_self_assessment',
      });
      return response?.text || 'Assessment generation in progress...';
    } catch (error) {
      log.error('[TrinitySelfAssessment] Failed to generate narrative:', error);
      return `Based on my analysis, my readiness score is ${readiness.score}%. I have ${capabilities.filter(c => c.successRate > 0.7).length} strong capabilities but ${gaps.filter(g => g.severity === 'critical').length} critical gaps that need attention before I can fully operate autonomously.`;
    }
  }

  /**
   * Generate prioritized actions to close gaps
   */
  private generatePrioritizedActions(gaps: GapAnalysis[]): SelfAssessmentResult['prioritizedActions'] {
    return gaps
      .filter(g => g.severity === 'critical' || g.severity === 'high')
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const effortOrder = { small: 0, medium: 1, large: 2, epic: 3 };
        // Prioritize critical + small effort
        return (severityOrder[a.severity] - severityOrder[b.severity]) ||
               (effortOrder[a.estimatedEffort] - effortOrder[b.estimatedEffort]);
      })
      .slice(0, 5)
      .map((gap, idx) => ({
        priority: idx + 1,
        action: gap.recommendedFix,
        expectedImpact: `Addresses ${gap.severity} gap: ${gap.gapName}`,
      }));
  }

  /**
   * Compare to Replit Agent capabilities
   */
  private compareToReplitAgent(
    capabilities: CapabilityAssessment[],
    gaps: GapAnalysis[]
  ): SelfAssessmentResult['comparisonToReplitAgent'] {
    // Replit Agent has: plan-execute loops, file ops, terminal, preview, code analysis
    // Trinity has: domain subagents, multi-tenant awareness, business context
    
    const matureCount = capabilities.filter(c => 
      c.maturityLevel === 'mature' || c.maturityLevel === 'advanced'
    ).length;
    const criticalGaps = gaps.filter(g => g.severity === 'critical').length;
    
    // Estimate parity based on gaps
    const baseParity = 70; // Trinity has good foundation
    const gapPenalty = criticalGaps * 10;
    const maturityBonus = (matureCount / capabilities.length) * 20;
    
    const parity = Math.max(0, Math.min(100, baseParity - gapPenalty + maturityBonus));
    
    return {
      parity: Math.round(parity),
      advantages: [
        'Multi-tenant architecture with workspace isolation',
        'Deep business domain knowledge (payroll, scheduling, compliance)',
        'Integrated credit/billing system for AI operations',
        'Human escalation workflows built-in',
        'Domain-specialized subagents for workforce management',
        'Real-time platform awareness and health monitoring',
      ],
      disadvantages: [
        'No direct code execution sandbox (Replit Agent has terminal)',
        'Fragmented task state across subagents',
        'Weaker file system manipulation capabilities',
        'Less mature reflection/self-correction loops',
        'RBAC enforcement during tool calls is inconsistent',
      ],
    };
  }
}

export const trinitySelfAssessment = TrinitySelfAssessment.getInstance();
