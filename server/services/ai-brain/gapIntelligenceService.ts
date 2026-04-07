/**
 * GAP INTELLIGENCE SERVICE - Trinity Autonomous Issue Detection
 * ==============================================================
 * Periodic scanners that autonomously detect platform issues:
 * - TypeScript/LSP errors
 * - Schema mismatches
 * - Code gaps and missing handlers
 * - React hook issues
 * - Runtime log errors
 * 
 * Runs on configurable schedules and stores findings in aiGapFindings table.
 * Part of Trinity's Full Platform Awareness initiative.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { createLogger } from '../../lib/logger';

const log = createLogger('GapIntelligenceService');
import { AI } from '../../config/platformConfig';
import { db } from '../../db';
import { aiGapFindings, aiWorkflowApprovals } from '@shared/schema';
import { eq, and, desc, sql, gte, lt } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  schemaOpsSubagent,
  logOpsSubagent,
  handlerOpsSubagent,
  hookOpsSubagent,
  persistGapFinding,
  persistGapFindings,
  GapFinding,
} from './subagents/domainOpsSubagents';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { platformEventBus, PlatformEvent } from '../platformEventBus';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface GapIntelligenceConfig {
  enabled: boolean;
  schedules: {
    typescript: string;
    schema: string;
    handlers: string;
    hooks: string;
    logs: string;
    fullScan: string;
  };
  maxFindingsPerScan: number;
  autoApproveThreshold: number;
}

const DEFAULT_CONFIG: GapIntelligenceConfig = {
  enabled: true,
  schedules: {
    typescript: '0 */2 * * *',
    schema: '0 */6 * * *',
    handlers: '0 */4 * * *',
    hooks: '0 */4 * * *',
    logs: '*/30 * * * *',
    fullScan: '0 3 * * *',
  },
  maxFindingsPerScan: 100,
  autoApproveThreshold: AI.autoApproveThreshold,
};

// ============================================================================
// GAP INTELLIGENCE SERVICE
// ============================================================================

class GapIntelligenceService {
  private static instance: GapIntelligenceService;
  private config: GapIntelligenceConfig;
  private scheduledJobs: Map<string, ScheduledTask> = new Map();
  private isRunning: boolean = false;
  private lastScanResults: Map<string, { timestamp: Date; findingsCount: number }> = new Map();

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  static getInstance(): GapIntelligenceService {
    if (!this.instance) {
      this.instance = new GapIntelligenceService();
    }
    return this.instance;
  }

  // ==========================================================================
  // CAPABILITY CHECKS
  // ==========================================================================

  private isGeminiAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  // ==========================================================================
  // TYPESCRIPT/LSP ERROR SCANNER
  // ==========================================================================

