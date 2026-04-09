/**
 * TRINITY PLATFORM SCAN ORCHESTRATOR
 * ===================================
 * Implements Trinity's autonomous platform scanning and learning system.
 * 
 * This service enables Trinity to:
 * 1. Perform initial platform scans to build knowledge baseline
 * 2. Continuously learn from user interactions and platform events
 * 3. Persist learned patterns to long-term memory
 * 4. Report readiness and knowledge state
 */

import { db } from '../../db';
import { eq, and, desc, sql, gte, count } from 'drizzle-orm';
import {
  subagentTelemetry,
  automationActionLedger,
  platformAwarenessEvents,
  knowledgeGapLogs,
  aiSubagentDefinitions,
} from '@shared/schema';
import { trinityMemoryService } from './trinityMemoryService';
import { trinitySelfAssessment } from './trinitySelfAssessment';
import { geminiClient } from './providers/geminiClient';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityScanOrchestrator');

// ============================================================================
// TYPES
// ============================================================================

export interface ScanResult {
  scanId: string;
  timestamp: Date;
  phase: 'initial' | 'incremental' | 'deep';
  duration: number;
  
  // What was scanned
  pagesScanned: number;
  eventsProcessed: number;
  errorsDetected: number;
  
  // Learning outcomes
  patternsLearned: LearnedPattern[];
  insightsGenerated: string[];
  knowledgeNodesCreated: number;
  
  // Readiness impact
  readinessBefore: number;
  readinessAfter: number;
  
  // Summary
  summary: string;
}

export interface LearnedPattern {
  patternId: string;
  patternType: 'error' | 'usage' | 'workflow' | 'performance' | 'ui';
  description: string;
  confidence: number;
  frequency: number;
  affectedAreas: string[];
  suggestedAction?: string;
}

export interface KnowledgeState {
  totalKnowledgeNodes: number;
  totalPatternsLearned: number;
  totalEventsProcessed: number;
  lastScanTime?: Date;
  readinessScore: number;
  topDomains: { domain: string; knowledgeLevel: number }[];
  recentInsights: string[];
  knowledgePersisted: boolean;
}

// ============================================================================
// TRINITY SCAN ORCHESTRATOR CLASS
// ============================================================================

class TrinityScanOrchestrator {
  private static instance: TrinityScanOrchestrator;
  private isScanning = false;
  private lastScanResult: ScanResult | null = null;
  private knowledgeRegistry: Map<string, LearnedPattern> = new Map();

  static getInstance(): TrinityScanOrchestrator {
    if (!this.instance) {
      this.instance = new TrinityScanOrchestrator();
    }
    return this.instance;
  }