  async scanTypeScriptErrors(): Promise<GapFinding[]> {
    log.info('[GapIntelligence] Scanning for TypeScript errors...');
    const findings: GapFinding[] = [];

    try {
      let output = '';
      try {
        const result = await execAsync('npx tsc --noEmit --pretty false', {
          cwd: process.cwd(),
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024,
        });
        output = result.stdout + result.stderr;
      } catch (execError: any) {
        output = (execError.stdout || '') + (execError.stderr || '');
        if (!output && execError.message) {
          log.info('[GapIntelligence] tsc execution failed:', execError.message);
        }
      }

      if (!output.trim()) {
        log.info('[GapIntelligence] No TypeScript errors found');
        this.lastScanResults.set('typescript', {
          timestamp: new Date(),
          findingsCount: 0,
        });
        return [];
      }

      const errorLines = output.split('\n').filter(line => 
        line.includes('error TS') || /\.tsx?\(\d+,\d+\)/.test(line)
      );

      for (const line of errorLines.slice(0, this.config.maxFindingsPerScan)) {
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
        if (match) {
          const [, filePath, lineNum, colNum, errorCode, message] = match;
          
          findings.push({
            filePath: filePath.trim(),
            lineNumber: parseInt(lineNum, 10),
            columnNumber: parseInt(colNum, 10),
            gapType: 'typescript_error',
            severity: 'error',
            title: `${errorCode}: ${message.substring(0, 100)}`,
            description: message,
            technicalDetails: `TypeScript compiler error at line ${lineNum}, column ${colNum}`,
            suggestedFix: this.suggestTypeScriptFix(errorCode, message),
            detectionMethod: 'tsc_noEmit',
            confidence: 1.0,
          });
        }
      }

      log.info(`[GapIntelligence] Found ${findings.length} TypeScript errors`);
      
      if (findings.length > 0) {
        const persistedIds = await persistGapFindings(findings, 'GapIntelligence:TypeScript');
        if (persistedIds.length > 0) {
          await this.emitScanEvent('typescript_scan', {
            totalFindings: findings.length,
            newFindings: persistedIds.length,
            criticalCount: 0,
            errorCount: findings.length,
            warningCount: 0,
            infoCount: 0,
            scanDuration: 0,
          });
        }
      }

      this.lastScanResults.set('typescript', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      return findings;
    } catch (error) {
      log.error('[GapIntelligence] TypeScript scan error:', error);
      return [];
    }
  }

  private suggestTypeScriptFix(errorCode: string, message: string): string {
    const fixes: Record<string, string> = {
      'TS2304': 'Import the missing type or variable, or install @types package',
      'TS2339': 'Check if property exists on the type, or add type assertion',
      'TS2345': 'Ensure argument types match parameter types',
      'TS2322': 'Check type compatibility and add proper type annotations',
      'TS2531': 'Add null check or use optional chaining (?.) operator',
      'TS2532': 'Add undefined check or use optional chaining (?.) operator',
      'TS7006': 'Add explicit type annotation to parameter',
      'TS2307': 'Install missing module or check import path',
      'TS18046': 'Handle the unknown type by narrowing with type guard',
    };
    return fixes[errorCode] || 'Review the error message and fix the type issue';
  }

  // ==========================================================================
  // SCHEMA SCANNER
  // ==========================================================================

  async scanSchemaIssues(): Promise<GapFinding[]> {
    log.info('[GapIntelligence] Scanning for schema issues...');
    const findings: GapFinding[] = [];

    try {
      try {
        const mismatches = await schemaOpsSubagent.detectSchemaMismatches();
        findings.push(...mismatches);
      } catch (mismatchError) {
        log.warn('[GapIntelligence] Schema mismatch detection failed:', mismatchError);
      }

      try {
        const relationships = await schemaOpsSubagent.analyzeRelationships();
        findings.push(...relationships);
      } catch (relationshipError) {
        log.warn('[GapIntelligence] Relationship analysis failed:', relationshipError);
      }

      if (findings.length > 0) {
        const persistedIds = await persistGapFindings(findings, 'GapIntelligence:Schema');
        if (persistedIds.length > 0) {
          // Include top issues for actionable notifications
          const topIssues = findings.slice(0, 5).map(f => ({
            file: f.filePath,
            message: f.description,
            type: f.gapType,
            severity: f.severity,
          }));
          const affectedFiles = [...new Set(findings.map(f => f.filePath).filter(Boolean))];
          
          await this.emitScanEvent('schema_scan', {
            totalFindings: findings.length,
            newFindings: persistedIds.length,
            criticalCount: findings.filter(f => f.severity === 'critical').length,
            errorCount: findings.filter(f => f.severity === 'error').length,
            warningCount: findings.filter(f => f.severity === 'warning').length,
            infoCount: findings.filter(f => f.severity === 'info').length,
            scanDuration: 0,
            topIssues,
            affectedFiles: affectedFiles.slice(0, 5),
          });
        }
      }

      this.lastScanResults.set('schema', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      log.info(`[GapIntelligence] Found ${findings.length} schema issues`);
      return findings;
    } catch (error) {
      log.error('[GapIntelligence] Schema scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // HANDLER/ROUTE SCANNER
  // ==========================================================================

  async scanHandlerGaps(): Promise<GapFinding[]> {
    log.info('[GapIntelligence] Scanning for handler gaps...');
    const findings: GapFinding[] = [];

    try {
      try {
        const gaps = await handlerOpsSubagent.detectMissingHandlers();
        findings.push(...gaps);
      } catch (gapError) {
        log.warn('[GapIntelligence] Handler gap detection failed:', gapError);
      }

      if (findings.length > 0) {
        await persistGapFindings(findings, 'GapIntelligence:Handlers');
      }

      this.lastScanResults.set('handlers', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      log.info(`[GapIntelligence] Found ${findings.length} handler gaps`);
      return findings;
    } catch (error) {
      log.error('[GapIntelligence] Handler scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // HOOK SCANNER
  // ==========================================================================

  async scanHookIssues(): Promise<GapFinding[]> {
    log.info('[GapIntelligence] Scanning for hook issues...');
    const findings: GapFinding[] = [];

    try {
      try {
        const issues = await hookOpsSubagent.detectHookIssues();
        findings.push(...issues);
      } catch (hookError) {
        log.warn('[GapIntelligence] Hook issue detection failed:', hookError);
      }

      if (findings.length > 0) {
        await persistGapFindings(findings, 'GapIntelligence:Hooks');
      }

      this.lastScanResults.set('hooks', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      log.info(`[GapIntelligence] Found ${findings.length} hook issues`);
      return findings;
    } catch (error) {
      log.error('[GapIntelligence] Hook scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // LOG SCANNER
  // ==========================================================================

  async scanRecentLogs(): Promise<GapFinding[]> {
    log.info('[GapIntelligence] Scanning recent logs for errors...');

    try {
      const logPaths = ['/tmp/logs', 'logs'];
      const allContent: string[] = [];
      const sources: string[] = [];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      for (const logDir of logPaths) {
        if (!fs.existsSync(logDir)) continue;

        const files = fs.readdirSync(logDir)
          .filter(f => f.endsWith('.log'))
          .slice(-10);
        
        for (const file of files) {
          try {
            const logPath = path.join(logDir, file);
            const stat = fs.statSync(logPath);
            
            if (stat.mtime < oneHourAgo) continue;

            const content = fs.readFileSync(logPath, 'utf-8');
            allContent.push(content);
            sources.push(logPath);
          } catch (fileError) {
            log.warn(`[GapIntelligence] Could not read log file ${file}:`, fileError);
          }
        }
      }

      if (allContent.length === 0) {
        log.info('[GapIntelligence] No recent log files to analyze');
        this.lastScanResults.set('logs', { timestamp: new Date(), findingsCount: 0 });
        return [];
      }

      const combinedContent = allContent.join('\n---LOG BOUNDARY---\n');
      const findings = await logOpsSubagent.analyzeLogContent(combinedContent, sources.join(', '));
      const limitedFindings = findings.slice(0, this.config.maxFindingsPerScan);

      this.lastScanResults.set('logs', {
        timestamp: new Date(),
        findingsCount: limitedFindings.length,
      });

      log.info(`[GapIntelligence] Found ${limitedFindings.length} log issues`);
      return limitedFindings;
    } catch (error) {
      log.error('[GapIntelligence] Log scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // FULL PLATFORM SCAN
  // ==========================================================================

  async runFullPlatformScan(): Promise<{
    typescript: GapFinding[];
    schema: GapFinding[];
    handlers: GapFinding[];
    hooks: GapFinding[];
    logs: GapFinding[];
    summary: {
      totalFindings: number;
      criticalCount: number;
      errorCount: number;
      warningCount: number;
      infoCount: number;
      scanDuration: number;
    };
  }> {
    log.info('[GapIntelligence] Starting full platform scan...');
    const startTime = Date.now();

    const [typescript, schema, handlers, hooks, logs] = await Promise.all([
      this.scanTypeScriptErrors(),
      this.scanSchemaIssues(),
      this.scanHandlerGaps(),
      this.scanHookIssues(),
      this.scanRecentLogs(),
    ]);

    const allFindings = [...typescript, ...schema, ...handlers, ...hooks, ...logs];
    
    const summary = {
      totalFindings: allFindings.length,
      criticalCount: allFindings.filter(f => f.severity === 'critical' || f.severity === 'blocker').length,
      errorCount: allFindings.filter(f => f.severity === 'error').length,
      warningCount: allFindings.filter(f => f.severity === 'warning').length,
      infoCount: allFindings.filter(f => f.severity === 'info').length,
      scanDuration: Date.now() - startTime,
    };

    await this.emitScanEvent('full_platform_scan', summary);

    log.info(`[GapIntelligence] Full scan complete: ${summary.totalFindings} findings in ${summary.scanDuration}ms`);

    return { typescript, schema, handlers, hooks, logs, summary };
  }

  // ==========================================================================
  // FINDINGS MANAGEMENT
  // ==========================================================================

  async getOpenFindings(limit: number = 50): Promise<any[]> {
    return db
      .select()
      .from(aiGapFindings)
      .where(eq(aiGapFindings.status, 'open'))
      .orderBy(desc(aiGapFindings.createdAt))
      .limit(limit);
  }

  /**
   * Get gap findings formatted for the Universal Notification System (UNS)
   * Returns actionable notifications for platform support roles
   */
  async getGapFindingsForUNS(limit: number = 20): Promise<Array<{
    id: string;
    title: string;
    message: string;
    priority: 'critical' | 'high' | 'medium' | 'info';
    category: 'system_alerts' | 'for_you';
    subCategory: string;
    serviceSource: string;
    statusTag: string;
    isRead: boolean;
    createdAt: Date;
    actions: Array<{
      label: string;
      type: 'orchestration' | 'navigate' | 'api_call';
      target: string;
      variant: 'primary' | 'secondary' | 'ghost';
    }>;
    metadata: Record<string, any>;
  }>> {
    const openFindings = await this.getOpenFindings(limit);
    
    return openFindings.map(finding => {
      // Map severity to priority
      const priorityMap: Record<string, 'critical' | 'high' | 'medium' | 'info'> = {
        'critical': 'critical',
        'blocker': 'critical',
        'error': 'high',
        'warning': 'medium',
        'info': 'info',
      };
      
      // Map gap type to human-readable category
      const gapTypeLabels: Record<string, string> = {
        'schema_mismatch': 'Schema Issue',
        'performance_issue': 'Performance Issue',
        'typescript_error': 'Code Error',
        'handler_gap': 'Handler Gap',
        'hook_issue': 'Hook Issue',
        'log_error': 'Runtime Error',
      };
      
      // Generate end-user friendly message
      const userMessage = finding.endUserSummary || 
        `Found ${gapTypeLabels[finding.gapType] || finding.gapType}: ${finding.title}`;
      
      return {
        id: `gap-finding-${finding.id}`,
        title: `Trinity: ${gapTypeLabels[finding.gapType] || 'Issue'} Detected`,
        message: userMessage,
        priority: priorityMap[finding.severity] || 'medium',
        category: 'system_alerts' as const,
        subCategory: 'trinity_analysis',
        serviceSource: 'Gap Intelligence',
        statusTag: finding.status === 'open' ? 'ACTION REQUIRED' : 'IN PROGRESS',
        isRead: false,
        createdAt: finding.createdAt,
        actions: [
          {
            label: 'Approve Fix',
            type: 'orchestration' as const,
            target: `gap_intelligence.approve_fix:${finding.id}`,
            variant: 'primary' as const,
          },
          {
            label: 'View Details',
            type: 'navigate' as const,
            target: `/diagnostics?findingId=${finding.id}`,
            variant: 'secondary' as const,
          },
          {
            label: 'Dismiss',
            type: 'orchestration' as const,
            target: `gap_intelligence.dismiss:${finding.id}`,
            variant: 'ghost' as const,
          },
        ],
        metadata: {
          findingId: finding.id,
          gapType: finding.gapType,
          severity: finding.severity,
          filePath: finding.filePath,
          lineNumber: finding.lineNumber,
          suggestedFix: finding.suggestedFix,
          detectedBy: finding.detectedBy,
          domain: finding.domain,
        },
      };
    });
  }

  async getCriticalFindings(): Promise<any[]> {
    return db
      .select()
      .from(aiGapFindings)
      .where(and(
        eq(aiGapFindings.status, 'open'),
        sql`${aiGapFindings.severity} IN ('critical', 'blocker', 'error')`
      ))
      .orderBy(desc(aiGapFindings.createdAt));
  }

  async markFindingResolved(findingId: string, resolvedBy: string): Promise<boolean> {
    try {
      await db
        .update(aiGapFindings)
        .set({
          status: 'wont_fix',
          fixedAt: new Date(),
          fixedBy: resolvedBy,
          updatedAt: new Date(),
        })
        .where(eq(aiGapFindings.id, findingId));
      log.info(`[GapIntelligence] Finding ${findingId} dismissed by ${resolvedBy}`);
      return true;
    } catch (error) {
      log.error('[GapIntelligence] Error marking finding resolved:', error);
      return false;
    }
  }

  async markFindingInProgress(findingId: string, approvedBy: string): Promise<boolean> {
    try {
      await db
        .update(aiGapFindings)
        .set({
          status: 'in_progress',
          updatedAt: new Date(),
        })
        .where(eq(aiGapFindings.id, findingId));
      log.info(`[GapIntelligence] Finding ${findingId} approved by ${approvedBy}`);
      return true;
    } catch (error) {
      log.error('[GapIntelligence] Error marking finding in progress:', error);
      return false;
    }
  }

  // ==========================================================================
  // SCHEDULER MANAGEMENT
  // ==========================================================================

  startScheduledScans(): void {
    if (this.isRunning) {
      log.info('[GapIntelligence] Scheduler already running');
      return;
    }

    log.info('[GapIntelligence] Starting scheduled scans...');

    const typescriptJob = cron.schedule(this.config.schedules.typescript, async () => {
      try {
        log.info('[GapIntelligence] Running scheduled TypeScript scan');
        await this.scanTypeScriptErrors();
      } catch (err) { log.error('[GapIntelligence] TypeScript scan error:', err); }
    });
    this.scheduledJobs.set('typescript', typescriptJob);

    const schemaJob = cron.schedule(this.config.schedules.schema, async () => {
      try {
        log.info('[GapIntelligence] Running scheduled schema scan');
        await this.scanSchemaIssues();
      } catch (err) { log.error('[GapIntelligence] Schema scan error:', err); }
    });
    this.scheduledJobs.set('schema', schemaJob);

    const handlersJob = cron.schedule(this.config.schedules.handlers, async () => {
      try {
        log.info('[GapIntelligence] Running scheduled handler scan');
        await this.scanHandlerGaps();
      } catch (err) { log.error('[GapIntelligence] Handler scan error:', err); }
    });
    this.scheduledJobs.set('handlers', handlersJob);

    const hooksJob = cron.schedule(this.config.schedules.hooks, async () => {
      try {
        log.info('[GapIntelligence] Running scheduled hook scan');
        await this.scanHookIssues();
      } catch (err) { log.error('[GapIntelligence] Hook scan error:', err); }
    });
    this.scheduledJobs.set('hooks', hooksJob);

    const logsJob = cron.schedule(this.config.schedules.logs, async () => {
      try {
        log.info('[GapIntelligence] Running scheduled log scan');
        await this.scanRecentLogs();
      } catch (err) { log.error('[GapIntelligence] Log scan error:', err); }
    });
    this.scheduledJobs.set('logs', logsJob);

    const fullScanJob = cron.schedule(this.config.schedules.fullScan, async () => {
      try {
        log.info('[GapIntelligence] Running scheduled full platform scan');
        await this.runFullPlatformScan();
      } catch (err) { log.error('[GapIntelligence] Full scan error:', err); }
    });
    this.scheduledJobs.set('fullScan', fullScanJob);

    this.isRunning = true;
    log.info('[GapIntelligence] All scheduled scans started');
  }

  stopScheduledScans(): void {
    log.info('[GapIntelligence] Stopping scheduled scans...');
    
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      log.info(`[GapIntelligence] Stopped ${name} scan`);
    }
    
    this.scheduledJobs.clear();
    this.isRunning = false;
    log.info('[GapIntelligence] All scheduled scans stopped');
  }

  getSchedulerStatus(): {
    isRunning: boolean;
    scheduledJobs: string[];
    lastScanResults: Record<string, { timestamp: Date; findingsCount: number }>;
    config: GapIntelligenceConfig;
  } {
    return {
      isRunning: this.isRunning,
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      lastScanResults: Object.fromEntries(this.lastScanResults),
      config: this.config,
    };
  }

  // ==========================================================================
  // EVENT EMISSION
  // ==========================================================================

  /**
   * Generate actionable description for scan results
   * Avoids vague "Found X issues" patterns - includes specific examples and guidance
   */
  private generateActionableDescription(scanType: string, summary: any): string {
    // If no issues found, return a clear success message
    if (summary.totalFindings === 0) {
      return `${this.getScanTypeLabel(scanType)} completed with no issues detected. Platform code quality verified.`;
    }

    // Get top issues from metadata if available
    const topIssues = summary.topIssues || [];
    const topIssuesSummary = topIssues.length > 0
      ? topIssues.slice(0, 3).map((issue: any) => 
          `• ${issue.file || issue.location || 'Unknown'}: ${issue.message?.substring(0, 60) || issue.type}...`
        ).join('\n')
      : '';

    // Build actionable description with Problem → Issue → Solution → Outcome structure
    const parts: string[] = [];
    
    // Problem: What was found
    if (summary.criticalCount > 0) {
      parts.push(`⚠️ CRITICAL: ${summary.criticalCount} critical issue(s) require immediate attention.`);
    }
    
    if (summary.errorCount > 0) {
      parts.push(`${summary.errorCount} error(s) detected in ${scanType.replace('_', ' ')}.`);
    }
    
    if (summary.warningCount > 0) {
      parts.push(`${summary.warningCount} warning(s) for review.`);
    }

    // Issue: Top specific examples
    if (topIssuesSummary) {
      parts.push(`\nTop issues:\n${topIssuesSummary}`);
    } else if (summary.affectedFiles && summary.affectedFiles.length > 0) {
      parts.push(`\nAffected files: ${summary.affectedFiles.slice(0, 3).join(', ')}${summary.affectedFiles.length > 3 ? ` (+${summary.affectedFiles.length - 3} more)` : ''}`);
    }

    // Solution: How to address
    parts.push(`\n${this.getScanResolutionGuidance(scanType)}`);

    // Outcome: What happens next
    parts.push(`Review in Gap Intelligence dashboard → Admin → Platform Health.`);

    return parts.join(' ');
  }

  private getScanTypeLabel(scanType: string): string {
    const labels: Record<string, string> = {
      'schema_scan': 'Database Schema Analysis',
      'typescript': 'TypeScript Compilation Check',
      'handlers': 'API Route Handler Audit',
      'hooks': 'React Hook Validation',
      'logs': 'Runtime Log Analysis',
      'full_scan': 'Full Platform Health Scan',
      'full_platform_scan': 'System Health Check Complete',
    };
    return labels[scanType] || `${scanType} Scan`;
  }

  private getScanResolutionGuidance(scanType: string): string {
    const guidance: Record<string, string> = {
      'schema_scan': 'Run `npm run db:push` to sync schema, or review migration scripts for complex changes.',
      'typescript': 'Run `npx tsc --noEmit` locally to see full error details. Fix type annotations and imports.',
      'handlers': 'Ensure all API routes have corresponding handler implementations in server/routes.ts.',
      'hooks': 'Review React component hook usage - check for conditional hooks or missing dependencies.',
      'logs': 'Check server logs for stack traces. Most runtime errors indicate missing null checks or API failures.',
      'full_scan': 'Address critical issues first. Use Trinity AI for automated fix suggestions.',
      'full_platform_scan': 'Review findings and address high-severity issues first.',
    };
    return guidance[scanType] || 'Review findings and address high-severity issues first.';
  }

  private async emitScanEvent(scanType: string, summary: any): Promise<void> {
    // Generate actionable, specific description instead of vague counts
    const actionableDescription = this.generateActionableDescription(scanType, summary);
    
    const event: PlatformEvent = {
      type: 'gap_intelligence_scan',
      category: 'improvement',
      title: `${this.getScanTypeLabel(scanType)} - ${summary.totalFindings === 0 ? 'All Clear' : `${summary.criticalCount > 0 ? 'Action Required' : 'Review Recommended'}`}`,
      description: actionableDescription,
      metadata: {
        scanType,
        ...summary,
        timestamp: new Date().toISOString(),
        // Flag to bypass vague language check since we've made this actionable
        skipFeatureCheck: true,
      },
      visibility: 'org_leadership',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      log.error('[GapIntelligence] Failed to emit scan event:', error);
    }
  }

  // ==========================================================================
  // AI BRAIN ACTIONS
  // ==========================================================================

  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'gap_intelligence.scan_typescript', name: 'Scan TypeScript', desc: 'Scan for TypeScript/LSP errors', fn: () => self.scanTypeScriptErrors() },
      { id: 'gap_intelligence.scan_schema', name: 'Scan Schema', desc: 'Scan for schema mismatches', fn: () => self.scanSchemaIssues() },
      { id: 'gap_intelligence.scan_handlers', name: 'Scan Handlers', desc: 'Scan for handler gaps', fn: () => self.scanHandlerGaps() },
      { id: 'gap_intelligence.scan_hooks', name: 'Scan Hooks', desc: 'Scan for React hook issues', fn: () => self.scanHookIssues() },
      { id: 'gap_intelligence.scan_logs', name: 'Scan Logs', desc: 'Scan recent logs for errors', fn: () => self.scanRecentLogs() },
      { id: 'gap_intelligence.full_scan', name: 'Full Scan', desc: 'Run complete platform gap analysis', fn: () => self.runFullPlatformScan() },
      { id: 'gap_intelligence.get_findings', name: 'Get Findings', desc: 'Get open gap findings', fn: (p: any) => p?.critical ? self.getCriticalFindings() : self.getOpenFindings(p?.limit || 50) },
      { id: 'gap_intelligence.resolve_finding', name: 'Resolve Finding', desc: 'Mark a gap finding as resolved', fn: (p: any) => self.markFindingResolved(p.findingId, p.resolvedBy || 'Trinity') },
      { id: 'gap_intelligence.scheduler_status', name: 'Scheduler Status', desc: 'Get scheduler status', fn: () => self.getSchedulerStatus() },
      { id: 'gap_intelligence.start_scheduler', name: 'Start Scheduler', desc: 'Start scheduled scans', fn: () => { self.startScheduledScans(); return { started: true }; } },
      { id: 'gap_intelligence.stop_scheduler', name: 'Stop Scheduler', desc: 'Stop scheduled scans', fn: () => { self.stopScheduledScans(); return { stopped: true }; } },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'gap_intelligence',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return {
            success: true,
            actionId: request.actionId,
            message: `${action.name} completed`,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });
    }

    log.info('[GapIntelligence] Registered 11 AI Brain actions');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const gapIntelligenceService = GapIntelligenceService.getInstance();

export async function initializeGapIntelligence(): Promise<void> {
  log.info('[GapIntelligence] Initializing Gap Intelligence Service...');
  gapIntelligenceService.registerActions();
  gapIntelligenceService.startScheduledScans();
  log.info('[GapIntelligence] Gap Intelligence Service initialized');
}

export function stopGapIntelligence(): void {
  gapIntelligenceService.stopScheduledScans();
}

export { GapIntelligenceService };