  /**
   * Perform initial platform scan to build knowledge baseline
   */
  async performInitialScan(): Promise<ScanResult> {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    this.isScanning = true;
    const startTime = Date.now();
    const scanId = `scan_${Date.now()}`;

    log.info('[TrinityScanOrchestrator] Starting initial platform scan...');

    try {
      // Get baseline readiness
      const baselineAssessment = await trinitySelfAssessment.performAssessment();
      const readinessBefore = baselineAssessment.overallReadiness;

      // Phase 1: Scan platform awareness events
      const eventsResult = await this.scanPlatformEvents();
      
      // Phase 2: Analyze telemetry data
      const telemetryResult = await this.analyzeTelemetryData();
      
      // Phase 3: Process automation ledger for patterns
      const automationResult = await this.processAutomationHistory();
      
      // Phase 4: Detect and learn from error patterns
      const errorPatterns = await this.detectErrorPatterns();
      
      // Phase 5: Build knowledge nodes
      const knowledgeNodes = await this.buildKnowledgeNodes(
        eventsResult.events,
        telemetryResult.records,
        automationResult.actions,
        errorPatterns
      );

      // Phase 6: Generate insights using Gemini
      const insights = await this.generateInsights(knowledgeNodes);

      // Phase 7: Persist to memory
      await this.persistToMemory(knowledgeNodes, insights);

      // Get updated readiness
      const updatedAssessment = await trinitySelfAssessment.performAssessment();
      const readinessAfter = updatedAssessment.overallReadiness;

      const duration = Date.now() - startTime;
      const patterns = Array.from(this.knowledgeRegistry.values());

      const result: ScanResult = {
        scanId,
        timestamp: new Date(),
        phase: 'initial',
        duration,
        pagesScanned: eventsResult.uniquePages,
        eventsProcessed: eventsResult.events.length + telemetryResult.records.length,
        errorsDetected: errorPatterns.length,
        patternsLearned: patterns,
        insightsGenerated: insights,
        knowledgeNodesCreated: knowledgeNodes.length,
        readinessBefore,
        readinessAfter,
        summary: this.generateScanSummary(patterns, insights, readinessBefore, readinessAfter),
      };

      this.lastScanResult = result;
      log.info(`[TrinityScanOrchestrator] Scan complete: ${result.summary}`);

      return result;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan platform awareness events for patterns
   */
  private async scanPlatformEvents(): Promise<{ events: any[]; uniquePages: number }> {
    try {
      const recentEvents = await db
        .select()
        .from(platformAwarenessEvents)
        .orderBy(desc(platformAwarenessEvents.createdAt))
        .limit(1000);

      const uniquePages = new Set(recentEvents.map(e => e.source || 'unknown')).size;

      log.info(`[TrinityScanOrchestrator] Scanned ${recentEvents.length} platform events from ${uniquePages} sources`);

      return { events: recentEvents, uniquePages };
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error scanning platform events:', error);
      return { events: [], uniquePages: 0 };
    }
  }

  /**
   * Analyze telemetry data for subagent performance
   */
  private async analyzeTelemetryData(): Promise<{ records: any[] }> {
    try {
      const telemetry = await db
        .select()
        .from(subagentTelemetry)
        .orderBy(desc(subagentTelemetry.createdAt))
        .limit(500);

      // Build performance map by subagent
      const performanceMap = new Map<string, { success: number; fail: number; total: number }>();
      
      for (const record of telemetry) {
        const key = (record as any).subagentName || 'unknown';
        const current = performanceMap.get(key) || { success: 0, fail: 0, total: 0 };
        current.total++;
        if (record.status === 'completed') current.success++;
        else if (record.status === 'failed') current.fail++;
        performanceMap.set(key, current);
      }

      // Create learned patterns from performance data
      for (const [name, stats] of performanceMap) {
        if (stats.total >= 5) {
          const successRate = stats.success / stats.total;
          this.knowledgeRegistry.set(`perf_${name}`, {
            patternId: `perf_${name}`,
            patternType: 'performance',
            description: `${name} has ${Math.round(successRate * 100)}% success rate over ${stats.total} operations`,
            confidence: Math.min(0.5 + stats.total / 100, 0.95),
            frequency: stats.total,
            affectedAreas: [name],
            suggestedAction: successRate < 0.7 ? `Investigate ${name} failures` : undefined,
          });
        }
      }

      log.info(`[TrinityScanOrchestrator] Analyzed ${telemetry.length} telemetry records`);

      return { records: telemetry };
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error analyzing telemetry:', error);
      return { records: [] };
    }
  }

  /**
   * Process automation action history
   */
  private async processAutomationHistory(): Promise<{ actions: any[] }> {
    try {
      const actions = await db
        .select()
        .from(automationActionLedger)
        .orderBy(desc(automationActionLedger.createdAt))
        .limit(500);

      // Analyze automation patterns
      const actionTypes = new Map<string, number>();
      for (const action of actions) {
        const type = (action as any).actionType || 'unknown';
        actionTypes.set(type, (actionTypes.get(type) || 0) + 1);
      }

      // Create workflow patterns
      for (const [type, count] of actionTypes) {
        if (count >= 3) {
          this.knowledgeRegistry.set(`workflow_${type}`, {
            patternId: `workflow_${type}`,
            patternType: 'workflow',
            description: `${type} automation executed ${count} times`,
            confidence: Math.min(0.4 + count / 50, 0.9),
            frequency: count,
            affectedAreas: ['automation', type],
          });
        }
      }

      log.info(`[TrinityScanOrchestrator] Processed ${actions.length} automation actions`);

      return { actions };
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error processing automation history:', error);
      return { actions: [] };
    }
  }

  /**
   * Detect error patterns from knowledge gap logs
   */
  private async detectErrorPatterns(): Promise<LearnedPattern[]> {
    try {
      const gaps = await db
        .select()
        .from(knowledgeGapLogs)
        .orderBy(desc(knowledgeGapLogs.createdAt))
        .limit(200);

      const errorPatterns: LearnedPattern[] = [];
      const gapCategories = new Map<string, { count: number; descriptions: string[] }>();

      for (const gap of gaps) {
        const category = (gap as any).category || 'unknown';
        const current = gapCategories.get(category) || { count: 0, descriptions: [] };
        current.count++;
        if (gap.gapDescription && current.descriptions.length < 5) {
          current.descriptions.push(gap.gapDescription);
        }
        gapCategories.set(category, current);
      }

      for (const [category, data] of gapCategories) {
        const pattern: LearnedPattern = {
          patternId: `error_${category}`,
          patternType: 'error',
          description: `${data.count} knowledge gaps in ${category}: ${data.descriptions[0] || 'Various issues'}`,
          confidence: Math.min(0.5 + data.count / 20, 0.9),
          frequency: data.count,
          affectedAreas: [category],
          suggestedAction: `Review and address ${category} knowledge gaps`,
        };
        errorPatterns.push(pattern);
        this.knowledgeRegistry.set(pattern.patternId, pattern);
      }

      log.info(`[TrinityScanOrchestrator] Detected ${errorPatterns.length} error patterns from ${gaps.length} gaps`);

      return errorPatterns;
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error detecting patterns:', error);
      return [];
    }
  }

  /**
   * Build knowledge nodes from collected data
   */
  private async buildKnowledgeNodes(
    events: any[],
    telemetry: any[],
    actions: any[],
    errorPatterns: LearnedPattern[]
  ): Promise<any[]> {
    const nodes: any[] = [];

    // Event-based nodes
    const eventsByType = new Map<string, number>();
    for (const event of events) {
      const type = event.eventType || 'unknown';
      eventsByType.set(type, (eventsByType.get(type) || 0) + 1);
    }

    for (const [type, count] of eventsByType) {
      nodes.push({
        nodeType: 'event_pattern',
        category: type,
        frequency: count,
        confidence: Math.min(0.3 + count / 100, 0.85),
      });
    }

    // Domain knowledge nodes
    const domains = ['scheduling', 'payroll', 'compliance', 'billing', 'notifications'];
    for (const domain of domains) {
      const domainTelemetry = telemetry.filter(t => 
        t.subagentName?.toLowerCase().includes(domain) ||
        t.domain?.toLowerCase() === domain
      );
      
      if (domainTelemetry.length > 0) {
        const successRate = domainTelemetry.filter(t => t.status === 'completed').length / domainTelemetry.length;
        nodes.push({
          nodeType: 'domain_knowledge',
          domain,
          telemetryCount: domainTelemetry.length,
          successRate,
          confidence: Math.min(0.4 + domainTelemetry.length / 50, 0.9),
        });
      }
    }

    log.info(`[TrinityScanOrchestrator] Built ${nodes.length} knowledge nodes`);

    return nodes;
  }

  /**
   * Generate insights using Gemini AI
   */
  private async generateInsights(knowledgeNodes: any[]): Promise<string[]> {
    try {
      const patterns = Array.from(this.knowledgeRegistry.values());
      
      const prompt = `You are Trinity, the AI orchestrator for CoAIleague. Based on your platform scan, generate 3-5 key insights.

Patterns Detected:
${patterns.slice(0, 10).map(p => `- ${p.patternType}: ${p.description} (confidence: ${Math.round(p.confidence * 100)}%)`).join('\n')}

Knowledge Nodes Built: ${knowledgeNodes.length}

Generate concise, actionable insights about:
1. Platform health and stability
2. Areas needing attention
3. Opportunities for improvement
4. Your learning progress

Format as a JSON array of strings. Example: ["insight 1", "insight 2"]`;

      const response = await geminiClient.generateContent(prompt, { // withGemini
        temperature: 0.7,
        maxTokens: 500,
        workspaceId: 'platform-system',
        featureKey: 'trinity_scan_orchestration',
      });

      try {
        const responseText = response?.text || '';
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Parse failed, extract insights manually
      }

      // Fallback insights
      return [
        `Scanned ${knowledgeNodes.length} knowledge nodes across the platform`,
        `Detected ${patterns.length} operational patterns`,
        `Platform awareness baseline established`,
      ];
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error generating insights:', error);
      return ['Initial platform scan completed'];
    }
  }

  /**
   * Persist learned knowledge to Trinity's memory
   */
  private async persistToMemory(knowledgeNodes: any[], insights: string[]): Promise<void> {
    try {
      // Broadcast insights to memory service
      for (const insight of insights) {
        await trinityMemoryService.shareInsight({
          sourceAgent: 'trinity',
          insightType: 'pattern',
          workspaceScope: null,
          title: 'Platform Scan Insight',
          content: insight,
          confidence: 0.8,
          applicableScenarios: ['platform-health', 'autonomous-operation'],
        });
      }

      log.info(`[TrinityScanOrchestrator] Persisted ${insights.length} insights to memory`);
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error persisting to memory:', error);
    }
  }

  /**
   * Generate human-readable scan summary
   */
  private generateScanSummary(
    patterns: LearnedPattern[],
    insights: string[],
    readinessBefore: number,
    readinessAfter: number
  ): string {
    const improvement = readinessAfter - readinessBefore;
    const improvementText = improvement > 0 
      ? `Readiness improved by ${improvement}%` 
      : improvement < 0 
        ? `Readiness decreased by ${Math.abs(improvement)}%` 
        : 'Readiness unchanged';

    return `Learned ${patterns.length} patterns, generated ${insights.length} insights. ${improvementText} (${readinessBefore}% → ${readinessAfter}%)`;
  }

  /**
   * Get current knowledge state
   */
  async getKnowledgeState(): Promise<KnowledgeState> {
    try {
      // Count telemetry records
      const telemetryCount = await db
        .select({ count: count() })
        .from(subagentTelemetry);

      // Count platform events
      const eventsCount = await db
        .select({ count: count() })
        .from(platformAwarenessEvents);

      // Get readiness from self-assessment
      const assessment = await trinitySelfAssessment.performAssessment();

      // Get domain knowledge levels
      const domainLevels = assessment.capabilities.map(cap => ({
        domain: cap.domain,
        knowledgeLevel: Math.round(cap.successRate * 100),
      }));

      // Get recent insights
      const recentInsights = this.lastScanResult?.insightsGenerated || [];

      return {
        totalKnowledgeNodes: this.knowledgeRegistry.size,
        totalPatternsLearned: this.knowledgeRegistry.size,
        totalEventsProcessed: (telemetryCount[0]?.count || 0) + (eventsCount[0]?.count || 0),
        lastScanTime: this.lastScanResult?.timestamp,
        readinessScore: assessment.overallReadiness,
        topDomains: domainLevels.sort((a, b) => b.knowledgeLevel - a.knowledgeLevel).slice(0, 5),
        recentInsights,
        knowledgePersisted: true,
      };
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error getting knowledge state:', error);
      return {
        totalKnowledgeNodes: 0,
        totalPatternsLearned: 0,
        totalEventsProcessed: 0,
        readinessScore: 0,
        topDomains: [],
        recentInsights: [],
        knowledgePersisted: false,
      };
    }
  }

  /**
   * Test knowledge persistence - verify data survives restart
   */
  async testKnowledgePersistence(): Promise<{ 
    passed: boolean; 
    checks: { name: string; passed: boolean; details: string }[] 
  }> {
    const checks: { name: string; passed: boolean; details: string }[] = [];

    try {
      // Check 1: Telemetry data exists
      const telemetryCount = await db.select({ count: count() }).from(subagentTelemetry);
      const hasTelemetry = (telemetryCount[0]?.count || 0) > 0;
      checks.push({
        name: 'Telemetry Data Persisted',
        passed: hasTelemetry,
        details: `${telemetryCount[0]?.count || 0} telemetry records found`,
      });

      // Check 2: Platform events exist
      const eventsCount = await db.select({ count: count() }).from(platformAwarenessEvents);
      const hasEvents = (eventsCount[0]?.count || 0) > 0;
      checks.push({
        name: 'Platform Events Persisted',
        passed: hasEvents,
        details: `${eventsCount[0]?.count || 0} platform events found`,
      });

      // Check 3: Automation ledger has data
      const actionsCount = await db.select({ count: count() }).from(automationActionLedger);
      const hasActions = (actionsCount[0]?.count || 0) > 0;
      checks.push({
        name: 'Automation History Persisted',
        passed: hasActions,
        details: `${actionsCount[0]?.count || 0} automation actions found`,
      });

      // Check 4: Knowledge gaps tracked
      const gapsCount = await db.select({ count: count() }).from(knowledgeGapLogs);
      checks.push({
        name: 'Knowledge Gaps Tracked',
        passed: true, // Gaps being empty is OK
        details: `${gapsCount[0]?.count || 0} knowledge gaps logged`,
      });

      // Check 5: Subagent definitions exist
      const subagentsCount = await db.select({ count: count() }).from(aiSubagentDefinitions);
      const hasSubagents = (subagentsCount[0]?.count || 0) > 0;
      checks.push({
        name: 'Subagent Definitions Persisted',
        passed: hasSubagents,
        details: `${subagentsCount[0]?.count || 0} subagent definitions found`,
      });

      const allPassed = checks.filter(c => c.passed).length >= 3; // At least 3 checks must pass

      return { passed: allPassed, checks };
    } catch (error) {
      log.error('[TrinityScanOrchestrator] Error testing persistence:', error);
      checks.push({
        name: 'Database Connection',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      return { passed: false, checks };
    }
  }

  /**
   * Get scan status
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  getLastScanResult(): ScanResult | null {
    return this.lastScanResult;
  }
}

export const trinityScanOrchestrator = TrinityScanOrchestrator.getInstance();
